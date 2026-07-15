
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    console.log('Received Webhook:', JSON.stringify(body));

    
    let order = body.order || body;
    
    if (!order || !order.id) {
        
        return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
        });
    }

    
    let merchantId = order.merchant?.id || body.merchantId;
    
    if (!merchantId) {
        console.error('Merchant ID not found in payload');
        return new Response(JSON.stringify({ received: true, error: 'Merchant ID missing' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
        });
    }

   
    const { data: integration, error: intError } = await supabase
        .from('integracoes_cardapioweb')
        .select('*')
        .eq('merchant_id', merchantId)
        .eq('status', 'ativo')
        .single();

    if (intError || !integration) {
        console.error(`Integration not found for Merchant ID: ${merchantId}`);
        return new Response(JSON.stringify({ received: true, error: 'Integration not found' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });
    }

    
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
        console.log(`Order ${order.id} already exists.`);
        return new Response(JSON.stringify({ received: true, status: 'exists' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });
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
            origem: 'online'
        })
        .select()
        .single();

    if (insertError) {
        console.error('Error inserting order:', insertError);
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
        status: 'criada'
    });

    if (deliveryError) {
        console.error('Error creating delivery:', deliveryError);

    }

    await supabase.from('integracoes_cardapioweb').update({ last_synced_at: new Date().toISOString() }).eq('id', integration.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Webhook Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});