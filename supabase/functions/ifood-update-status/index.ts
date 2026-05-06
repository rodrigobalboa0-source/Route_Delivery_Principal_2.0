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

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let receivedAction: string | null = null;
  let receivedPedidoId: string | null = null;
  let receivedIfoodOrderId: string | null = null;
  let receivedClienteId: string | null = null;
  let calledEndpoint: string | null = null;
  let ifoodHttpStatus: number | null = null;
  let ifoodErrorBody: string | null = null;

  try {
    const { action, pedidoId, ifoodOrderId, clienteId } = await req.json();
    receivedAction = action ?? null;
    receivedPedidoId = pedidoId ?? null;
    receivedIfoodOrderId = ifoodOrderId ?? null;
    receivedClienteId = clienteId ?? null;
    
    if (!action) {
        throw new Error("Missing action");
    }

    const baseUrl = Deno.env.get("IFOOD_API_BASE_URL") || "https://merchant-api.ifood.com.br";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    
    let targetClienteId: string | null = null;
    let targetIfoodOrderId: string | null = null;
    if (pedidoId) {
        const { data: pedido, error: pedidoError } = await supabase
            .from('pedidos')
            .select('cliente_id, ifood_order_id')
            .eq('id', pedidoId)
            .maybeSingle();
        if (pedidoError || !pedido) {
            throw new Error(`Pedido ${pedidoId} not found`);
        }
        targetClienteId = pedido.cliente_id;
        targetIfoodOrderId = pedido.ifood_order_id || null;
    } else {
        targetClienteId = clienteId || null;
        targetIfoodOrderId = ifoodOrderId || null;
    }

    if (!targetClienteId || !targetIfoodOrderId) {
        throw new Error("Missing clienteId or ifoodOrderId");
    }

    const { data: integration, error: intError } = await supabase
      .from('integracoes_ifood')
      .select('*')
      .eq('cliente_id', targetClienteId)
      .eq('status', 'ativo')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intError || !integration) throw new Error("Active integration not found for this order's client");

    
    let token = integration.access_token;
    const expiresAt = new Date(integration.token_expires_at || 0);
    const nowPlusBuffer = new Date(Date.now() + 5 * 60 * 1000);

    if (!token || expiresAt < nowPlusBuffer) {
        if (!integration.refresh_token) throw new Error("No refresh token available");

        const APP_CLIENT_ID = Deno.env.get('IFOOD_APP_CLIENT_ID');
        const APP_CLIENT_SECRET = Deno.env.get('IFOOD_APP_CLIENT_SECRET');

        const params = new URLSearchParams();
        params.append('grantType', 'refresh_token');
        params.append('clientId', APP_CLIENT_ID || '');
        params.append('clientSecret', APP_CLIENT_SECRET || '');
        params.append('refreshToken', integration.refresh_token);

        const refreshResp = await fetch(`${baseUrl}/authentication/v1.0/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        if (!refreshResp.ok) {
            const err = await refreshResp.json();
            throw new Error(`Token refresh failed: ${JSON.stringify(err)}`);
        }

        const tokenData = await refreshResp.json();
        token = tokenData.accessToken;
        
        await supabase.from('integracoes_ifood').update({
            access_token: tokenData.accessToken,
            refresh_token: tokenData.refreshToken || integration.refresh_token,
            token_expires_at: new Date(Date.now() + (tokenData.expiresIn * 1000)).toISOString(),
            updated_at: new Date().toISOString()
        }).eq('id', integration.id);
    }

    
    let endpoint = "";
    if (action === 'confirm') endpoint = `/order/v1.0/orders/${targetIfoodOrderId}/confirm`;
    else if (action === 'startPreparation') endpoint = `/order/v1.0/orders/${targetIfoodOrderId}/startPreparation`;
    else if (action === 'readyToPickup') endpoint = `/order/v1.0/orders/${targetIfoodOrderId}/readyToPickup`;
    else if (action === 'dispatch') endpoint = `/order/v1.0/orders/${targetIfoodOrderId}/dispatch`;
    else if (action === 'conclude') endpoint = `/order/v1.0/orders/${targetIfoodOrderId}/conclude`;
    else if (action === 'requestCancellation') endpoint = `/order/v1.0/orders/${targetIfoodOrderId}/requestCancellation`;
    else throw new Error("Invalid action");
    calledEndpoint = endpoint;

    let ifoodResp = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(integration.merchant_id ? { 'x-merchant-id': String(integration.merchant_id) } : {})
        },
        body: action === 'requestCancellation' ? JSON.stringify({ reason: 'Cancelado pelo estabelecimento', cancellationCode: '501' }) : undefined
    });
    ifoodHttpStatus = ifoodResp.status;

    if (!ifoodResp.ok) {
        const errText = await ifoodResp.text();
        ifoodErrorBody = errText || null;
        
        if (ifoodResp.status === 404 && action === 'conclude') {
            const fallbackEndpoint = `/order/v1.0/orders/${targetIfoodOrderId}/dispatch`;
            calledEndpoint = `${fallbackEndpoint} (fallback)`;
            const fallbackResp = await fetch(`${baseUrl}${fallbackEndpoint}`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    ...(integration.merchant_id ? { 'x-merchant-id': String(integration.merchant_id) } : {})
                }
            });
            ifoodHttpStatus = fallbackResp.status;
            if (!fallbackResp.ok) {
                const fbErrText = await fallbackResp.text();
                ifoodErrorBody = fbErrText || null;
                throw new Error(`iFood API error (${fallbackResp.status}) on conclude fallback (dispatch): ${fbErrText}`);
            }
            ifoodResp = fallbackResp;
            endpoint = fallbackEndpoint;
        } else if (ifoodResp.status === 409) {
            if (action === 'conclude') {
                throw new Error(`iFood 409 Conflict: ${errText}`);
            }
            console.warn(`iFood 409 Conflict (already done?): ${errText}`);
        } else {
            throw new Error(`iFood API error (${ifoodResp.status}): ${errText}`);
        }
    }

    let orderAfter: any = null;
    const checkResp = await fetch(`${baseUrl}/order/v1.0/orders/${targetIfoodOrderId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(integration.merchant_id ? { 'x-merchant-id': String(integration.merchant_id) } : {})
      }
    });
    if (checkResp.ok) {
      orderAfter = await checkResp.json().catch(() => null);
    }

    if (action === 'confirm' && pedidoId) {
      await supabase
        .from('pedidos')
        .update({ status: 'confirmado', ifood_info: orderAfter || undefined, updated_at: new Date().toISOString() } as any)
        .eq('id', pedidoId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Action ${action} executed for order ${targetIfoodOrderId}`,
        ifood: { httpStatus: ifoodResp.status, endpoint, fallbackUsed: action === 'conclude' && calledEndpoint?.includes('(fallback)') },
        orderStatus: orderAfter?.orderStatus ?? null,
        order: orderAfter
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    const message = error?.message || "Erro desconhecido";
    console.error("ifood-update-status failed", {
      action: receivedAction,
      pedidoId: receivedPedidoId,
      ifoodOrderId: receivedIfoodOrderId,
      clienteId: receivedClienteId,
      endpoint: calledEndpoint,
      ifoodHttpStatus,
      ifoodErrorBody,
      message,
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
        debug: {
          action: receivedAction,
          pedidoId: receivedPedidoId,
          ifoodOrderId: receivedIfoodOrderId,
          clienteId: receivedClienteId,
          endpoint: calledEndpoint,
          ifoodHttpStatus,
          ifoodErrorBody,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
