import { useEffect, useRef, useState } from 'react';
import type { Database } from '../lib/database.types';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

interface MapViewProps {
  deliveryPersons: DeliveryPerson[];
  center?: [number, number];
}

export function MapView({ deliveryPersons, center = [-23.5505, -46.6333] }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js';
    script.async = true;
    document.head.appendChild(script);

    const link = document.createElement('link');
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    script.onload = () => {
      if (!mapContainer.current) return;

      (window as any).mapboxgl.accessToken = 'pk.eyJ1IjoiZGVtby1tYXBib3giLCJhIjoiY2wxYWJvcmQxMDB3aTNrbzI5cnQ3cGM5cCJ9.yD3V0r3BNO3TqRd1T9C7Uw';

      map.current = new (window as any).mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [center[1], center[0]],
        zoom: 12,
      });

      map.current.on('load', () => {
        setMapLoaded(true);
      });
    };

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

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

        const popup = new (window as any).mapboxgl.Popup({ offset: 25 }).setHTML(
          `<div style="padding: 8px;">
            <strong>${person.name}</strong><br/>
            <span>Status: ${person.status}</span><br/>
            <span>${person.is_online ? '🟢 Online' : '🔴 Offline'}</span>
          </div>`
        );

        const marker = new (window as any).mapboxgl.Marker(el)
          .setLngLat([person.current_longitude, person.current_latitude])
          .setPopup(popup)
          .addTo(map.current);

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

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full rounded-lg" />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg">
          <div className="text-slate-600">Carregando mapa...</div>
        </div>
      )}
    </div>
  );
}
