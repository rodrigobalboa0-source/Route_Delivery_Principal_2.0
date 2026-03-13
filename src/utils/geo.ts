
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

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function getCoordsFromEdgeFunction(address: string): Promise<[number, number] | undefined> {
  const q = sanitizeAddressQuery(address);
  if (!q) return undefined;
  try {
    const { data, error } = await supabase.functions.invoke('geocode', {
      body: { q, limit: 1, bounded: true },
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
      const boundedUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(sanitized)}&limit=1&countrycodes=br&viewbox=${viewbox}&bounded=1`;
      const unboundedUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(sanitized)}&limit=1&countrycodes=br`;

      const tryFetch = async (url: string) => {
        const res = await fetchWithTimeout(url, 12000, { headers: { 'Accept-Language': 'pt-BR' } });
        if (!res.ok) return undefined;
        const data = await res.json();
        if (data && data[0]) {
          return [parseFloat(data[0].lat), parseFloat(data[0].lon)] as [number, number];
        }
        return undefined;
      };

      const coords = (await tryFetch(boundedUrl)) ?? (await tryFetch(unboundedUrl));
      if (coords) {
        coordsCache.set(key, coords);
        return coords;
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
