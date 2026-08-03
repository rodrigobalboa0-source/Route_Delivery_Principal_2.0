import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';

// Faixa Unicode de marcas diacríticas combinantes (resultado de normalize('NFD')),
// construída via charCode para evitar problemas de encoding no source.
const COMBINING_MARKS_REGEX = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');

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
  onSuggestCoords?: (coords: [number, number] | undefined, typedText: string) => void
}>(function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  containerClassName,
  inputClassName,
  onSelectCoords,
  onSuggestCoords,
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

        const call = async () => {
          try {
            const url = new URL('/v1/autocomplete', import.meta.env.VITE_MAPS_API_URL);
            url.searchParams.set('input', query);
            const res = await fetch(url.toString(), {
              headers: { 'X-API-Key': import.meta.env.VITE_MAPS_API_KEY },
            });
            if (!res.ok) return { ok: false as const, results: [] as any[] };
            const data = await res.json();
            const results = Array.isArray(data?.predictions) ? data.predictions : [];
            return { ok: true as const, results };
          } catch {
            return { ok: false as const, results: [] as any[] };
          }
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
      {open && trimmedValue.length > 0 && (
        <div className="absolute z-[10000] w-full mt-1 bg-white border border-slate-200 rounded shadow-lg pointer-events-auto">
          {trimmedValue.length < 3 ? (
            <div className="px-3 py-2 text-sm text-slate-500">Digite pelo menos 3 caracteres</div>
          ) : loadingSuggestions ? (
            <div className="px-3 py-2 text-sm text-slate-500">Buscando endereços...</div>
          ) : suggestionsError ? (
            <div className="px-3 py-2 text-sm text-red-700">{suggestionsError}</div>
          ) : suggestions.length === 0 && didSearch ? (
            <div className="px-3 py-2 text-sm text-slate-500">Nenhum endereço encontrado. Tente incluir bairro ou número.</div>
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
    </div>
  );
});
