import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Cliente = Database['public']['Tables']['clientes']['Row'];
type Endereco = Database['public']['Tables']['cliente_enderecos']['Row'];
type Entregador = Database['public']['Tables']['entregadores']['Row'];
type TipoServico = Database['public']['Tables']['tipo_servicos']['Row'];
type ModalRow = Database['public']['Tables']['modais']['Row'];
type TabelaPreco = Database['public']['Tables']['tabelas_precos']['Row'];
  type FaixaPreco = Database['public']['Tables']['tabelas_precos_faixas']['Row'];
  type DynamicRule = Database['public']['Tables']['preco_dinamico_demanda']['Row'];
  
  interface PrecificacaoConfigItem {
  modal: string;
  preco_ponto: string;
  tipo_precificacao: string;
  tabela_id: string;
}

interface AddressSuggestion {
  display_name: string;
}

function AddressAutocomplete({ value, onChange, placeholder, containerClassName }: { value: string, onChange: (val: string) => void, placeholder: string, containerClassName?: string }) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (value.length > 4 && showSuggestions) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&addressdetails=1&limit=5&countrycodes=br`, {
            headers: { 'User-Agent': 'RouteDeliveryApp/1.0' }
          });
          const data = await res.json();
          setSuggestions(data || []);
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
  const [blacklist, setBlacklist] = useState<Array<{ cliente_id: string, entregador_id: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [distanciaKm, setDistanciaKm] = useState<string>('');
  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const [selectedTabelaId, setSelectedTabelaId] = useState<string>('');
  const [valorDinamico, setValorDinamico] = useState(false);
  const [pricingMode, setPricingMode] = useState<'Distância' | 'Fixo' | 'Padrão' | 'Zona' | 'Bairro' | 'Zerar'>('Distância');
  const [pricePerPoint, setPricePerPoint] = useState<number>(0);
  const [dynamicRules, setDynamicRules] = useState<DynamicRule[]>([]);
  const [activeDynamicRules, setActiveDynamicRules] = useState<{ name: string; value: number }[]>([]);

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
    entrega_usa_endereco_cadastro: false,
    entrega_contato: '',
    entrega_telefone: '',
    entrega_codigo_pedido: '',
    entrega_centro_custo: '',
    entrega_solicitante: '',
    entrega_cep: '',
    entrega_endereco_texto: '',
    entrega_complemento: '',
    entrega_observacoes: '',
    retorno: false,
    pontos: [] as Array<{ contato: string; telefone: string; cep: string; endereco_texto: string; complemento: string; observacoes: string }>,
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (form.cliente_id) fetchEnderecos(form.cliente_id);
    else setEnderecos([]);
  }, [form.cliente_id]);

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

          const enderecoTexto = [rua, numero, bairro, cidade]
            .filter(Boolean)
            .join(', ');

          if (type === 'coleta') {
            next = {
              ...next,
              coleta_cep: cep || '',
              coleta_endereco_texto: enderecoTexto,
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

  const getCoordsFromAddress = async (address: string) => {
    
    const match = address.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    if (match) {
      return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
    }
    
    
    if (address.length > 5) {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`, {
          headers: {
            'User-Agent': 'RouteDeliveryApp/1.0'
          }
        });
        const data = await response.json();
        if (data && data.length > 0) {
          return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        }
      } catch (error) {
        console.error("Geocoding error:", error);
      }
    }
    return null;
  };

  useEffect(() => {
    const updateDistance = async () => {
      if (!form.coleta_endereco_texto || !form.entrega_endereco_texto) return;

      setCalculatingDistance(true);
      
      const startCoords = await getCoordsFromAddress(form.coleta_endereco_texto);
      const endCoords = await getCoordsFromAddress(form.entrega_endereco_texto);

      if (startCoords && endCoords) {
        let totalDist = calculateDistance(startCoords.lat, startCoords.lon, endCoords.lat, endCoords.lon);
        
        let currentCoords = endCoords;
        for (const ponto of form.pontos) {
          const pointCoords = await getCoordsFromAddress(ponto.endereco_texto || '');
          if (pointCoords) {
             totalDist += calculateDistance(currentCoords.lat, currentCoords.lon, pointCoords.lat, pointCoords.lon);
             currentCoords = pointCoords;
          }
        }

        setDistanciaKm(totalDist.toFixed(2));
      }
      setCalculatingDistance(false);
    };

    const timeoutId = setTimeout(() => {
      updateDistance();
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [form.coleta_endereco_texto, form.entrega_endereco_texto, form.pontos]);

  useEffect(() => {
    calculatePrice();
  }, [distanciaKm, selectedTabelaId, pricingMode, pricePerPoint, form.pontos, form.retorno, dynamicRules]);

  const calculatePrice = async () => {
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
  
      const { data } = await supabase
        .from('tabelas_precos_faixas')
        .select('*')
        .eq('tabela_id', selectedTabelaId)
        .order('km_ate', { ascending: true });
  
      const faixas = data as FaixaPreco[] | null;
  
      if (!faixas || faixas.length === 0) return;
  
      const faixa = faixas.find(f => f.km_ate >= km);
  
      if (faixa) {
        price = faixa.valor;
      } else {
        
        const lastFaixa = faixas[faixas.length - 1];
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
        price = price * 1.20;
    }

    // Apply Dynamic Rules
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
    const [c, e, t, m, tp, b, dyn] = await Promise.all([
      supabase.from('clientes').select('*').order('nome_completo'),
      supabase.from('entregadores').select('id, nome_completo, status, is_online').neq('status', 'inativo').order('nome_completo'),
      supabase.from('tipo_servicos').select('*').eq('ativo', true).order('nome'),
      supabase.from('modais').select('*').eq('ativo', true).order('tipo'),
      supabase.from('tabelas_precos').select('*').order('nome'),
      supabase.from('entregador_bloqueios_clientes').select('cliente_id, entregador_id'),
       supabase.from('preco_dinamico_demanda').select('*').eq('ativa', true).order('nome')
     ]);
     setClientes((c.data || []) as Cliente[]);
    setEntregadores((e.data || []) as Entregador[]);
    const tiposList = (t.data || []) as TipoServico[];
    setTipos(tiposList);
    const modaisList = (m.data || []) as ModalRow[];
    setModais(modaisList);
    const tabelas = (tp.data || []) as TabelaPreco[];
    setTabelasPrecos(tabelas);
    setBlacklist((b.data || []) as Array<{ cliente_id: string, entregador_id: string }>);
    setDynamicRules((dyn.data || []) as DynamicRule[]);
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

  const calculateDriverCommission = (km: number, hasReturn: boolean, pointsCount: number): string => {
     
      
      if (form.valor_entrega) {
          const totalValue = parseFloat(form.valor_entrega.replace(',', '.'));
          if (!isNaN(totalValue)) {
              return (totalValue * 0.75).toFixed(2); 
          }
      }
      return '0.00';
  };

  const handleSubmit = async () => {
    if (!form.cliente_id) {
      setError('Preencha o cliente');
      return;
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
    const driverValueStr = calculateDriverCommission(kmValue, form.retorno, form.pontos.length);
    const driverValue = parseFloat(driverValueStr);

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
          endereco_texto: form.entrega_endereco_texto || null,
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
        coleta_endereco_texto: form.coleta_endereco_texto || null,
        coleta_complemento: form.coleta_complemento || null,
        coleta_observacoes: form.coleta_observacoes || null,
        entrega_usa_endereco_cadastro: form.entrega_usa_endereco_cadastro,
        entrega_contato: form.entrega_contato || null,
        entrega_telefone: form.entrega_telefone || null,
        entrega_codigo_pedido: form.entrega_codigo_pedido || null,
        entrega_centro_custo: form.entrega_centro_custo || null,
        entrega_solicitante: form.entrega_solicitante || null,
        entrega_cep: form.entrega_cep || null,
        entrega_endereco_texto: form.entrega_endereco_texto || null,
        entrega_complemento: form.entrega_complemento || null,
        entrega_observacoes: form.entrega_observacoes || null,
        retorno: form.retorno,
        pontos_adicionais: form.pontos.length ? form.pontos : null,
        opcionais: null,
        observacoes: form.observacoes || null,
        status: entregadorEscolhido ? 'atribuida' : 'criada',
      });

    if (insertError?.message) setError(insertError.message);
    else {
      setForm({
        cliente_id: '', endereco_id: '', tipo_servico_id: '', modal_tipo: '', atribuicao_modo: 'manual', entregador_id: '', observacoes: '',
        solicitar_comprovante: false, agendar_em: '', valor_manual: false, valor_entrega: '', tipo_cobranca: 'fatura', cobrar_destinatario: false,
        coleta_usa_endereco_cadastro: false, coleta_contato: '', coleta_telefone: '', coleta_cep: '', coleta_endereco_texto: '', coleta_complemento: '', coleta_observacoes: '',
        entrega_usa_endereco_cadastro: false, entrega_contato: '', entrega_telefone: '', entrega_codigo_pedido: '', entrega_centro_custo: '', entrega_solicitante: '', entrega_cep: '', entrega_endereco_texto: '', entrega_complemento: '', entrega_observacoes: '',
        retorno: false, pontos: [],
      });
    }
    setLoading(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Criar nova entrega</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value, endereco_id: '' })} className="px-3 py-2 border border-slate-300 rounded">
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
          <input placeholder="Complemento" value={form.coleta_complemento} onChange={(e) => setForm({ ...form, coleta_complemento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Observações (Coleta)" value={form.coleta_observacoes} onChange={(e) => setForm({ ...form, coleta_observacoes: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-3" />
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
          <input placeholder="Complemento" value={form.entrega_complemento} onChange={(e) => setForm({ ...form, entrega_complemento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Observações (Entrega)" value={form.entrega_observacoes} onChange={(e) => setForm({ ...form, entrega_observacoes: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-3" />
        </div>
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Serviços Opcionais</div>
          <div className="flex items-center gap-3">
            <button onClick={() => setForm({ ...form, pontos: [...form.pontos, { contato: '', telefone: '', cep: '', endereco_texto: '', complemento: '', observacoes: '' }] })} className="px-3 py-2 rounded bg-green-600 text-white text-sm">Adicionar Ponto +</button>
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
                <input placeholder="Complemento" value={p.complemento} onChange={(e) => { const v = e.target.value; const arr = [...form.pontos]; arr[idx] = { ...arr[idx], complemento: v }; setForm({ ...form, pontos: arr }); }} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Observações" value={p.observacoes} onChange={(e) => { const v = e.target.value; const arr = [...form.pontos]; arr[idx] = { ...arr[idx], observacoes: v }; setForm({ ...form, pontos: arr }); }} className="px-3 py-2 border border-slate-300 rounded md:col-span-3" />
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
                        {rule.name}: +R$ {rule.value.toFixed(2)}
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

        <div className="flex justify-end">
          <button onClick={handleSubmit} disabled={loading} className="w-full md:w-auto px-6 py-3 rounded bg-sky-600 hover:bg-sky-700 text-white font-medium disabled:opacity-50 shadow-sm transition-colors">
            {loading ? 'Processando...' : 'Solicitar Entrega'}
          </button>
        </div>
      </div>
    </div>
  );
}