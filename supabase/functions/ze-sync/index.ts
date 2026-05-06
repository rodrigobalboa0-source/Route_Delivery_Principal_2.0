import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: integrations, error } = await supabase
      .from('integracoes_ze')
      .select('*')
      .eq('status', 'ativo');

    if (error) throw error;
    if (!integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhuma integração Zé ativa.' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = Deno.env.get('ZE_API_BASE') || 'https://seller-public-api.ze.delivery';

    let created = 0;
    let updated = 0;
    const logs: string[] = [];

    for (const integration of integrations) {
      try {
        if (!integration.api_key || !integration.merchant_id) {
          logs.push(`Integração ${integration.id}: faltando api_key ou merchant_id`);
          continue;
        }

        const ordersResp = await fetch(`${baseUrl}/orders?merchantId=${encodeURIComponent(integration.merchant_id)}`, {
          headers: {
            'Authorization': `Bearer ${integration.api_key}`,
            'Accept': 'application/json'
          }
        });

        if (!ordersResp.ok) {
          logs.push(`Integração ${integration.id}: erro ao buscar pedidos (${ordersResp.status})`);
          continue;
        }

        const orders = await ordersResp.json();
        if (!Array.isArray(orders)) {
          logs.push(`Integração ${integration.id}: resposta inesperada`);
          continue;
        }

        for (const order of orders) {
          try {
            const externalId = order.id || order.displayId;
            if (!externalId) continue;

            const { data: existing } = await supabase
              .from('pedidos')
              .select('id, status')
              .eq('id', externalId)
              .maybeSingle();

            const address =
              order.delivery?.deliveryAddress?.formattedAddress ||
              [
                order.delivery?.deliveryAddress?.streetName,
                order.delivery?.deliveryAddress?.streetNumber,
                order.delivery?.deliveryAddress?.neighborhood,
                order.delivery?.deliveryAddress?.city,
                order.delivery?.deliveryAddress?.state
              ].filter(Boolean).join(', ');

            if (!existing) {
              const { data: createdPedido, error: insertErr } = await supabase
                .from('pedidos')
                .insert({
                  id: externalId,
                  cliente_id: integration.cliente_id,
                  entrega_codigo_pedido: order.displayId || null,
                  status: 'criado',
                  entrega_endereco_texto: address || null,
                  entrega_contato: order.customer?.name || null,
                  entrega_telefone: order.customer?.phone?.number || null,
                  observacoes: '[Zé Delivery]',
                  valor_entrega: Number(order.otherFees?.find?.((f: any) => f.type === 'DELIVERY_FEE')?.price?.value) || null,
                  modal_tipo: 'moto',
                  origem: 'online'
                })
                .select()
                .single();

              if (insertErr) {
                logs.push(`Erro ao criar pedido ${externalId}: ${insertErr.message}`);
                continue;
              }

              await supabase.from('nova_entrega').insert({
                pedido_id: createdPedido.id,
                cliente_id: integration.cliente_id,
                modal_tipo: 'moto',
                atribuicao_modo: 'manual',
                valor_entrega: Number(order.otherFees?.find?.((f: any) => f.type === 'DELIVERY_FEE')?.price?.value) || null,
                valor_entregador: null,
                valor_mercadoria: Number(order.total?.orderAmount?.value) || null,
                tipo_cobranca: 'fatura',
                cobrar_destinatario: false,
                coleta_usa_endereco_cadastro: true,
                coleta_contato: 'Balcão',
                coleta_observacoes: 'Pedido Zé Delivery',
                entrega_usa_endereco_cadastro: false,
                entrega_contato: order.customer?.name || null,
                entrega_telefone: order.customer?.phone?.number || '',
                entrega_cep: order.delivery?.deliveryAddress?.postalCode || null,
                entrega_endereco_texto: address || null,
                entrega_codigo_pedido: order.displayId || null,
                entrega_observacoes: order.extraInfo || '',
                status: 'criada'
              });

              created++;
            } else {
              updated++;
            }
          } catch (e: any) {
            logs.push(`Erro ao processar pedido: ${e.message}`);
          }
        }

        await supabase
          .from('integracoes_ze')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', integration.id);
      } catch (e: any) {
        logs.push(`Erro na integração ${integration.id}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, created, updated, logs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
