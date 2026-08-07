const MAPS_API_URL = String(import.meta.env.VITE_MAPS_API_URL || '').replace(/\/+$/, '');
const MAPS_API_KEY = String(import.meta.env.VITE_MAPS_API_KEY || '').trim();

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

// A autocomplete da carbymaps já devolve lat/lng prontos por sugestão (dados
// do CNEFE/IBGE), então guardamos aqui pra getPlaceCoords não precisar de uma
// segunda chamada de rede — só mantém a mesma forma de API do googlePlaces.ts
// (autocompletePlaces + getPlaceCoords) pra minimizar mudança nos chamadores.
const coordsCache = new Map<string, { lat: number; lng: number; formattedAddress: string }>();

export function newSessionToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Autocomplete de endereço via Maps API própria (dados do CNEFE/IBGE). O
 * segundo parâmetro existe só por compatibilidade com a assinatura anterior
 * (googlePlaces.ts usava sessionToken pra otimizar cobrança do Google) — a
 * carbymaps não precisa disso, é ignorado. */
export async function autocompletePlaces(input: string, _sessionToken?: string): Promise<PlaceSuggestion[]> {
  void _sessionToken;
  if (!MAPS_API_URL || !input.trim()) return [];
  try {
    const url = new URL(`${MAPS_API_URL}/v1/autocomplete`);
    url.searchParams.set('input', input);
    const res = await fetch(url.toString(), {
      headers: { 'X-API-Key': MAPS_API_KEY },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const predictions = Array.isArray(data?.predictions) ? data.predictions : [];
    const suggestions: PlaceSuggestion[] = [];
    for (const p of predictions) {
      const placeId = String(p?.place_id || '');
      const description = String(p?.description || '');
      if (!placeId || !description) continue;
      if (typeof p?.lat === 'number' && typeof p?.lng === 'number') {
        coordsCache.set(placeId, { lat: p.lat, lng: p.lng, formattedAddress: description });
      }
      suggestions.push({ placeId, description });
    }
    return suggestions;
  } catch {
    return [];
  }
}

/** Resolve lat/lng a partir do placeId escolhido — já veio pronto do autocomplete, sem nova chamada de rede. */
export async function getPlaceCoords(
  placeId: string,
  _sessionToken?: string
): Promise<{ lat: number; lng: number; formattedAddress: string } | undefined> {
  void _sessionToken;
  return coordsCache.get(placeId);
}
