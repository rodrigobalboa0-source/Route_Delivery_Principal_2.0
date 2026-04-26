import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { getCoordsFromAddress, getDrivingRouteDistance } from '../../utils/geo';
import type { Database } from '../../lib/database.types';

type Cliente = Database['public']['Tables']['clientes']['Row'];
type Endereco = Database['public']['Tables']['cliente_enderecos']['Row'];
type Entregador = Database['public']['Tables']['entregadores']['Row'];
type TipoServico = Database['public']['Tables']['tipo_servicos']['Row'];
type ModalRow = Database['public']['Tables']['modais']['Row'];
type TabelaPreco = Database['public']['Tables']['tabelas_precos']['Row'];
  type FaixaPreco = Database['public']['Tables']['tabelas_precos_faixas']['Row'];
  type TabelaComissao = Database['public']['Tables']['tabelas_comissoes']['Row'];
  type FaixaComissao = Database['public']['Tables']['tabelas_comissoes_faixas']['Row'];
  type DynamicRule = Database['public']['Tables']['preco_dinamico_demanda']['Row'];
  type DynamicDriverRule = Database['public']['Tables']['preco_dinamico_entregador']['Row'] & { criterio?: string };
  
  interface PrecificacaoConfigItem {
  modal: string;
  preco_ponto: string;
  tipo_precificacao: string;
  tabela_id: string;
}

interface AddressSuggestion {
  display_name: string;
  lat?: string;
  lon?: string;
}

