import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapViewOwnApi.css';
import type { Database } from '../lib/database.types';

/**
 * Substituto drop-in do MapView.tsx (Google Maps JS SDK) usando Leaflet +
 * OpenStreetMap, consumindo a Maps API própria (~/maps-api) em vez do
 * Google. Mesma interface de props do MapView original — nenhum consumidor
 * precisa mudar como chama o componente.
 *
 * Diferente do DeliveryMap.tsx de referência da maps-api, este componente
 * NÃO cria seu próprio client Supabase nem se inscreve em Realtime: a
 * posição dos entregadores já chega pronta via prop `deliveryPersons`
 * (current_latitude/current_longitude), porque o RouteDelivery já mantém
 * sua própria inscrição Realtime na tabela `entregadores` (ver
 * PedidosPanel.tsx) — reimplementar isso aqui duplicaria a assinatura e,
 * pior, tentaria ler uma tabela que não existe no projeto Supabase do
 * RouteDelivery (a maps-api usa `driver_locations`/lat/lng num projeto
 * Supabase diferente).
 *
 * Também não busca rota sozinho: `route`, quando passado, já vem calculado
 * por quem chama (ver RoteirizacaoReport.tsx/TrajetoEntregadoresReport.tsx,
 * que passam trilhas históricas de GPS, não uma rota otimizada) — isso
 * espelha o comportamento do MapView.tsx original, que também só desenha o
 * `route` recebido sem calcular nada.
 */

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

export interface MapDeliveryPerson extends DeliveryPerson {
  foto_url?: string | null;
  foto_base64?: string | null;
  heading?: number | null;
}

export interface DeliveryPin {
  id: string;
  coords: [number, number];
  tooltip: string;
  color?: string;
  label?: string;
  agendado?: boolean;
}

interface MapViewOwnApiProps {
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
  deliveryPins?: DeliveryPin[];
  /** Quando passado, o popup do entregador mostra uma chave para deixá-lo offline. */
  onOffline?: (id: string) => void;
}

const CAMPINAS_CENTER: [number, number] = [-22.9099, -47.0626];

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMarkerColor(p: MapDeliveryPerson): string {
  if (!p.is_online) return '#6b7280';
  if (p.status === 'disponivel') return '#0ea5e9';
  if (p.status === 'em_entrega') return '#3b82f6';
  return '#6b7280';
}

function formatStatus(s: string): string {
  if (s === 'disponivel') return 'Disponível';
  if (s === 'inativo') return 'Indisponível';
  if (s === 'em_entrega') return 'Em Entrega';
  return s;
}

const ICONS = {
  store: (size = 15) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  package: (size = 15) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  truck: (size = 15) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`,
  clock: (size = 10) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
};

function dropIcon(
  color: string,
  opts: { iconSvg?: string; label?: string; scale?: number; badge?: 'clock' } = {}
): L.DivIcon {
  const scale = opts.scale ?? 1;
  const w = Math.round(34 * scale);
  const h = Math.round(42 * scale);
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:${w}px;height:${h}px;filter:drop-shadow(0 2px 4px rgba(15,23,42,0.35));">
        <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 34 42">
          <path d="M17 40c-5.6-6.5-14-14.6-14-22C3 8 9.4 2 17 2s14 6 14 16c0 7.4-8.4 15.5-14 22z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
        </svg>
        ${opts.iconSvg ? `<div style="position:absolute;left:50%;top:${Math.round(h * 0.36)}px;transform:translate(-50%,-50%);line-height:0;">${opts.iconSvg}</div>` : ''}
        ${opts.label ? `<div style="position:absolute;left:50%;top:${Math.round(h * 0.36)}px;transform:translate(-50%,-50%);color:#fff;font:700 ${Math.round(11 * scale)}px sans-serif;">${escapeHtml(opts.label)}</div>` : ''}
        ${opts.badge === 'clock' ? `<div style="position:absolute;right:-3px;top:-1px;width:15px;height:15px;background:#f59e0b;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;">${ICONS.clock(9)}</div>` : ''}
      </div>
    `,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
  });
}

function driverIconKey(p: MapDeliveryPerson, selected: boolean): string {
  const photoUrl = String(p.foto_url || p.foto_base64 || '').trim();
  return [
    selected ? '1' : '0',
    p.is_online ? '1' : '0',
    p.status || '',
    photoUrl,
    photoUrl ? '' : (p.name || ''),
  ].join('|');
}

