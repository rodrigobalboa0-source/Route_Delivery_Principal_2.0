import { useEffect, useRef, useState } from 'react';
import type { Database } from '../lib/database.types';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

export interface MapDeliveryPerson extends DeliveryPerson {
  foto_url?: string | null;
}

interface MapViewProps {
  deliveryPersons: MapDeliveryPerson[];
  selectedEntregadorId?: string;
  center?: [number, number];
  origin?: [number, number];
  destination?: [number, number];
  route?: Array<[number, number]>;
  originTitle?: string;
  destinationTitle?: string;
  originIconType?: 'truck' | 'store';
  additionalDestinations?: Array<{ coords: [number, number]; title: string; order: number }>;
}

let googleMapsLoadingPromise: Promise<void> | null = null;

function loadGoogleMapsJs(apiKey: string) {
  if ((window as any)?.google?.maps) return Promise.resolve();
  if (googleMapsLoadingPromise) return googleMapsLoadingPromise;

  googleMapsLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-google-maps-js="true"]') as HTMLScriptElement | null;
    if (existing) {
      const interval = setInterval(() => {
        if ((window as any)?.google?.maps) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(interval);
        if (!(window as any)?.google?.maps) reject(new Error('Google Maps não carregou.'));
      }, 12000);
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsJs = 'true';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Erro ao carregar Google Maps.'));
    document.head.appendChild(script);
  });

  return googleMapsLoadingPromise;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: unknown) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function makePinSvg(fill: string, innerSvg?: string) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
      <path d="M20 46c-6.6-7.6-14-17.2-14-26C6 10.1 12.3 4 20 4s14 6.1 14 16c0 8.8-7.4 18.4-14 26z" fill="${fill}" stroke="#ffffff" stroke-width="2" />
      <circle cx="20" cy="20" r="7" fill="white" fill-opacity="0.35" />
      ${innerSvg ? `<g transform="translate(8 8)">${innerSvg}</g>` : ''}
    </svg>
  `.trim();
}

export function MapView({ deliveryPersons = [], selectedEntregadorId, center = [-23.5505, -46.6333], origin, destination, route, originTitle, destinationTitle, originIconType = 'truck', additionalDestinations = [] }: MapViewProps) {
  useEffect(() => {
    console.log('MapView initialized (Google Maps version)');
  }, []);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<any | null>(null);
  const markers = useRef<Map<string, any>>(new Map());
  const markerAnimations = useRef<Map<string, number>>(new Map());
  const lastUserInteractionAtRef = useRef<number>(0);
  const lastBoundsKeyRef = useRef<string>('');
  const prevSelectedIdRef = useRef<string | undefined>(undefined);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const destMarker = useRef<any | null>(null);
  const originMarker = useRef<any | null>(null);
  const routePolyline = useRef<any | null>(null);
  const additionalMarkers = useRef<Map<number, any>>(new Map());
  const infoWindowRef = useRef<any | null>(null);
  const cleanupInteractionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      markerAnimations.current.forEach((rafId) => cancelAnimationFrame(rafId));
      markerAnimations.current.clear();
    };
  }, []);

  useEffect(() => {
    if (map.current) return;

    const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();
    if (!apiKey) {
      setMapError('Chave do Google Maps não configurada (VITE_GOOGLE_MAPS_API_KEY). Se você acabou de alterar o .env, reinicie o servidor (npm run dev) e recarregue a página.');
      return;
    }

    let cancelled = false;

    const initMap = async () => {
      if (!mapContainer.current) return;

      try {
        await loadGoogleMapsJs(apiKey);
        if (cancelled) return;

        const g = (window as any).google as any;
        if (!g?.maps) {
          setMapError('Não foi possível carregar o Google Maps.');
          return;
        }

        if (map.current) return;

        const m = new g.maps.Map(mapContainer.current, {
          center: { lat: center[0], lng: center[1] },
          zoom: 12,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });

        map.current = m;
        infoWindowRef.current = new g.maps.InfoWindow();
        setMapLoaded(true);

        const markInteraction = () => {
          lastUserInteractionAtRef.current = Date.now();
        };

        const target = mapContainer.current;
        const opts: AddEventListenerOptions = { passive: true };
        target.addEventListener('wheel', markInteraction, opts);
        target.addEventListener('mousedown', markInteraction, opts);
        target.addEventListener('touchstart', markInteraction, opts);
        target.addEventListener('pointerdown', markInteraction, opts);

        cleanupInteractionRef.current = () => {
          target.removeEventListener('wheel', markInteraction);
          target.removeEventListener('mousedown', markInteraction);
          target.removeEventListener('touchstart', markInteraction);
          target.removeEventListener('pointerdown', markInteraction);
        };

        g.maps.event.addListener(m, 'dragstart', markInteraction);
      } catch (e) {
        console.error('Failed to initialize Google Maps:', e);
        setMapError('Não foi possível carregar o mapa.');
      }
    };

    void initMap();

    return () => {
      cancelled = true;
      cleanupInteractionRef.current?.();
      cleanupInteractionRef.current = null;

      if (map.current) {
        markers.current.forEach((mk) => {
          if (mk?.setMap) mk.setMap(null);
          else mk.map = null;
        });
        markers.current.clear();

        additionalMarkers.current.forEach((mk) => {
          if (mk?.setMap) mk.setMap(null);
          else mk.map = null;
        });
        additionalMarkers.current.clear();

        if (destMarker.current) {
          if (destMarker.current?.setMap) destMarker.current.setMap(null);
          else destMarker.current.map = null;
          destMarker.current = null;
        }

        if (originMarker.current) {
          if (originMarker.current?.setMap) originMarker.current.setMap(null);
          else originMarker.current.map = null;
          originMarker.current = null;
        }

        if (routePolyline.current?.setMap) {
          routePolyline.current.setMap(null);
          routePolyline.current = null;
        }

        map.current = null;
      }
      setMapLoaded(false);
    };
  }, []);

  
  // Handle container resize
  useEffect(() => {
    if (!mapContainer.current || !map.current) return;

    const resizeObserver = new ResizeObserver(() => {
      const g = (window as any).google as any;
      if (g?.maps?.event && map.current) {
        g.maps.event.trigger(map.current, 'resize');
      }
    });

    resizeObserver.observe(mapContainer.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [mapLoaded]);

  useEffect(() => {
    if (!map.current || !center) return;
    
    const now = Date.now();
    if (now - lastUserInteractionAtRef.current < 1500) return;
    map.current.panTo({ lat: center[0], lng: center[1] });
  }, [center[0], center[1]]);

  useEffect(() => {
    if (!map.current || !selectedEntregadorId) return;

    if (prevSelectedIdRef.current === selectedEntregadorId) return;
    prevSelectedIdRef.current = selectedEntregadorId;

    const person = deliveryPersons.find(p => p.id === selectedEntregadorId);
    if (person && person.current_latitude && person.current_longitude) {
      map.current.panTo({ lat: person.current_latitude, lng: person.current_longitude });
      map.current.setZoom(16);
    }
  }, [selectedEntregadorId, deliveryPersons]);

  
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const g = (window as any).google as any;
    if (!g?.maps) return;

    const currentMarkerIds = new Set<string>();

    const getMarkerPosition = (marker: any): [number, number] | undefined => {
      if (!marker) return undefined;
      const pos = marker.position ?? marker.getPosition?.();
      if (!pos) return undefined;
      const lat = typeof pos.lat === 'function' ? Number(pos.lat()) : Number(pos.lat);
      const lng = typeof pos.lng === 'function' ? Number(pos.lng()) : Number(pos.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
      return [lat, lng];
    };

    const setMarkerPosition = (marker: any, lat: number, lng: number) => {
      if (!marker) return;
      const next = { lat, lng };
      if ('position' in marker) marker.position = next;
      else marker.setPosition?.(next);
    };

    const animateMarkerTo = (marker: any, markerId: string, to: [number, number], durationMs: number) => {
      const existing = markerAnimations.current.get(markerId);
      if (typeof existing === 'number') cancelAnimationFrame(existing);

      const from = getMarkerPosition(marker) ?? to;

      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const lat = from[0] + (to[0] - from[0]) * t;
        const lng = from[1] + (to[1] - from[1]) * t;
        setMarkerPosition(marker, lat, lng);
        if (t < 1) {
          const rafId = requestAnimationFrame(step);
          markerAnimations.current.set(markerId, rafId);
        } else {
          markerAnimations.current.delete(markerId);
        }
      };

      const rafId = requestAnimationFrame(step);
      markerAnimations.current.set(markerId, rafId);
    };

    const removeMarker = (marker: any) => {
      if (!marker) return;
      if (marker?.setMap) marker.setMap(null);
      else marker.map = null;
    };

    const openInfo = (anchor: any, html: string, pos?: [number, number]) => {
      const info = infoWindowRef.current;
      if (!info) return;
      info.setContent(html);
      try {
        info.open({ map: map.current, anchor });
        return;
      } catch {
        void 0;
      }
      if (pos) info.setPosition({ lat: pos[0], lng: pos[1] });
      info.open({ map: map.current });
    };

    const makeMarkerIcon = (fill: string, scale: number) => {
      const svg = makePinSvg(fill);
      const size = 40 * scale;
      const height = 48 * scale;
      return {
        url: svgToDataUrl(svg),
        scaledSize: new g.maps.Size(size, height),
        anchor: new g.maps.Point(size / 2, height),
        labelOrigin: new g.maps.Point(size / 2, height * 0.42),
      };
    };

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

        const photoUrl = String(p.foto_url || '').trim();
        const photoHtml = photoUrl
          ? `<div style="position: absolute; bottom: 45px; left: 50%; transform: translateX(-50%); width: 48px; height: 48px; border-radius: 50%; overflow: hidden; ${border} background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 20;">
               <img src="${escapeAttr(photoUrl)}" style="width: 100%; height: 100%; object-fit: cover;" />
             </div>`
          : '';
        
        return `
          <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: visible; transform: ${scale}; z-index: ${zIndex};">
            ${photoHtml}
            <svg viewBox="0 0 24 24" width="56" height="56" style="color: ${color}; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); transform: translateY(-4px);">
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
            <strong>${escapeHtml(person.name)}</strong><br/>
            <span>Status: ${escapeHtml(formatStatus(person.status))}</span><br/>
            <span>${person.is_online ? '🟢 Online' : '🔴 Offline'}</span>
        </div>
      `;

      if (existingMarker) {
        const newLatLng: [number, number] = [person.current_latitude, person.current_longitude];
        const color = getMarkerColor(person);
        const isSelected = person.id === selectedEntregadorId;
        existingMarker.setIcon(makeMarkerIcon(color, isSelected ? 1.15 : 1));

        if (person.id === selectedEntregadorId) {
          animateMarkerTo(existingMarker, person.id, newLatLng, 900);
        } else {
          const existingAnim = markerAnimations.current.get(person.id);
          if (typeof existingAnim === 'number') {
            cancelAnimationFrame(existingAnim);
            markerAnimations.current.delete(person.id);
          }
          setMarkerPosition(existingMarker, newLatLng[0], newLatLng[1]);
        }

        existingMarker.setZIndex(person.id === selectedEntregadorId ? 1000 : 0);
      } else {
        const pos: [number, number] = [person.current_latitude, person.current_longitude];
        const zIndex = person.id === selectedEntregadorId ? 1000 : 0;
        const color = getMarkerColor(person);
        const isSelected = person.id === selectedEntregadorId;
        const marker = new g.maps.Marker({
          map: map.current,
          position: { lat: pos[0], lng: pos[1] },
          title: person.name ?? undefined,
          zIndex,
          icon: makeMarkerIcon(color, isSelected ? 1.15 : 1),
        });

        marker.addListener('click', () => openInfo(marker, popupContent, pos));

        markers.current.set(person.id, marker);
      }
    });

    
    markers.current.forEach((marker, id) => {
      if (!currentMarkerIds.has(id)) {
        const existingAnim = markerAnimations.current.get(id);
        if (typeof existingAnim === 'number') cancelAnimationFrame(existingAnim);
        markerAnimations.current.delete(id);
        removeMarker(marker);
        markers.current.delete(id);
      }
    });

  }, [deliveryPersons, mapLoaded, selectedEntregadorId]);

  
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const g = (window as any).google as any;
    if (!g?.maps) return;

    if (!destination) {
      if (destMarker.current) {
        destMarker.current.setMap(null);
        destMarker.current = null;
      }
      return;
    }

    const inner = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
        <line x1="4" y1="22" x2="4" y2="15"></line>
      </svg>
    `.trim();
    const icon = {
      url: svgToDataUrl(makePinSvg('#ef4444', inner)),
      scaledSize: new g.maps.Size(40, 48),
      anchor: new g.maps.Point(20, 48),
    };

    if (destMarker.current) {
      destMarker.current.setPosition({ lat: destination[0], lng: destination[1] });
      destMarker.current.setIcon(icon);
    } else {
      const popup = `<div style="padding:6px; color: #ef4444;"><strong>${escapeHtml(destinationTitle || 'Destino')}</strong></div>`;
      const marker = new g.maps.Marker({
        map: map.current,
        position: { lat: destination[0], lng: destination[1] },
        title: destinationTitle || 'Destino',
        zIndex: 500,
        icon,
      });
      marker.addListener('click', () => infoWindowRef.current?.setContent(popup) || infoWindowRef.current?.open({ map: map.current, anchor: marker }));
      destMarker.current = marker;
    }

  }, [destination, mapLoaded, destinationTitle]);

  
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const g = (window as any).google as any;
    if (!g?.maps) return;

    if (!origin) {
      if (originMarker.current) {
        originMarker.current.setMap(null);
        originMarker.current = null;
      }
      return;
    }

    const innerTruck = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="1" y="3" width="15" height="13"></rect>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
        <circle cx="5.5" cy="18.5" r="2.5"></circle>
        <circle cx="18.5" cy="18.5" r="2.5"></circle>
      </svg>
    `.trim();
    const innerStore = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
        <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
        <path d="M2 7h20"/>
        <path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/>
      </svg>
    `.trim();
    const icon = {
      url: svgToDataUrl(makePinSvg('#10b981', originIconType === 'store' ? innerStore : innerTruck)),
      scaledSize: new g.maps.Size(40, 48),
      anchor: new g.maps.Point(20, 48),
    };

    if (originMarker.current) {
      originMarker.current.setPosition({ lat: origin[0], lng: origin[1] });
      originMarker.current.setIcon(icon);
    } else {
      const popup = `<div style="padding:6px; color: #10b981;"><strong>${escapeHtml(originTitle || 'Comércio (Origem)')}</strong></div>`;
      const marker = new g.maps.Marker({
        map: map.current,
        position: { lat: origin[0], lng: origin[1] },
        title: originTitle || 'Comércio (Origem)',
        zIndex: 400,
        icon,
      });
      marker.addListener('click', () => infoWindowRef.current?.setContent(popup) || infoWindowRef.current?.open({ map: map.current, anchor: marker }));
      originMarker.current = marker;
    }

  }, [origin, mapLoaded, originTitle, originIconType]);

  
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const g = (window as any).google as any;
    if (!g?.maps) return;

    const currentMarkerOrders = new Set<number>();

    additionalDestinations.forEach((dest) => {
      currentMarkerOrders.add(dest.order);
      const existingMarker = additionalMarkers.current.get(dest.order);

      const icon = {
        url: svgToDataUrl(makePinSvg('#8b5cf6')),
        scaledSize: new g.maps.Size(40, 48),
        anchor: new g.maps.Point(20, 48),
        labelOrigin: new g.maps.Point(20, 20),
      };

      if (existingMarker) {
        existingMarker.setPosition({ lat: dest.coords[0], lng: dest.coords[1] });
        existingMarker.setIcon(icon);
        existingMarker.setLabel({ text: String(dest.order), color: '#ffffff', fontWeight: '700', fontSize: '12px' });
      } else {
        const popup = `<div style="padding:6px; color: #8b5cf6;"><strong>${escapeHtml(dest.title)}</strong></div>`;
        const marker = new g.maps.Marker({
          map: map.current,
          position: { lat: dest.coords[0], lng: dest.coords[1] },
          title: dest.title,
          zIndex: 300,
          label: { text: String(dest.order), color: '#ffffff', fontWeight: '700', fontSize: '12px' },
          icon,
        });
        marker.addListener('click', () => infoWindowRef.current?.setContent(popup) || infoWindowRef.current?.open({ map: map.current, anchor: marker }));
        additionalMarkers.current.set(dest.order, marker);
      }
    });

    additionalMarkers.current.forEach((marker, order) => {
      if (!currentMarkerOrders.has(order)) {
        if (marker?.setMap) marker.setMap(null);
        else marker.map = null;
        additionalMarkers.current.delete(order);
      }
    });
  }, [additionalDestinations, mapLoaded]);

  
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const g = (window as any).google as any;
    if (!g?.maps) return;

    if (!route || route.length < 2) {
        if (routePolyline.current) {
            routePolyline.current.setMap(null);
            routePolyline.current = null;
        }
        return;
    }

    if (routePolyline.current) {
        routePolyline.current.setPath(route.map((p: [number, number]) => ({ lat: p[0], lng: p[1] })));
    } else {
        routePolyline.current = new g.maps.Polyline({
          map: map.current,
          path: route.map((p: [number, number]) => ({ lat: p[0], lng: p[1] })),
          strokeColor: '#0ea5e9',
          strokeOpacity: 1,
          strokeWeight: 4,
        });
    }

  }, [route, mapLoaded]);

  
  useEffect(() => {
    if (!mapLoaded || !map.current) return;
    const g = (window as any).google as any;
    if (!g?.maps) return;

    const points: [number, number][] = [];

    if (origin) points.push(origin); 
    if (destination) points.push(destination);
    additionalDestinations.forEach(dest => points.push(dest.coords)); 

    if (selectedEntregadorId) {
      const person = deliveryPersons.find(p => p.id === selectedEntregadorId);
      if (person && person.current_latitude && person.current_longitude) {
        points.push([person.current_latitude, person.current_longitude]);
      }
    }

    if (points.length === 0) return;

    const boundsKey = points.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join('|');
    if (boundsKey === lastBoundsKeyRef.current) return;
    lastBoundsKeyRef.current = boundsKey;

    const now = Date.now();
    if (now - lastUserInteractionAtRef.current < 1500) return;

    const bounds = new g.maps.LatLngBounds();
    points.forEach((p) => bounds.extend({ lat: p[0], lng: p[1] }));
    map.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });

    const clampZoom = () => {
      const z = map.current?.getZoom?.();
      if (typeof z === 'number' && z > 15) map.current.setZoom(15);
    };
    setTimeout(clampZoom, 0);

  }, [origin, destination, selectedEntregadorId, mapLoaded]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full z-0" style={{ overscrollBehavior: 'contain' }} />
      {!mapLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <div className="text-slate-600">Carregando mapa...</div>
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <div className="text-red-600 font-medium px-4 py-2 bg-red-50 border border-red-200 rounded">
            {mapError}
          </div>
        </div>
      )}
    </div>
  );
}
