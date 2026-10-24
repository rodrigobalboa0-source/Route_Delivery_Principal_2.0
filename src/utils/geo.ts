// Geolocalização com provedor configurável na aba Configurações:
//  - OpenStreetMap (padrão): Nominatim (endereço) + OSRM (rota).
//  - Google (opcional): Geocoding API (endereço) + Routes API (rota), com
//    reserva automática no OpenStreetMap quando o Google não responde.
// O mapa (tiles) é sempre OpenStreetMap, independente do provedor escolhido.
import { getMapaConfig } from '../lib/mapaConfig';
import { geocodeGoogle, reverseGeocodeGoogle, routeDistanceGoogle } from './googleMaps';

async function googleAtivo(): Promise<string | null> {
  try {
    const cfg = await getMapaConfig();
    return cfg.provider === 'google' && cfg.apiKey ? cfg.apiKey : null;
  } catch {
    return null;
  }
}

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
    .replace(/[̀-ͯ]/g, '')
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

  const baseNoAccents = base.normalize('NFD').replace(/[̀-ͯ]/g, '');
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

/** Geocodifica um texto de endereço via Nominatim (OpenStreetMap). */
async function geocodeNominatim(q: string): Promise<[number, number] | undefined> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'br');
    url.searchParams.set('accept-language', 'pt-BR');
    url.searchParams.set('q', q);
    const res = await fetchWithTimeout(url.toString(), 12000, { headers: { Accept: 'application/json' } });
    if (!res.ok) return undefined;
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : undefined;
    if (first && first.lat != null && first.lon != null) {
      const lat = Number(first.lat);
      const lon = Number(first.lon);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) return [lat, lon];
    }
  } catch (e) {
    void e;
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

    // 1) Google (Geocoding API) — quando configurado na aba Configurações.
    try {
      const apiKey = await googleAtivo();
      if (apiKey) {
        const g = await geocodeGoogle(sanitized, apiKey);
        if (g) {
          coordsCache.set(key, g);
          return g;
        }
      }
    } catch (e) {
      void e;
    }

    // 2) OpenStreetMap (Nominatim) — padrão e reserva. Tenta cada variação.
    try {
      const candidates = buildGeocodeCandidates(sanitized);
      for (const q of candidates) {
        const coords = await geocodeNominatim(q);
        if (coords) {
          coordsCache.set(key, coords);
          return coords;
        }
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

/**
 * Confirma a posição marcada manualmente no mapa. Como a geolocalização é
 * 100% OpenStreetMap (sem serviço próprio pra salvar pin), a posição marcada
 * é usada diretamente — não é persistida num geocoder externo.
 */
export async function confirmarPinPreciso(input: ConfirmarPinInput): Promise<ConfirmarPinResult> {
  const formattedAddress = [
    input.numero && input.logradouro ? `${input.logradouro}, ${input.numero}` : input.logradouro,
    input.bairro,
    input.cidade && input.uf ? `${input.cidade} - ${input.uf}` : (input.cidade || input.uf),
    input.cep,
  ].filter(Boolean).join(', ') || undefined;

  return { ok: true, lat: input.lat, lng: input.lng, formattedAddress };
}

export interface ReverseGeocodeResult {
  cep?: string;
  formattedAddress?: string;
}

/** Descobre o endereço/CEP mais próximo de uma coordenada via Nominatim (OpenStreetMap) — usado pelo AddressPinPicker pra preencher o CEP a partir da posição do pin. */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | undefined> {
  // 1) Google (reverse) — quando configurado.
  try {
    const apiKey = await googleAtivo();
    if (apiKey) {
      const g = await reverseGeocodeGoogle(lat, lng, apiKey);
      if (g?.cep || g?.formattedAddress) return g;
    }
  } catch (e) {
    void e;
  }

  // 2) OpenStreetMap (Nominatim) — padrão e reserva.
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('accept-language', 'pt-BR');
    const res = await fetchWithTimeout(url.toString(), 8000, { headers: { Accept: 'application/json' } });
    if (!res.ok) return undefined;
    const data = await res.json();
    const cepDigits = data?.address?.postcode ? String(data.address.postcode).replace(/\D/g, '') : '';
    const cep = cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : undefined;
    const formattedAddress = data?.display_name ? String(data.display_name) : undefined;
    if (!cep && !formattedAddress) return undefined;
    return { cep, formattedAddress };
  } catch (e) {
    void e;
    return undefined;
  }
}

export async function getDrivingRouteDistance(coords: {lat: number, lon: number}[]): Promise<number | null> {
  if (coords.length < 2) return 0;

  // Distância em linha reta (para a checagem de plausibilidade).
  let straightLineKm = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    straightLineKm += getDistanceFromLatLonInKm(coords[i].lat, coords[i].lon, coords[i + 1].lat, coords[i + 1].lon);
  }
  const implausivel = (km: number) => straightLineKm > 0.05 && km > straightLineKm * 2.5 + 3;

  // 1) Google (Routes API) — quando configurado.
  try {
    const apiKey = await googleAtivo();
    if (apiKey) {
      const gkm = await routeDistanceGoogle(coords, apiKey);
      if (typeof gkm === 'number' && gkm > 0 && !implausivel(gkm)) {
        return gkm;
      }
    }
  } catch (e) {
    void e;
  }

  // 2) OSRM público (OpenStreetMap) — padrão e reserva.
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

      if (implausivel(drivingKm)) {
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
