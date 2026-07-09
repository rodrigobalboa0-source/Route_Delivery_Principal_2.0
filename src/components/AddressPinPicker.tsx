import { useEffect, useRef, useState } from 'react';
import { loadGoogleMapsJs } from '../lib/loadGoogleMapsJs';

const GOOGLE_MAPS_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

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

/**
 * Mapa pequeno com um pin arrastável, pra corrigir manualmente a posição
 * aproximada devolvida pelo geocoding (Places API). Usa Google Maps
 * JavaScript SDK com um marcador clássico (draggable) — não precisa de Map
 * ID, ao contrário do AdvancedMarkerElement usado no dashboard de frota.
 */
export function AddressPinPicker({ lat, lng, onConfirm, onCancel }: AddressPinPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const markerRef = useRef<any | null>(null);
  const positionRef = useRef<[number, number]>([lat, lng]);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!GOOGLE_MAPS_KEY) {
      setMapError('Chave do Google Maps não configurada.');
      return;
    }
    let cancelled = false;

    const init = async () => {
      try {
        await loadGoogleMapsJs(GOOGLE_MAPS_KEY);
        if (cancelled || !containerRef.current) return;

        const g = (window as any).google;
        const map = new g.maps.Map(containerRef.current, {
          center: { lat, lng },
          zoom: 17,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          clickableIcons: false,
        });

        const marker = new g.maps.Marker({
          map,
          position: { lat, lng },
          draggable: true,
          icon: {
            url: pinIconUrl('#ef4444'),
            scaledSize: new g.maps.Size(34, 42),
            anchor: new g.maps.Point(17, 42),
          },
        });

        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (pos) positionRef.current = [pos.lat(), pos.lng()];
        });

        mapRef.current = map;
        markerRef.current = marker;
      } catch (e) {
        if (!cancelled) setMapError('Não foi possível carregar o mapa.');
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      mapRef.current = null;
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
