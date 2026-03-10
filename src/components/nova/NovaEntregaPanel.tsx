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
}

function normalizeBillingMode(mode: string | null | undefined) {
  return (mode || '').toLowerCase().trim();
}

function isFaturamentoMode(mode: string | null | undefined) {
  const m = normalizeBillingMode(mode);
  return m === 'faturamento' || m === 'faturado' || m === 'pos-pago' || m === 'pós-pago' || m === 'pos pago' || m === 'pós pago';
}

function AddressAutocomplete({ value, onChange, placeholder, containerClassName }: { value: string, onChange: (val: string) => void, placeholder: string, containerClassName?: string }) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (value.length > 4 && showSuggestions) {
        try {
         
          let query = value;
          let userNumber = '';
          
          const startMatch = value.match(/^(\d+)[,\s]+(.+)$/);
          const endMatch = value.match(/^(.+)[,\s]+(\d+)$/);

          if (startMatch) {
             userNumber = startMatch[1];
             
             query = `${startMatch[2]}, ${startMatch[1]}`;
          } else if (endMatch) {
             userNumber = endMatch[2];
          }

          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5&countrycodes=br&viewbox=-47.25,-22.70,-46.80,-23.10&bounded=1`, {
            headers: { 'User-Agent': 'RouteDeliveryApp/1.0' }
          });
          let data = await res.json();

          const userSpecifiedCampinas = value.toLowerCase().includes('campinas');
          if (userSpecifiedCampinas && data && data.length > 0) {
             const filtered = data.filter((item: any) => {
                 const addr = item.address || {};
                 const city = addr.city || addr.town || addr.municipality || addr.village || '';
                 const displayName = item.display_name || '';
                 return (city && city.toLowerCase().includes('campinas')) || displayName.toLowerCase().includes('campinas');
             });
             
             if (filtered.length > 0) {
                 data = filtered;
             }
          }
          
          const formatted = (data || []).map((item: any) => {
             const addr = item.address || {};
             const road = addr.road || addr.pedestrian || addr.street || item.name || '';
             
             const number = addr.house_number || userNumber || '';
             const district = addr.suburb || addr.neighbourhood || addr.city_district || '';
             const city = addr.city || addr.town || addr.municipality || addr.village || '';
             const state = addr.state || '';

             
             if (!road) return { display_name: item.display_name };

             const parts = [
               road,
               number ? `, ${number}` : '',
               district ? ` - ${district}` : '',
               city ? ` - ${city}` : '',
               state ? ` - ${state}` : ''
             ].join('');
             
             
             const clean = parts.replace(/, ,/g, ',').replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
             return { display_name: clean };
          });

          setSuggestions(formatted);
        } catch (e) {
          console.error(e);
        }
      } else {
        setSuggestions([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [value, showSuggestions]);

  return (
    <div className={`relative ${containerClassName || ''}`}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-300 rounded"
      />
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-b shadow-lg max-h-60 overflow-auto mt-1">
          {suggestions.map((s, i) => (
            <li key={i} className="px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-700"
                onMouseDown={() => {
                  onChange(s.display_name);
                  setShowSuggestions(false);
                }}>
              {s.display_name}
            </li>
          ))}
        </ul>
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
  const [clientModoFaturamento, setClientModoFaturamento] = useState<string>('credito');

  const [distanciaKm, setDistanciaKm] = useState<string>('');
  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const [selectedTabelaId, setSelectedTabelaId] = useState<string>('');
  const [valorDinamico, setValorDinamico] = useState(false);
  const [pricingMode, setPricingMode] = useState<'Distância' | 'Fixo' | 'Padrão' | 'Zona' | 'Bairro' | 'Zerar'>('Distância');
  const [pricePerPoint, setPricePerPoint] = useState<number>(0);
  const [dynamicRules, setDynamicRules] = useState<DynamicRule[]>([]);
  const [activeDynamicRules, setActiveDynamicRules] = useState<{ name: string; value: number }[]>([]);
  const [dynamicDriverRules, setDynamicDriverRules] = useState<DynamicDriverRule[]>([]);
  const [faixasPreco, setFaixasPreco] = useState<FaixaPreco[]>([]);
  const coordsCache = useRef<Map<string, { lat: number; lon: number }>>(new Map()); // Kept for backward compatibility if needed, but unused now
  const [driverValueDisplay, setDriverValueDisplay] = useState<string>('0.00');
  const [driverReturnDisplay, setDriverReturnDisplay] = useState<string | null>(null);

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
    valor_manual: false,
    valor_entrega: '',
    tipo_cobranca: 'fatura',
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
    pontos: [] as Array<{ contato: string; telefone: string; cep: string; endereco_texto: string; numero: string; complemento: string; observacoes: string }>,
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
      if (!form.coleta_endereco_texto || !form.entrega_endereco_texto) return;

      setCalculatingDistance(true);
      
      const coletaFull = form.coleta_numero ? `${form.coleta_endereco_texto}, ${form.coleta_numero}` : form.coleta_endereco_texto;
      const entregaFull = form.entrega_numero ? `${form.entrega_endereco_texto}, ${form.entrega_numero}` : form.entrega_endereco_texto;

      const startCoords = await getCoordsFromAddress(coletaFull);
      const endCoords = await getCoordsFromAddress(entregaFull);

      if (startCoords && endCoords) {
        const points = [];
        points.push({lat: startCoords[0], lon: startCoords[1]});

        for (const ponto of form.pontos) {
          const pontoFull = ponto.numero ? `${ponto.endereco_texto}, ${ponto.numero}` : ponto.endereco_texto;
          const pointCoords = await getCoordsFromAddress(pontoFull || '');
          if (pointCoords) {
             points.push({lat: pointCoords[0], lon: pointCoords[1]});
          }
        }
        points.push({lat: endCoords[0], lon: endCoords[1]});

        
        let totalDist = await getDrivingRouteDistance(points);

        
        if (totalDist === null) {
            console.log("OSRM failed, falling back to Haversine");
            totalDist = 0;
            for (let i = 0; i < points.length - 1; i++) {
                totalDist += calculateDistance(points[i].lat, points[i].lon, points[i+1].lat, points[i+1].lon);
            }
        }

        setDistanciaKm(totalDist.toFixed(2));
      }
      setCalculatingDistance(false);
    };

    const timeoutId = setTimeout(() => {
      updateDistance();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [form.coleta_endereco_texto, form.coleta_numero, form.entrega_endereco_texto, form.entrega_numero, form.pontos]);

  useEffect(() => {
    calculatePrice();
  }, [distanciaKm, selectedTabelaId, pricingMode, pricePerPoint, form.pontos, form.retorno, dynamicRules, faixasPreco]);

  useEffect(() => {
    const kmValue = distanciaKm ? parseFloat(distanciaKm.replace(',', '.')) : 0;
    
    const { total } = calculateDriverCommission(
      kmValue,
      form.retorno,
      form.pontos.length,
      form.entregador_id || null,
      dynamicDriverRules
    );
    
    setDriverValueDisplay(total);

    if (form.retorno) {
        if (selectedComissaoTable && faixasComissoes.length > 0) {
             const { total: totalSemRetorno } = calculateDriverCommission(
              kmValue,
              false, 
              form.pontos.length,
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

    if (pricingMode === 'Zerar') {
      setForm(prev => ({ ...prev, valor_entrega: '0.00', valor_manual: false }));
      setValorDinamico(true);
      setActiveDynamicRules([]);
      return;
    }

    if (pricingMode === 'Fixo') {
      const basePoints = 2; 
      const extraPoints = form.pontos.length;
      const totalPoints = basePoints + extraPoints;
      price = totalPoints * pricePerPoint;
      shouldCalculate = true;
    } else {
      if (!distanciaKm || !selectedTabelaId) return;

      const km = parseFloat(distanciaKm.replace(',', '.'));
      if (isNaN(km)) return;
  
      const tabela = tabelasPrecos.find(t => t.id === selectedTabelaId);
      if (!tabela) return;
  
      if (!faixasPreco || faixasPreco.length === 0) return;
  
      const faixa = faixasPreco.find(f => f.km_ate >= km);
  
      if (faixa) {
        price = faixa.valor;
      } else {
        
        const lastFaixa = faixasPreco[faixasPreco.length - 1];
        const extraKm = km - lastFaixa.km_ate;
        price = lastFaixa.valor + (extraKm * (tabela.km_adicional || 0));
      }
  
      
      if (tabela.valor_minimo && price < tabela.valor_minimo) {
        price = tabela.valor_minimo;
      }
      shouldCalculate = true;
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
    const userPromise = supabase.auth.getUser();

    const [c, e, t, m, tp, tc, b, dyn, dynDriver] = await Promise.all([
      supabase.from('clientes').select('*').order('nome_completo'),
      supabase.from('entregadores').select('id, nome_completo, status, is_online').neq('status', 'inativo').order('nome_completo'),
      supabase.from('tipo_servicos').select('*').eq('ativo', true).order('nome'),
      supabase.from('modais').select('*').eq('ativo', true).order('tipo'),
      supabase.from('tabelas_precos').select('*').order('nome'),
      supabase.from('tabelas_comissoes').select('*').order('nome'),
      supabase.from('entregador_bloqueios_clientes').select('cliente_id, entregador_id'),
       supabase.from('preco_dinamico_demanda').select('*').eq('ativa', true).order('nome'),
       supabase.from('preco_dinamico_entregador').select('*').eq('ativa', true)
     ]);

     let finalClientes = (c.data || []) as Cliente[];
     
     
      const { data: { user } } = await userPromise;
      if (user) {
          const { data: uData } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
          if (uData?.role === 'cliente') {
              setIsComercio(true);
              const userEmail = user.email?.trim().toLowerCase();
              const matched = finalClientes.find(cli => cli.email?.trim().toLowerCase() === userEmail);
              if (matched) {
                  finalClientes = [matched];
                  setForm(prev => ({ ...prev, cliente_id: matched.id }));
                  setClientSaldo(matched.saldo_creditos);
                  setClientModoFaturamento(matched.modo_faturamento || 'credito');
              } else {
                  finalClientes = [];
              }
          }
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
        const next = { ...prev };
        if (type === 'coleta') {
          next.coleta_endereco_texto = addressText;
        } else if (type === 'entrega') {
          next.entrega_endereco_texto = addressText;
        } else if (type === 'ponto' && typeof index === 'number') {
           const pontos = [...next.pontos];
           if (pontos[index]) {
             pontos[index] = { ...pontos[index], endereco_texto: addressText };
             next.pontos = pontos;
           }
        }
        return next;
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

    // Get fresh client data to avoid stale state issues
    const currentClient = clientes.find(c => c.id === form.cliente_id);
    const mode = (currentClient?.modo_faturamento || '').toLowerCase().trim();
    // Include all variations of faturamento/pos-pago including accents
    const isFaturado = mode === 'faturamento' || mode === 'faturado' || mode === 'pos-pago' || mode === 'pós-pago';

    // Check for balance only if NOT in faturamento mode
    // We use currentClient.saldo_creditos instead of clientSaldo state to be safe
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
      form.pontos.length,
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
    try {
      const valorTotal = form.valor_entrega ? Number(form.valor_entrega.replace(',', '.')) : null;
      console.log('Tentando criar pedido para cliente:', form.cliente_id, 'Valor:', valorTotal);

      const { data: pData, error: pError } = await supabase
        .from('pedidos')
        .insert({
          cliente_id: form.cliente_id,
          endereco_id: form.endereco_id || null,
          numero: form.entrega_codigo_pedido || null,
          item_descricao: null,
          endereco_texto: form.entrega_numero ? `${form.entrega_endereco_texto}, ${form.entrega_numero}` : (form.entrega_endereco_texto || null),
          origem: 'manual',
          valor_total: (valorTotal && !isNaN(valorTotal)) ? valorTotal : null,
          status: 'criado',
          observacoes: form.observacoes || null,
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

    const { error: insertError } = await supabase
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
        agendar_em: form.agendar_em ? new Date(form.agendar_em).toISOString() : null,
        valor_manual: form.valor_manual,
        valor_entrega: form.valor_entrega ? Number(form.valor_entrega.replace(',', '.')) : null,
        valor_entregador: driverValue,
        tipo_cobranca: form.tipo_cobranca as 'fatura' | 'avista' | 'pix' | 'cartao',
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
        pontos_adicionais: form.pontos.length ? form.pontos : null,
        opcionais: driverBonuses.length > 0 ? { driver_bonuses: driverBonuses } : null,
        observacoes: form.observacoes || null,
        status: entregadorEscolhido ? 'atribuida' : 'criada',
        distancia_km: kmValue > 0 ? kmValue : null,
      });

    if (insertError?.message) setError(insertError.message);
    else {
      
      if (form.cliente_id && form.valor_entrega) {
         const val = parseFloat(form.valor_entrega.replace(',', '.'));
         if (!isNaN(val) && val > 0) {
             // Only deduct from balance if not faturado
             // Re-evaluate mode to be consistent with the check above
             const currentClient = clientes.find(c => c.id === form.cliente_id);
             const mode = (currentClient?.modo_faturamento || '').toLowerCase().trim();
             const isFaturado = mode === 'faturamento' || mode === 'faturado' || mode === 'pos-pago' || mode === 'pós-pago';
             
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
      

      setForm({
        cliente_id: form.cliente_id, 
        endereco_id: '', 
        tipo_servico_id: form.tipo_servico_id, 
        modal_tipo: form.modal_tipo, 
        atribuicao_modo: 'manual', 
        entregador_id: '', 
        observacoes: '',
        solicitar_comprovante: false, 
        agendar_em: '', 
        valor_manual: false, 
        valor_entrega: '', 
        tipo_cobranca: 'fatura', 
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
      });
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
      
      {clientSaldo !== null && !isFaturamentoMode(clientModoFaturamento) && (
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
            setForm({ ...form, cliente_id: val, endereco_id: '' });
            const selected = clientes.find(c => c.id === val);
            setClientSaldo(selected && selected.saldo_creditos !== undefined ? selected.saldo_creditos : null);
            setClientModoFaturamento(selected && selected.modo_faturamento ? selected.modo_faturamento : 'credito');
          }} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome_completo || 'Cliente'}</option>
            ))}
          </select>
          <select value={form.entregador_id} onChange={(e) => setForm({ ...form, entregador_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Selecione um Entregador (Opcional)</option>
            {entregadores.map((d) => (
              <option key={d.id} value={d.id}>{d.nome_completo}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input id="solicitar_comprovante" type="checkbox" checked={form.solicitar_comprovante} onChange={(e) => setForm({ ...form, solicitar_comprovante: e.target.checked })} />
            <label htmlFor="solicitar_comprovante" className="text-sm text-slate-700">Solicitar comprovante assinado na entrega</label>
          </div>
          {/* Price Info Removed - Moved to Bottom */}
          <div className="flex items-center justify-between md:col-span-2">
            <div>
              <label className="text-sm text-slate-700">Agendar Entrega</label>
              <input type="datetime-local" value={form.agendar_em} onChange={(e) => setForm({ ...form, agendar_em: e.target.value })} className="ml-2 px-3 py-2 border border-slate-300 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <input id="cobrar_destinatario" type="checkbox" checked={form.cobrar_destinatario} onChange={(e) => setForm({ ...form, cobrar_destinatario: e.target.checked })} />
              <label htmlFor="cobrar_destinatario" className="text-sm text-slate-700">Cobrar destinatário</label>
            </div>
          </div>
          


          <input placeholder="Observações" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
        </div>
      </div>
      <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-semibold text-slate-900 mb-3">Coleta</div>
        <div className="flex items-center gap-2 mb-3">
          <input id="coleta_mesmo" type="checkbox" checked={form.coleta_usa_endereco_cadastro} onChange={(e) => handleUseRegistrationAddress('coleta', e.target.checked)} />
          <label htmlFor="coleta_mesmo" className="text-sm text-slate-700">Usar o mesmo endereço de cadastro</label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input placeholder="Contato" value={form.coleta_contato} onChange={(e) => setForm({ ...form, coleta_contato: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Telefone" value={form.coleta_telefone} onChange={(e) => setForm({ ...form, coleta_telefone: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="CEP" value={form.coleta_cep} onChange={(e) => setForm({ ...form, coleta_cep: e.target.value })} onBlur={(e) => handleCepBlur(e.target.value, 'coleta')} className="px-3 py-2 border border-slate-300 rounded" />
          <AddressAutocomplete
            placeholder="Endereço completo"
            value={form.coleta_endereco_texto}
            onChange={(val) => setForm({ ...form, coleta_endereco_texto: val })}
            containerClassName="md:col-span-2"
          />
          <input placeholder="Nº" value={form.coleta_numero} onChange={(e) => setForm({ ...form, coleta_numero: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Complemento" value={form.coleta_complemento} onChange={(e) => setForm({ ...form, coleta_complemento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Observações (Coleta)" value={form.coleta_observacoes} onChange={(e) => setForm({ ...form, coleta_observacoes: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
        </div>
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-semibold text-slate-900 mb-3">Entrega</div>
        <div className="flex items-center gap-2 mb-3">
          <input id="entrega_mesmo" type="checkbox" checked={form.entrega_usa_endereco_cadastro} onChange={(e) => handleUseRegistrationAddress('entrega', e.target.checked)} />
          <label htmlFor="entrega_mesmo" className="text-sm text-slate-700">Usar o mesmo endereço de cadastro</label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input placeholder="Contato" value={form.entrega_contato} onChange={(e) => setForm({ ...form, entrega_contato: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Telefone" value={form.entrega_telefone} onChange={(e) => setForm({ ...form, entrega_telefone: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Código do pedido" value={form.entrega_codigo_pedido} onChange={(e) => setForm({ ...form, entrega_codigo_pedido: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Centro de Custo" value={form.entrega_centro_custo} onChange={(e) => setForm({ ...form, entrega_centro_custo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Solicitante" value={form.entrega_solicitante} onChange={(e) => setForm({ ...form, entrega_solicitante: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="CEP" value={form.entrega_cep} onChange={(e) => setForm({ ...form, entrega_cep: e.target.value })} onBlur={(e) => handleCepBlur(e.target.value, 'entrega')} className="px-3 py-2 border border-slate-300 rounded" />
          <AddressAutocomplete
            placeholder="Endereço completo"
            value={form.entrega_endereco_texto}
            onChange={(val) => setForm({ ...form, entrega_endereco_texto: val })}
            containerClassName="md:col-span-2"
          />
          <input placeholder="Nº" value={form.entrega_numero} onChange={(e) => setForm({ ...form, entrega_numero: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Complemento" value={form.entrega_complemento} onChange={(e) => setForm({ ...form, entrega_complemento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Observações (Entrega)" value={form.entrega_observacoes} onChange={(e) => setForm({ ...form, entrega_observacoes: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
        </div>
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Serviços Opcionais</div>
          <div className="flex items-center gap-3">
            <button onClick={() => setForm({ ...form, pontos: [...form.pontos, { contato: '', telefone: '', cep: '', endereco_texto: '', numero: '', complemento: '', observacoes: '' }] })} className="px-3 py-2 rounded bg-green-600 text-white text-sm">Adicionar Ponto +</button>
            <div className="flex items-center gap-2">
              <input id="retorno" type="checkbox" checked={form.retorno} onChange={(e) => setForm({ ...form, retorno: e.target.checked })} />
              <label htmlFor="retorno" className="text-sm text-slate-700">Adicionar Retorno</label>
            </div>
          </div>
        </div>
        {form.pontos.length === 0 ? (
          <div className="text-slate-600 mt-3 text-sm">Sem pontos adicionais</div>
        ) : (
          <div className="mt-3 space-y-3">
            {form.pontos.map((p, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input placeholder="Contato" value={p.contato} onChange={(e) => { const v = e.target.value; const arr = [...form.pontos]; arr[idx] = { ...arr[idx], contato: v }; setForm({ ...form, pontos: arr }); }} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Telefone" value={p.telefone} onChange={(e) => { const v = e.target.value; const arr = [...form.pontos]; arr[idx] = { ...arr[idx], telefone: v }; setForm({ ...form, pontos: arr }); }} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="CEP" value={p.cep} onChange={(e) => { const v = e.target.value; const arr = [...form.pontos]; arr[idx] = { ...arr[idx], cep: v }; setForm({ ...form, pontos: arr }); }} onBlur={(e) => handleCepBlur(e.target.value, 'ponto', idx)} className="px-3 py-2 border border-slate-300 rounded" />
                <AddressAutocomplete
                  placeholder="Endereço completo"
                  value={p.endereco_texto}
                  onChange={(val) => { const arr = [...form.pontos]; arr[idx] = { ...arr[idx], endereco_texto: val }; setForm({ ...form, pontos: arr }); }}
                  containerClassName="md:col-span-2"
                />
                <input placeholder="Nº" value={p.numero} onChange={(e) => { const v = e.target.value; const arr = [...form.pontos]; arr[idx] = { ...arr[idx], numero: v }; setForm({ ...form, pontos: arr }); }} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Complemento" value={p.complemento} onChange={(e) => { const v = e.target.value; const arr = [...form.pontos]; arr[idx] = { ...arr[idx], complemento: v }; setForm({ ...form, pontos: arr }); }} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Observações" value={p.observacoes} onChange={(e) => { const v = e.target.value; const arr = [...form.pontos]; arr[idx] = { ...arr[idx], observacoes: v }; setForm({ ...form, pontos: arr }); }} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
                <div className="md:col-span-3">
                  <button onClick={() => { const arr = [...form.pontos]; arr.splice(idx, 1); setForm({ ...form, pontos: arr }); }} className="px-3 py-2 rounded bg-red-600 text-white text-sm">Remover</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
        {(valorDinamico || calculatingDistance) && (
           <div className="mb-4 p-4 bg-sky-50 border border-sky-100 rounded-lg flex flex-col md:flex-row justify-between items-center gap-4">
             <div>
                <span className="text-sm text-sky-700 font-medium block">Valor Total da Entrega</span>
                {distanciaKm && <span className="text-xs text-sky-600">Distância estimada: {distanciaKm} km</span>}
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
               {calculatingDistance ? '...' : `R$ ${form.valor_entrega}`}
            </div>
           </div>
        )}

        {clientSaldo !== null && (
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