function driverIcon(p: MapDeliveryPerson, selected: boolean): L.DivIcon {
  const color = getMarkerColor(p);
  const size = selected ? 46 : 40;
  const ring = selected ? '3px solid #f59e0b' : '2px solid #ffffff';
  const photoUrl = String(p.foto_url || p.foto_base64 || '').trim();
  const initials = (p.name || '??')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const inner = photoUrl
    ? `<img src="${escapeHtml(photoUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
    : `<div style="width:100%;height:100%;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font:700 13px sans-serif;">${escapeHtml(initials)}</div>`;

  const statusDotColor = p.is_online ? '#22c55e' : '#9ca3af';
  const statusDotSize = Math.round(size * 0.3);

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;filter:drop-shadow(0 2px 4px rgba(15,23,42,0.4));">
        <div style="width:100%;height:100%;border-radius:50%;border:${ring};overflow:hidden;">${inner}</div>
        <div style="position:absolute;right:-1px;bottom:-1px;width:${statusDotSize}px;height:${statusDotSize}px;border-radius:50%;background:${statusDotColor};border:2px solid #fff;"></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function MapView({
  deliveryPersons = [],
  selectedEntregadorId,
  center,
  origin,
  destination,
  route,
  originTitle,
  destinationTitle,
  originIconType = 'truck',
  additionalDestinations = [],
  deliveryPins = [],
  onOffline,
}: MapViewOwnApiProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onOfflineRef = useRef(onOffline);
  onOfflineRef.current = onOffline;
  const mapRef = useRef<L.Map | null>(null);
  const driverMarkersRef = useRef<Map<string, { marker: L.Marker; iconKey: string }>>(new Map());
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const additionalMarkersRef = useRef<Map<number, L.Marker>>(new Map());
  const pinMarkersRef = useRef<Map<string, { marker: L.Marker; iconKey: string }>>(new Map());
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const userInteractedRef = useRef(false);
  const prevSelectedIdRef = useRef<string | undefined>(undefined);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initialCenter = center ?? CAMPINAS_CENTER;
    const map = L.map(containerRef.current).setView(initialCenter, 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on('dragstart', () => {
      userInteractedRef.current = true;
    });
    mapRef.current = map;
    setMapLoaded(true);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);
    const initialSizeTimeout = setTimeout(() => map.invalidateSize(), 150);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(initialSizeTimeout);
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };

  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !center || userInteractedRef.current) return;
    mapRef.current.panTo(center);
  }, [mapLoaded, center]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    const currentIds = new Set<string>();
    deliveryPersons.forEach((person) => {
      if (person.current_latitude == null || person.current_longitude == null) return;
      currentIds.add(person.id);

      const pos: [number, number] = [person.current_latitude, person.current_longitude];
      const isSelected = person.id === selectedEntregadorId;
      const iconKey = driverIconKey(person, isSelected);

      const existing = driverMarkersRef.current.get(person.id);
      if (existing) {
        existing.marker.setLatLng(pos);
        if (existing.iconKey !== iconKey) {
          existing.marker.setIcon(driverIcon(person, isSelected));
          existing.marker.setZIndexOffset(isSelected ? 1000 : 0);
          existing.iconKey = iconKey;
        }
      } else {
        const icon = driverIcon(person, isSelected);
        const pid = person.id;
        const chaveHtml = (onOfflineRef.current && person.is_online)
          ? `<label class="mv-chave" title="Deixar offline"><input type="checkbox" checked data-offline="${escapeHtml(pid)}"/><span class="mv-trilho"></span><span class="mv-chave-txt">Online</span></label>`
          : `<span>${person.is_online ? '🟢 Online' : '🔴 Offline'}</span>`;
        const popup = `
          <div style="padding:4px;min-width:130px;">
            <strong>${escapeHtml(person.name)}</strong><br/>
            <span>Status: ${escapeHtml(formatStatus(person.status))}</span><br/>
            ${chaveHtml}
          </div>
        `;
        const marker = L.marker(pos, { icon, zIndexOffset: isSelected ? 1000 : 0 }).addTo(map);
        marker.bindPopup(popup);
        marker.on('popupopen', (ev: any) => {
          const el = ev?.popup?.getElement?.()?.querySelector('[data-offline]') as HTMLInputElement | null;
          if (el && !el.dataset.bound) {
            el.dataset.bound = '1';
            el.addEventListener('change', () => {
              if (window.confirm('Deixar este entregador offline?')) onOfflineRef.current?.(pid);
              else el.checked = true;
            });
          }
        });
        driverMarkersRef.current.set(person.id, { marker, iconKey });
      }
    });

    driverMarkersRef.current.forEach(({ marker }, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        driverMarkersRef.current.delete(id);
      }
    });
  }, [mapLoaded, deliveryPersons, selectedEntregadorId]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !selectedEntregadorId) return;

    if (prevSelectedIdRef.current !== selectedEntregadorId) {
      prevSelectedIdRef.current = selectedEntregadorId;
      userInteractedRef.current = false;
    }
    if (userInteractedRef.current) return;

    const person = deliveryPersons.find((p) => p.id === selectedEntregadorId);
    if (person?.current_latitude != null && person?.current_longitude != null) {
      mapRef.current.panTo([person.current_latitude, person.current_longitude]);
      mapRef.current.setZoom(16);
    }
  }, [mapLoaded, selectedEntregadorId, deliveryPersons]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    if (!origin) {
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      return;
    }

    const iconSvg = originIconType === 'store' ? ICONS.store() : ICONS.truck();
    const icon = dropIcon('#10b981', { iconSvg });
    if (originMarkerRef.current) {
      originMarkerRef.current.setLatLng(origin);
      originMarkerRef.current.setIcon(icon);
    } else {
      const marker = L.marker(origin, { icon, zIndexOffset: 400 }).addTo(map);
      if (originTitle) marker.bindPopup(`<strong style="color:#10b981">${escapeHtml(originTitle)}</strong>`);
      originMarkerRef.current = marker;
    }
  }, [mapLoaded, origin, originTitle, originIconType]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    if (!destination) {
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      return;
    }

    const icon = dropIcon('#ef4444', { iconSvg: ICONS.package() });
    if (destMarkerRef.current) {
      destMarkerRef.current.setLatLng(destination);
      destMarkerRef.current.setIcon(icon);
    } else {
      const marker = L.marker(destination, { icon, zIndexOffset: 500 }).addTo(map);
      if (destinationTitle) marker.bindPopup(`<strong style="color:#ef4444">${escapeHtml(destinationTitle)}</strong>`);
      destMarkerRef.current = marker;
    }
  }, [mapLoaded, destination, destinationTitle]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    const currentOrders = new Set<number>();
    additionalDestinations.forEach((dest) => {
      currentOrders.add(dest.order);
      const icon = dropIcon('#8b5cf6', { label: String(dest.order) });
      const existing = additionalMarkersRef.current.get(dest.order);
      if (existing) {
        existing.setLatLng(dest.coords);
        existing.setIcon(icon);
      } else {
        const marker = L.marker(dest.coords, { icon, zIndexOffset: 300 }).addTo(map);
        marker.bindPopup(`<strong style="color:#8b5cf6">${escapeHtml(dest.title)}</strong>`);
        additionalMarkersRef.current.set(dest.order, marker);
      }
    });

    additionalMarkersRef.current.forEach((marker, order) => {
      if (!currentOrders.has(order)) {
        marker.remove();
        additionalMarkersRef.current.delete(order);
      }
    });
  }, [mapLoaded, additionalDestinations]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    const currentIds = new Set<string>();
    deliveryPins.forEach((pin) => {
      currentIds.add(pin.id);
      const color = pin.color || '#f97316';
      const iconKey = `${color}|${pin.agendado ? '1' : '0'}`;
      const existing = pinMarkersRef.current.get(pin.id);
      if (existing) {
        existing.marker.setLatLng(pin.coords);
        if (existing.iconKey !== iconKey) {
          existing.marker.setIcon(dropIcon(color, { iconSvg: ICONS.package(), badge: pin.agendado ? 'clock' : undefined }));
          existing.iconKey = iconKey;
        }
      } else {
        const icon = dropIcon(color, { iconSvg: ICONS.package(), badge: pin.agendado ? 'clock' : undefined });
        const marker = L.marker(pin.coords, { icon, zIndexOffset: 150 }).addTo(map);

        if (pin.label) {
          marker.bindTooltip(escapeHtml(pin.label), {
            permanent: true,
            direction: 'top',
            offset: [0, -34],
            className: 'delivery-pin-label',
          });
        }
        marker.bindPopup(`<strong style="color:${color}">${escapeHtml(pin.tooltip)}</strong>`);
        pinMarkersRef.current.set(pin.id, { marker, iconKey });
      }
    });

    pinMarkersRef.current.forEach(({ marker }, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        pinMarkersRef.current.delete(id);
      }
    });
  }, [mapLoaded, deliveryPins]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    if (!route || route.length < 2) {
      if (routeLayerRef.current) map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
      return;
    }

    if (routeLayerRef.current) {
      routeLayerRef.current.setLatLngs(route);
    } else {
      routeLayerRef.current = L.polyline(route, { color: '#0ea5e9', weight: 4, opacity: 1 }).addTo(map);
    }
  }, [mapLoaded, route]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || userInteractedRef.current) return;
    const map = mapRef.current;

    const points: [number, number][] = [];
    if (origin) points.push(origin);
    if (destination) points.push(destination);
    additionalDestinations.forEach((d) => points.push(d.coords));
    if (selectedEntregadorId) {
      const person = deliveryPersons.find((p) => p.id === selectedEntregadorId);
      if (person?.current_latitude != null && person?.current_longitude != null) {
        points.push([person.current_latitude, person.current_longitude]);
      }
    }
    if (points.length === 0) return;

    map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15 });
  }, [mapLoaded, origin, destination, additionalDestinations, selectedEntregadorId]);

  return <div ref={containerRef} className="w-full h-full z-0" style={{ overscrollBehavior: 'contain' }} />;
}
