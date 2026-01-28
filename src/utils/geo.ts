
export function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

const coordsCache = new Map<string, [number, number]>();

export async function getCoordsFromAddress(address: string): Promise<[number, number] | undefined> {
    if (!address) return undefined;
    
    // Check cache first
    if (coordsCache.has(address)) {
        return coordsCache.get(address);
    }

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`, {
        headers: { 'User-Agent': 'RouteDeliveryApp/1.0' }
      });
      const data = await res.json();
      if (data && data[0]) {
        const coords: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        coordsCache.set(address, coords);
        return coords;
      }
    } catch (e) {
      console.error('Error fetching coords for address:', address, e);
    }
    return undefined;
}
