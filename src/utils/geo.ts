
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

function normalizeAddressKey(address: string) {
  return address
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function getCoordsFromAddress(address: string): Promise<[number, number] | undefined> {
    if (!address) return undefined;
    
    
    const match = address.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    if (match) {
      return [parseFloat(match[1]), parseFloat(match[2])];
    }

    const key = normalizeAddressKey(address);
    if (!key) return undefined;

    
    if (coordsCache.has(key)) {
        return coordsCache.get(key);
    }

    try {
      const boundedUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br&viewbox=-47.25,-22.70,-46.80,-23.10&bounded=1`;
      const unboundedUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`;

      const tryFetch = async (url: string) => {
        const res = await fetchWithTimeout(url, 12000);
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
