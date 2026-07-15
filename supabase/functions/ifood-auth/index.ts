
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_CLIENT_ID = Deno.env.get('IFOOD_APP_CLIENT_ID');
const APP_CLIENT_SECRET = Deno.env.get('IFOOD_APP_CLIENT_SECRET');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const baseUrl = Deno.env.get('IFOOD_API_BASE_URL') || 'https://merchant-api.ifood.com.br';
    const body = await req.json();
    const action = (body.action || 'exchange') as 'userCode' | 'exchange';
    const code = body.code as string | undefined;
    const cliente_id = body.cliente_id as string | undefined;
    const redirect_uri = body.redirect_uri as string | undefined;

    if (!APP_CLIENT_ID || !APP_CLIENT_SECRET) {
      throw new Error('Credenciais do App iFood não configuradas no servidor.');
    }

    if (action === 'userCode') {
      const params = new URLSearchParams();
      params.append('clientId', APP_CLIENT_ID);
      params.append('clientSecret', APP_CLIENT_SECRET);

      const userCodeResp = await fetch(`${baseUrl}/authentication/v1.0/oauth/userCode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: params.toString()
      });

      if (!userCodeResp.ok) {
        const errText = await userCodeResp.text();
        console.error('Erro iFood userCode:', errText);
        throw new Error(`Falha ao gerar código de autorização no iFood: ${errText}`);
      }

      const userCodeData = await userCodeResp.json();
      const authorizationCodeVerifier =
        userCodeData.authorizationCodeVerifier ||
        userCodeData.authorization_code_verifier ||
        userCodeData.codeVerifier ||
        userCodeData.code_verifier ||
        null;

      return new Response(
        JSON.stringify({ success: true, ...userCodeData, authorization_code_verifier: authorizationCodeVerifier }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!code || !cliente_id) {
      throw new Error('Parâmetros "code" e "cliente_id" são obrigatórios.');
    }

    const params = new URLSearchParams();
    params.append('grantType', 'authorization_code');
    params.append('clientId', APP_CLIENT_ID);
    params.append('clientSecret', APP_CLIENT_SECRET);
    params.append('authorizationCode', code);
    const authorizationCodeVerifierRaw =
      ((body as any).authorization_code_verifier as string | undefined) ||
      ((body as any).authorizationCodeVerifier as string | undefined) ||
      ((body as any).codeVerifier as string | undefined) ||
      ((body as any).code_verifier as string | undefined) ||
      undefined;
    const authorizationCodeVerifier = authorizationCodeVerifierRaw?.trim();
    if (!authorizationCodeVerifier) {
      throw new Error("Code Verifier é obrigatório. Gere um novo userCode e conclua a autorização usando o código exibido no Portal.");
    }
    params.append('authorizationCodeVerifier', authorizationCodeVerifier);
    if (redirect_uri) {
      params.append('redirectUri', redirect_uri);
    }

    console.log(`Trocando code por token para cliente ${cliente_id}...`);

    const tokenResp = await fetch(`${baseUrl}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params
    });

    if (!tokenResp.ok) {
      const errData = await tokenResp.json();
      console.error('Erro iFood Auth:', errData);
      throw new Error(`Falha na autenticação com iFood: ${JSON.stringify(errData)}`);
    }

    const tokenData = await tokenResp.json();

    const accessToken = tokenData.accessToken || tokenData.access_token;
    const refreshToken = tokenData.refreshToken || tokenData.refresh_token;
    const expiresIn = tokenData.expiresIn || tokenData.expires_in;

    if (!accessToken) {
      throw new Error('Resposta do iFood não trouxe accessToken.');
    }
    if (!expiresIn) {
      throw new Error('Resposta do iFood não trouxe expiresIn.');
    }
    
    let merchantId = tokenData.merchantId || tokenData.merchant_id;
    
    if (!merchantId) {
      console.log('Merchant ID não retornado no token, buscando detalhes do merchant...');
      const merchResp = await fetch(`${baseUrl}/merchant/v1.0/merchants`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (merchResp.ok) {
        const merchs = await merchResp.json();
       
        if (merchs && merchs.length > 0) {
          merchantId = merchs[0].id;
        }
      }
    }

    if (!merchantId) {
      throw new Error('Não foi possível identificar o Merchant ID do iFood.');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (Number(expiresIn) * 1000)).toISOString();

    const payload = {
      cliente_id: cliente_id,
      merchant_id: merchantId,
      access_token: accessToken,
      refresh_token: refreshToken || null,
      token_expires_at: expiresAt,
      status: 'ativo',
      updated_at: now.toISOString(),
      authorization_code_used: code,
    };

    const { data: existing, error: existingError } = await supabase
      .from('integracoes_ifood')
      .select('id')
      .eq('cliente_id', cliente_id)
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    if (existing && existing.length > 0) {
      const { error: updateError } = await supabase
        .from('integracoes_ifood')
        .update(payload)
        .eq('id', existing[0].id);

      if (updateError) {
        throw updateError;
      }
    } else {
      const { error: insertError } = await supabase
        .from('integracoes_ifood')
        .insert(payload);

      if (insertError) {
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({ success: true, merchantId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
