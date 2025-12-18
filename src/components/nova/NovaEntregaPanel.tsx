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

interface PrecificacaoConfigItem {
  modal: string;
  preco_ponto: string;
  tipo_precificacao: string;
  tabela_id: string;
}

export function NovaEntregaPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [tipos, setTipos] = useState<TipoServico[]>([]);
  const [modais, setModais] = useState<ModalRow[]>([]);
  const [tabelasPrecos, setTabelasPrecos] = useState<TabelaPreco[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [distanciaKm, setDistanciaKm] = useState<string>('');
  const [selectedTabelaId, setSelectedTabelaId] = useState<string>('');
  const [valorDinamico, setValorDinamico] = useState(false);
  const [pricingMode, setPricingMode] = useState<'Distância' | 'Fixo' | 'Padrão' | 'Zona' | 'Bairro' | 'Zerar'>('Distância');
  const [pricePerPoint, setPricePerPoint] = useState<number>(0);

  const [form, setForm] = useState({
    cliente_id: '',
    endereco_id: '',
    tipo_servico_id: '',
    modal_tipo: '',
    atribuicao_modo: 'automatica' as 'manual' | 'automatica',
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

  useEffect(() => {
    if (form.cliente_id && (form.coleta_usa_endereco_cadastro || form.entrega_usa_endereco_cadastro)) {
      const cliente = clientes.find((c) => c.id === form.cliente_id);
      if (cliente) {
        let { cep, rua, numero, complemento, bairro, cidade, referencia_entrega } = cliente;

        
        if ((!rua || !cidade) && enderecos.length > 0) {
          const ultimo = enderecos[0];
          
          if (ultimo.cliente_id === form.cliente_id) {
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

        setForm((prev) => {
          let next = { ...prev };
          if (prev.coleta_usa_endereco_cadastro) {
            next = {
              ...next,
              coleta_cep: cep || '',
              coleta_endereco_texto: enderecoTexto,
              coleta_complemento: complemento || '',
              coleta_contato: cliente.nome_completo,
              coleta_telefone: cliente.telefone || '',
              coleta_observacoes: referencia_entrega || '',
            };
          }
          if (prev.entrega_usa_endereco_cadastro) {
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
          return next;
        });
      }
    }
  }, [form.cliente_id, form.coleta_usa_endereco_cadastro, form.entrega_usa_endereco_cadastro, clientes, enderecos]);

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

  useEffect(() => {
    calculatePrice();
  }, [distanciaKm, selectedTabelaId, pricingMode, pricePerPoint, form.pontos, form.retorno]);

  const calculatePrice = async () => {
    if (pricingMode === 'Zerar') {
      setForm(prev => ({ ...prev, valor_entrega: '0.00', valor_manual: false }));
      setValorDinamico(true);
      return;
    }

    if (pricingMode === 'Fixo') {
      const basePoints = 2; 
      const extraPoints = form.pontos.length;
      const returnPoint = form.retorno ? 1 : 0;
      const totalPoints = basePoints + extraPoints + returnPoint;
      const price = totalPoints * pricePerPoint;
      setForm(prev => ({ ...prev, valor_entrega: price.toFixed(2), valor_manual: false }));
      setValorDinamico(true);
      return;
    }

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

    let price = 0;
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

    setForm(prev => ({ ...prev, valor_entrega: price.toFixed(2), valor_manual: false }));
    setValorDinamico(true);
  };

  const fetchData = async () => {
    const [c, e, t, m, tp] = await Promise.all([
      supabase.from('clientes').select('*').order('nome_completo'),
      supabase.from('entregadores').select('id, nome_completo, status').eq('status', 'ativo').order('nome_completo'),
      supabase.from('tipo_servicos').select('*').eq('ativo', true).order('nome'),
      supabase.from('modais').select('*').eq('ativo', true).order('tipo'),
      supabase.from('tabelas_precos').select('*').order('nome'),
    ]);
    setClientes((c.data || []) as Cliente[]);
    setEntregadores((e.data || []) as Entregador[]);
    setTipos((t.data || []) as TipoServico[]);
    setModais((m.data || []) as ModalRow[]);
    const tabelas = (tp.data || []) as TabelaPreco[];
    setTabelasPrecos(tabelas);
    if (tabelas.length > 0) setSelectedTabelaId(tabelas[0].id);
  };

  const fetchEnderecos = async (clienteId: string) => {
    const { data } = await supabase.from('cliente_enderecos').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false });
    setEnderecos((data || []) as Endereco[]);
  };

  const pickEntregadorAutomatico = (): string | null => {
    const ativos = entregadores.filter((e) => e.status === 'ativo');
    return ativos.length > 0 ? ativos[0].id : null;
  };

  const handleSubmit = async () => {
    if (!form.cliente_id || !form.modal_tipo) {
      setError('Preencha cliente e modal');
      return;
    }
    setLoading(true);
    setError(null);
    const entregadorEscolhido = form.atribuicao_modo === 'automatica' ? pickEntregadorAutomatico() : (form.entregador_id || null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('nova_entrega')
      .insert({
        cliente_id: form.cliente_id,
        endereco_id: form.endereco_id || null,
        tipo_servico_id: form.tipo_servico_id || null,
        modal_tipo: (form.modal_tipo || null) as ModalRow['tipo'],
        atribuicao_modo: form.atribuicao_modo,
        entregador_id: entregadorEscolhido,
        solicitar_comprovante: form.solicitar_comprovante,
        agendar_em: form.agendar_em ? new Date(form.agendar_em).toISOString() : null,
        valor_manual: form.valor_manual,
        valor_entrega: form.valor_entrega ? Number(form.valor_entrega) : null,
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
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    else {
      if (form.entrega_codigo_pedido) {
        await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('pedidos').insert({
          cliente_id: form.cliente_id,
          endereco_id: form.endereco_id || null,
          numero: form.entrega_codigo_pedido || null,
          item_descricao: null,
          endereco_texto: form.entrega_endereco_texto || null,
          origem: 'manual',
          itens: null,
          valor_total: form.valor_entrega ? Number(form.valor_entrega) : null,
          status: 'criado',
          observacoes: form.observacoes || null,
        });
      }
      setForm({
        cliente_id: '', endereco_id: '', tipo_servico_id: '', modal_tipo: '', atribuicao_modo: 'automatica', entregador_id: '', observacoes: '',
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
          <select value={form.endereco_id} onChange={(e) => setForm({ ...form, endereco_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Endereço</option>
            {enderecos.map((e) => (
              <option key={e.id} value={e.id}>{[e.rua, e.numero, e.bairro].filter(Boolean).join(', ')}</option>
            ))}
          </select>
          <select value={form.tipo_servico_id} onChange={(e) => setForm({ ...form, tipo_servico_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Tipo de serviço</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
          <select value={form.modal_tipo} onChange={(e) => setForm({ ...form, modal_tipo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Modal</option>
            {modais.map((m) => (
              <option key={m.id} value={m.tipo}>{m.tipo}</option>
            ))}
          </select>
          <div className="flex gap-2">
             <input 
               placeholder="Distância (KM)" 
               value={distanciaKm} 
               onChange={(e) => setDistanciaKm(e.target.value)} 
               className="px-3 py-2 border border-slate-300 rounded w-full"
               type="number"
               step="0.1"
             />
             {tabelasPrecos.length > 1 && (
                <select value={selectedTabelaId} onChange={(e) => setSelectedTabelaId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded w-full">
                    {tabelasPrecos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
             )}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-700">Atribuição:</label>
            <select value={form.atribuicao_modo} onChange={(e) => setForm({ ...form, atribuicao_modo: e.target.value as 'manual' | 'automatica' })} className="px-3 py-2 border border-slate-300 rounded">
              <option value="automatica">Automática</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          {form.atribuicao_modo === 'manual' && (
            <select value={form.entregador_id} onChange={(e) => setForm({ ...form, entregador_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
              <option value="">Entregador</option>
              {entregadores.map((d) => (
                <option key={d.id} value={d.id}>{d.nome_completo}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            <input id="solicitar_comprovante" type="checkbox" checked={form.solicitar_comprovante} onChange={(e) => setForm({ ...form, solicitar_comprovante: e.target.checked })} />
            <label htmlFor="solicitar_comprovante" className="text-sm text-slate-700">Solicitar comprovante assinado na entrega</label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:col-span-2">
            <div className="flex items-center gap-2">
              <input id="valor_manual" type="checkbox" checked={form.valor_manual} onChange={(e) => setForm({ ...form, valor_manual: e.target.checked })} />
              <label htmlFor="valor_manual" className="text-sm text-slate-700">Informar Valor Manualmente</label>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input 
                  placeholder="Valor desta entrega" 
                  value={form.valor_entrega} 
                  onChange={(e) => setForm({ ...form, valor_entrega: e.target.value })} 
                  className="px-3 py-2 border border-slate-300 rounded w-full" 
                  disabled={!form.valor_manual} 
                />
                {valorDinamico && !form.valor_manual && (
                  <div className="absolute top-full left-0 right-0 mt-1">
                     <span className="bg-slate-900 text-white text-[10px] px-2 py-1 rounded w-full block text-center">Entrega com valor dinâmico</span>
                  </div>
                )}
              </div>
              <select value={form.tipo_cobranca} onChange={(e) => setForm({ ...form, tipo_cobranca: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
                <option value="fatura">Fatura</option>
                <option value="avista">À vista</option>
                <option value="pix">PIX</option>
                <option value="cartao">Cartão</option>
              </select>
            </div>
          </div>
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
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loading ? 'Criando...' : 'Solicitar'}
          </button>
        </div>
      </div>
      <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-semibold text-slate-900 mb-3">Coleta</div>
        <div className="flex items-center gap-2 mb-3">
          <input id="coleta_mesmo" type="checkbox" checked={form.coleta_usa_endereco_cadastro} onChange={(e) => setForm({ ...form, coleta_usa_endereco_cadastro: e.target.checked })} />
          <label htmlFor="coleta_mesmo" className="text-sm text-slate-700">Usar o mesmo endereço de cadastro</label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input placeholder="Contato" value={form.coleta_contato} onChange={(e) => setForm({ ...form, coleta_contato: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Telefone" value={form.coleta_telefone} onChange={(e) => setForm({ ...form, coleta_telefone: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="CEP" value={form.coleta_cep} onChange={(e) => setForm({ ...form, coleta_cep: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Endereço completo" value={form.coleta_endereco_texto} onChange={(e) => setForm({ ...form, coleta_endereco_texto: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <input placeholder="Complemento" value={form.coleta_complemento} onChange={(e) => setForm({ ...form, coleta_complemento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Observações (Coleta)" value={form.coleta_observacoes} onChange={(e) => setForm({ ...form, coleta_observacoes: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-3" />
        </div>
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
        <div className="text-sm font-semibold text-slate-900 mb-3">Entrega</div>
        <div className="flex items-center gap-2 mb-3">
          <input id="entrega_mesmo" type="checkbox" checked={form.entrega_usa_endereco_cadastro} onChange={(e) => setForm({ ...form, entrega_usa_endereco_cadastro: e.target.checked })} />
          <label htmlFor="entrega_mesmo" className="text-sm text-slate-700">Usar o mesmo endereço de cadastro</label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input placeholder="Contato" value={form.entrega_contato} onChange={(e) => setForm({ ...form, entrega_contato: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Telefone" value={form.entrega_telefone} onChange={(e) => setForm({ ...form, entrega_telefone: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Código do pedido" value={form.entrega_codigo_pedido} onChange={(e) => setForm({ ...form, entrega_codigo_pedido: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Centro de Custo" value={form.entrega_centro_custo} onChange={(e) => setForm({ ...form, entrega_centro_custo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Solicitante" value={form.entrega_solicitante} onChange={(e) => setForm({ ...form, entrega_solicitante: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="CEP" value={form.entrega_cep} onChange={(e) => setForm({ ...form, entrega_cep: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Endereço completo" value={form.entrega_endereco_texto} onChange={(e) => setForm({ ...form, entrega_endereco_texto: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
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
                <input placeholder="CEP" value={p.cep} onChange={(e) => { const v = e.target.value; const arr = [...form.pontos]; arr[idx] = { ...arr[idx], cep: v }; setForm({ ...form, pontos: arr }); }} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Endereço completo" value={p.endereco_texto} onChange={(e) => { const v = e.target.value; const arr = [...form.pontos]; arr[idx] = { ...arr[idx], endereco_texto: v }; setForm({ ...form, pontos: arr }); }} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
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
    </div>
  );
}