function normalizeBillingMode(mode: string | null | undefined) {
  return (mode || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function isFaturamentoMode(mode: string | null | undefined) {
  const m = normalizeBillingMode(mode);
  if (!m) return false;
  return m.includes('fatur') || m.includes('pospago') || m.includes('pos-pago') || m.includes('pos pago');
}

function isClientFaturamento(client: Cliente | null | undefined) {
  if (!client) return false;

  if (isFaturamentoMode(client.modo_faturamento)) return true;

  if (client.faturamento_periodo) return true;
  if (client.faturamento_vencimento_dias !== null && client.faturamento_vencimento_dias !== undefined) return true;
  if (client.faturamento_tipo_cobranca) return true;
  if (client.faturamento_adicional_1 !== null && client.faturamento_adicional_1 !== undefined) return true;
  if (client.faturamento_adicional_2 !== null && client.faturamento_adicional_2 !== undefined) return true;
  if (client.faturamento_cobrar_taxas_sem_entregas !== null && client.faturamento_cobrar_taxas_sem_entregas !== undefined) return true;
  if (client.faturamento_instrucoes) return true;
  if (client.faturamento_observacoes) return true;
  if (client.faturamento_emails && client.faturamento_emails.length > 0) return true;

  return false;
}

function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  containerClassName,
  onSelectCoords,
  onSuggestCoords,
}: {
  value: string,
  onChange: (val: string) => void,
  placeholder: string,
  containerClassName?: string,
  onSelectCoords?: (coords: [number, number] | undefined, selectedText?: string) => void,
  onSuggestCoords?: (coords: [number, number] | undefined, typedText: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestSeqRef = useRef(0);
  const cacheRef = useRef<Map<string, AddressSuggestion[]>>(new Map());
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [didSearch, setDidSearch] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectSuggestion = (s: AddressSuggestion) => {
    console.log('selectSuggestion called:', s.display_name);
    onChange(s.display_name);
    if (onSelectCoords) {
      const lat = Number(s.lat);
      const lon = Number(s.lon);
      const coords = !Number.isNaN(lat) && !Number.isNaN(lon) ? ([lat, lon] as [number, number]) : undefined;
      onSelectCoords(coords, s.display_name);
    }
    setOpen(false);
    setActiveIndex(-1);
    sessionTokenRef.current = crypto.randomUUID();
  };

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
        .replace(/[\u0300-\u036f]/g, '')
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
          .replace(/[\u0300-\u036f]/g, '')
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

        const call = async (bounded: boolean) => {
          const { data, error } = await supabase.functions.invoke('geocode', {
            body: { q: query, limit: 8, bounded, sessionToken: sessionTokenRef.current, provider: 'google-geocode' },
          });
          if (error) return { ok: false as const, results: [] as any[] };
          const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
          return { ok: true as const, results };
        };

        const first = await call(true);
        let results = first.ok ? first.results : [];
        if (results.length === 0) {
          const second = await call(false);
          results = second.ok ? second.results : [];
        }
        if (seq !== requestSeqRef.current) return;

        // Usar exatamente a ordem e display_name original da API
        const suggestionsRaw = (Array.isArray(results) ? results : [])
          .map((item: any) => ({
            display_name: String(item.display_name || '').trim(),
            lat: typeof item.lat === 'string' ? item.lat : undefined,
            lon: typeof item.lon === 'string' ? item.lon : undefined,
          }))
          .filter((s: any) => !!s.display_name && !!s.lat && !!s.lon);

        const deduped: AddressSuggestion[] = [];
        const seen = new Set<string>();
        for (const s of suggestionsRaw) {
          const k = s.display_name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
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
        className="w-full px-3 py-2 border border-slate-300 rounded"
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
}

export function NovaEntregaPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [tipos, setTipos] = useState<TipoServico[]>([]);
  const [modais, setModais] = useState<ModalRow[]>([]);
  const [tabelasPrecos, setTabelasPrecos] = useState<TabelaPreco[]>([]);
  const [tabelasComissoes, setTabelasComissoes] = useState<TabelaComissao[]>([]);
  const [faixasComissoes, setFaixasComissoes] = useState<FaixaComissao[]>([]);
  const [comissaoTableFound, setComissaoTableFound] = useState<string | null>(null);
  const [selectedComissaoTable, setSelectedComissaoTable] = useState<TabelaComissao | null>(null);
  const [blacklist, setBlacklist] = useState<Array<{ cliente_id: string, entregador_id: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComercio, setIsComercio] = useState(false);
  const [clientSaldo, setClientSaldo] = useState<number | null>(null);

  const [distanciaKm, setDistanciaKm] = useState<string>('');
  const [segmentDistancesKm, setSegmentDistancesKm] = useState<number[]>([]);
  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [selectedTabelaId, setSelectedTabelaId] = useState<string>('');
  const [valorDinamico, setValorDinamico] = useState(false);
  const [pricingMode, setPricingMode] = useState<'Distância' | 'Fixo' | 'Padrão' | 'Zona' | 'Bairro' | 'Zerar'>('Distância');
  const [pricePerPoint, setPricePerPoint] = useState<number>(0);
  const [dynamicRules, setDynamicRules] = useState<DynamicRule[]>([]);
  const [activeDynamicRules, setActiveDynamicRules] = useState<{ name: string; value: number }[]>([]);
  const [dynamicDriverRules, setDynamicDriverRules] = useState<DynamicDriverRule[]>([]);
  const [faixasPreco, setFaixasPreco] = useState<FaixaPreco[]>([]);
  const coordsCache = useRef<Map<string, { lat: number; lon: number }>>(new Map()); 
  const distanceCalcIdRef = useRef(0);
  const [driverValueDisplay, setDriverValueDisplay] = useState<string>('0.00');
  const [driverReturnDisplay, setDriverReturnDisplay] = useState<string | null>(null);
  const [coletaSelectedCoords, setColetaSelectedCoords] = useState<[number, number] | undefined>(undefined);
  const [entregaSelectedCoords, setEntregaSelectedCoords] = useState<[number, number] | undefined>(undefined);
  const selectedCoordsByTextRef = useRef<Map<string, [number, number]>>(new Map());

  const normalizeAddressKey = (text: string) => {
    return String(text || '')
      .replace(/\s+-\s+/g, ', ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ');
  };

  const [form, setForm] = useState({
    cliente_id: '',
    endereco_id: '',
    tipo_servico_id: '',
    modal_tipo: '',
    atribuicao_modo: 'manual' as 'manual' | 'automatica',
    entregador_id: '',
    observacoes: '',
    solicitar_comprovante: false,
    agendar_em: '',
    retirada_no_local: false,
    valor_manual: false,
    valor_entrega: '',
    tipo_cobranca: 'fatura',
    pagamento_metodo: 'fatura',
    pagamento_na_entrega: false,
    troco_para: '',
    documento_tipo: 'cpf',
    documento_numero: '',
    cobrar_destinatario: false,
    coleta_usa_endereco_cadastro: false,
    coleta_contato: '',
    coleta_telefone: '',
    coleta_cep: '',
    coleta_endereco_texto: '',
    coleta_complemento: '',
    coleta_observacoes: '',
    coleta_numero: '',
    entrega_usa_endereco_cadastro: false,
    entrega_contato: '',
    entrega_telefone: '',
    entrega_codigo_pedido: '',
    entrega_centro_custo: '',
    entrega_solicitante: '',
    entrega_cep: '',
    entrega_endereco_texto: '',
    entrega_numero: '',
    entrega_complemento: '',
    entrega_observacoes: '',
    retorno: false,
    pontos: [] as Array<{ contato: string; telefone: string; cep: string; endereco_texto: string; numero: string; complemento: string; observacoes: string; coords?: [number, number] }>,
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (form.cliente_id) fetchEnderecos(form.cliente_id);
    else setEnderecos([]);
  }, [form.cliente_id]);

  useEffect(() => {
    const loadFaixas = async () => {
      if (!selectedTabelaId) {
        setFaixasPreco([]);
        return;
      }
      const { data } = await supabase
        .from('tabelas_precos_faixas')
        .select('*')
        .eq('tabela_id', selectedTabelaId)
        .order('km_ate', { ascending: true });
      setFaixasPreco((data || []) as FaixaPreco[]);
    };
    loadFaixas();
  }, [selectedTabelaId]);

  useEffect(() => {
    if (pricingMode === 'Fixo' || pricingMode === 'Zerar') return;
    if (!tabelasPrecos || tabelasPrecos.length === 0) return;

    const currentValid =
      selectedTabelaId &&
      tabelasPrecos.some((t) => String(t.id) === String(selectedTabelaId));

    if (!currentValid) {
      setSelectedTabelaId(String(tabelasPrecos[0].id));
    }
  }, [pricingMode, selectedTabelaId, tabelasPrecos]);

  useEffect(() => {
    const loadComissaoRules = async () => {
        if (!form.cliente_id || tabelasComissoes.length === 0) {
            setFaixasComissoes([]);
            setComissaoTableFound(null);
            return;
        }
        
        console.log('Searching commission table for client:', form.cliente_id);
        const table = tabelasComissoes.find(t => {
            let ids = t.cliente_ids;
            
            
            if (typeof ids === 'string') {
                try {
                    const parsed = JSON.parse(ids);
                    if (Array.isArray(parsed)) ids = parsed;
                } catch (e) {
                    console.warn('Failed to parse cliente_ids:', ids);
                }
            }

            if (Array.isArray(ids)) {
                
                const targetId = String(form.cliente_id).trim().toLowerCase();
                const match = (ids as any[]).some(id => String(id).trim().toLowerCase() === targetId);
                
                
                if (match) {
                    console.log('Match found in table:', t.nome);
                } else {
                    
                    
                }
                
                return match;
            }
            return false;
        });
        console.log('Commission table found:', table ? table.nome : 'None');
        
        if (table) {
            setComissaoTableFound(table.nome);
            setSelectedComissaoTable(table);
            const { data } = await supabase
                .from('tabelas_comissoes_faixas')
                .select('*')
                .eq('tabela_id', table.id)
                .order('km_ate', { ascending: true });
            setFaixasComissoes((data || []) as FaixaComissao[]);
        } else {
            setComissaoTableFound(null);
            setSelectedComissaoTable(null);
            setFaixasComissoes([]);
        }
    };
    loadComissaoRules();
  }, [form.cliente_id, tabelasComissoes]);

  const handleUseRegistrationAddress = (type: 'coleta' | 'entrega', checked: boolean) => {
    if (type === 'coleta') setColetaSelectedCoords(undefined);
    else setEntregaSelectedCoords(undefined);
    setDistanceError(null);
    setForm((prev) => {
      let next = { ...prev };
      if (type === 'coleta') next.coleta_usa_endereco_cadastro = checked;
      else next.entrega_usa_endereco_cadastro = checked;

      if (checked && prev.cliente_id) {
        const cliente = clientes.find((c) => c.id === prev.cliente_id);
        if (cliente) {
          let { cep, rua, numero, complemento, bairro, cidade, referencia_entrega } = cliente;

          if ((!rua || !cidade) && enderecos.length > 0) {
            const ultimo = enderecos[0];
            if (ultimo.cliente_id === prev.cliente_id) {
              cep = ultimo.cep;
              rua = ultimo.rua;
              numero = ultimo.numero;
              complemento = ultimo.complemento;
              bairro = ultimo.bairro;
              cidade = ultimo.cidade;
              referencia_entrega = ultimo.referencia_entrega;
            }
          }

          const enderecoTexto = [rua, bairro, cidade]
            .filter(Boolean)
            .join(', ');

          if (type === 'coleta') {
            next = {
              ...next,
              coleta_cep: cep || '',
              coleta_endereco_texto: enderecoTexto,
              coleta_numero: numero || '',
              coleta_complemento: complemento || '',
              coleta_contato: cliente.nome_completo,
              coleta_telefone: cliente.telefone || '',
              coleta_observacoes: referencia_entrega || '',
            };
          } else {
            next = {
              ...next,
              entrega_cep: cep || '',
              entrega_endereco_texto: enderecoTexto,
              entrega_numero: numero || '',
              entrega_complemento: complemento || '',
              entrega_contato: cliente.nome_completo,
              entrega_telefone: cliente.telefone || '',
              entrega_observacoes: referencia_entrega || '',
            };
          }
        }
      }
      return next;
    });
  };

  useEffect(() => {
    if (form.cliente_id && form.modal_tipo) {
      const cliente = clientes.find(c => c.id === form.cliente_id);
      if (cliente && cliente.precificacao_config) {
        const configs = cliente.precificacao_config as unknown as PrecificacaoConfigItem[];
        const config = configs.find(c => c.modal === form.modal_tipo);
        if (config) {
          setPricingMode(config.tipo_precificacao as any);
          if (config.tipo_precificacao === 'Fixo') {
            setPricePerPoint(Number(config.preco_ponto) || 0);
          } else if (config.tipo_precificacao === 'Zerar') {
             
          } else {
            
            setPricePerPoint(0);
            if (config.tabela_id) {
              const exists = tabelasPrecos.find(t => t.id === config.tabela_id);
              if (exists) setSelectedTabelaId(config.tabela_id);
            }
          }
        } else {
           setPricingMode('Distância');
        }
      }
    }
  }, [form.cliente_id, form.modal_tipo, clientes, tabelasPrecos]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; 
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; 
    return d;
  };

  const deg2rad = (deg: number) => {
    return deg * (Math.PI / 180);
  };

  useEffect(() => {
    const updateDistance = async () => {
      const calcId = ++distanceCalcIdRef.current;

      const coletaEndereco = (form.coleta_endereco_texto || '').trim();
      const entregaEndereco = (form.entrega_endereco_texto || '').trim();

      if (!coletaEndereco || !entregaEndereco) {
        if (calcId === distanceCalcIdRef.current) {
          setDistanciaKm('');
          setDistanceError(null);
          setCalculatingDistance(false);
        }
        return;
      }

      const coletaFull = form.coleta_numero ? `${coletaEndereco}, ${form.coleta_numero}` : coletaEndereco;
      const entregaFull = form.entrega_numero ? `${entregaEndereco}, ${form.entrega_numero}` : entregaEndereco;

      if ((!coletaSelectedCoords && coletaFull.length < 5) || (!entregaSelectedCoords && entregaFull.length < 5)) {
        if (calcId === distanceCalcIdRef.current) {
          setDistanciaKm('');
          setDistanceError(null);
          setCalculatingDistance(false);
        }
        return;
      }

      setCalculatingDistance(true);
      setDistanceError(null);

      try {
        const resolveCoords = async (
          baseText: string,
          numero: string,
          selected: [number, number] | undefined
        ) => {
          if (selected) return selected;
          const key = normalizeAddressKey(baseText);
          const cached = selectedCoordsByTextRef.current.get(key);
          if (cached) return cached;

          const full = numero ? `${baseText}, ${numero}` : baseText;
          let c = await getCoordsFromAddress(full);
          if (!c && numero) c = await getCoordsFromAddress(baseText);
          if (c) {
            selectedCoordsByTextRef.current.set(key, c);
            return c;
          }

          const normalized = String(baseText || '').replace(/\s+-\s+/g, ', ');
          const parts = normalized
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);

          if (parts.length >= 2) {
            const area = parts.slice(1).join(', ');
            const candidates: string[] = [area];
            const areaNorm = normalizeAddressKey(area);
            if (!areaNorm.includes('campinas')) candidates.push(`${area}, Campinas, SP`);

            for (const q of candidates) {
              const areaCoords = await getCoordsFromAddress(q);
              if (areaCoords) {
                selectedCoordsByTextRef.current.set(key, areaCoords);
                return areaCoords;
              }
            }
          }
          return undefined;
        };

        const [startCoords, endCoords] = await Promise.all([
          resolveCoords(coletaEndereco, String(form.coleta_numero || '').trim(), coletaSelectedCoords),
          resolveCoords(entregaEndereco, String(form.entrega_numero || '').trim(), entregaSelectedCoords),
        ]);

        if (calcId !== distanceCalcIdRef.current) return;

        if (!startCoords || !endCoords) {
          setDistanciaKm('');
          setSegmentDistancesKm([]);
          if (!startCoords && !endCoords) {
            setDistanceError('Não foi possível localizar coleta e entrega. Selecione uma sugestão da lista.');
          } else if (!startCoords) {
            setDistanceError('Não foi possível localizar o endereço de coleta. Selecione uma sugestão da lista.');
          } else {
            setDistanceError('Não foi possível localizar o endereço de entrega. Selecione uma sugestão da lista.');
          }
          return;
        }

        const pontosFilled = (form.pontos || []).filter((p) => (p?.endereco_texto || '').trim().length > 0);
        const extraCoords: Array<[number, number]> = [];
        for (const p of pontosFilled) {
          if (p.coords) {
            extraCoords.push(p.coords);
            continue;
          }
          const texto = (p.endereco_texto || '').trim();
          const addr = p.numero ? `${texto}, ${p.numero}` : texto;
          if (addr.trim().length < 5) continue;
          const c = await getCoordsFromAddress(addr);
          if (!c) {
            setDistanciaKm('');
            setSegmentDistancesKm([]);
            setDistanceError('Não foi possível localizar um ponto adicional. Selecione uma sugestão da lista.');
            return;
          }
          extraCoords.push(c);
        }

        if (calcId !== distanceCalcIdRef.current) return;

        const points: { lat: number; lon: number }[] = [];
       
        points.push({ lat: startCoords[0], lon: startCoords[1] });
        points.push({ lat: endCoords[0], lon: endCoords[1] });
        extraCoords.forEach((c) => points.push({ lat: c[0], lon: c[1] }));

        let totalDist = await getDrivingRouteDistance(points);

        if (calcId !== distanceCalcIdRef.current) return;

        if (totalDist === null) {
          totalDist = 0;
          for (let i = 0; i < points.length - 1; i++) {
            totalDist += calculateDistance(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon);
          }
        }

        const segmentDistances: number[] = [];
        for (let i = 0; i < points.length - 1; i++) {
          const seg = await getDrivingRouteDistance([points[i], points[i + 1]]);
          const fallback = calculateDistance(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon);
          segmentDistances.push(typeof seg === 'number' && seg > 0 ? seg : fallback);
        }

        setDistanciaKm(totalDist > 0 ? totalDist.toFixed(2) : '');
        setSegmentDistancesKm(segmentDistances);
        setDistanceError(null);
      } catch (e) {
        if (calcId !== distanceCalcIdRef.current) return;
        setDistanciaKm('');
        setSegmentDistancesKm([]);
        setDistanceError('Erro ao calcular a distância. Tente novamente.');
      } finally {
        if (calcId === distanceCalcIdRef.current) {
          setCalculatingDistance(false);
        }
      }
    };

    const timeoutId = setTimeout(() => {
      void updateDistance();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [form.coleta_endereco_texto, form.coleta_numero, form.entrega_endereco_texto, form.entrega_numero, form.pontos, coletaSelectedCoords, entregaSelectedCoords]);

  useEffect(() => {
    calculatePrice();
  }, [distanciaKm, segmentDistancesKm, selectedTabelaId, pricingMode, pricePerPoint, form.pontos, form.retorno, dynamicRules, faixasPreco]);

  useEffect(() => {
    const kmValue = distanciaKm ? parseFloat(distanciaKm.replace(',', '.')) : 0;
    const extraPointsFilled = (form.pontos || []).filter((p) => (p?.endereco_texto || '').trim().length > 0).length;
    
    const { total } = calculateDriverCommission(
      kmValue,
      form.retorno,
      extraPointsFilled,
      form.entregador_id || null,
      dynamicDriverRules
    );
    
    setDriverValueDisplay(total);

    if (form.retorno) {
        if (selectedComissaoTable && faixasComissoes.length > 0) {
             const { total: totalSemRetorno } = calculateDriverCommission(
              kmValue,
              false, 
              extraPointsFilled,
              form.entregador_id || null,
              dynamicDriverRules
            );
            const diff = parseFloat(total) - parseFloat(totalSemRetorno);
            setDriverReturnDisplay(diff > 0.01 ? diff.toFixed(2) : null);
        } else {
            const totalDriver = parseFloat(total);
            const returnPart = totalDriver - (totalDriver / 1.2);
            setDriverReturnDisplay(returnPart > 0.01 ? returnPart.toFixed(2) : null);
        }
    } else {
        setDriverReturnDisplay(null);
    }
  }, [distanciaKm, form.retorno, form.pontos, form.entregador_id, form.valor_entrega, dynamicDriverRules, selectedComissaoTable, faixasComissoes]);

  const calculatePrice = () => {
    let price = 0;
    let shouldCalculate = false;
    const extraPointsFilled = (form.pontos || []).filter((p) => (p?.endereco_texto || '').trim().length > 0).length;

    if (pricingMode === 'Zerar') {
      setForm(prev => ({ ...prev, valor_entrega: '0.00', valor_manual: false }));
      setValorDinamico(true);
      setActiveDynamicRules([]);
      return;
    }

    if (pricingMode === 'Fixo') {
      const basePoints = 2; 
      const totalPoints = basePoints + extraPointsFilled;
      price = totalPoints * pricePerPoint;
      shouldCalculate = true;
    } else {
      if (!selectedTabelaId) return;

      const tabela = tabelasPrecos.find(t => String(t.id) === String(selectedTabelaId));
      if (!tabela) return;
  
      if (!faixasPreco || faixasPreco.length === 0) return;

      const km = distanciaKm ? parseFloat(distanciaKm.replace(',', '.')) : NaN;
      const kmValid = !Number.isNaN(km) && km > 0;
      const fallbackMin =
        (Number(tabela.valor_minimo) > 0 ? Number(tabela.valor_minimo) : 0) ||
        (faixasPreco.length > 0 && Number(faixasPreco[0].valor) > 0 ? Number(faixasPreco[0].valor) : 0);

      const calcPriceForKm = (kmSegment: number) => {
        const kmSegValid = !Number.isNaN(kmSegment) && kmSegment > 0;
        if (!kmSegValid) return fallbackMin;

        const faixa = faixasPreco.find((f) => Number(f.km_ate) >= kmSegment);
        let p = 0;

        if (faixa) {
          p = Number(faixa.valor);
        } else {
          const lastFaixa = faixasPreco[faixasPreco.length - 1];
          const lastKm = Number(lastFaixa?.km_ate || 0);
          const lastValor = Number(lastFaixa?.valor || 0);
          const extraKm = kmSegment - lastKm;
          p = lastValor + (extraKm * Number(tabela.km_adicional || 0));
        }

        if (fallbackMin > 0 && p < fallbackMin) p = fallbackMin;
        return p;
      };

      if (!kmValid) {
        if (fallbackMin > 0) {
          price = fallbackMin;
          shouldCalculate = true;
        }
      } else {
        const expectedSegments = 1 + extraPointsFilled;
        const canSplit =
          extraPointsFilled > 0 &&
          Array.isArray(segmentDistancesKm) &&
          segmentDistancesKm.length === expectedSegments &&
          segmentDistancesKm.every((v) => typeof v === 'number' && !Number.isNaN(v));

        if (canSplit) {
          price = segmentDistancesKm.reduce((acc, segKm) => acc + calcPriceForKm(segKm), 0);
        } else {
          price = calcPriceForKm(km);
        }
        shouldCalculate = true;
      }
    }

    if (!shouldCalculate) return;

    if (form.retorno) {
        const tabela = tabelasPrecos.find(t => t.id === selectedTabelaId);
        if (tabela && tabela.valor_retorno) {
             const tipo = (tabela.tipo_retorno || '').trim().toLowerCase();
             if (tipo === 'percentual' || tipo === 'porcentagem') {
                 price += price * (tabela.valor_retorno / 100);
             } else {
                 price += tabela.valor_retorno;
             }
        } else {
             
             price = price * 1.20;
        }
    }

    const activeRules: { name: string; value: number }[] = [];
    dynamicRules.forEach(rule => {
      if (!rule.ativa) return;
      
      let addedValue = 0;
      if (rule.criterio === 'MULTIPLICADOR' && rule.multiplicador) {
         const increase = price * (rule.multiplicador - 1);
         addedValue = increase;
         price *= rule.multiplicador;
      } else if (rule.criterio === 'TAXA_FIXA' && rule.multiplicador) {
         addedValue = rule.multiplicador;
         price += rule.multiplicador;
      }

      if (addedValue > 0) {
        activeRules.push({ name: rule.nome || 'Regra Dinâmica', value: addedValue });
      }
    });
    setActiveDynamicRules(activeRules);

    setForm(prev => ({ ...prev, valor_entrega: price.toFixed(2), valor_manual: false }));
    setValorDinamico(true);
  };

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    const normalizeEmail = (v: unknown) => {
      const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
      return e || '';
    };

    const uDataPromise = user
      ? supabase
          .from('users')
          .select('role, cliente_id, email')
          .eq('id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null as any });

    const [uDataResp, e, t, m, tp, tc, b, dyn, dynDriver] = await Promise.all([
      uDataPromise,
      supabase.from('entregadores').select('id, nome_completo, status, is_online').neq('status', 'inativo').order('nome_completo'),
      supabase.from('tipo_servicos').select('*').eq('ativo', true).order('nome'),
      supabase.from('modais').select('*').eq('ativo', true).order('tipo'),
      supabase.from('tabelas_precos').select('*').order('nome'),
      supabase.from('tabelas_comissoes').select('*').order('nome'),
      supabase.from('entregador_bloqueios_clientes').select('cliente_id, entregador_id'),
      supabase.from('preco_dinamico_demanda').select('*').eq('ativa', true).order('nome'),
      supabase.from('preco_dinamico_entregador').select('*').eq('ativa', true),
    ]);

    const uData = (uDataResp as any)?.data || null;
    const userEmail = normalizeEmail((uData as any)?.email || user?.email);
    const targetClientId = String((uData as any)?.cliente_id || '').trim();
    const isClientByRole = (uData as any)?.role === 'cliente';

    let finalClientes: Cliente[] = [];

    if (user && isClientByRole) {
      setIsComercio(true);

      let resolvedClientId = targetClientId;
      if (!resolvedClientId) {
        try {
          const { data: rpcId } = await supabase.rpc('resolve_my_cliente_id');
          if (rpcId) resolvedClientId = String(rpcId).trim();
        } catch (e) {
          void e;
        }
      }

      let matched: Cliente | null = null;

      if (resolvedClientId) {
        const { data } = await supabase.from('clientes').select('*').eq('id', resolvedClientId).maybeSingle();
        matched = (data as Cliente | null) || null;
      }

      if (!matched && userEmail) {
        const { data } = await supabase.from('clientes').select('*').ilike('email', userEmail).maybeSingle();
        matched = (data as Cliente | null) || null;
      }

      if (!matched && userEmail) {
        try {
          const { data } = await supabase.from('clientes').select('*').contains('faturamento_emails', [userEmail]).limit(1);
          if (Array.isArray(data) && data[0]) matched = data[0] as Cliente;
        } catch (e) {
          void e;
        }
      }

      if (matched) {
        finalClientes = [matched];
        setForm((prev) => ({ ...prev, cliente_id: matched!.id }));
        setClientSaldo(matched.saldo_creditos);
      } else {
        finalClientes = [];
      }
    } else {
      setIsComercio(false);
      const { data } = await supabase.from('clientes').select('*').order('nome_completo');
      finalClientes = (data || []) as Cliente[];
    }

    setClientes(finalClientes);
    setEntregadores((e.data || []) as Entregador[]);
    const tiposList = (t.data || []) as TipoServico[];
    setTipos(tiposList);
    const modaisList = (m.data || []) as ModalRow[];
    setModais(modaisList);
    const tabelas = (tp.data || []) as TabelaPreco[];
    setTabelasPrecos(tabelas);
    setTabelasComissoes((tc.data || []) as TabelaComissao[]);
    setBlacklist((b.data || []) as Array<{ cliente_id: string, entregador_id: string }>);
    setDynamicRules((dyn.data || []) as DynamicRule[]);
    setDynamicDriverRules((dynDriver.data || []) as DynamicDriverRule[]);
    if (tabelas.length > 0) setSelectedTabelaId(tabelas[0].id);

    setForm(prev => ({
      ...prev,
      modal_tipo: modaisList.length > 0 ? modaisList[0].tipo : prev.modal_tipo,
      tipo_servico_id: tiposList.length > 0 ? tiposList[0].id : prev.tipo_servico_id
    }));
  };

  const fetchEnderecos = async (clienteId: string) => {
    const { data } = await supabase.from('cliente_enderecos').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false });
    setEnderecos((data || []) as Endereco[]);
  };

  const pickEntregadorAutomatico = (): string | null => {
    const ativos = entregadores.filter((e) => e.status === 'ativo');
    return ativos.length > 0 ? ativos[0].id : null;
  };

  const handleCepBlur = async (cep: string, type: 'coleta' | 'entrega' | 'ponto', index?: number) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();

      if (data.erro) return;

      const addressText = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`;

      setForm((prev) => {
        if (type === 'coleta') {
          return { ...prev, coleta_endereco_texto: addressText };
        } else if (type === 'entrega') {
          return { ...prev, entrega_endereco_texto: addressText };
        } else if (type === 'ponto' && typeof index === 'number') {
           const newPontos = [...prev.pontos];
           if (newPontos[index]) {
             newPontos[index] = { ...newPontos[index], endereco_texto: addressText };
             return { ...prev, pontos: newPontos };
           }
        }
        return prev;
      });
    } catch (error) {
      console.error("Error fetching CEP:", error);
    }
  };

  const calculateDriverCommission = (
    km: number,
    hasReturn: boolean,
    pointsCount: number,
    entregadorId?: string | null,
    rulesOverride?: DynamicDriverRule[],
    faixasOverride?: FaixaComissao[],
    tableOverride?: TabelaComissao
  ): { total: string, breakdown: { description: string, value: number }[] } => {
      const breakdown: { description: string, value: number }[] = [];
      let val = 0;
      
      const faixasToUse = faixasOverride || faixasComissoes;
      const tableToUse = tableOverride || selectedComissaoTable;

      if (faixasToUse.length > 0) {
         const faixa = faixasToUse.find(f => f.km_ate >= km);
         
         if (faixa) {
             val = faixa.valor;
         } else {
             const last = faixasToUse[faixasToUse.length - 1];
             val = last ? last.valor : 0;
         }

         const table = tableToUse;
         
         if (table) {
             if ((table.valor_por_ponto || 0) > 0 && pointsCount > 0) {
                 val += ((table.valor_por_ponto || 0) * pointsCount);
             }
             if (hasReturn && (table.valor_retorno || 0) > 0) {
             let returnVal = table.valor_retorno || 0;
             let description = 'Adicional Retorno';
             const tipo = (table.tipo_retorno || '').trim().toLowerCase();

             if (tipo === 'percentual' || tipo === 'porcentagem') {
                 returnVal = val * ((table.valor_retorno || 0) / 100);
                 description = 'Com retorno';
             }

             val += returnVal;
             breakdown.push({ description, value: returnVal });
         } else if (hasReturn) {
             const returnVal = val * 0.20;
             val += returnVal;
             breakdown.push({ description: 'Com retorno', value: returnVal });
         }
         }
         
         const sourceRules = rulesOverride ?? dynamicDriverRules;
         const rules = sourceRules.filter(r => 
             r.ativa && 
             (r.entregador_id === entregadorId || r.entregador_id === null)
         );
         
         rules.forEach(r => {
           if (r.multiplicador) {
             let bonus = 0;
             if (r.criterio === 'TAXA_FIXA') {
               bonus = r.multiplicador;
               val += bonus;
             } else {
               const increase = val * (r.multiplicador - 1);
               bonus = increase;
               val *= r.multiplicador;
             }
             
             if (bonus > 0) {
                breakdown.push({ description: r.observacao || 'Bônus Dinâmico', value: bonus });
             }
           }
         });
         
         const totalStr = val.toFixed(2);
         return { total: totalStr === 'NaN' ? '0.00' : totalStr, breakdown };
      }
      
      
      return { total: '0.00', breakdown: [] };
  };

  const handleSubmit = async () => {
    if (!form.cliente_id) {
      setError('Preencha o cliente');
      return;
    }

    
    const currentClient = clientes.find(c => c.id === form.cliente_id);
    const isFaturado = isClientFaturamento(currentClient);

    
    if (isComercio && currentClient && currentClient.saldo_creditos !== null && !isFaturado) {
        const total = form.valor_entrega ? parseFloat(form.valor_entrega.replace(',', '.')) : 0;
        if (!isNaN(total) && total > 0 && (currentClient.saldo_creditos || 0) < total) {
             setError(`Saldo insuficiente para realizar esta entrega. Seu saldo: R$ ${(currentClient.saldo_creditos || 0).toFixed(2)}. Valor da entrega: R$ ${total.toFixed(2)}.`);
             return;
        }
    }

    setLoading(true);
    setError(null);
   
    
    let entregadorEscolhido = form.atribuicao_modo === 'manual' ? (form.entregador_id || null) : null;
    
    
    if (form.atribuicao_modo === 'manual' && entregadorEscolhido) {
        const isBlocked = blacklist.some(b => b.cliente_id === form.cliente_id && b.entregador_id === entregadorEscolhido);
        if (isBlocked) {
            setError('O entregador selecionado está na blacklist deste cliente.');
            setLoading(false);
            return;
        }
    }

    
    const kmValue = distanciaKm ? parseFloat(distanciaKm.replace(',', '.')) : 0;
    const extraPointsFilled = (form.pontos || []).filter((p) => (p?.endereco_texto || '').trim().length > 0).length;

    let freshDriverRules = dynamicDriverRules;
    try {
      const { data } = await supabase
        .from('preco_dinamico_entregador')
        .select('*')
        .eq('ativa', true);
      freshDriverRules = (data || []) as DynamicDriverRule[];
      setDynamicDriverRules(freshDriverRules);
    } catch (e) {}

    
    let effectiveFaixasComissoes = faixasComissoes;
    let effectiveSelectedTable = selectedComissaoTable;

    if ((!effectiveFaixasComissoes.length || !effectiveSelectedTable) && form.cliente_id && tabelasComissoes.length > 0) {
        console.log('Commission data missing in submit. Attempting to resolve...');
        const table = tabelasComissoes.find(t => {
            let ids = t.cliente_ids;
            if (typeof ids === 'string') {
                try {
                    const parsed = JSON.parse(ids);
                    if (Array.isArray(parsed)) ids = parsed;
                } catch (e) {}
            }
            if (Array.isArray(ids)) {
                const targetId = String(form.cliente_id).trim().toLowerCase();
                return (ids as any[]).some(id => String(id).trim().toLowerCase() === targetId);
            }
            return false;
        });

        if (table) {
            console.log('Resolved table in submit:', table.nome);
            effectiveSelectedTable = table;
            try {
                const { data } = await supabase
                    .from('tabelas_comissoes_faixas')
                    .select('*')
                    .eq('tabela_id', table.id)
                    .order('km_ate', { ascending: true });
                effectiveFaixasComissoes = (data || []) as FaixaComissao[];
            } catch (e) {
                console.error('Error fetching commission ranges in submit:', e);
            }
        } else {
             console.warn('No commission table found for client in submit');
        }
    }

    const { total: driverValueStr, breakdown: driverBonuses } = calculateDriverCommission(
      kmValue,
      form.retorno,
      extraPointsFilled,
      entregadorEscolhido,
      freshDriverRules,
      effectiveFaixasComissoes, 
      effectiveSelectedTable || undefined 
    );
    const parsedDriverValue = parseFloat(driverValueStr);
    const driverValue = isNaN(parsedDriverValue) ? 0 : parsedDriverValue;

    if (driverValue === 0 && effectiveSelectedTable) {
         
         const confirmed = confirm('Atenção: O valor da comissão do entregador foi calculado como R$ 0,00. Deseja continuar mesmo assim?');
         if (!confirmed) {
             setLoading(false);
             return;
         }
    }

    if (isNaN(parsedDriverValue)) {
        console.warn('Driver value calculation resulted in NaN. Defaulting to 0.');
    }

    let pedidoId = null;
    const agendarIso = form.agendar_em ? new Date(form.agendar_em).toISOString() : null;
    const trocoParaNum = form.troco_para ? Number(String(form.troco_para).replace(',', '.')) : null;
    const documentoNumeroDigits = form.documento_numero ? String(form.documento_numero).replace(/\D/g, '') : '';
    const documentoNumero = documentoNumeroDigits ? documentoNumeroDigits : null;
    const documentoTipo = documentoNumero ? (form.documento_tipo === 'cnpj' ? 'cnpj' : 'cpf') : null;

    try {
      const valorTotal = form.valor_entrega ? Number(form.valor_entrega.replace(',', '.')) : null;
      console.log('Tentando criar pedido para cliente:', form.cliente_id, 'Valor:', valorTotal);

      const valorTotalParaPedido = (valorTotal && !isNaN(valorTotal)) ? valorTotal : null;

      const { data: pData, error: pError } = await supabase
        .from('pedidos')
        .insert({
          cliente_id: form.cliente_id,
          endereco_id: form.endereco_id || null,
          numero: form.entrega_codigo_pedido || null,
          item_descricao: null,
          endereco_texto: form.retirada_no_local
            ? (form.coleta_numero ? `${form.coleta_endereco_texto}, ${form.coleta_numero}` : (form.coleta_endereco_texto || null))
            : (form.entrega_numero ? `${form.entrega_endereco_texto}, ${form.entrega_numero}` : (form.entrega_endereco_texto || null)),
          origem: 'manual',
          valor_total: valorTotalParaPedido,
          status: 'criado',
          observacoes: form.observacoes || null,
          agendar_em: agendarIso,
          retirada_no_local: form.retirada_no_local,
          pagamento_metodo: form.pagamento_metodo || null,
          pagamento_na_entrega: !!form.pagamento_na_entrega,
          troco_para: trocoParaNum && !isNaN(trocoParaNum) ? trocoParaNum : null,
          documento_tipo: documentoTipo,
          documento_numero: documentoNumero,
        })
        .select()
        .single();
      
      if (pError) {
        console.error("Erro ao criar pedido:", pError);
        setError(`Erro ao criar pedido: ${pError.message}`);
        setLoading(false);
        return;
      }
      
      console.log('Pedido criado com sucesso:', pData);
      if (pData) pedidoId = pData.id;
    } catch (err) {
      console.error("Erro ao tentar criar pedido:", err);
      setError("Erro inesperado ao criar pedido. Verifique o console.");
      setLoading(false);
      return;
    }

    let insertError: any = null;
    if (!form.retirada_no_local) {
      const pontosFilled = (form.pontos || []).filter((p) => (p?.endereco_texto || '').trim().length > 0);
      const extraPointsFilled = pontosFilled.length;

      const buildSegmentPricing = () => {
        if (pricingMode !== 'Distância') return null;
        if (!selectedTabelaId) return null;
        if (!faixasPreco || faixasPreco.length === 0) return null;

        const tabela = tabelasPrecos.find((t) => String(t.id) === String(selectedTabelaId));
        if (!tabela) return null;

        const expectedSegments = 1 + extraPointsFilled;
        if (!Array.isArray(segmentDistancesKm) || segmentDistancesKm.length !== expectedSegments) return null;

        const fallbackMin =
          (Number(tabela.valor_minimo) > 0 ? Number(tabela.valor_minimo) : 0) ||
          (faixasPreco.length > 0 && Number(faixasPreco[0].valor) > 0 ? Number(faixasPreco[0].valor) : 0);

        const calcPriceForKm = (kmSegment: number) => {
          const kmSegValid = !Number.isNaN(kmSegment) && kmSegment > 0;
          if (!kmSegValid) return fallbackMin;

          const faixa = faixasPreco.find((f) => Number(f.km_ate) >= kmSegment);
          let p = 0;

          if (faixa) {
            p = Number(faixa.valor);
          } else {
            const lastFaixa = faixasPreco[faixasPreco.length - 1];
            const lastKm = Number(lastFaixa?.km_ate || 0);
            const lastValor = Number(lastFaixa?.valor || 0);
            const extraKm = kmSegment - lastKm;
            p = lastValor + (extraKm * Number(tabela.km_adicional || 0));
          }

          if (fallbackMin > 0 && p < fallbackMin) p = fallbackMin;
          return p;
        };

        return segmentDistancesKm.map((kmSeg, idx) => ({
          destino: idx + 1,
          km: kmSeg,
          valor: calcPriceForKm(kmSeg),
        }));
      };

      const segmentPricing = buildSegmentPricing();
      const buildCommissionDestinos = () => {
        if (!segmentPricing || segmentPricing.length === 0) return null;

        const faixasToUse = effectiveFaixasComissoes || [];
        const tableToUse = effectiveSelectedTable || null;

        if (!faixasToUse.length) return null;

        const vpp = tableToUse ? Number(tableToUse.valor_por_ponto || 0) : 0;

        const calcComissaoBaseForKm = (kmSegment: number) => {
          const faixa = faixasToUse.find((f) => Number(f.km_ate) >= kmSegment);
          if (faixa) return Number(faixa.valor);
          const last = faixasToUse[faixasToUse.length - 1];
          return last ? Number(last.valor) : 0;
        };

        const destinos = segmentPricing.map((seg: any, idx: number) => {
          const kmSeg = Number(seg?.km || 0);
          const base = calcComissaoBaseForKm(kmSeg);
          const extraPonto = idx >= 1 && vpp > 0 ? vpp : 0;
          return { destino: idx + 1, km: kmSeg, valor: base + extraPonto };
        });

        let retornoValor: number | null = null;
        if (form.retorno) {
          if (tableToUse && Number(tableToUse.valor_retorno || 0) > 0) {
            retornoValor = Number(tableToUse.valor_retorno || 0);
            const tipo = String(tableToUse.tipo_retorno || '').trim().toLowerCase();
            if (tipo === 'percentual' || tipo === 'porcentagem') {
              const baseTotal = destinos.reduce((acc: number, d: any) => acc + Number(d.valor || 0), 0);
              retornoValor = baseTotal * (Number(tableToUse.valor_retorno || 0) / 100);
            }
          } else {
            const baseTotal = destinos.reduce((acc: number, d: any) => acc + Number(d.valor || 0), 0);
            retornoValor = baseTotal * 0.2;
          }
        }

        const total = destinos.reduce((acc: number, d: any) => acc + Number(d.valor || 0), 0) + (retornoValor || 0);
        return { destinos, retornoValor: retornoValor && retornoValor > 0 ? retornoValor : null, total: total > 0 ? total : null };
      };

    const commission = buildCommissionDestinos();
    

    const finalDriverValue = (commission && commission.total && extraPointsFilled > 0) 
      ? commission.total 
      : driverValue;

    const opcionaisPayload = {
      ...(driverBonuses.length > 0 ? { driver_bonuses: driverBonuses } : {}),
      ...(segmentPricing ? { pricing_destinos: segmentPricing } : {}),
      ...(commission ? { comissao_destinos: commission.destinos, comissao_retorno: commission.retornoValor, comissao_total: commission.total } : {}),
    };

    const res = await supabase
      .from('nova_entrega')
      .insert({
        pedido_id: pedidoId,
        cliente_id: form.cliente_id,
        endereco_id: form.endereco_id || null,
        tipo_servico_id: form.tipo_servico_id || (tipos.length > 0 ? tipos[0].id : null),
        modal_tipo: (form.modal_tipo || (modais.length > 0 ? modais[0].tipo : 'moto')) as ModalRow['tipo'],
        atribuicao_modo: form.atribuicao_modo,
        entregador_id: entregadorEscolhido,
        solicitar_comprovante: form.solicitar_comprovante,
        agendar_em: agendarIso,
        retirada_no_local: false,
        valor_manual: form.valor_manual,
        valor_entrega: form.valor_entrega ? Number(form.valor_entrega.replace(',', '.')) : null,
        valor_entregador: finalDriverValue,
          tipo_cobranca: form.tipo_cobranca as 'fatura' | 'avista' | 'pix' | 'cartao',
          pagamento_metodo: form.pagamento_metodo || null,
          pagamento_na_entrega: !!form.pagamento_na_entrega,
          troco_para: trocoParaNum && !isNaN(trocoParaNum) ? trocoParaNum : null,
          documento_tipo: documentoTipo,
          documento_numero: documentoNumero,
          cobrar_destinatario: form.cobrar_destinatario,
          coleta_usa_endereco_cadastro: form.coleta_usa_endereco_cadastro,
          coleta_contato: form.coleta_contato || null,
          coleta_telefone: form.coleta_telefone || null,
          coleta_cep: form.coleta_cep || null,
          coleta_endereco_texto: form.coleta_numero ? `${form.coleta_endereco_texto}, ${form.coleta_numero}` : (form.coleta_endereco_texto || null),
          coleta_complemento: form.coleta_complemento || null,
          coleta_observacoes: form.coleta_observacoes || null,
          entrega_usa_endereco_cadastro: form.entrega_usa_endereco_cadastro,
          entrega_contato: form.entrega_contato || null,
          entrega_telefone: form.entrega_telefone || null,
          entrega_codigo_pedido: form.entrega_codigo_pedido || null,
          entrega_centro_custo: form.entrega_centro_custo || null,
          entrega_solicitante: form.entrega_solicitante || null,
          entrega_cep: form.entrega_cep || null,
          entrega_endereco_texto: form.entrega_numero ? `${form.entrega_endereco_texto}, ${form.entrega_numero}` : (form.entrega_endereco_texto || null),
          entrega_complemento: form.entrega_complemento || null,
          entrega_observacoes: form.entrega_observacoes || null,
          retorno: form.retorno,
          pontos_adicionais: pontosFilled.length ? pontosFilled.map(({ coords, ...rest }) => rest) : null,
          opcionais: Object.keys(opcionaisPayload).length ? opcionaisPayload : null,
          observacoes: form.observacoes || null,
          status: entregadorEscolhido ? 'atribuida' : 'criada',
          distancia_km: kmValue > 0 ? kmValue : null,
        });
      insertError = res.error;
    }

    if (insertError?.message) setError(insertError.message);
    else {
      
      if (!form.retirada_no_local && form.cliente_id && form.valor_entrega) {
         const val = parseFloat(form.valor_entrega.replace(',', '.'));
         if (!isNaN(val) && val > 0) {
             
             const currentClient = clientes.find(c => c.id === form.cliente_id);
             const isFaturado = isClientFaturamento(currentClient);
             
             if (!isFaturado) {
                 setClientes(prev => prev.map(c => {
                     if (c.id === form.cliente_id) {
                         const novoSaldo = (c.saldo_creditos || 0) - val;
                         setClientSaldo(novoSaldo); 
                         return { ...c, saldo_creditos: novoSaldo };
                     }
                     return c;
                 }));
             }
         }
      }
      

      setForm(prev => ({
        cliente_id: prev.cliente_id, 
        endereco_id: '', 
        tipo_servico_id: prev.tipo_servico_id, 
        modal_tipo: prev.modal_tipo, 
        atribuicao_modo: 'manual', 
        entregador_id: '', 
        observacoes: '',
        solicitar_comprovante: false, 
        agendar_em: '', 
        retirada_no_local: false,
        valor_manual: false, 
        valor_entrega: '', 
        tipo_cobranca: 'fatura', 
        pagamento_metodo: 'fatura',
        pagamento_na_entrega: false,
        troco_para: '',
        documento_tipo: 'cpf',
        documento_numero: '',
        cobrar_destinatario: false,
        coleta_usa_endereco_cadastro: false, 
        coleta_contato: '', 
        coleta_telefone: '', 
        coleta_cep: '', 
        coleta_endereco_texto: '', 
        coleta_numero: '',
        coleta_complemento: '', 
        coleta_observacoes: '',
        entrega_usa_endereco_cadastro: false, 
        entrega_contato: '', 
        entrega_telefone: '', 
        entrega_codigo_pedido: '', 
        entrega_centro_custo: '', 
        entrega_solicitante: '', 
        entrega_cep: '', 
        entrega_endereco_texto: '', 
        entrega_numero: '',
        entrega_complemento: '', 
        entrega_observacoes: '',
        retorno: false, 
        pontos: [],
      }));
      setDistanciaKm('');
      setValorDinamico(false);
      setActiveDynamicRules([]);
      setDriverValueDisplay('0.00');
      setDriverReturnDisplay(null);
      setSelectedTabelaId('');
      setFaixasPreco([]);
      setFaixasComissoes([]);
      setSelectedComissaoTable(null);
      setComissaoTableFound(null);
    }
    setLoading(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Criar nova entrega</h2>
      
      {clientSaldo !== null && !isClientFaturamento(clientes.find(c => c.id === form.cliente_id)) && (
          <div className={`mb-4 p-3 rounded-lg border ${
              (form.valor_entrega && parseFloat(form.valor_entrega.replace(',', '.') || '0') > clientSaldo) 
              ? 'bg-red-50 border-red-200 text-red-700' 
              : 'bg-green-50 border-green-200 text-green-700'
          } flex justify-between items-center`}>
              <span className="font-medium">{isComercio ? 'Seu Saldo Disponível:' : 'Saldo Disponível do Cliente:'}</span>
              <span className="text-lg font-bold">R$ {clientSaldo.toFixed(2)}</span>
          </div>
      )}

      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.cliente_id} onChange={(e) => {
            const val = e.target.value;
            setForm(prev => ({ ...prev, cliente_id: val, endereco_id: '' }));
            const selected = clientes.find(c => c.id === val);
            setClientSaldo(selected && selected.saldo_creditos !== undefined ? selected.saldo_creditos : null);
          }} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome_completo || 'Cliente'}</option>
            ))}
          </select>
          <select value={form.entregador_id} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, entregador_id: v })); }} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Selecione um Entregador (Opcional)</option>
            {entregadores.map((d) => (
              <option key={d.id} value={d.id}>{d.nome_completo}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input id="solicitar_comprovante" type="checkbox" checked={form.solicitar_comprovante} onChange={(e) => { const v = e.target.checked; setForm(prev => ({ ...prev, solicitar_comprovante: v })); }} />
            <label htmlFor="solicitar_comprovante" className="text-sm text-slate-700">Solicitar comprovante assinado na entrega</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="retirada_no_local"
              type="checkbox"
              checked={form.retirada_no_local}
              onChange={(e) => {
                const next = e.target.checked;
                setForm(prev => ({
                  ...prev,
                  retirada_no_local: next,
                  entregador_id: next ? '' : prev.entregador_id,
                  cobrar_destinatario: next ? false : prev.cobrar_destinatario,
                }));
              }}
            />
            <label htmlFor="retirada_no_local" className="text-sm text-slate-700">Retirada no local (sem motoboy)</label>
          </div>
          {/* Price Info Removed - Moved to Bottom */}
          <div className="flex items-center justify-between md:col-span-2">
            <div>
              <label className="text-sm text-slate-700">Agendar Entrega</label>
              <input type="datetime-local" value={form.agendar_em} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, agendar_em: v })); }} className="ml-2 px-3 py-2 border border-slate-300 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <input id="cobrar_destinatario" type="checkbox" checked={form.cobrar_destinatario} onChange={(e) => { const v = e.target.checked; setForm(prev => ({ ...prev, cobrar_destinatario: v })); }} />
              <label htmlFor="cobrar_destinatario" className="text-sm text-slate-700">Cobrar destinatário</label>
            </div>
          </div>
          

          <select
            value={form.pagamento_metodo}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'fatura') {
                setForm(prev => ({ ...prev, pagamento_metodo: 'fatura', tipo_cobranca: 'fatura', pagamento_na_entrega: false, troco_para: '', cobrar_destinatario: false }));
                return;
              }
              if (v === 'pix') {
                setForm(prev => ({ ...prev, pagamento_metodo: 'pix', tipo_cobranca: 'pix', pagamento_na_entrega: false, troco_para: '', cobrar_destinatario: false }));
                return;
              }
              if (v === 'cartao') {
                setForm(prev => ({ ...prev, pagamento_metodo: 'cartao', tipo_cobranca: 'cartao', pagamento_na_entrega: true, troco_para: '', cobrar_destinatario: true }));
                return;
              }
              if (v === 'dinheiro') {
                setForm(prev => ({ ...prev, pagamento_metodo: 'dinheiro', tipo_cobranca: 'avista', pagamento_na_entrega: true, cobrar_destinatario: true }));
                return;
              }
              setForm(prev => ({ ...prev, pagamento_metodo: v }));
            }}
            className="px-3 py-2 border border-slate-300 rounded"
          >
            <option value="fatura">Pagamento: Fatura</option>
            <option value="pix">Pagamento: PIX</option>
            <option value="cartao">Pagamento: Cartão na entrega</option>
            <option value="dinheiro">Pagamento: Dinheiro (troco)</option>
          </select>

          {form.pagamento_metodo === 'dinheiro' ? (
            <input
              placeholder="Troco para (R$)"
              value={form.troco_para}
              onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, troco_para: v })); }}
              className="px-3 py-2 border border-slate-300 rounded"
            />
          ) : (
            <div />
          )}

          <select value={form.documento_tipo} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, documento_tipo: v })); }} className="px-3 py-2 border border-slate-300 rounded">
            <option value="cpf">CPF</option>
            <option value="cnpj">CNPJ</option>
          </select>
          <input
            placeholder="CPF/CNPJ do cliente"
            value={form.documento_numero}
            onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, documento_numero: v })); }}
            className="px-3 py-2 border border-slate-300 rounded"
          />


          <input placeholder="Observações" value={form.observacoes} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, observacoes: v })); }} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
        </div>
      </div>
      <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-semibold text-slate-900 mb-3">Coleta</div>
        <div className="flex items-center gap-2 mb-3">
          <input id="coleta_mesmo" type="checkbox" checked={form.coleta_usa_endereco_cadastro} onChange={(e) => handleUseRegistrationAddress('coleta', e.target.checked)} />
          <label htmlFor="coleta_mesmo" className="text-sm text-slate-700">Usar o mesmo endereço de cadastro</label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input placeholder="Contato" value={form.coleta_contato} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, coleta_contato: v })); }} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Telefone" value={form.coleta_telefone} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, coleta_telefone: v })); }} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="CEP" value={form.coleta_cep} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, coleta_cep: v })); }} onBlur={(e) => handleCepBlur(e.target.value, 'coleta')} className="px-3 py-2 border border-slate-300 rounded" />
          <AddressAutocomplete
            placeholder="Endereço completo"
            value={form.coleta_endereco_texto}
            onChange={(val) => { 
              setColetaSelectedCoords(undefined); 
              setDistanceError(null); 
              setForm(prev => ({ ...prev, coleta_endereco_texto: val })); 
            }}
            onSelectCoords={(coords, selectedText) => {
              setColetaSelectedCoords(coords);
              if (coords) {
                const key = normalizeAddressKey(selectedText || form.coleta_endereco_texto);
                if (key) selectedCoordsByTextRef.current.set(key, coords);
              }
            }}
            onSuggestCoords={(coords, typedText) => {
              if (!coords) return;
              const key = normalizeAddressKey(typedText);
              if (key) selectedCoordsByTextRef.current.set(key, coords);
            }}
            containerClassName="md:col-span-2"
          />
          <input placeholder="Nº" value={form.coleta_numero} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, coleta_numero: v })); }} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Complemento" value={form.coleta_complemento} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, coleta_complemento: v })); }} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Observações (Coleta)" value={form.coleta_observacoes} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, coleta_observacoes: v })); }} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
        </div>
      </div>

      {!form.retirada_no_local && (
        <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-slate-900 mb-3">Entrega</div>
          <div className="flex items-center gap-2 mb-3">
            <input id="entrega_mesmo" type="checkbox" checked={form.entrega_usa_endereco_cadastro} onChange={(e) => handleUseRegistrationAddress('entrega', e.target.checked)} />
            <label htmlFor="entrega_mesmo" className="text-sm text-slate-700">Usar o mesmo endereço de cadastro</label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input placeholder="Contato" value={form.entrega_contato} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, entrega_contato: v })); }} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Telefone" value={form.entrega_telefone} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, entrega_telefone: v })); }} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Código do pedido" value={form.entrega_codigo_pedido} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, entrega_codigo_pedido: v })); }} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Centro de Custo" value={form.entrega_centro_custo} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, entrega_centro_custo: v })); }} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Solicitante" value={form.entrega_solicitante} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, entrega_solicitante: v })); }} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="CEP" value={form.entrega_cep} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, entrega_cep: v })); }} onBlur={(e) => handleCepBlur(e.target.value, 'entrega')} className="px-3 py-2 border border-slate-300 rounded" />
            <AddressAutocomplete
              placeholder="Endereço completo"
              value={form.entrega_endereco_texto}
              onChange={(val) => { 
                setEntregaSelectedCoords(undefined); 
                setDistanceError(null); 
                setForm(prev => ({ ...prev, entrega_endereco_texto: val })); 
              }}
              onSelectCoords={(coords, selectedText) => {
                setEntregaSelectedCoords(coords);
                if (coords) {
                  const key = normalizeAddressKey(selectedText || form.entrega_endereco_texto);
                  if (key) selectedCoordsByTextRef.current.set(key, coords);
                }
              }}
              onSuggestCoords={(coords, typedText) => {
                if (!coords) return;
                const key = normalizeAddressKey(typedText);
                if (key) selectedCoordsByTextRef.current.set(key, coords);
              }}
              containerClassName="md:col-span-2"
            />
            <input placeholder="Nº" value={form.entrega_numero} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, entrega_numero: v })); }} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Complemento" value={form.entrega_complemento} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, entrega_complemento: v })); }} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Observações (Entrega)" value={form.entrega_observacoes} onChange={(e) => { const v = e.target.value; setForm(prev => ({ ...prev, entrega_observacoes: v })); }} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          </div>
        </div>
      )}

      <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Serviços Opcionais</div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => { 
                setDistanceError(null); 
                setForm(prev => ({ 
                  ...prev, 
                  pontos: [...prev.pontos, { contato: '', telefone: '', cep: '', endereco_texto: '', numero: '', complemento: '', observacoes: '', coords: undefined }] 
                })); 
              }} 
              className="px-3 py-2 rounded bg-green-600 text-white text-sm"
            >
              Adicionar Ponto de Entrega +
            </button>
            <div className="flex items-center gap-2">
              <input id="retorno" type="checkbox" checked={form.retorno} onChange={(e) => setForm(prev => ({ ...prev, retorno: e.target.checked }))} />
              <label htmlFor="retorno" className="text-sm text-slate-700">Adicionar Retorno</label>
            </div>
          </div>
        </div>
        {form.pontos.length === 0 ? (
          <div className="text-slate-600 mt-3 text-sm">Sem pontos adicionais</div>
        ) : (
          <div className="mt-3 space-y-3">
            {form.pontos.map((p, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-3 relative">
                <input 
                  placeholder="Contato" 
                  value={p.contato} 
                  onChange={(e) => { 
                    const v = e.target.value; 
                    setForm(prev => {
                      const arr = [...prev.pontos];
                      arr[idx] = { ...arr[idx], contato: v };
                      return { ...prev, pontos: arr };
                    });
                  }} 
                  className="px-3 py-2 border border-slate-300 rounded" 
                />
                <input 
                  placeholder="Telefone" 
                  value={p.telefone} 
                  onChange={(e) => { 
                    const v = e.target.value; 
                    setForm(prev => {
                      const arr = [...prev.pontos];
                      arr[idx] = { ...arr[idx], telefone: v };
                      return { ...prev, pontos: arr };
                    });
                  }} 
                  className="px-3 py-2 border border-slate-300 rounded" 
                />
                <input 
                  placeholder="CEP" 
                  value={p.cep} 
                  onChange={(e) => { 
                    const v = e.target.value; 
                    setForm(prev => {
                      const arr = [...prev.pontos];
                      arr[idx] = { ...arr[idx], cep: v };
                      return { ...prev, pontos: arr };
                    });
                  }} 
                  onBlur={(e) => handleCepBlur(e.target.value, 'ponto', idx)} 
                  className="px-3 py-2 border border-slate-300 rounded" 
                />
                <AddressAutocomplete
                  placeholder="Endereço completo"
                  value={p.endereco_texto}
                  onChange={(val) => { 
                    setDistanceError(null); 
                    setForm(prev => {
                      const arr = [...prev.pontos];
                      arr[idx] = { ...arr[idx], endereco_texto: val };
                      return { ...prev, pontos: arr };
                    });
                  }}
                  onSelectCoords={(coords) => { 
                    setDistanceError(null); 
                    setForm(prev => {
                      const arr = [...prev.pontos];
                      arr[idx] = { ...arr[idx], coords };
                      return { ...prev, pontos: arr };
                    });
                  }}
                />
                <input 
                  placeholder="Nº" 
                  value={p.numero} 
                  onChange={(e) => { 
                    const v = e.target.value; 
                    setForm(prev => {
                      const arr = [...prev.pontos];
                      arr[idx] = { ...arr[idx], numero: v };
                      return { ...prev, pontos: arr };
                    });
                  }} 
                  className="px-3 py-2 border border-slate-300 rounded" 
                />
                <input 
                  placeholder="Complemento" 
                  value={p.complemento} 
                  onChange={(e) => { 
                    const v = e.target.value; 
                    setForm(prev => {
                      const arr = [...prev.pontos];
                      arr[idx] = { ...arr[idx], complemento: v };
                      return { ...prev, pontos: arr };
                    });
                  }} 
                  className="px-3 py-2 border border-slate-300 rounded" 
                />
                <input 
                  placeholder="Observações" 
                  value={p.observacoes} 
                  onChange={(e) => { 
                    const v = e.target.value; 
                    setForm(prev => {
                      const arr = [...prev.pontos];
                      arr[idx] = { ...arr[idx], observacoes: v };
                      return { ...prev, pontos: arr };
                    });
                  }} 
                  className="px-3 py-2 border border-slate-300 rounded md:col-span-2" 
                />
                <div className="md:col-span-3">
                  <button 
                    onClick={() => { 
                      setForm(prev => {
                        const arr = [...prev.pontos];
                        arr.splice(idx, 1);
                        return { ...prev, pontos: arr };
                      });
                    }} 
                    className="px-3 py-2 rounded bg-red-600 text-white text-sm"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
        {((form.coleta_endereco_texto && form.entrega_endereco_texto) || valorDinamico || calculatingDistance || pricingMode === 'Zerar' || pricingMode === 'Fixo') && (
           <div className="mb-4 p-4 bg-sky-50 border border-sky-100 rounded-lg flex flex-col md:flex-row justify-between items-center gap-4">
             <div>
                <span className="text-sm text-sky-700 font-medium block">Valor Total da Entrega</span>
                {distanciaKm && <span className="text-xs text-sky-600">Distância estimada: {distanciaKm} km</span>}
                {!calculatingDistance && !!distanceError && (
                  <span className="text-xs text-red-700 block">{distanceError}</span>
                )}
                {!calculatingDistance && (form.coleta_endereco_texto && form.entrega_endereco_texto) && !distanciaKm && !distanceError && (
                  <span className="text-xs text-amber-700 block">Aguardando cálculo da distância...</span>
                )}
                {activeDynamicRules.length > 0 && (
                  <div className="mt-1">
                    {activeDynamicRules.map((rule, idx) => (
                      <span key={idx} className="block text-xs text-amber-600 font-medium">
                        {rule.name}
                      </span>
                    ))}
                  </div>
                )}
                {calculatingDistance && <span className="text-xs text-amber-600 block animate-pulse">Calculando rota e distância...</span>}

             </div>
             <div className="text-3xl font-bold text-sky-900">
               {calculatingDistance ? '...' : (form.valor_entrega ? `R$ ${form.valor_entrega}` : 'R$ --')}
            </div>
           </div>
        )}

        {clientSaldo !== null && !isClientFaturamento(clientes.find(c => c.id === form.cliente_id)) && (
            <div className={`mb-4 p-3 rounded-lg border ${
                (form.valor_entrega && parseFloat(form.valor_entrega.replace(',', '.')) > clientSaldo) 
                ? 'bg-red-50 border-red-200 text-red-700' 
                : 'bg-green-50 border-green-200 text-green-700'
            } flex justify-between items-center`}>
                <span className="font-medium">{isComercio ? 'Seu Saldo Disponível:' : 'Saldo Disponível do Cliente:'}</span>
                <span className="text-lg font-bold">R$ {clientSaldo.toFixed(2)}</span>
            </div>
        )}

        <div className="flex justify-end">
          <button onClick={handleSubmit} disabled={loading} className="w-full md:w-auto px-6 py-3 rounded bg-sky-600 hover:bg-sky-700 text-white font-medium disabled:opacity-50 shadow-sm transition-colors">
            {loading ? 'Processando...' : 'Solicitar Entrega'}
          </button>
        </div>
      </div>
    </div>
  );
}
