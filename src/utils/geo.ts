
const MAPS_API_URL = import.meta.env.VITE_MAPS_API_URL;
const MAPS_API_KEY = import.meta.env.VITE_MAPS_API_KEY;

export function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; 
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

const coordsCache = new Map<string, [number, number]>();

function sanitizeAddressQuery(address: string) {
  return String(address || '')
    .replace(/\s+-\s+/g, ', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/,+/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAddressKey(address: string) {
  return sanitizeAddressQuery(address)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function moveTrailingNumberAfterStreet(address: string) {
  const parts = sanitizeAddressQuery(address)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 3) return undefined;
  const last = parts[parts.length - 1];
  if (!/^\d+[a-zA-Z]?$/.test(last)) return undefined;
  const street = parts[0];
  if (!street || /\d/.test(street)) return undefined;

  const middle = parts.slice(1, -1);
  if (middle.length === 0) return undefined;

  return [street, last, ...middle].join(', ');
}

function addSpIfMissing(address: string) {
  const q = normalizeAddressKey(address);
  if (!q) return undefined;
  if (!q.includes('campinas')) return undefined;
  if (q.includes(', sp') || q.includes(' sp,') || q.endsWith(' sp')) return undefined;
  if (q.includes('sao paulo') || q.includes('são paulo')) return undefined;
  return `${sanitizeAddressQuery(address)}, SP`;
}

function buildGeocodeCandidates(address: string) {
  const base = sanitizeAddressQuery(address);
  if (!base) return [];

  const candidates: string[] = [base];
  const moved = moveTrailingNumberAfterStreet(base);
  if (moved && normalizeAddressKey(moved) !== normalizeAddressKey(base)) candidates.push(moved);

  const spBase = addSpIfMissing(base);
  if (spBase) candidates.push(spBase);
  const spMoved = moved ? addSpIfMissing(moved) : undefined;
  if (spMoved) candidates.push(spMoved);

  if (!hasCityOrStateHint(base)) candidates.push(`${base}, Campinas, SP`);

  const baseNoAccents = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalizeAddressKey(baseNoAccents) !== normalizeAddressKey(base)) {
    candidates.push(baseNoAccents);
    const movedNoAccents = moveTrailingNumberAfterStreet(baseNoAccents);
    if (movedNoAccents) candidates.push(movedNoAccents);
    const spNoAccents = addSpIfMissing(baseNoAccents);
    if (spNoAccents) candidates.push(spNoAccents);
    const spMovedNoAccents = movedNoAccents ? addSpIfMissing(movedNoAccents) : undefined;
    if (spMovedNoAccents) candidates.push(spMovedNoAccents);
    if (!hasCityOrStateHint(baseNoAccents)) candidates.push(`${baseNoAccents}, Campinas, SP`);
  }

  const seen = new Set<string>();
  return candidates.filter((c) => {
    const k = normalizeAddressKey(c);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function hasCityOrStateHint(address: string) {
  const q = normalizeAddressKey(address);
  if (!q) return false;
  if (q.includes('campinas')) return true;
  if (q.includes(', sp') || q.includes(' sp,')) return true;
  if (q.includes('sao paulo') || q.includes('são paulo')) return true;
  return false;
}

/** Geocodifica um texto de endereço via /v1/geocode da Maps API própria (aceita CEP ou texto livre). */
async function invokeGeocodeApi(q: string): Promise<[number, number] | undefined> {
  try {
    const url = new URL(`${String(MAPS_API_URL || '').replace(/\/+$/, '')}/v1/geocode`);
    url.searchParams.set('address', q);
    const res = await fetchWithTimeout(url.toString(), 12000, {
      headers: { 'X-API-Key': MAPS_API_KEY },
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    const location = data?.results?.[0]?.geometry?.location;
    if (data?.status === 'OK' && typeof location?.lat === 'number' && typeof location?.lng === 'number') {
      return [location.lat, location.lng];
    }
  } catch (e) {
    void e;
  }
  return undefined;
}

async function getCoordsFromMapsApi(address: string): Promise<[number, number] | undefined> {
  const uniqueCandidates = buildGeocodeCandidates(address);
  if (uniqueCandidates.length === 0) return undefined;

  for (const q of uniqueCandidates) {
    const coords = await invokeGeocodeApi(q);
    if (coords) return coords;
  }

  return undefined;
}

export async function getCoordsFromAddress(address: string): Promise<[number, number] | undefined> {
    if (!address) return undefined;
    const sanitized = sanitizeAddressQuery(address);


    const match = sanitized.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    if (match) {
      return [parseFloat(match[1]), parseFloat(match[2])];
    }

    const key = normalizeAddressKey(sanitized);
    if (!key) return undefined;


    if (coordsCache.has(key)) {
        return coordsCache.get(key);
    }

    try {
      const coords = await getCoordsFromMapsApi(sanitized);
      if (coords) {
        coordsCache.set(key, coords);
        return coords;
      }
    } catch (e) {
      console.error('Error fetching coords for address:', address, e);
    }
    return undefined;
}

export function extractCepFromAddress(address: string): string | null {
  const match = String(address || '').match(/(\d{5})-?(\d{3})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

export interface ConfirmarPinInput {
  cep: string;
  lat: number;
  lng: number;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
}

export interface ConfirmarPinResult {
  ok: boolean;
  lat?: number;
  lng?: number;
  formattedAddress?: string;
  error?: string;
}

/** Salva uma posição confirmada manualmente na Maps API própria (POST /v1/geocode/confirmar) — fica permanente (fonte='confirmado_manual', prioridade máxima em /v1/geocode e /v1/autocomplete futuros pro mesmo CEP). */
export async function confirmarPinPreciso(input: ConfirmarPinInput): Promise<ConfirmarPinResult> {
  try {
    const url = `${String(MAPS_API_URL || '').replace(/\/+$/, '')}/v1/geocode/confirmar`;
    const res = await fetchWithTimeout(url, 8000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': MAPS_API_KEY },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.status !== 'OK') {
      return { ok: false, error: data?.error_message || `Falha ao confirmar localização (HTTP ${res.status})` };
    }
    const result = data?.results?.[0];
    const location = result?.geometry?.location;
    return {
      ok: true,
      lat: typeof location?.lat === 'number' ? location.lat : input.lat,
      lng: typeof location?.lng === 'number' ? location.lng : input.lng,
      formattedAddress: result?.formatted_address,
    };
  } catch (e) {
    void e;
    return { ok: false, error: 'Falha de conexão ao confirmar localização' };
  }
}

export interface ReverseGeocodeResult {
  cep?: string;
  formattedAddress?: string;
}

/** Descobre o CEP mais próximo de uma coordenada (GET /v1/geocode/reverse) — usado pelo AddressPinPicker pra preencher o CEP sozinho a partir da posição do pin, sem depender do usuário saber/digitar o CEP no texto de busca. */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | undefined> {
  try {
    const url = new URL(`${String(MAPS_API_URL || '').replace(/\/+$/, '')}/v1/geocode/reverse`);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    const res = await fetchWithTimeout(url.toString(), 8000, {
      headers: { 'X-API-Key': MAPS_API_KEY },
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    const result = data?.results?.[0];
    if (data?.status !== 'OK' || !result?.cep) return undefined;
    return { cep: result.cep, formattedAddress: result.formatted_address };
  } catch (e) {
    void e;
    return undefined;
  }
}

export async function getDrivingRouteDistance(coords: {lat: number, lon: number}[]): Promise<number | null> {
  if (coords.length < 2) return 0;
  try {
    const coordString = coords.map(c => `${c.lon},${c.lat}`).join(';');
    
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=false&alternatives=true&steps=false`;
    const response = await fetchWithTimeout(url, 12000);
    if (!response.ok) return null;
    const data = await response.json();
    
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {

      const shortestRoute = data.routes.reduce((min: any, current: any) => {
        return (current.distance < min.distance) ? current : min;
      }, data.routes[0]);

      const drivingKm = shortestRoute.distance / 1000;

      let straightLineKm = 0;
      for (let i = 0; i < coords.length - 1; i++) {
        straightLineKm += getDistanceFromLatLonInKm(coords[i].lat, coords[i].lon, coords[i + 1].lat, coords[i + 1].lon);
      }
      if (straightLineKm > 0.05 && drivingKm > straightLineKm * 2.5 + 3) {
        console.warn('[getDrivingRouteDistance] Distância implausível descartada:', { drivingKm, straightLineKm });
        return null;
      }

      return drivingKm;
    }
  } catch (error) {
    console.error('Error fetching OSRM route:', error);
  }
  return null;
}
