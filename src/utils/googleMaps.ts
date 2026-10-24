// Geolocalização pelo Google — via REST (sem SDK), usado só quando a aba
// Configurações estiver no provedor "Google" com uma chave válida.
//  - Endereço / coordenada  -> Geocoding API (maps.googleapis.com/maps/api/geocode/json)
//  - Rota / distância        -> Routes API nova (routes.googleapis.com/directions/v2:computeRoutes)
// O mapa (tiles) continua sempre OpenStreetMap. Se o Google falhar, quem
// chama (geo.ts) cai automaticamente para o OpenStreetMap (Nominatim/OSRM).

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export interface GoogleSuggestion {
  description: string;
  lat?: number;
  lng?: number;
}

/** Geocoding API: devolve as melhores correspondências de um texto de endereço (para o autocomplete). */
export async function geocodeGoogleSuggestions(query: string, apiKey: string): Promise<GoogleSuggestion[]> {
  if (!apiKey || !query) return [];
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', query);
    url.searchParams.set('region', 'br');
    url.searchParams.set('language', 'pt-BR');
    url.searchParams.set('components', 'country:BR');
    url.searchParams.set('key', apiKey);
    const res = await fetchWithTimeout(url.toString(), 12000);
    if (!res.ok) return [];
    const data = await res.json();
    if (data?.status !== 'OK' || !Array.isArray(data.results)) {
      if (data?.status && data.status !== 'ZERO_RESULTS') {
        console.error('[googleMaps] Geocoding API:', data.status, data.error_message || '');
      }
      return [];
    }
    return data.results.map((r: any) => ({
      description: String(r.formatted_address || ''),
      lat: r?.geometry?.location?.lat,
      lng: r?.geometry?.location?.lng,
    }));
  } catch (err) {
    console.error('[googleMaps] Geocoding falhou:', err);
    return [];
  }
}

/** Geocoding API: primeira coordenada de um texto de endereço. */
export async function geocodeGoogle(address: string, apiKey: string): Promise<[number, number] | undefined> {
  const results = await geocodeGoogleSuggestions(address, apiKey);
  const first = results.find((r) => typeof r.lat === 'number' && typeof r.lng === 'number');
  if (first && typeof first.lat === 'number' && typeof first.lng === 'number') {
    return [first.lat, first.lng];
  }
  return undefined;
}

export interface GoogleReverseResult {
  cep?: string;
  formattedAddress?: string;
}

/** Geocoding API (reverse): CEP + endereço formatado de uma coordenada. */
export async function reverseGeocodeGoogle(lat: number, lng: number, apiKey: string): Promise<GoogleReverseResult | undefined> {
  if (!apiKey) return undefined;
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('language', 'pt-BR');
    url.searchParams.set('key', apiKey);
    const res = await fetchWithTimeout(url.toString(), 8000);
    if (!res.ok) return undefined;
    const data = await res.json();
    if (data?.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) return undefined;
    const result = data.results[0];
    const comp = Array.isArray(result?.address_components) ? result.address_components : [];
    const postal = comp.find((c: any) => Array.isArray(c.types) && c.types.includes('postal_code'));
    const cepDigits = postal?.long_name ? String(postal.long_name).replace(/\D/g, '') : '';
    const cep = cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : undefined;
    const formattedAddress = result?.formatted_address ? String(result.formatted_address) : undefined;
    if (!cep && !formattedAddress) return undefined;
    return { cep, formattedAddress };
  } catch (err) {
    console.error('[googleMaps] Reverse geocoding falhou:', err);
    return undefined;
  }
}

/**
 * Routes API nova (computeRoutes): distância de direção em km, somando os
 * trechos entre os pontos. Origem = primeiro ponto, destino = último, os do
 * meio entram como `intermediates`. Devolve null se falhar (quem chama cai
 * pro OSRM).
 */
export async function routeDistanceGoogle(coords: { lat: number; lon: number }[], apiKey: string): Promise<number | null> {
  if (!apiKey || coords.length < 2) return null;
  try {
    const toWaypoint = (c: { lat: number; lon: number }) => ({
      location: { latLng: { latitude: c.lat, longitude: c.lon } },
    });
    const body = {
      origin: toWaypoint(coords[0]),
      destination: toWaypoint(coords[coords.length - 1]),
      intermediates: coords.slice(1, -1).map(toWaypoint),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    };
    const res = await fetchWithTimeout('https://routes.googleapis.com/directions/v2:computeRoutes', 12000, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('[googleMaps] Routes API HTTP', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    const meters = data?.routes?.[0]?.distanceMeters;
    if (typeof meters === 'number' && meters > 0) return meters / 1000;
    return null;
  } catch (err) {
    console.error('[googleMaps] Routes API falhou:', err);
    return null;
  }
}
