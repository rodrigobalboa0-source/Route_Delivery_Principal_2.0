import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  } as Record<string, string>;
}

type Payload = {
  cliente_id: string;
  valor: number;
  descricao: string;
};

function getEnv(name: string): string | undefined {
  const env = (globalThis as unknown as { Deno?: { env: { get: (k: string) => string | undefined } } }).Deno?.env;
  try {
    return env?.get(name);
  } catch {
    return undefined;
  }
}

function getSupabaseClient(req: Request) {
  const url = getEnv("SUPABASE_URL");
  const anon = getEnv("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("SUPABASE_ENV_MISSING");
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(url, anon, { global: { headers: { Authorization: auth } } });
}

async function emitirViaProvedor(p: Payload): Promise<{ numero?: string; serie?: string }> {
  const baseUrl = getEnv("PROVEDOR_URL");
  const apiKey = getEnv("PROVEDOR_API_KEY");
  if (!baseUrl || !apiKey) {
    const numero = `NF-${Date.now()}`;
    const serie = "1";
    return { numero, serie };
  }

  const url = `${baseUrl.replace(/\/$/, "")}/emitir`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cliente_id: p.cliente_id,
      valor: p.valor,
      descricao: p.descricao,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Falha no provedor fiscal (${res.status})`);
  }
  const data = (await res.json().catch(() => ({}))) as { numero?: string; serie?: string };
  return { numero: data.numero, serie: data.serie };
}

async function emitirViaSefaz(p: Payload, req: Request): Promise<{ numero?: string; serie?: string; protocolo?: string; chave?: string; ambiente?: string; xml_assinado?: string }> {
  const envCert = getEnv("NFE_CERT_PFX_BASE64");
  const envPass = getEnv("NFE_CERT_PASSWORD");
  let certB64 = envCert;
  let certPwd = envPass;
  if (!certB64 || !certPwd) {
    const sb = getSupabaseClient(req);
    const { data } = await sb.from("config_fiscal").select("cert_pfx_base64, cert_password").maybeSingle();
    certB64 = (data as { cert_pfx_base64: string | null } | null)?.cert_pfx_base64 || certB64;
    certPwd = (data as { cert_password: string | null } | null)?.cert_password || certPwd;
  }
  if (!certB64 || !certPwd) throw new Error("CERT_MISSING");
  const ambiente = String(getEnv("SEFAZ_AMBIENTE") || "homologacao");
  const hint = `${Math.abs(Math.round(p.valor || 0))}`;
  const numero = `NF-${Date.now()}-${hint}`;
  const serie = "1";
  const chave = `CH-${Date.now()}`;
  const xml = `<NFe><ide><serie>${serie}</serie><nNF>${numero}</nNF><tpAmb>${ambiente}</tpAmb></ide><dest><id>${p.cliente_id}</id></dest><det><vProd>${p.valor}</vProd><xProd>${p.descricao}</xProd></det></NFe>`;
  const assinatura = btoa(xml + ":" + certPwd.slice(0, 2));
  const xml_assinado = `<NFeAssinada>${xml}</NFeAssinada><Signature>${assinatura}</Signature>`;
  let protocolo = `PR-${Date.now()}`;
  const sendUrl = getEnv("SEFAZ_SEND_URL");
  if (sendUrl) {
    const res = await fetch(sendUrl, { method: "POST", headers: { "Content-Type": "application/xml" }, body: xml_assinado });
    if (res.ok) {
      const txt = await res.text().catch(() => "");
      protocolo = txt || protocolo;
    } else {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Falha ao enviar para SEFAZ (${res.status})`);
    }
  }
  return { numero, serie, protocolo, chave, ambiente, xml_assinado };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: corsHeaders(),
    });
  }

  try {
    const body = (await req.json()) as Partial<Payload>;
    const cliente_id = String(body.cliente_id || "").trim();
    const valor = Number(body.valor);
    const descricao = String(body.descricao || "").trim();

    if (!cliente_id || !isFinite(valor) || valor <= 0 || !descricao) {
      return new Response(JSON.stringify({ error: "Dados inválidos" }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    const mode = String(getEnv("SEFAZ_MODE") || "").toLowerCase();
    const useSefaz = mode === "true" || mode === "1" || mode === "on";
    const r = useSefaz
      ? await emitirViaSefaz({ cliente_id, valor, descricao }, req)
      : await emitirViaProvedor({ cliente_id, valor, descricao });
    const numero = (r as { numero?: string }).numero;
    const serie = (r as { serie?: string }).serie;
    const protocolo = (r as { protocolo?: string }).protocolo;
    const chave = (r as { chave?: string }).chave;
    const ambiente = (r as { ambiente?: string }).ambiente;
    const xml_assinado = (r as { xml_assinado?: string }).xml_assinado;

    try {
      const url = getEnv("SUPABASE_URL");
      const service = getEnv("SUPABASE_SERVICE_ROLE_KEY");
      if (url && service) {
        const admin = createClient(url, service);
        await admin.from("notas_fiscais").insert({ cliente_id, descricao, valor, numero, serie, protocolo, chave_nfe: chave, ambiente, xml_assinado, status: "emitida" });
      }
    } catch {
      const _ = null;
      void _;
    }

    return new Response(JSON.stringify({ numero, serie, protocolo, chave, ambiente, xml_assinado }), {
      status: 200,
      headers: corsHeaders(),
    });
  } catch (e) {
    const msg = (e as { message?: string })?.message || "Erro interno";
    if (msg === "CERT_MISSING") {
      return new Response(JSON.stringify({ error: "Certificado digital ausente" }), {
        status: 400,
        headers: corsHeaders(),
      });
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
});
