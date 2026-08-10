import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { confirmarPinPreciso, extractCepFromAddress, getCoordsFromAddress } from '../utils/geo';

const CAMPINAS_CENTER: [number, number] = [-22.9099, -47.0626];

const KNOWN_CITIES = [
  'Campinas', 'Valinhos', 'Vinhedo', 'Hortolândia', 'Sumaré', 'Paulínia',
  'Indaiatuba', 'Jaguariúna', 'Monte Mor', 'Santa Bárbara d\'Oeste',
  'Santo Antônio de Posse', 'Itupeva',
];

function guessFromAddressText(addressText: string) {
  const cep = extractCepFromAddress(addressText) || '';
  const withoutCep = addressText.replace(/\d{5}-?\d{3}/, '').trim().replace(/,\s*$/, '');
  const parts = withoutCep.split(',').map((p) => p.trim()).filter(Boolean);

  let cidade = '';
  let uf = 'SP';
  const cidadeIdx = parts.findIndex((p) => KNOWN_CITIES.some((c) => c.toLowerCase() === p.toLowerCase()));
  if (cidadeIdx >= 0) {
    cidade = parts[cidadeIdx];
    parts.splice(cidadeIdx, 1);
  }
  const ufIdx = parts.findIndex((p) => /^[A-Z]{2}$/i.test(p));
  if (ufIdx >= 0) {
    uf = parts[ufIdx].toUpperCase();
    parts.splice(ufIdx, 1);
  }
  const filtered = parts.filter((p) => !/^\d+[a-zA-Z]?$/.test(p));

  return {
    cep,
    logradouro: filtered[0] || '',
    bairro: filtered[1] || '',
    cidade: cidade || 'Campinas',
    uf,
  };
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

export interface AddressPinPickerConfirmedResult {
  lat: number;
  lng: number;
  cep: string;
  logradouro?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  formattedAddress: string;
}

interface AddressPinPickerProps {
  /** Texto digitado pelo usuário que não retornou nenhum resultado na busca. */
  addressText: string;
  onConfirm: (result: AddressPinPickerConfirmedResult) => void;
  onCancel: () => void;
}

/**
 * Mapa (Leaflet + OpenStreetMap, mesma base do MapViewOwnApi.tsx) com pin
 * arrastável, pra usuário final confirmar manualmente a posição exata de um
 * endereço que a busca automática (CNEFE/ViaCEP/Nominatim) não encontrou.
 * Ao confirmar, chama POST /v1/geocode/confirmar da Carbymaps — a posição
 * fica salva permanentemente (fonte='confirmado_manual') e passa a ser
 * encontrada automaticamente em buscas futuras pelo mesmo CEP.
 */
export function AddressPinPicker({ addressText, onConfirm, onCancel }: AddressPinPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const positionRef = useRef<[number, number]>(CAMPINAS_CENTER);

  const guess = useRef(guessFromAddressText(addressText)).current;
  const [cep, setCep] = useState(guess.cep);
  const [logradouro, setLogradouro] = useState(guess.logradouro);
  const [bairro, setBairro] = useState(guess.bairro);
  const [cidade, setCidade] = useState(guess.cidade);
  const [uf, setUf] = useState(guess.uf);

  const [locating, setLocating] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tenta centralizar o mapa numa posição aproximada (bairro/cidade) antes
  // de deixar o usuário arrastar o pin pro local exato.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const coords = await getCoordsFromAddress(addressText);
      if (cancelled) return;
      if (coords) {
        positionRef.current = coords;
        mapRef.current?.setView(coords, 16);
        markerRef.current?.setLatLng(coords);
      }
      setLocating(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(positionRef.current, 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.marker(positionRef.current, { icon: pinIcon, draggable: true }).addTo(map);
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

  const handleConfirm = async () => {
    const cepDigits = cep.replace(/\D/g, '');
    if (cepDigits.length !== 8) {
      setError('Informe um CEP válido (8 dígitos) para confirmar esse local.');
      return;
    }
    const formattedCep = `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`;

    setConfirming(true);
    setError(null);
    const [lat, lng] = positionRef.current;
    const result = await confirmarPinPreciso({
      cep: formattedCep,
      lat,
      lng,
      logradouro: logradouro.trim() || undefined,
      bairro: bairro.trim() || undefined,
      cidade: cidade.trim() || undefined,
      uf: uf.trim() || undefined,
    });
    setConfirming(false);

    if (!result.ok) {
      setError(result.error || 'Não foi possível confirmar essa localização. Tente novamente.');
      return;
    }

    const fallbackAddress = [logradouro, bairro, `${cidade} - ${uf}`, formattedCep].filter(Boolean).join(', ');
    onConfirm({
      lat: result.lat ?? lat,
      lng: result.lng ?? lng,
      cep: formattedCep,
      logradouro: logradouro.trim() || undefined,
      bairro: bairro.trim() || undefined,
      cidade: cidade.trim() || undefined,
      uf: uf.trim() || undefined,
      formattedAddress: result.formattedAddress || fallbackAddress,
    });
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800 text-sm">Marcar endereço no mapa</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Não encontramos esse endereço automaticamente. Arraste o pin até o local exato e confirme os dados abaixo.
          </p>
        </div>

        <div ref={containerRef} style={{ width: '100%', height: '260px' }} className="bg-slate-100 relative">
          {locating && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-white/70 text-xs text-slate-500 pointer-events-none">
              Buscando posição aproximada...
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="CEP*"
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded"
            />
            <input
              placeholder="Bairro"
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded"
            />
          </div>
          <input
            placeholder="Logradouro (rua)"
            value={logradouro}
            onChange={(e) => setLogradouro(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              placeholder="Cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className="col-span-2 px-3 py-1.5 text-sm border border-slate-300 rounded"
            />
            <input
              placeholder="UF"
              value={uf}
              maxLength={2}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="px-3 py-1.5 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
          >
            {confirming ? 'Confirmando...' : 'Confirmar este local'}
          </button>
        </div>
      </div>
    </div>
  );
}
