import { useEffect, useRef, useState } from 'react';
import type { Database } from '../lib/database.types';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

export interface MapDeliveryPerson extends DeliveryPerson {
  foto_url?: string | null;
  heading?: number | null;
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
let googleMapsMarkerLibraryPromise: Promise<void> | null = null;

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

async function loadGoogleMapsMarkerLibrary() {
  const g = (window as any).google as any;
  if (!g?.maps) throw new Error('Google Maps não carregou.');
  if (g?.maps?.marker?.AdvancedMarkerElement) return;

  if (typeof g.maps.importLibrary !== 'function') return;
  if (googleMapsMarkerLibraryPromise) return googleMapsMarkerLibraryPromise;

  googleMapsMarkerLibraryPromise = Promise.resolve(g.maps.importLibrary('marker')).then(() => void 0);
  return googleMapsMarkerLibraryPromise;
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

function makePinSvg(fill: string, innerSvg?: string, rotation?: number) {
  const rotationTransform = rotation !== undefined && !Number.isNaN(rotation) ? `transform="rotate(${rotation} 20 20)"` : '';
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">
      <g ${rotationTransform}>
        <path d="M20 46c-6.6-7.6-14-17.2-14-26C6 10.1 12.3 4 20 4s14 6.1 14 16c0 8.8-7.4 18.4-14 26z" fill="${fill}" stroke="#ffffff" stroke-width="2" />
        <circle cx="20" cy="20" r="7" fill="white" fill-opacity="0.35" />
        ${innerSvg ? `<g transform="translate(8 8)">${innerSvg}</g>` : ''}
      </g>
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
  const driverPhotoIconCacheRef = useRef<Map<string, string>>(new Map());
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

    const mapId = String(import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? '').trim();
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
          mapId: mapId ? mapId : undefined,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });

        map.current = m;
        infoWindowRef.current = new g.maps.InfoWindow();
        if (mapId) {
          try {
            await loadGoogleMapsMarkerLibrary();
          } catch (e) {
            console.error('Failed to load Google Maps marker library:', e);
          }
        }
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
    const mapId = String(import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? '').trim();
    const canUseAdvancedMarkers = !!mapId && !!g?.maps?.marker?.AdvancedMarkerElement;

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
      if (typeof marker.setPosition === 'function') marker.setPosition(next);
      else if ('position' in marker) marker.position = next;
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

    const makeMarkerIcon = (fill: string, scale: number, rotation?: number) => {
      const svg = makePinSvg(fill, undefined, rotation);
      const size = 40 * scale;
      const height = 48 * scale;
      return {
        url: svgToDataUrl(svg),
        scaledSize: new g.maps.Size(size, height),
        anchor: new g.maps.Point(size / 2, height),
        labelOrigin: new g.maps.Point(size / 2, height * 0.42),
      };
    };

