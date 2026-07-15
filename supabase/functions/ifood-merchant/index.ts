import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action =
  | "listMerchants"
  | "getMerchant"
  | "getStatus"
  | "createInterruption"
  | "listInterruptions"
  | "deleteInterruption"
  | "getOpeningHours"
  | "putOpeningHours"
  | "selfTest";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  integration: any,
) {
  const baseUrl = Deno.env.get("IFOOD_API_BASE_URL") || "https://merchant-api.ifood.com.br";

  let token = integration.access_token as string | null;
  const expiresAt = new Date(integration.token_expires_at || 0);
  const nowPlusBuffer = new Date(Date.now() + 5 * 60 * 1000);

  if (token && expiresAt >= nowPlusBuffer) {
    return { token, baseUrl };
  }

  if (!integration.refresh_token) {
    throw new Error("No refresh token available");
  }

  const appClientId = Deno.env.get("IFOOD_APP_CLIENT_ID") || "";
  const appClientSecret = Deno.env.get("IFOOD_APP_CLIENT_SECRET") || "";

  const params = new URLSearchParams();
  params.append("grantType", "refresh_token");
  params.append("clientId", appClientId);
  params.append("clientSecret", appClientSecret);
  params.append("refreshToken", integration.refresh_token);

  const refreshResp = await fetch(`${baseUrl}/authentication/v1.0/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!refreshResp.ok) {
    const errText = await refreshResp.text();
    throw new Error(`Token refresh failed (${refreshResp.status}): ${errText}`);
  }

  const tokenData = await refreshResp.json();
  const refreshedAccessToken = tokenData.accessToken || tokenData.access_token;
  const refreshedRefreshToken = tokenData.refreshToken || tokenData.refresh_token;
  const refreshedExpiresIn = tokenData.expiresIn || tokenData.expires_in;

  if (!refreshedAccessToken) {
    throw new Error("Token refresh response missing accessToken");
  }
  if (!refreshedExpiresIn) {
    throw new Error("Token refresh response missing expiresIn");
  }

  token = refreshedAccessToken;

  await supabase
    .from("integracoes_ifood")
    .update({
      access_token: refreshedAccessToken,
      refresh_token: refreshedRefreshToken || integration.refresh_token,
      token_expires_at: new Date(Date.now() + Number(refreshedExpiresIn) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id);

  return { token, baseUrl };
}

async function ifoodRequest(params: {
  token: string;
  baseUrl: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
}) {
  const resp = await fetch(`${params.baseUrl}${params.path}`, {
    method: params.method,
    headers: {
      Authorization: `Bearer ${params.token}`,
      ...(params.body ? { "Content-Type": "application/json" } : {}),
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  const contentType = resp.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  const raw = isJson ? await resp.json().catch(() => null) : await resp.text().catch(() => "");
  if (!resp.ok) {
    throw new Error(
      `iFood API error (${resp.status}) ${params.method} ${params.path}: ${
        typeof raw === "string" ? raw : JSON.stringify(raw)
      }`,
    );
  }
  return raw;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as Action | undefined;
    const clienteId = body.cliente_id as string | undefined;
    const merchantIdInput = body.merchantId as string | undefined;
    const interruptionId = body.interruptionId as string | undefined;
    const payload = body.payload as unknown;

    if (!action) return jsonResponse({ success: false, error: "Missing action" }, 400);
    if (!clienteId) return jsonResponse({ success: false, error: "Missing cliente_id" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse(
        { success: false, error: "Missing Supabase env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
        500,
      );
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: integration, error: intError } = await supabase
      .from("integracoes_ifood")
      .select("*")
      .eq("cliente_id", clienteId)
      .eq("status", "ativo")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intError || !integration) {
      return jsonResponse(
        {
          success: false,
          error: "Integração iFood ativa não encontrada para este comércio",
          details: intError ? { message: intError.message, code: (intError as any).code } : null,
        },
        400,
      );
    }

    const merchantId = merchantIdInput || integration.merchant_id;
    const { token, baseUrl } = await getValidAccessToken(supabase, integration);

    if (action === "listMerchants") {
      const merchants = await ifoodRequest({
        token,
        baseUrl,
        method: "GET",
        path: "/merchant/v1.0/merchants",
      });
      return jsonResponse({ success: true, merchants });
    }

    if (!merchantId && action !== "selfTest") {
      return jsonResponse({ success: false, error: "Missing merchantId" }, 400);
    }

    if (action === "getMerchant") {
      const merchant = await ifoodRequest({
        token,
        baseUrl,
        method: "GET",
        path: `/merchant/v1.0/merchants/${merchantId}`,
      });
      return jsonResponse({ success: true, merchant });
    }

    if (action === "getStatus") {
      const status = await ifoodRequest({
        token,
        baseUrl,
        method: "GET",
        path: `/merchant/v1.0/merchants/${merchantId}/status`,
      });
      return jsonResponse({ success: true, status });
    }

    if (action === "listInterruptions") {
      const interruptions = await ifoodRequest({
        token,
        baseUrl,
        method: "GET",
        path: `/merchant/v1.0/merchants/${merchantId}/interruptions`,
      });
      return jsonResponse({ success: true, interruptions });
    }

    if (action === "createInterruption") {
      const created = await ifoodRequest({
        token,
        baseUrl,
        method: "POST",
        path: `/merchant/v1.0/merchants/${merchantId}/interruptions`,
        body: payload ?? {},
      });
      return jsonResponse({ success: true, interruption: created });
    }

    if (action === "deleteInterruption") {
      if (!interruptionId) {
        return jsonResponse({ success: false, error: "Missing interruptionId" }, 400);
      }
      const deleted = await ifoodRequest({
        token,
        baseUrl,
        method: "DELETE",
        path: `/merchant/v1.0/merchants/${merchantId}/interruptions/${interruptionId}`,
      });
      return jsonResponse({ success: true, result: deleted });
    }

    if (action === "getOpeningHours") {
      const openingHours = await ifoodRequest({
        token,
        baseUrl,
        method: "GET",
        path: `/merchant/v1.0/merchants/${merchantId}/opening-hours`,
      });
      return jsonResponse({ success: true, openingHours });
    }

    if (action === "putOpeningHours") {
      const result = await ifoodRequest({
        token,
        baseUrl,
        method: "PUT",
        path: `/merchant/v1.0/merchants/${merchantId}/opening-hours`,
        body: payload ?? {},
      });
      return jsonResponse({ success: true, result });
    }

    if (action === "selfTest") {
      const merchants = (await ifoodRequest({
        token,
        baseUrl,
        method: "GET",
        path: "/merchant/v1.0/merchants",
      })) as any[];

      const mId = merchants?.[0]?.id || integration.merchant_id;
      if (!mId) return jsonResponse({ success: false, error: "Nenhuma loja encontrada no token" }, 400);

      const [merchant, status, interruptions, openingHours] = await Promise.all([
        ifoodRequest({ token, baseUrl, method: "GET", path: `/merchant/v1.0/merchants/${mId}` }),
        ifoodRequest({ token, baseUrl, method: "GET", path: `/merchant/v1.0/merchants/${mId}/status` }),
        ifoodRequest({ token, baseUrl, method: "GET", path: `/merchant/v1.0/merchants/${mId}/interruptions` }),
        ifoodRequest({ token, baseUrl, method: "GET", path: `/merchant/v1.0/merchants/${mId}/opening-hours` }),
      ]);

      return jsonResponse({
        success: true,
        merchantId: mId,
        merchants,
        merchant,
        status,
        interruptions,
        openingHours,
      });
    }

    return jsonResponse({ success: false, error: "Unsupported action" }, 400);
  } catch (error: any) {
    return jsonResponse({ success: false, error: error.message || "Unknown error" }, 400);
  }
});
