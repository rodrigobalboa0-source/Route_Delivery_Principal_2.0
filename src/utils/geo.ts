
import { supabase } from '../lib/supabase';

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

async function invokeGeocode(q: string, bounded: boolean): Promise<[number, number] | undefined> {
  try {
    const { data, error } = await supabase.functions.invoke('geocode', {
      body: { q, limit: 1, bounded },
    });
    if (error) return undefined;
    const results = (data as any)?.results;
    if (Array.isArray(results) && results[0] && typeof results[0].lat === 'string' && typeof results[0].lon === 'string') {
      const lat = parseFloat(results[0].lat);
      const lon = parseFloat(results[0].lon);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) return [lat, lon];
    }
  } catch (e) {
    void e;
  }
  return undefined;
}

async function getCoordsFromEdgeFunction(address: string): Promise<[number, number] | undefined> {
  const uniqueCandidates = buildGeocodeCandidates(address);
  if (uniqueCandidates.length === 0) return undefined;

  for (const q of uniqueCandidates) {
    const boundedCoords = await invokeGeocode(q, true);
    if (boundedCoords) return boundedCoords;

    const unboundedCoords = await invokeGeocode(q, false);
    if (unboundedCoords) return unboundedCoords;
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
      const edgeCoords = await getCoordsFromEdgeFunction(sanitized);
      if (edgeCoords) {
        coordsCache.set(key, edgeCoords);
        return edgeCoords;
      }

      const viewbox = '-47.60,-22.55,-46.60,-23.35';
      const tryFetch = async (url: string) => {
        const res = await fetchWithTimeout(url, 12000, { headers: { 'Accept-Language': 'pt-BR' } });
        if (!res.ok) return undefined;
        const data = await res.json();
        if (data && data[0]) {
          return [parseFloat(data[0].lat), parseFloat(data[0].lon)] as [number, number];
        }
        return undefined;
      };

      const candidates = buildGeocodeCandidates(sanitized);
      for (const q of candidates) {
        const boundedUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=br&viewbox=${viewbox}&bounded=1`;
        const unboundedUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=br`;
        const coords = (await tryFetch(boundedUrl)) ?? (await tryFetch(unboundedUrl));
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
      
      return shortestRoute.distance / 1000; 
    }
  } catch (error) {
    console.error('Error fetching OSRM route:', error);
  }
  return null;
}
