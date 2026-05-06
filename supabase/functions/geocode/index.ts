import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  q?: string;
  limit?: number;
  bounded?: boolean;
};

type CacheEntry = { expiresAt: number; value: unknown };

const cache = new Map<string, CacheEntry>();

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function moveTrailingNumberAfterStreet(value: string) {
  const parts = String(value || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return undefined;
  const last = parts[parts.length - 1];
  if (!/^\d+[a-zA-Z]?$/.test(last)) return undefined;
  const street = parts[0];
  if (!street || /\d/.test(street)) return undefined;
  const middle = parts.slice(1, -1);
  if (middle.length === 0) return undefined;
  return [street, last, ...middle].join(", ");
}

function addSpIfMissing(value: string) {
  const q = normalizeKey(value);
  if (!q || !q.includes("campinas")) return undefined;
  if (q.includes(", sp") || q.includes(" sp,") || q.endsWith(" sp")) return undefined;
  if (q.includes("sao paulo") || q.includes("são paulo")) return undefined;
  return `${String(value).trim()}, SP`;
}

function hasCityOrStateHint(query: string) {
  const q = normalizeKey(query);
  const regionHints = [
    "campinas",
    "valinhos",
    "vinhedo",
    "hortolandia",
    "hortolândia",
    "sumare",
    "sumaré",
    "paulinia",
    "paulínia",
    "indaiatuba",
    "jaguariuna",
    "jaguariúna",
    "monte mor",
    "itupeva",
    "sp",
    "sao paulo",
    "são paulo",
  ];
  return regionHints.some((h) => q.includes(h));
}

async function fetchNominatim(q: string, limit: number, bounded: boolean) {
  const viewbox = "-47.60,-22.55,-46.60,-23.35";
  const base = "https://nominatim.openstreetmap.org/search";
  const params = new URLSearchParams({
    format: "jsonv2",
    q,
    addressdetails: "1",
    limit: String(limit),
    countrycodes: "br",
  });
  if (bounded) {
    params.set("bounded", "1");
    params.set("viewbox", viewbox);
  }

  const url = `${base}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "Accept-Language": "pt-BR",
      "User-Agent": "RouteDelivery/1.0 (geocode proxy; contact: support@routedelivery.local)",
    },
  });

  if (!res.ok) {
    return { ok: false as const, status: res.status, data: null as unknown };
  }
  const data = await res.json();
  return { ok: true as const, status: 200, data };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const rawQ = String(body.q || "").trim();
    if (!rawQ || rawQ.length < 3) return json({ results: [] }, 200);

    const limit = Math.max(1, Math.min(10, Number(body.limit || 8)));
    const bounded = body.bounded !== false;

    const moved = moveTrailingNumberAfterStreet(rawQ);
    let q = moved || rawQ;
    if (!hasCityOrStateHint(q)) q = `${q}, Campinas, SP`;
    const sp = addSpIfMissing(q);
    if (sp) q = sp;
    const cacheKey = `${bounded ? "b" : "u"}:${limit}:${normalizeKey(q)}`;
    const now = Date.now();

    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return json({ results: cached.value }, 200);
    }

    const first = await fetchNominatim(q, limit, bounded);
    if (first.ok) {
      cache.set(cacheKey, { expiresAt: now + 1000 * 60 * 60, value: first.data });
      return json({ results: first.data }, 200);
    }

    const fallback = await fetchNominatim(q, limit, false);
    if (fallback.ok) {
      cache.set(`u:${limit}:${normalizeKey(q)}`, { expiresAt: now + 1000 * 60 * 60, value: fallback.data });
      return json({ results: fallback.data }, 200);
    }

    return json({ results: [], error: "UPSTREAM_ERROR", status: first.status }, 200);
  } catch (e) {
    const msg = (e as { message?: string })?.message || "Erro interno";
    return json({ results: [], error: msg }, 500);
  }
});
