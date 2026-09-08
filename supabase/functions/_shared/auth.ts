// ============================================================================
// Helper de autenticação para Edge Functions.
//
// Contexto: os containers de edge-function sobem com VERIFY_JWT=false e as rotas
// do Kong só têm o plugin `cors` — ou seja, sem checagem, qualquer um na
// internet chama /functions/v1/<nome>. Cada função que faz algo sensível PRECISA
// validar o chamador aqui dentro.
//
//   authenticate(req)  -> { user, isAdmin } | null   (null = sem token válido)
//   requireAdmin(req)  -> { user } | Response(401/403)
//   verifyWebhookSignature(...) -> boolean            (para webhooks de terceiros)
//   requireSharedSecret(req, envName) -> boolean      (para cron / trigger do DB)
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuthResult = { user: Record<string, unknown>; isAdmin: boolean };

function bearer(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

export async function authenticate(req: Request): Promise<AuthResult | null> {
  const token = bearer(req);
  if (!token) return null;

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anon) return null;

  const supa = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user?.id) return null; // anon/service key não tem user.id

  let isAdmin = false;
  try {
    const { data: adm } = await supa.rpc("is_admin");
    isAdmin = adm === true;
  } catch (_) {
    isAdmin = false;
  }
  return { user: data.user as Record<string, unknown>, isAdmin };
}

export function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Exige um usuário autenticado E admin. Retorna Response de erro se falhar. */
export async function requireAdmin(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ user: Record<string, unknown> } | Response> {
  const auth = await authenticate(req);
  if (!auth) return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  if (!auth.isAdmin) return jsonResponse({ error: "forbidden" }, 403, corsHeaders);
  return { user: auth.user };
}

/** Exige apenas usuário autenticado (qualquer papel). */
export async function requireUser(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ user: Record<string, unknown>; isAdmin: boolean } | Response> {
  const auth = await authenticate(req);
  if (!auth) return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  return auth;
}

/** Compara duas strings em tempo constante (evita timing attack). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // comprimento diferente: ainda faz um loop para não vazar o tamanho
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** Compara em tempo constante um header contra um segredo de ambiente. */
export function requireSharedSecret(req: Request, envName: string): boolean {
  const expected = Deno.env.get(envName) ?? "";
  const got = req.headers.get("x-webhook-secret") ?? "";
  if (!expected || expected.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/** Valida assinatura HMAC-SHA256 hex de um webhook de terceiro. */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const got = signatureHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  if (got.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
