import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { AddressPinPicker, type AddressPinPickerConfirmedResult } from './AddressPinPicker';
import { getMapaConfig } from '../lib/mapaConfig';

// Faixa Unicode de marcas diacríticas combinantes (resultado de normalize('NFD')),
// construída via charCode para evitar problemas de encoding no source.
const COMBINING_MARKS_REGEX = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');

/** Mesma extração de número usada pra montar a query da busca (linhas ~130-139 do efeito abaixo) — reaproveitada aqui pra decidir se o resultado final tem o número exato pedido, sem duplicar o parsing em dois lugares com regras diferentes. */
function extractNumeroFromQuery(text: string): string {
  let query = String(text || '').replace(/\s+-\s+/g, ', ').replace(/\s+/g, ' ').trim();
  const queryParts = query.split(',').map((p) => p.trim()).filter(Boolean);
  if (queryParts[0]) {
    queryParts[0] = queryParts[0].replace(/([^\d,])\s+(\d{1,6}[a-zA-Z]?)\b/, '$1, $2');
  }
  query = queryParts.join(', ');
  return (query.match(/,\s*(\d{1,6}[a-zA-Z]?)\b/) || [])[1] || '';
}

/** Verifica se um número aparece como segmento próprio (separado por vírgula) na descrição — evita bater substring dentro de outro número (ex.: "91" dentro de "1991" ou de um CEP). */
function suggestionHasExactNumber(displayName: string, numero: string): boolean {
  const escaped = numero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`,\\s*${escaped}\\s*(,|-|$)`, 'i').test(displayName);
}

export interface AddressSuggestion {
  display_name: string;
  lat?: string;
  lon?: string;
}

export interface AddressAutocompleteHandle {
  /** Foca e abre a lista de sugestões — usado por campos de CEP dedicados
   * pra unificar com o mesmo fluxo de busca+clique do autocomplete, em vez
   * de aceitar/preencher um endereço resolvido à parte. */
  focusAndOpen: () => void;
}