    const loadImage = (url: string) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Falha ao carregar imagem'));
        img.src = url;
      });
    };

    const cropToCover = (imgW: number, imgH: number, targetW: number, targetH: number) => {
      const scale = Math.max(targetW / imgW, targetH / imgH);
      const sw = targetW / scale;
      const sh = targetH / scale;
      const sx = (imgW - sw) / 2;
      const sy = (imgH - sh) / 2;
      return { sx, sy, sw, sh };
    };

    const buildDriverPhotoIconPng = async (photoUrl: string, color: string, scale: number, selected: boolean) => {
      const baseW = 56;
      const baseH = 68;
      const w = Math.round(baseW * scale);
      const h = Math.round(baseH * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;

      const cx = w / 2;

      const photoRadius = 18 * scale;
      const photoCy = 22 * scale;
      const ringWidth = (selected ? 4 : 3) * scale;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 8 * scale;
      ctx.shadowOffsetY = 3 * scale;

      const pinCy = 34 * scale;
      const pinR = 20 * scale;
      const tipY = h - 6 * scale;
      const triHalf = 10 * scale;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, pinCy, pinR, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - triHalf, pinCy + 10 * scale);
      ctx.lineTo(cx + triHalf, pinCy + 10 * scale);
      ctx.lineTo(cx, tipY);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, photoCy, photoRadius + ringWidth + 1 * scale, 0, Math.PI * 2);
      ctx.fill();

      const img = await loadImage(photoUrl);
      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;
      const { sx, sy, sw, sh } = cropToCover(imgW, imgH, photoRadius * 2, photoRadius * 2);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, photoCy, photoRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, sx, sy, sw, sh, cx - photoRadius, photoCy - photoRadius, photoRadius * 2, photoRadius * 2);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, photoCy, photoRadius + ringWidth / 2, 0, Math.PI * 2);
      ctx.lineWidth = ringWidth;
      ctx.strokeStyle = selected ? '#f59e0b' : '#ffffff';
      ctx.stroke();

      return {
        url: canvas.toDataURL('image/png'),
        scaledSize: new g.maps.Size(w, h),
        anchor: new g.maps.Point(cx, tipY),
      };
    };

    const applyDriverPhotoIcon = async (markerId: string, marker: any, photoUrl: string, color: string, scale: number, selected: boolean) => {
      const normalizedPhotoUrl = String(photoUrl || '').trim();
      if (!normalizedPhotoUrl) return;

      const key = `${normalizedPhotoUrl}|${color}|${scale.toFixed(3)}|${selected ? '1' : '0'}`;
      let dataUrl = driverPhotoIconCacheRef.current.get(key);
      if (!dataUrl) {
        try {
          const icon = await buildDriverPhotoIconPng(normalizedPhotoUrl, color, scale, selected);
          if (!icon?.url) return;
          dataUrl = icon.url;
          driverPhotoIconCacheRef.current.set(key, dataUrl);
        } catch {
          return;
        }
      }

      const current = markers.current.get(markerId);
      if (current !== marker) return;
      marker.setIcon({
        url: dataUrl,
        scaledSize: new g.maps.Size(Math.round(56 * scale), Math.round(68 * scale)),
        anchor: new g.maps.Point(Math.round((56 * scale) / 2), Math.round(68 * scale - 6 * scale)),
      });
    };

    const createAdvancedMarker = (position: [number, number], html: string, title?: string, zIndex?: number) => {
      const AdvancedMarkerElement = g?.maps?.marker?.AdvancedMarkerElement;
      if (!AdvancedMarkerElement) return undefined;
      const content = document.createElement('div');
      content.innerHTML = html;
      return new AdvancedMarkerElement({
        map: map.current,
        position: { lat: position[0], lng: position[1] },
        content,
        title,
        zIndex,
      });
    };

    const attachMarkerClick = (marker: any, html: string, pos: [number, number]) => {
      if (!marker) return;
      if (typeof marker.addListener === 'function') {
        marker.addListener('gmp-click', () => openInfo(marker, html, pos));
        marker.addListener('click', () => openInfo(marker, html, pos));
      } else if (g?.maps?.event?.addListener) {
        g.maps.event.addListener(marker, 'gmp-click', () => openInfo(marker, html, pos));
        g.maps.event.addListener(marker, 'click', () => openInfo(marker, html, pos));
      }
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
        const isSelected = p.id === selectedEntregadorId;
        const scale = isSelected ? 'scale(1.15)' : 'scale(1)';
        const zIndex = isSelected ? '50' : '10';
        const ring = isSelected ? '4px solid #f59e0b' : '3px solid #ffffff';

        // Apply rotation based on heading if available
        const heading = typeof p.heading === 'number' && !Number.isNaN(p.heading) ? p.heading : null;
        const rotation = heading !== null ? `rotate(${heading}deg)` : '';

        const photoUrl = String(p.foto_url || '').trim();
        const photoHtml = photoUrl
          ? `<div style="position:absolute; left:50%; top:9px; transform:translateX(-50%); width:30px; height:30px; border-radius:50%; overflow:hidden; border:${ring}; background:#ffffff;">
               <img src="${escapeAttr(photoUrl)}" style="width:100%; height:100%; object-fit:cover; display:block;" />
             </div>`
          : `<div style="position:absolute; left:50%; top:16px; transform:translateX(-50%); width:14px; height:14px; border-radius:50%; background: rgba(255,255,255,0.35); border:2px solid rgba(255,255,255,0.6);"></div>`;

        return `
          <div style="position: relative; width: 56px; height: 62px; transform: ${scale} ${rotation}; z-index: ${zIndex};">
            <svg xmlns="http://www.w3.org/2000/svg" width="56" height="62" viewBox="0 0 40 48" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.35));">
              <path d="M20 46c-6.6-7.6-14-17.2-14-26C6 10.1 12.3 4 20 4s14 6.1 14 16c0 8.8-7.4 18.4-14 26z" fill="${color}" stroke="#ffffff" stroke-width="2" />
            </svg>
            ${photoHtml}
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

      const pos: [number, number] = [person.current_latitude, person.current_longitude];
      const zIndex = person.id === selectedEntregadorId ? 1000 : 0;
      const color = getMarkerColor(person);
      const isSelected = person.id === selectedEntregadorId;

      const isClassicMarker = !!existingMarker && typeof (existingMarker as any).setIcon === 'function';
      const isAdvancedMarker = !!existingMarker && !isClassicMarker && !!(existingMarker as any).content && 'position' in (existingMarker as any);

      if (existingMarker) {
        const newLatLng: [number, number] = [person.current_latitude, person.current_longitude];
        if (canUseAdvancedMarkers) {
          if (!isAdvancedMarker) {
            removeMarker(existingMarker);
            const adv = createAdvancedMarker(pos, getMarkerHtml(person), person.name ?? undefined, zIndex);
            if (adv) {
              attachMarkerClick(adv, popupContent, pos);
              markers.current.set(person.id, adv);
            }
            return;
          }
          if ((existingMarker as any)?.content) (existingMarker as any).content.innerHTML = getMarkerHtml(person);
          (existingMarker as any).zIndex = zIndex;
        } else {
          if (!isClassicMarker) {
            removeMarker(existingMarker);
            const mk = new g.maps.Marker({
              map: map.current,
              position: { lat: pos[0], lng: pos[1] },
              title: person.name ?? undefined,
              zIndex,
              icon: makeMarkerIcon(color, isSelected ? 1.15 : 1, person.heading),
            });
            mk.addListener('click', () => openInfo(mk, popupContent, pos));
            markers.current.set(person.id, mk);
            if (person.foto_url) void applyDriverPhotoIcon(person.id, mk, person.foto_url, color, isSelected ? 1.15 : 1, isSelected);
            return;
          }
          (existingMarker as any).setIcon(makeMarkerIcon(color, isSelected ? 1.15 : 1, person.heading));
          (existingMarker as any).setZIndex(zIndex);
          if (person.foto_url) void applyDriverPhotoIcon(person.id, existingMarker, person.foto_url, color, isSelected ? 1.15 : 1, isSelected);
        }

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
      } else {
        if (canUseAdvancedMarkers) {
          const adv = createAdvancedMarker(pos, getMarkerHtml(person), person.name ?? undefined, zIndex);
          if (adv) {
            attachMarkerClick(adv, popupContent, pos);
            markers.current.set(person.id, adv);
          }
        } else {
          const marker = new g.maps.Marker({
            map: map.current,
            position: { lat: pos[0], lng: pos[1] },
            title: person.name ?? undefined,
            zIndex,
            icon: makeMarkerIcon(color, isSelected ? 1.15 : 1, person.heading),
          });

          marker.addListener('click', () => openInfo(marker, popupContent, pos));
          markers.current.set(person.id, marker);
          if (person.foto_url) void applyDriverPhotoIcon(person.id, marker, person.foto_url, color, isSelected ? 1.15 : 1, isSelected);
        }
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
