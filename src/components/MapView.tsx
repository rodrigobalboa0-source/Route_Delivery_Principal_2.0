import { useEffect, useRef, useState } from 'react';
import type { Database } from '../lib/database.types';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

export interface MapDeliveryPerson extends DeliveryPerson {
  foto_url?: string | null;
}

type GLMap = {
  on: (event: string, handler: (ev?: unknown) => void) => void;
  remove: () => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
  getLayer: (id: string) => unknown;
  removeLayer: (id: string) => void;
  removeSource: (id: string) => void;
  flyTo: (options: unknown) => void;
  fitBounds: (bounds: unknown, options?: unknown) => void;
};

type GLMarker = {
  setLngLat: (lngLat: [number, number]) => GLMarker;
  getElement: () => HTMLElement;
  addTo: (map: GLMap) => GLMarker;
  setPopup: (popup: unknown) => GLMarker;
  getPopup: () => GLPopup;
  remove: () => void;
};

type GLPopup = {
  setHTML: (html: string) => GLPopup;
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
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<GLMap | null>(null);
  const markers = useRef<Map<string, GLMarker>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const destMarker = useRef<GLMarker | null>(null);
  const originMarker = useRef<GLMarker | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initMap = () => {
        if (!mapContainer.current) return;
        
        const w = window as unknown as {
          maplibregl: {
            Map: new (opts: unknown) => GLMap;
            Popup: new (opts: unknown) => GLPopup;
            Marker: new (el: HTMLElement) => GLMarker;
          };
        };

        const maplibre = w.maplibregl;
        if (!maplibre) return;

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

        map.current.on('error', (e) => {
          console.error('MapLibre error:', e);
        });
    };

    if ((window as any).maplibregl) {
        initMap();
    } else {
        
        if (!document.querySelector('script[src*="maplibre-gl.js"]')) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/maplibre-gl@3.6.1/dist/maplibre-gl.js';
            script.async = true;
            document.head.appendChild(script);

            const link = document.createElement('link');
            link.href = 'https://unpkg.com/maplibre-gl@3.6.1/dist/maplibre-gl.css';
            link.rel = 'stylesheet';
            document.head.appendChild(link);

            script.onload = initMap;
            script.onerror = () => {
              setMapError('Erro ao carregar script do mapa.');
            };
        } else {
           
            const interval = setInterval(() => {
                if ((window as any).maplibregl) {
                    clearInterval(interval);
                    initMap();
                }
            }, 100);
            
           
            setTimeout(() => clearInterval(interval), 10000);
        }
    }

    return () => {
      map.current?.remove();
      map.current = null;
      setMapLoaded(false);
    };
  }, []); 

  useEffect(() => {
    if (!map.current || !center) return;
    map.current.flyTo({
      center: [center[1], center[0]],
      zoom: 12,
      essential: true
    });
  }, [center[0], center[1]]);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;

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
        const zIndex = isSelected ? 'z-index: 50;' : 'z-index: 10;';
        const border = isSelected ? 'border: 3px solid #f59e0b;' : 'border: 3px solid white;';

        const photoHtml = p.foto_url 
          ? `<div style="position: absolute; bottom: 45px; left: 50%; transform: translateX(-50%); width: 48px; height: 48px; border-radius: 50%; overflow: hidden; ${border} background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 20;">
               <img src="${p.foto_url}" style="width: 100%; height: 100%; object-fit: cover;" />
             </div>` 
          : '';
        
        return `
          <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: visible; transform: ${scale}; ${zIndex}">
            ${photoHtml}
            <svg viewBox="0 0 24 24" style="width: 56px; height: 56px; color: ${color}; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); transform: translateY(-4px);">
               <path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
               <circle cx="12" cy="9" r="3.5" fill="white" fill-opacity="0.4" />
            </svg>
            <div style="display:none" data-status="${statusText}"></div>
          </div>
        `;
      };

      if (existingMarker) {
        existingMarker.setLngLat([person.current_longitude, person.current_latitude]);

        const el = existingMarker.getElement();
        
        const prevStatus = el.dataset.status;
        const prevOnline = el.dataset.online;
        const prevFoto = el.dataset.foto;
        const prevSelected = el.dataset.selected;
        
        const currentStatus = person.status;
        const currentOnline = String(person.is_online);
        const currentFoto = person.foto_url || '';
        const currentSelected = String(person.id === selectedEntregadorId);

        if (prevStatus !== currentStatus || prevOnline !== currentOnline || prevFoto !== currentFoto || prevSelected !== currentSelected) {
          el.className = `marker ${person.status} ${person.is_online ? 'online' : 'offline'}`;
          // ... (styles) ...
          el.style.overflow = 'visible';
          el.innerHTML = getMarkerHtml(person);
          
          el.dataset.status = currentStatus;
          el.dataset.online = currentOnline;
          el.dataset.foto = currentFoto;
          el.dataset.selected = currentSelected;
        }

        const popup = existingMarker.getPopup();
        if (popup) {
          const formatStatus = (s: string) => {
             if (s === 'disponivel') return 'Disponível';
             if (s === 'inativo') return 'Indisponível';
             if (s === 'em_entrega') return 'Em Entrega';
             return s;
          };
          popup.setHTML(
            `<div style="padding: 8px;">
              <strong>${person.name}</strong><br/>
              <span>Status: ${formatStatus(person.status)}</span><br/>
              <span>${person.is_online ? '🟢 Online' : '🔴 Offline'}</span>
            </div>`
          );
        }
      } else {
        const el = document.createElement('div');
        el.className = `marker ${person.status} ${person.is_online ? 'online' : 'offline'}`;
        el.style.overflow = 'visible';
        el.style.width = '56px';
        el.style.height = '56px';
        el.style.display = 'block';
        
        el.dataset.status = person.status;
        el.dataset.online = String(person.is_online);
        el.dataset.foto = person.foto_url || '';
        el.dataset.selected = String(person.id === selectedEntregadorId);
        
        el.innerHTML = getMarkerHtml(person);

        const w = window as unknown as {
          maplibregl: {
            Popup: new (opts: unknown) => GLPopup;
            Marker: new (opts: unknown) => GLMarker;
          };
        };
        const formatStatus = (s: string) => {
           if (s === 'disponivel') return 'Disponível';
           if (s === 'inativo') return 'Indisponível';
           if (s === 'em_entrega') return 'Em Entrega';
           return s;
        };
        const popup = new w.maplibregl.Popup({ offset: 25 }).setHTML(
          `<div style="padding: 8px;">
            <strong>${person.name}</strong><br/>
            <span>Status: ${formatStatus(person.status)}</span><br/>
            <span>${person.is_online ? '🟢 Online' : '🔴 Offline'}</span>
          </div>`
        );

        const marker = new w.maplibregl.Marker({ element: el })
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
  }, [deliveryPersons, mapLoaded, selectedEntregadorId]);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    
    
    if (destination) {
      console.log('Rendering destination marker at:', destination);
    }

    if (!destination) {
      destMarker.current?.remove();
      destMarker.current = null;
      return;
    }
    const lngLat: [number, number] = [destination[1], destination[0]];
    const w = window as unknown as {
      maplibregl: {
        Popup: new (opts: unknown) => GLPopup;
        Marker: new (opts: unknown) => GLMarker;
      };
    };
    if (destMarker.current) {
      destMarker.current.setLngLat(lngLat);
    } else {
      const el = document.createElement('div');
      el.className = 'destination-marker';
      
      // Container styles
      el.style.display = 'block';
      el.style.width = '40px';
      el.style.height = '48px';
      el.style.cursor = 'pointer';
      
      el.innerHTML = `
        <div style="position: absolute; top: 0; left: 0; width: 40px; height: 40px; background: white; border-radius: 50%; border: 3px solid #ef4444; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 50;">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                <line x1="4" y1="22" x2="4" y2="15"></line>
             </svg>
        </div>
        <div style="position: absolute; width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid #ef4444; bottom: 0; left: 50%; transform: translateX(-50%);"></div>
      `;

      // Increased offset to 50 to clear the 48px height marker
      const popup = new w.maplibregl.Popup({ offset: 50 }).setHTML(`<div style="padding:6px; color: #ef4444;"><strong>${destinationTitle || 'Destino'}</strong></div>`);
      
      destMarker.current = new w.maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(lngLat)
        .setPopup(popup)
        .addTo(map.current as GLMap);
    }
  }, [destination, mapLoaded, destinationTitle]);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    if (!origin) {
      originMarker.current?.remove();
      originMarker.current = null;
      return;
    }
    const lngLat: [number, number] = [origin[1], origin[0]];
    const w = window as unknown as {
      maplibregl: {
        Popup: new (opts: unknown) => GLPopup;
        Marker: new (opts: unknown) => GLMarker;
      };
    };
    if (originMarker.current) {
      originMarker.current.setLngLat(lngLat);
    } else {
      const el = document.createElement('div');
      el.className = 'origin-marker';
      
      
      el.style.width = '40px';
      el.style.height = '48px';
      el.style.cursor = 'pointer';

      el.innerHTML = `
        <div style="position: absolute; top: 0; left: 0; width: 40px; height: 40px; background: white; border-radius: 50%; border: 3px solid #10b981; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 50;">
             <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="3" width="15" height="13"></rect>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                <circle cx="18.5" cy="18.5" r="2.5"></circle>
             </svg>
        </div>
        <div style="position: absolute; width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid #10b981; bottom: 0; left: 50%; transform: translateX(-50%);"></div>
      `;

      const popup = new w.maplibregl.Popup({ offset: 25 }).setHTML(`<div style="padding:6px; color: #10b981;"><strong>${originTitle || 'Comércio (Origem)'}</strong></div>`);
      
      
      originMarker.current = new w.maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(lngLat)
        .setPopup(popup)
        .addTo(map.current as GLMap);
    }
  }, [origin, mapLoaded, originTitle]);

  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const id = 'route-line';
    if (!route || route.length < 2) {
      if (map.current.getLayer(id)) {
        try { map.current.removeLayer(id); } catch (e) { console.warn('Layer removal error ignored', e); }
      }
      if (map.current.getSource(id)) {
        try { map.current.removeSource(id); } catch (e) { console.warn('Source removal error ignored', e); }
      }
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

  
  useEffect(() => {
    if (!mapLoaded || !map.current) return;

    const points: [number, number][] = [];

    if (origin) points.push([origin[1], origin[0]]); 
    if (destination) points.push([destination[1], destination[0]]); 

    if (selectedEntregadorId) {
      const person = deliveryPersons.find(p => p.id === selectedEntregadorId);
      if (person && person.current_latitude && person.current_longitude) {
        points.push([person.current_longitude, person.current_latitude]);
      }
    }

    if (points.length === 0) return;

    const w = window as unknown as {
      maplibregl: {
        LngLatBounds: new () => { extend: (p: [number, number]) => any };
      };
    };

    if (w.maplibregl && w.maplibregl.LngLatBounds) {
        const bounds = new w.maplibregl.LngLatBounds();
        points.forEach(p => bounds.extend(p));
        map.current.fitBounds(bounds, { padding: 80, maxZoom: 15 });
    }

  }, [origin, destination, selectedEntregadorId, deliveryPersons, mapLoaded]);

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
