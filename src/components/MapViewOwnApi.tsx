import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Database } from '../lib/database.types';



type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

export interface MapDeliveryPerson extends DeliveryPerson {
  foto_url?: string | null;
  heading?: number | null;
}

export interface DeliveryPin {
  id: string;
  coords: [number, number];
  tooltip: string;
  color?: string;
  label?: string;
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

/** Pin em formato de gota, mesmo estilo visual usado nos marcadores de origem/destino/paradas. */
function dropIcon(color: string, opts: { label?: string; scale?: number; glyph?: string } = {}): L.DivIcon {
  const scale = opts.scale ?? 1;
  const w = Math.round(34 * scale);
  const h = Math.round(42 * scale);
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:${w}px;height:${h}px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 34 42">
          <path d="M17 40c-5.6-6.5-14-14.6-14-22C3 8 9.4 2 17 2s14 6 14 16c0 7.4-8.4 15.5-14 22z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
        </svg>
        ${opts.glyph ? `<div style="position:absolute;left:50%;top:${Math.round(h * 0.3)}px;transform:translate(-50%,-50%);font-size:${Math.round(14 * scale)}px;">${opts.glyph}</div>` : ''}
        ${opts.label ? `<div style="position:absolute;left:50%;top:${Math.round(h * 0.36)}px;transform:translate(-50%,-50%);color:#fff;font:700 ${Math.round(11 * scale)}px sans-serif;">${escapeHtml(opts.label)}</div>` : ''}
      </div>
    `,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
  });
}

/** Marcador circular do entregador (foto se tiver, senão iniciais), com anel de destaque quando selecionado. */
function driverIcon(p: MapDeliveryPerson, selected: boolean): L.DivIcon {
  const color = getMarkerColor(p);
  const size = selected ? 46 : 40;
  const ring = selected ? '3px solid #f59e0b' : '2px solid #ffffff';
  const photoUrl = String(p.foto_url || '').trim();
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

  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;border:${ring};box-shadow:0 2px 6px rgba(0,0,0,0.4);overflow:hidden;">${inner}</div>`,
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
}: MapViewOwnApiProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const driverMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const originMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const additionalMarkersRef = useRef<Map<number, L.Marker>>(new Map());
  const pinMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Inicializa o mapa uma única vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initialCenter = center ?? CAMPINAS_CENTER;
    const map = L.map(containerRef.current).setView(initialCenter, 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;
    setMapLoaded(true);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Centro do mapa.
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !center) return;
    mapRef.current.panTo(center);
  }, [mapLoaded, center]);

  // Marcadores de entregador — posição já vem pronta via prop (ver
  // comentário no topo do arquivo), só desenha/atualiza/remove.
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    const currentIds = new Set<string>();
    deliveryPersons.forEach((person) => {
      if (person.current_latitude == null || person.current_longitude == null) return;
      currentIds.add(person.id);

      const pos: [number, number] = [person.current_latitude, person.current_longitude];
      const isSelected = person.id === selectedEntregadorId;
      const icon = driverIcon(person, isSelected);
      const popup = `
        <div style="padding:4px;">
          <strong>${escapeHtml(person.name)}</strong><br/>
          <span>Status: ${escapeHtml(formatStatus(person.status))}</span><br/>
          <span>${person.is_online ? '🟢 Online' : '🔴 Offline'}</span>
        </div>
      `;

      const existing = driverMarkersRef.current.get(person.id);
      if (existing) {
        existing.setLatLng(pos);
        existing.setIcon(icon);
        existing.setZIndexOffset(isSelected ? 1000 : 0);
      } else {
        const marker = L.marker(pos, { icon, zIndexOffset: isSelected ? 1000 : 0 }).addTo(map);
        marker.bindPopup(popup);
        driverMarkersRef.current.set(person.id, marker);
      }
    });

    driverMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        driverMarkersRef.current.delete(id);
      }
    });
  }, [mapLoaded, deliveryPersons, selectedEntregadorId]);

  // Pan + zoom no entregador selecionado (mesmo comportamento do MapView original).
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !selectedEntregadorId) return;
    const person = deliveryPersons.find((p) => p.id === selectedEntregadorId);
    if (person?.current_latitude != null && person?.current_longitude != null) {
      mapRef.current.panTo([person.current_latitude, person.current_longitude]);
      mapRef.current.setZoom(16);
    }
  }, [mapLoaded, selectedEntregadorId, deliveryPersons]);

  // Marcador de origem (loja/caminhão).
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    if (!origin) {
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      return;
    }

    const glyph = originIconType === 'store' ? '🏬' : '🚚';
    const icon = dropIcon('#10b981', { glyph });
    if (originMarkerRef.current) {
      originMarkerRef.current.setLatLng(origin);
      originMarkerRef.current.setIcon(icon);
    } else {
      const marker = L.marker(origin, { icon, zIndexOffset: 400 }).addTo(map);
      if (originTitle) marker.bindPopup(`<strong style="color:#10b981">${escapeHtml(originTitle)}</strong>`);
      originMarkerRef.current = marker;
    }
  }, [mapLoaded, origin, originTitle, originIconType]);

  // Marcador de destino.
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    if (!destination) {
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      return;
    }

    const icon = dropIcon('#ef4444', { glyph: '📦' });
    if (destMarkerRef.current) {
      destMarkerRef.current.setLatLng(destination);
      destMarkerRef.current.setIcon(icon);
    } else {
      const marker = L.marker(destination, { icon, zIndexOffset: 500 }).addTo(map);
      if (destinationTitle) marker.bindPopup(`<strong style="color:#ef4444">${escapeHtml(destinationTitle)}</strong>`);
      destMarkerRef.current = marker;
    }
  }, [mapLoaded, destination, destinationTitle]);

  // Paradas extras numeradas.
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

  // Pins de entrega (cor/label livres, vindos do chamador).
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    const currentIds = new Set<string>();
    deliveryPins.forEach((pin) => {
      currentIds.add(pin.id);
      const color = pin.color || '#f97316';
      const icon = dropIcon(color, { label: pin.label, glyph: pin.label ? undefined : '📦' });
      const existing = pinMarkersRef.current.get(pin.id);
      if (existing) {
        existing.setLatLng(pin.coords);
        existing.setIcon(icon);
      } else {
        const marker = L.marker(pin.coords, { icon, zIndexOffset: 150 }).addTo(map);
        marker.bindTooltip(pin.tooltip);
        pinMarkersRef.current.set(pin.id, marker);
      }
    });

    pinMarkersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        pinMarkersRef.current.delete(id);
      }
    });
  }, [mapLoaded, deliveryPins]);

  // Polyline da rota — só desenha o que já vier pronto via prop (ver
  // comentário no topo do arquivo: este componente não calcula rota).
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

  // Enquadra o mapa em origem+destino+paradas+entregador selecionado —
  // mesmo conjunto de pontos que o MapView.tsx original usava pro fitBounds.
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, origin, destination, additionalDestinations, selectedEntregadorId]);

  return <div ref={containerRef} className="w-full h-full z-0" style={{ overscrollBehavior: 'contain' }} />;
}
