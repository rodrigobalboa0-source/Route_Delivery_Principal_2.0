import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface AddressPinPickerProps {
  lat: number;
  lng: number;
  onConfirm: (lat: number, lng: number) => void;
  onCancel: () => void;
}

function pinIconUrl(color: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
      <path d="M17 40c-5.6-6.5-14-14.6-14-22C3 8 9.4 2 17 2s14 6 14 16c0 7.4-8.4 15.5-14 22z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const pinIcon = L.icon({
  iconUrl: pinIconUrl('#ef4444'),
  iconSize: [34, 42],
  iconAnchor: [17, 42],
});

/**
 * Mapa pequeno com um pin arrastável, pra corrigir manualmente a posição
 * aproximada devolvida pelo geocoding. Usa Leaflet + tiles do OpenStreetMap
 * (mesma base do MapViewOwnApi.tsx), sem depender de nenhuma API paga.
 */
export function AddressPinPicker({ lat, lng, onConfirm, onCancel }: AddressPinPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const positionRef = useRef<[number, number]>([lat, lng]);
  const [mapError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([lat, lng], 17);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      positionRef.current = [pos.lat, pos.lng];
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800 text-sm">Ajustar localização exata</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            A posição encontrada automaticamente é aproximada. Arraste o pin até o local exato.
          </p>
        </div>
        <div ref={containerRef} style={{ width: '100%', height: '280px' }} className="bg-slate-100 flex items-center justify-center">
          {mapError && <span className="text-sm text-red-600 px-4 text-center">{mapError}</span>}
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(positionRef.current[0], positionRef.current[1])}
            className="px-3 py-1.5 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700"
          >
            Confirmar posição
          </button>
        </div>
      </div>
    </div>
  );
}