export const AddressAutocomplete = forwardRef<AddressAutocompleteHandle, {
  value: string,
  onChange: (val: string) => void,
  placeholder: string,
  containerClassName?: string,
  inputClassName?: string,
  onSelectCoords?: (coords: [number, number] | undefined, selectedText?: string) => void,
  onSuggestCoords?: (coords: [number, number] | undefined, typedText: string) => void,
  /** Chamado além de onChange/onSelectCoords quando o usuário confirma um pin manual —
   * usado por telas que têm um campo de CEP separado do texto de endereço. */
  onConfirmManualPin?: (result: AddressPinPickerConfirmedResult) => void,
}>(function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  containerClassName,
  inputClassName,
  onSelectCoords,
  onSuggestCoords,
  onConfirmManualPin,
}, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestSeqRef = useRef(0);
  const cacheRef = useRef<Map<string, AddressSuggestion[]>>(new Map());
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [didSearch, setDidSearch] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [pinPickerOpen, setPinPickerOpen] = useState(false);

  const handleConfirmManualPin = (result: AddressPinPickerConfirmedResult) => {
    onChange(result.formattedAddress);
    onSelectCoords?.([result.lat, result.lng], result.formattedAddress);
    onConfirmManualPin?.(result);
    setPinPickerOpen(false);
    setOpen(false);
  };

  const selectSuggestion = (s: AddressSuggestion) => {
    onChange(s.display_name);
    if (onSelectCoords) {
      const lat = Number(s.lat);
      const lon = Number(s.lon);
      const coords = !Number.isNaN(lat) && !Number.isNaN(lon) ? ([lat, lon] as [number, number]) : undefined;
      onSelectCoords(coords, s.display_name);
    }
    setOpen(false);
    setActiveIndex(-1);
  };

  useImperativeHandle(ref, () => ({
    focusAndOpen: () => {
      setOpen(true);
      inputRef.current?.focus();
    },
  }), []);

  useEffect(() => {
    const trimmed = (value || '').trim();
    if (!open || trimmed.length < 3) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      setSuggestionsError(null);
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    const timer = setTimeout(async () => {
      const seq = ++requestSeqRef.current;
      const normalizedKey = trimmed
        .normalize('NFD')
        .replace(COMBINING_MARKS_REGEX, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

      const cached = cacheRef.current.get(normalizedKey);
      if (cached) {
        setSuggestions(cached);
        setLoadingSuggestions(false);
        setSuggestionsError(null);
        setDidSearch(true);
        return;
      }

      setLoadingSuggestions(true);
      setSuggestionsError(null);
      setDidSearch(true);

      try {
        let query = String(trimmed || '')
          .replace(/\s+-\s+/g, ', ')
          .replace(/\s+/g, ' ')
          .trim();

        const queryParts = query
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        if (queryParts[0]) {
          queryParts[0] = queryParts[0].replace(/([^\d,])\s+(\d{1,6}[a-zA-Z]?)\b/, '$1, $2');
        }
        query = queryParts.join(', ');

        const userNumber = (query.match(/,\s*(\d{1,6}[a-zA-Z]?)\b/) || [])[1] || '';

        const queryNormalized = query
          .normalize('NFD')
          .replace(COMBINING_MARKS_REGEX, '')
          .toLowerCase();

        const regionCities = [
          'campinas',
          'valinhos',
          'vinhedo',
          'hortolandia',
          'hortolândia',
          'sumare',
          'sumaré',
          'paulinia',
          'paulínia',
          'indaiatuba',
          'jaguariuna',
          'jaguariúna',
          'monte mor',
          'santa barbara',
          'santa bárbara',
          'santo antonio',
          'santo antônio',
          'itupeva',

          'jardim sao marcos',
          'jardim são marcos',
          'jardim das industrias',
          'jardim das indústrias',
          'jardim guanabara',
          'jardim planalto',
          'jardim novo horizonte',
          'jardim santa genebra',
          'jardim santa edwiges',
          'jardim sao jose',
          'jardim são josé',
          'jardim eldorado',
          'jardim flor da serra',
          'barao geraldo',
          'barão geraldo',
          'vila industrial',
          'centro',
          'nova campinas',
          'taquaral',
          'lagoa do codorna',
        ];

        const hasCityHint = regionCities.some((c) => queryNormalized.includes(c));
        const hasStateHint = queryNormalized.includes(', sp') || queryNormalized.includes(' sao paulo') || queryNormalized.includes('são paulo');
        if (!hasCityHint && !hasStateHint) {
          query = `${query}, Campinas, SP`;
        }

        // Provedor da geolocalização definido na aba Configurações (Google ou
        // OpenStreetMap). O mapa (tiles) segue sempre em OpenStreetMap.
        const googleCall = async (apiKey: string) => {
          try {
            const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
            url.searchParams.set('address', query);
            url.searchParams.set('region', 'br');
            url.searchParams.set('language', 'pt-BR');
            url.searchParams.set('components', 'country:BR');
            url.searchParams.set('key', apiKey);
            const res = await fetch(url.toString());
            if (!res.ok) return { ok: false as const, results: [] as any[] };
            const data = await res.json();
            if (data?.status !== 'OK' || !Array.isArray(data.results)) {
              if (data?.status && data.status !== 'ZERO_RESULTS') {
                console.error('[AddressAutocomplete] Geocoding API:', data.status, data.error_message || '');
              }
              return { ok: false as const, results: [] as any[] };
            }
            const results = data.results.map((r: any) => ({
              description: String(r.formatted_address || ''),
              lat: r?.geometry?.location?.lat,
              lng: r?.geometry?.location?.lng,
            }));
            return { ok: true as const, results };
          } catch (err) {
            console.error('[AddressAutocomplete] Google Geocoding falhou, caindo para OpenStreetMap:', err);
            return { ok: false as const, results: [] as any[] };
          }
        };

        const osmCall = async () => {
          try {
            const url = new URL('https://nominatim.openstreetmap.org/search');
            url.searchParams.set('format', 'json');
            url.searchParams.set('limit', '6');
            url.searchParams.set('countrycodes', 'br');
            url.searchParams.set('accept-language', 'pt-BR');
            url.searchParams.set('q', query);
            const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
            if (!res.ok) return { ok: false as const, results: [] as any[] };
            const data = await res.json();
            const results = (Array.isArray(data) ? data : []).map((item: any) => ({
              description: String(item.display_name || ''),
              lat: item.lat != null ? Number(item.lat) : undefined,
              lng: item.lon != null ? Number(item.lon) : undefined,
            }));
            return { ok: true as const, results };
          } catch (err) {
            console.error('[AddressAutocomplete] OpenStreetMap (Nominatim) falhou:', err);
            return { ok: false as const, results: [] as any[] };
          }
        };

        const call = async () => {
          const cfg = await getMapaConfig();
          if (cfg.provider === 'google' && cfg.apiKey) {
            const g = await googleCall(cfg.apiKey);
            if (g.ok && g.results.length) return g;
          }
          return osmCall();
        };

        const first = await call();
        const results = first.ok ? first.results : [];
        if (seq !== requestSeqRef.current) return;


        const suggestionsRaw = (Array.isArray(results) ? results : [])
          .map((item: any) => ({
            display_name: String(item.description || '').trim(),
            lat: typeof item.lat === 'number' ? String(item.lat) : undefined,
            lon: typeof item.lng === 'number' ? String(item.lng) : undefined,
          }))
          .filter((s: any) => !!s.display_name && !!s.lat && !!s.lon);

        const deduped: AddressSuggestion[] = [];
        const seen = new Set<string>();
        for (const s of suggestionsRaw) {
          const k = s.display_name
            .normalize('NFD')
            .replace(COMBINING_MARKS_REGEX, '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ');
          if (seen.has(k)) continue;
          seen.add(k);
          deduped.push(s);
        }

        cacheRef.current.set(normalizedKey, deduped);
        setSuggestions(deduped);


      } catch (e) {
        console.error('[AddressAutocomplete] falha inesperada na busca de endereço:', e);
        setSuggestions([]);
        setSuggestionsError('Falha ao buscar endereços. Tente novamente.');
      } finally {
        const isLatest = seq === requestSeqRef.current;
        if (isLatest) setLoadingSuggestions(false);
      }
    }, 700);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [value, open]);

  const trimmedValue = (value || '').trim();
  const numeroDigitado = extractNumeroFromQuery(trimmedValue);
  const temNumeroExato = !numeroDigitado || suggestions.some((s) => suggestionHasExactNumber(s.display_name, numeroDigitado));
  // Mostra o link "Marque no mapa" tanto quando a busca não acha NADA quanto
  // quando acha só vizinhos aproximados (rua certa, número não bate) — sem
  // isso, endereços como "RUA X, 91" onde só existem os números 89/90/95/96
  // nunca chegavam a mostrar o link, porque a lista nunca fica vazia (o
  // CNEFE sempre devolve o vizinho mais próximo).
  const semResultadoExato = didSearch && !loadingSuggestions && !suggestionsError && (suggestions.length === 0 || !temNumeroExato);

  return (
    <div ref={containerRef} className={`relative ${containerClassName || ''}`}>
      <input
        ref={inputRef}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onSelectCoords?.(undefined, undefined);
          setActiveIndex(-1);
          setOpen(true);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'Escape') {
            setOpen(false);
            setActiveIndex(-1);
            return;
          }
          if (suggestions.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((v) => (v + 1) % suggestions.length);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((v) => (v <= 0 ? suggestions.length - 1 : v - 1));
            return;
          }
          if (e.key === 'Enter') {
            if (activeIndex >= 0 && activeIndex < suggestions.length) {
              e.preventDefault();
              selectSuggestion(suggestions[activeIndex]);
            }
          }
        }}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border rounded ${inputClassName || 'border-slate-300'}`}
      />
      {open && !pinPickerOpen && trimmedValue.length > 0 && (
        <div className="absolute z-[10000] w-full mt-1 bg-white border border-slate-200 rounded shadow-lg pointer-events-auto">
          {trimmedValue.length < 3 ? (
            <div className="px-3 py-2 text-sm text-slate-500">Digite pelo menos 3 caracteres</div>
          ) : loadingSuggestions ? (
            <div className="px-3 py-2 text-sm text-slate-500">Buscando endereços...</div>
          ) : suggestionsError ? (
            <div className="px-3 py-2 text-sm text-red-700">{suggestionsError}</div>
          ) : semResultadoExato ? (
            <div className="space-y-1.5">
              <div className="px-3 pt-2 text-sm text-slate-500">
                {suggestions.length === 0
                  ? 'Nenhum endereço encontrado. Tente incluir bairro ou número.'
                  : `Não encontramos o número ${numeroDigitado} exatamente — endereços próximos:`}
              </div>
              {suggestions.length > 0 && (
                <ul className="max-h-40 overflow-auto">
                  {suggestions.map((s, i) => (
                    <button
                      key={`${s.display_name}-${i}`}
                      type="button"
                      className={`w-full text-left px-3 py-2 cursor-pointer text-sm ${
                        i === activeIndex ? 'bg-sky-50 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectSuggestion(s);
                      }}
                    >
                      {s.display_name}
                    </button>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setPinPickerOpen(true);
                }}
                className="w-full text-left px-3 pb-2 text-sky-600 hover:text-sky-700 font-medium text-sm"
              >
                📍 Não encontrou seu endereço? Marque no mapa
              </button>
            </div>
          ) : (
            <ul className="max-h-60 overflow-auto">
              {suggestions.map((s, i) => (
                <button
                  key={`${s.display_name}-${i}`}
                  type="button"
                  className={`w-full text-left px-3 py-2 cursor-pointer text-sm ${
                    i === activeIndex ? 'bg-sky-50 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSuggestion(s);
                  }}
                >
                  {s.display_name}
                </button>
              ))}
            </ul>
          )}
        </div>
      )}
      {pinPickerOpen && (
        <AddressPinPicker
          addressText={trimmedValue}
          onConfirm={handleConfirmManualPin}
          onCancel={() => setPinPickerOpen(false)}
        />
      )}
    </div>
  );
});
