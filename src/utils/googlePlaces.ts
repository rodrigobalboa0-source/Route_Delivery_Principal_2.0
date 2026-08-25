const GOOGLE_PLACES_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

export interface PlaceSuggestion {
  placeId: string;
  description: string;
}

export function newSessionToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Places API (New) — Autocomplete: sugestões de endereço com número de casa real. */
export async function autocompletePlaces(input: string, sessionToken: string): Promise<PlaceSuggestion[]> {
  if (!GOOGLE_PLACES_KEY || !input.trim()) return [];
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
      },
      body: JSON.stringify({
        input,
        sessionToken,
        includedRegionCodes: ['br'],
        languageCode: 'pt-BR',
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
    return suggestions
      .map((s: any) => s.placePrediction)
      .filter(Boolean)
      .map((p: any) => ({ placeId: String(p.placeId || ''), description: String(p.text?.text || '') }))
      .filter((s: PlaceSuggestion) => s.placeId && s.description);
  } catch {
    return [];
  }
}

/** Places API (New) — Place Details: resolve lat/lng exato (nível de número) a partir do placeId escolhido. */
export async function getPlaceCoords(
  placeId: string,
  sessionToken: string
): Promise<{ lat: number; lng: number; formattedAddress: string } | undefined> {
  if (!GOOGLE_PLACES_KEY || !placeId) return undefined;
  try {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
        'X-Goog-FieldMask': 'location,formattedAddress',
      },
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    const lat = data?.location?.latitude;
    const lng = data?.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
    return { lat, lng, formattedAddress: String(data?.formattedAddress || '') };
  } catch {
    return undefined;
  }
}
