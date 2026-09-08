import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { timingSafeEqualStr } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token',
};

// ============================================================================
// SEGURANÇA C4 — validação de origem do webhook do CardápioWeb.
//
// O CardápioWeb NÃO assina o payload com HMAC. Ele manda um token estático no
// header `X-Webhook-Token` (definido por você no portal do CardápioWeb, legado;
// ou gerado no cadastro do app na CW App Store). Ref:
//   https://docs.cardapioweb.com/webhooks/visao-geral
//
// Guardamos o token esperado em `integracoes_cardapioweb.merchant_secret`
// (campo "Segredo do Estabelecimento" no painel). Fallback global opcional:
// env CARDAPIOWEB_WEBHOOK_TOKEN.
//
// Comportamento:
//   * token configurado e não bate            -> 401 (CardápioWeb re-tenta)
//   * token configurado e bate                -> processa
//   * NENHUM token configurado (secret vazio) -> processa + WARN no log
//     (compatibilidade: não quebra integração existente antes de você
//      configurar o token — configure assim que possível)
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonOk = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const receivedToken = req.headers.get('x-webhook-token') ?? '';

    const body = await req.json();
    // Não logar o payload inteiro (PII do cliente). Só o essencial.
    console.log('cardapioweb-webhook: evento recebido');

    const order = body.order || body;

    if (!order || !order.id) {
      return jsonOk({ received: true });
    }

    const merchantId = order.merchant?.id || body.merchantId;
    if (!merchantId) {
      console.error('cardapioweb-webhook: merchant_id ausente no payload');
      return jsonOk({ received: true, error: 'Merchant ID missing' });
    }

    const { data: integration, error: intError } = await supabase
      .from('integracoes_cardapioweb')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('status', 'ativo')
      .single();

    if (intError || !integration) {
      console.error(`cardapioweb-webhook: integração não encontrada p/ merchant ${merchantId}`);
      return jsonOk({ received: true, error: 'Integration not found' });
    }

    // ---- validação de origem -------------------------------------------------
    const expectedToken =
      (integration.merchant_secret as string | null) ||
      Deno.env.get('CARDAPIOWEB_WEBHOOK_TOKEN') ||
      '';

    if (expectedToken) {
      if (!timingSafeEqualStr(receivedToken, expectedToken)) {
        console.warn(`cardapioweb-webhook: X-Webhook-Token inválido p/ integração ${integration.id}`);
        return jsonOk({ error: 'invalid webhook token' }, 401);
      }
    } else {
      console.warn(
        `cardapioweb-webhook: integração ${integration.id} SEM merchant_secret — ` +
        `configure o X-Webhook-Token no painel (Integração Cardápio Web).`,
      );
    }
    // -----------------------------------------------------------------------

    const customer = order.customer || {};
    const delivery = order.delivery || {};
    const addressData = delivery.deliveryAddress || {};

    const enderecoTexto = addressData.formattedAddress ||
      `${addressData.streetName || ''}, ${addressData.streetNumber || ''} - ${addressData.neighborhood || ''}, ${addressData.city || ''} - ${addressData.state || ''}`;

    const itemsDesc = (order.items || []).map((i: any) => `${i.quantity}x ${i.name}`).join(', ');

    const { data: existing } = await supabase
      .from('pedidos')
      .select('id')
      .eq('id', order.id)
      .maybeSingle();

    if (existing) {
      return jsonOk({ received: true, status: 'exists' });
    }

    const { data: createdPedido, error: insertError } = await supabase
      .from('pedidos')
      .insert({
        id: order.id,
        cliente_id: integration.cliente_id,
        entrega_codigo_pedido: String(order.displayId || order.id.slice(0, 8)),
        status: 'criado',
        entrega_endereco_texto: enderecoTexto,
        entrega_contato: customer.name || 'Cliente',
        entrega_telefone: customer.phone?.number || '',
        observacoes: `[Cardápio Web] ${delivery.observations || ''} | Itens: ${itemsDesc}`,
        valor_total: order.total?.orderAmount || 0,
        modal_tipo: 'moto',
        origem: 'online',
      })
      .select()
      .single();

    if (insertError) {
      console.error('cardapioweb-webhook: erro ao inserir pedido:', insertError.message);
      throw insertError;
    }

    const deliveryFee = order.total?.deliveryFee || 0;
    const orderAmount = order.total?.orderAmount || 0;

    const { error: deliveryError } = await supabase.from('nova_entrega').insert({
      pedido_id: createdPedido.id,
      cliente_id: integration.cliente_id,
      modal_tipo: 'moto',
      atribuicao_modo: 'manual',
      valor_entrega: deliveryFee,
      valor_entregador: deliveryFee * 0.8,
      valor_mercadoria: orderAmount,
      tipo_cobranca: 'fatura',
      cobrar_destinatario: false,
      coleta_usa_endereco_cadastro: true,
      coleta_contato: 'Balcão',
      coleta_observacoes: 'Pedido Cardápio Web',
      entrega_usa_endereco_cadastro: false,
      entrega_contato: customer.name || 'Cliente',
      entrega_telefone: customer.phone?.number || '',
      entrega_cep: addressData.postalCode || '',
      entrega_endereco_texto: enderecoTexto,
      entrega_codigo_pedido: String(order.displayId || order.id.slice(0, 8)),
      entrega_observacoes: delivery.observations || '',
      status: 'criada',
    });

    if (deliveryError) {
      console.error('cardapioweb-webhook: erro ao criar entrega:', deliveryError.message);
    }

    await supabase
      .from('integracoes_cardapioweb')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', integration.id);

    return jsonOk({ success: true });

  } catch (error: any) {
    console.error('cardapioweb-webhook: erro:', error?.message);
    return new Response(JSON.stringify({ error: error?.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
