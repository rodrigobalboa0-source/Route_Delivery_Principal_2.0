import { useEffect, useRef, useState } from 'react';
import type { Database } from '../lib/database.types';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

type GLMap = {
  on: (event: string, handler: (ev?: unknown) => void) => void;
  remove: () => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
  removeLayer: (id: string) => void;
  removeSource: (id: string) => void;
};

type GLMarker = {
  setLngLat: (lngLat: [number, number]) => GLMarker;
  getElement: () => HTMLElement;
  addTo: (map: GLMap) => GLMarker;
  setPopup: (popup: unknown) => GLMarker;
  remove: () => void;
};

type GLPopup = {
  setHTML: (html: string) => GLPopup;
};

interface MapViewProps {
  deliveryPersons: DeliveryPerson[];
  center?: [number, number];
  destination?: [number, number];
  route?: Array<[number, number]>;
}

export function MapView({ deliveryPersons, center = [-23.5505, -46.6333], destination, route }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<GLMap | null>(null);
  const markers = useRef<Map<string, GLMarker>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const destMarker = useRef<GLMarker | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/maplibre-gl@3.6.1/dist/maplibre-gl.js';
    script.async = true;
    document.head.appendChild(script);

    const link = document.createElement('link');
    link.href = 'https://unpkg.com/maplibre-gl@3.6.1/dist/maplibre-gl.css';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    script.onload = () => {
      if (!mapContainer.current) return;

      const maplibre = (window as unknown as {
        maplibregl: {
          Map: new (opts: unknown) => GLMap;
          Popup: new (opts: unknown) => GLPopup;
          Marker: new (el: HTMLElement) => GLMarker;
        };
      }).maplibregl;

      const osmRasterStyle = {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm'
          }
        ]
      } as unknown;

      map.current = new maplibre.Map({
        container: mapContainer.current,
        style: osmRasterStyle,
        center: [center[1], center[0]],
        zoom: 12,
        maxZoom: 19,
      });

      map.current.on('load', () => {
        setMapLoaded(true);
      });

      map.current.on('error', () => {
        setMapError('Erro ao carregar o mapa.');
      });
    };

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [center]);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const currentMarkerIds = new Set<string>();

    deliveryPersons.forEach((person) => {
      if (!person.current_latitude || !person.current_longitude) return;

      currentMarkerIds.add(person.id);

      const existingMarker = markers.current.get(person.id);

      if (existingMarker) {
        existingMarker.setLngLat([person.current_longitude, person.current_latitude]);

        const el = existingMarker.getElement();
        el.className = `marker ${person.status} ${person.is_online ? 'online' : 'offline'}`;
      } else {
        const el = document.createElement('div');
        el.className = `marker ${person.status} ${person.is_online ? 'online' : 'offline'}`;
        el.style.width = '32px';
        el.style.height = '32px';
        el.style.borderRadius = '50%';
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        el.style.cursor = 'pointer';

        if (person.status === 'disponivel') {
          el.style.backgroundColor = '#0ea5e9';
        } else if (person.status === 'em_entrega') {
          el.style.backgroundColor = '#3b82f6';
        } else {
          el.style.backgroundColor = '#6b7280';
        }

        const w = window as unknown as {
          maplibregl: {
            Popup: new (opts: unknown) => GLPopup;
            Marker: new (el: HTMLElement) => GLMarker;
          };
        };
        const popup = new w.maplibregl.Popup({ offset: 25 }).setHTML(
          `<div style="padding: 8px;">
            <strong>${person.name}</strong><br/>
            <span>Status: ${person.status}</span><br/>
            <span>${person.is_online ? '🟢 Online' : '🔴 Offline'}</span>
          </div>`
        );

        const marker = new w.maplibregl.Marker(el)
          .setLngLat([person.current_longitude, person.current_latitude])
          .setPopup(popup)
          .addTo(map.current as GLMap);

        markers.current.set(person.id, marker);
      }
    });

    markers.current.forEach((marker, id) => {
      if (!currentMarkerIds.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    });
  }, [deliveryPersons, mapLoaded]);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    if (!destination) {
      destMarker.current?.remove();
      destMarker.current = null;
      return;
    }
    const lngLat: [number, number] = [destination[1], destination[0]];
    const w = window as unknown as {
      maplibregl: {
        Popup: new (opts: unknown) => GLPopup;
        Marker: new (el: HTMLElement) => GLMarker;
      };
    };
    if (destMarker.current) {
      destMarker.current.setLngLat(lngLat);
    } else {
      const el = document.createElement('div');
      el.style.width = '28px';
      el.style.height = '28px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#ef4444';
      el.style.border = '3px solid white';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      const popup = new w.maplibregl.Popup({ offset: 20 }).setHTML('<div style="padding:6px"><strong>Destino</strong></div>');
      destMarker.current = new w.maplibregl.Marker(el).setLngLat(lngLat).setPopup(popup).addTo(map.current as GLMap);
    }
  }, [destination, mapLoaded]);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const id = 'route-line';
    if (!route || route.length < 2) {
      try { map.current.removeLayer(id); } catch { void 0; }
      try { map.current.removeSource(id); } catch { void 0; }
      return;
    }
    const coords = route.map((p) => [p[1], p[0]]);
    const data = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } as unknown;
    const src = map.current.getSource(id);
    if (src) {
      src.setData(data);
    } else {
      map.current.addSource(id, { type: 'geojson', data });
      map.current.addLayer({ id, type: 'line', source: id, paint: { 'line-color': '#0ea5e9', 'line-width': 4 } });
    }
  }, [route, mapLoaded]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full rounded-lg" />
      {!mapLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg">
          <div className="text-slate-600">Carregando mapa...</div>
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg">
          <div className="text-red-600 font-medium px-4 py-2 bg-red-50 border border-red-200 rounded">
            {mapError}
          </div>
        </div>
      )}
    </div>
  );
}
