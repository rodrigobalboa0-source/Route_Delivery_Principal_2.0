import { useEffect, useRef, useState } from 'react';
import type { Database } from '../lib/database.types';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

export interface MapDeliveryPerson extends DeliveryPerson {
  foto_url?: string | null;
}


type LeafletMap = {
  remove: () => void;
  flyTo: (latlng: [number, number], zoom?: number, options?: any) => void;
  fitBounds: (bounds: any, options?: any) => void;
  setView: (latlng: [number, number], zoom: number) => void;
  addLayer: (layer: any) => void;
  removeLayer: (layer: any) => void;
};

interface MapViewProps {
  deliveryPersons: MapDeliveryPerson[];
  selectedEntregadorId?: string;
  center?: [number, number];
  origin?: [number, number];
  destination?: [number, number];
  route?: Array<[number, number]>;
  originTitle?: string;
  destinationTitle?: string;
}

export function MapView({ deliveryPersons = [], selectedEntregadorId, center = [-23.5505, -46.6333], origin, destination, route, originTitle, destinationTitle }: MapViewProps) {
  useEffect(() => {
    console.log('MapView initialized (Leaflet version)');
  }, []);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef<Map<string, any>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const destMarker = useRef<any | null>(null);
  const originMarker = useRef<any | null>(null);
  const routePolyline = useRef<any | null>(null);

  useEffect(() => {
    
    if (map.current) return;

    const initMap = () => {
      
      if (!mapContainer.current) return;

      
      const L = (window as any).L;
      if (!L) return;

      
      if ((mapContainer.current as any)._leaflet_id) {
          return;
      }
      
      
      if (map.current) return;

      try {
        const m = L.map(mapContainer.current, {
           center: center,
           zoom: 12,
           attributionControl: false,
           zoomControl: false 
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(m);
        
        L.control.zoom({ position: 'topright' }).addTo(m);

        map.current = m;
        setMapLoaded(true);

      } catch (e: any) {
        
        if (e.message && e.message.includes('Map container is already initialized')) {
             console.warn('Map container already initialized, skipping...');
             return;
        }
        console.error('Failed to initialize Leaflet map:', e);
        setMapError('Não foi possível carregar o mapa.');
      }
    };

    if ((window as any).L) {
      initMap();
    } else {
      if (!document.querySelector('script[src*="leaflet.js"]')) {
          const link = document.createElement('link');
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          link.rel = 'stylesheet';
          document.head.appendChild(link);

          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.async = true;
          document.head.appendChild(script);

          script.onload = initMap;
          script.onerror = () => setMapError('Erro ao carregar script do mapa.');
      } else {
          const interval = setInterval(() => {
              if ((window as any).L) {
                  clearInterval(interval);
                  initMap();
              }
          }, 100);
          setTimeout(() => clearInterval(interval), 10000);
      }
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapLoaded(false);
    };
  }, []);

  
  useEffect(() => {
    if (!map.current || !center) return;
    
    map.current.flyTo(center, 12, { animate: true, duration: 1.5 });
  }, [center[0], center[1]]);

  
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const L = (window as any).L;
    if (!L) return;

    const currentMarkerIds = new Set<string>();

    (deliveryPersons || []).forEach((person) => {
      if (!person.current_latitude || !person.current_longitude) return;

      currentMarkerIds.add(person.id);
      const existingMarker = markers.current.get(person.id);

      const getMarkerColor = (p: MapDeliveryPerson) => {
        if (!p.is_online) return '#6b7280';
        if (p.status === 'disponivel') return '#0ea5e9';
        if (p.status === 'em_entrega') return '#3b82f6';
        return '#6b7280';
      };

      const getMarkerHtml = (p: MapDeliveryPerson) => {
        const color = getMarkerColor(p);
        const formatStatus = (s: string) => {
           if (s === 'disponivel') return 'Disponível';
           if (s === 'inativo') return 'Indisponível';
           if (s === 'em_entrega') return 'Em Entrega';
           return s;
        };
        const statusText = formatStatus(p.status);
        const isSelected = p.id === selectedEntregadorId;
        const scale = isSelected ? 'scale(1.2)' : 'scale(1)';
        const zIndex = isSelected ? '50' : '10';
        const border = isSelected ? 'border: 3px solid #f59e0b;' : 'border: 3px solid white;';

        const photoHtml = p.foto_url 
          ? `<div style="position: absolute; bottom: 45px; left: 50%; transform: translateX(-50%); width: 48px; height: 48px; border-radius: 50%; overflow: hidden; ${border} background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 20;">
               <img src="${p.foto_url}" style="width: 100%; height: 100%; object-fit: cover;" />
             </div>` 
          : '';
        
        return `
          <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: visible; transform: ${scale}; z-index: ${zIndex};">
            ${photoHtml}
            <svg viewBox="0 0 24 24" style="width: 56px; height: 56px; color: ${color}; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); transform: translateY(-4px);">
               <path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
               <circle cx="12" cy="9" r="3.5" fill="white" fill-opacity="0.4" />
            </svg>
          </div>
        `;
      };

      const formatStatus = (s: string) => {
           if (s === 'disponivel') return 'Disponível';
           if (s === 'inativo') return 'Indisponível';
           if (s === 'em_entrega') return 'Em Entrega';
           return s;
      };

      const popupContent = `
        <div style="padding: 4px;">
            <strong>${person.name}</strong><br/>
            <span>Status: ${formatStatus(person.status)}</span><br/>
            <span>${person.is_online ? '🟢 Online' : '🔴 Offline'}</span>
        </div>
      `;

      if (existingMarker) {
      
        const newLatLng = [person.current_latitude, person.current_longitude];
        existingMarker.setLatLng(newLatLng);
        existingMarker.setIcon(L.divIcon({
            html: getMarkerHtml(person),
            className: '', 
            iconSize: [56, 56],
            iconAnchor: [28, 56],
            popupAnchor: [0, -50]
        }));
        existingMarker.getPopup().setContent(popupContent);

        
        if (person.id === selectedEntregadorId) {
            existingMarker.setZIndexOffset(1000);
        } else {
            existingMarker.setZIndexOffset(0);
        }

      } else {
        
        const icon = L.divIcon({
            html: getMarkerHtml(person),
            className: '', 
            iconSize: [56, 56],
            iconAnchor: [28, 56],
            popupAnchor: [0, -50]
        });

        const marker = L.marker([person.current_latitude, person.current_longitude], { icon })
          .bindPopup(popupContent)
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

  }, [deliveryPersons, mapLoaded, selectedEntregadorId]);

  
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const L = (window as any).L;

    if (!destination) {
      if (destMarker.current) {
        destMarker.current.remove();
        destMarker.current = null;
      }
      return;
    }

    const html = `
      <div style="position: relative; width: 40px; height: 48px;">
        <div style="position: absolute; top: 0; left: 0; width: 40px; height: 40px; background: white; border-radius: 50%; border: 3px solid #ef4444; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 50;">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                <line x1="4" y1="22" x2="4" y2="15"></line>
             </svg>
        </div>
        <div style="position: absolute; width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid #ef4444; bottom: 0; left: 50%; transform: translateX(-50%);"></div>
      </div>
    `;

    const icon = L.divIcon({
        html: html,
        className: '',
        iconSize: [40, 48],
        iconAnchor: [20, 48],
        popupAnchor: [0, -50]
    });

    if (destMarker.current) {
        destMarker.current.setLatLng(destination);
        destMarker.current.setIcon(icon);
    } else {
        destMarker.current = L.marker(destination, { icon })
           .bindPopup(`<div style="padding:6px; color: #ef4444;"><strong>${destinationTitle || 'Destino'}</strong></div>`)
           .addTo(map.current);
    }

  }, [destination, mapLoaded, destinationTitle]);

  
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const L = (window as any).L;

    if (!origin) {
      if (originMarker.current) {
        originMarker.current.remove();
        originMarker.current = null;
      }
      return;
    }

    const html = `
      <div style="position: relative; width: 40px; height: 48px;">
        <div style="position: absolute; top: 0; left: 0; width: 40px; height: 40px; background: white; border-radius: 50%; border: 3px solid #10b981; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 50;">
             <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="3" width="15" height="13"></rect>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                <circle cx="18.5" cy="18.5" r="2.5"></circle>
             </svg>
        </div>
        <div style="position: absolute; width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid #10b981; bottom: 0; left: 50%; transform: translateX(-50%);"></div>
      </div>
    `;

    const icon = L.divIcon({
        html: html,
        className: '',
        iconSize: [40, 48],
        iconAnchor: [20, 48],
        popupAnchor: [0, -50]
    });

    if (originMarker.current) {
        originMarker.current.setLatLng(origin);
        originMarker.current.setIcon(icon);
    } else {
        originMarker.current = L.marker(origin, { icon })
           .bindPopup(`<div style="padding:6px; color: #10b981;"><strong>${originTitle || 'Comércio (Origem)'}</strong></div>`)
           .addTo(map.current);
    }

  }, [origin, mapLoaded, originTitle]);

  
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const L = (window as any).L;

    if (!route || route.length < 2) {
        if (routePolyline.current) {
            routePolyline.current.remove();
            routePolyline.current = null;
        }
        return;
    }

    if (routePolyline.current) {
        routePolyline.current.setLatLngs(route);
    } else {
        routePolyline.current = L.polyline(route, { color: '#0ea5e9', weight: 4 }).addTo(map.current);
    }

  }, [route, mapLoaded]);

  
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const L = (window as any).L;

    const points: [number, number][] = [];

    if (origin) points.push(origin); 
    if (destination) points.push(destination); 

    if (selectedEntregadorId) {
      const person = deliveryPersons.find(p => p.id === selectedEntregadorId);
      if (person && person.current_latitude && person.current_longitude) {
        points.push([person.current_latitude, person.current_longitude]);
      }
    }

    if (points.length === 0) return;

    const bounds = L.latLngBounds(points);
    map.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });

  }, [origin, destination, selectedEntregadorId, deliveryPersons, mapLoaded]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full rounded-lg z-0" />
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