import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { Modal } from '../Modal';
import { Edit, DollarSign, Trash2, ArrowLeft, Info, X } from 'lucide-react';

type TabelaComissao = Database['public']['Tables']['tabelas_comissoes']['Row'];
type FaixaComissao = Database['public']['Tables']['tabelas_comissoes_faixas']['Row'];
type Cliente = { id: string; nome_completo: string };

function TabelaComissoesDetalhe({ tabela, onBack }: { tabela: TabelaComissao; onBack: () => void }) {
  const [faixas, setFaixas] = useState<FaixaComissao[]>([]);
  const [loading, setLoading] = useState(false);
  const [novoKm, setNovoKm] = useState('');

  useEffect(() => {
    fetchFaixas();
  }, [tabela.id]);

  const fetchFaixas = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tabelas_comissoes_faixas')
      .select('*')
      .eq('tabela_id', tabela.id)
      .order('km_ate', { ascending: true });
    setFaixas(data || []);
    setLoading(false);
  };

  const handleAddFaixa = async () => {
    if (!novoKm) return;
    const km = parseFloat(novoKm.replace(',', '.'));
    if (isNaN(km)) return;

 
    if (faixas.some(f => f.km_ate === km)) {
      alert('Já existe uma faixa com essa quilometragem.');
      return;
    }

    const { error } = await (supabase as any).from('tabelas_comissoes_faixas').insert({
      tabela_id: tabela.id,
      km_ate: km,
      valor: 0
    });

    if (error) {
      console.error(error);
      alert('Erro ao adicionar faixa');
    } else {
      setNovoKm('');
      fetchFaixas();
    }
  };

  const handleUpdateValor = async (id: string, valorStr: string) => {
    const valor = parseFloat(valorStr.replace(',', '.'));
    if (isNaN(valor)) return;

    const { error } = await (supabase as any).from('tabelas_comissoes_faixas').update({ valor }).eq('id', id);
    if (error) {
      console.error(error);
    } else {
  
        setFaixas(prev => prev.map(f => f.id === id ? { ...f, valor } : f));
    }
  };

  const handleDeleteFaixa = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta faixa?')) return;
    const { error } = await supabase.from('tabelas_comissoes_faixas').delete().eq('id', id);
    if (error) {
      console.error(error);
      alert('Erro ao excluir faixa');
    } else {
      fetchFaixas();
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800">
          Cadastro de preços - {tabela.nome}
        </h2>
        <button
          onClick={onBack}
          className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={16} />
          Listagem de tabelas
        </button>
      </div>

      <div className="mb-8">
        <label className="block text-sm font-medium text-slate-700 mb-1">Adicionar distância(s)</label>
        <div className="flex gap-2 max-w-xs">
          <input
            type="number"
            value={novoKm}
            onChange={(e) => setNovoKm(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            placeholder="KM"
          />
          <button
            onClick={handleAddFaixa}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium text-sm"
          >
            Adicionar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {faixas.map((faixa) => (
          <div key={faixa.id} className="flex items-center gap-3 bg-white p-3 rounded shadow-sm border border-slate-200">
            <span className="text-sm font-bold text-slate-700 whitespace-nowrap w-24">Até {faixa.km_ate} KM:</span>
            <input
              type="number"
              defaultValue={faixa.valor}
              onBlur={(e) => handleUpdateValor(faixa.id, e.target.value)}
              className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm w-24"
              step="0.01"
            />
            <button
              onClick={() => handleDeleteFaixa(faixa.id)}
              className="p-2 text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      
      {faixas.length === 0 && !loading && (
        <div className="text-center text-slate-500 py-10">Nenhuma faixa de preço cadastrada.</div>
      )}
    </div>
  );
}

export function TabelasComissoesPanel() {
  const [tabelas, setTabelas] = useState<TabelaComissao[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTabela, setEditingTabela] = useState<TabelaComissao | null>(null);
  const [view, setView] = useState<'list' | 'detalhe'>('list');
  const [selectedTabela, setSelectedTabela] = useState<TabelaComissao | null>(null);
  
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState('');

  const [form, setForm] = useState({
    nome: '',
    tipo_calculo: 'Distância',
    valor_por_ponto: '',
    tipo_retorno: 'Percentual',
    valor_retorno: '',
    valor_adicional_entregador: '',
    aplicar_adicional_primeira_entrega: false
  });

  useEffect(() => {
    if (view === 'list') {
      fetchTabelas();
    }
    fetchClientes();
  }, [view]);

  const fetchTabelas = async () => {
    setLoading(true);
    const { data } = await supabase.from('tabelas_comissoes').select('*').order('created_at', { ascending: false });
    setTabelas(data || []);
    setLoading(false);
  };

  const fetchClientes = async () => {
    const { data } = await supabase.from('clientes').select('id, nome_completo').order('nome_completo');
    if (data) setClientes(data);
  };

  const handleOpenModal = (tabela?: TabelaComissao) => {
    if (tabela) {
      setEditingTabela(tabela);
      setForm({
        nome: tabela.nome,
        tipo_calculo: tabela.tipo_calculo || 'Distância',
        valor_por_ponto: tabela.valor_por_ponto?.toString() || '',
        tipo_retorno: tabela.tipo_retorno || 'Percentual',
        valor_retorno: tabela.valor_retorno?.toString() || '',
        valor_adicional_entregador: tabela.valor_adicional_entregador?.toString() || '',
        aplicar_adicional_primeira_entrega: tabela.aplicar_adicional_primeira_entrega || false
      });
      setSelectedClientIds(tabela.cliente_ids || []);
    } else {
      setEditingTabela(null);
      setForm({
        nome: '',
        tipo_calculo: 'Distância',
        valor_por_ponto: '',
        tipo_retorno: 'Percentual',
        valor_retorno: '',
        valor_adicional_entregador: '',
        aplicar_adicional_primeira_entrega: false
      });
      setSelectedClientIds([]);
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome) return alert('Nome é obrigatório');

    const dataToSave = {
      nome: form.nome,
      tipo_calculo: form.tipo_calculo,
      valor_por_ponto: form.valor_por_ponto ? parseFloat(form.valor_por_ponto.replace(',', '.')) : 0,
      tipo_retorno: form.tipo_retorno,
      valor_retorno: form.valor_retorno ? parseFloat(form.valor_retorno.replace(',', '.')) : 0,
      valor_adicional_entregador: form.valor_adicional_entregador ? parseFloat(form.valor_adicional_entregador.replace(',', '.')) : 0,
      aplicar_adicional_primeira_entrega: form.aplicar_adicional_primeira_entrega,
      cliente_ids: selectedClientIds,
      ativo: editingTabela?.ativo ?? true
    };

    let error;
    if (editingTabela) {
      ({ error } = await (supabase as any).from('tabelas_comissoes').update(dataToSave).eq('id', editingTabela.id));
    } else {
      ({ error } = await (supabase as any).from('tabelas_comissoes').insert(dataToSave));
    }

    if (error) {
      console.error(error);
      alert('Erro ao salvar tabela');
    } else {
      setIsModalOpen(false);
      fetchTabelas();
    }
  };

  const handleToggleAtivo = async (tabela: TabelaComissao) => {
    const current = tabela.ativo ?? true;
    const { error } = await (supabase as any)
      .from('tabelas_comissoes')
      .update({ ativo: !current })
      .eq('id', tabela.id);
    if (error) {
      console.error(error);
      alert('Erro ao atualizar status da tabela');
      return;
    }
    setTabelas(prev => prev.map(t => t.id === tabela.id ? { ...t, ativo: !current } : t));
  };

  const handleDeleteTabela = async (tabela: TabelaComissao) => {
    if (!confirm(`Excluir a tabela "${tabela.nome}"? Essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('tabelas_comissoes').delete().eq('id', tabela.id);
    if (error) {
      console.error(error);
      alert('Erro ao excluir tabela');
      return;
    }
    setTabelas(prev => prev.filter(t => t.id !== tabela.id));
  };

  const toggleClient = (id: string) => {
    if (selectedClientIds.includes(id)) {
      setSelectedClientIds(prev => prev.filter(cid => cid !== id));
    } else {
      setSelectedClientIds(prev => [...prev, id]);
    }
    setClientSearch('');
  };

  const filteredClientes = clientes.filter(c => 
    c.nome_completo.toLowerCase().includes(clientSearch.toLowerCase()) && 
    !selectedClientIds.includes(c.id)
  );

  if (view === 'detalhe' && selectedTabela) {
    return <TabelaComissoesDetalhe tabela={selectedTabela} onBack={() => { setView('list'); setSelectedTabela(null); }} />;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">Tabelas de comissões</h1>
            <span className="bg-sky-600 text-white text-xs px-2 py-0.5 rounded">Manual</span>
            <Info size={16} className="text-slate-500 cursor-help" />
        </div>
        <div className="flex gap-2">
          <button className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded text-sm font-medium">
            Cadastrar distâncias
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded text-sm font-medium"
          >
            Cadastrar Tabela
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900 text-white uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Valor por ponto</th>
                <th className="px-4 py-3">Adicional Entregador</th>
                <th className="px-4 py-3 text-center">Precificação</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tabelas.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <span>{t.nome}</span>
                      {(t.ativo ?? true) ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded">Ativa</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wide bg-slate-200 text-slate-700 px-2 py-0.5 rounded">Inativa</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{t.valor_por_ponto?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-600">{t.valor_adicional_entregador?.toFixed(2) || '0.00'}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => { setSelectedTabela(t); setView('detalhe'); }}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded flex items-center gap-2 mx-auto text-xs font-bold uppercase"
                    >
                      <DollarSign size={14} /> Precificar
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggleAtivo(t)}
                        className={`px-3 py-1.5 rounded text-xs font-bold uppercase ${
                          (t.ativo ?? true)
                            ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        {(t.ativo ?? true) ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => handleOpenModal(t)}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded flex items-center gap-2 text-xs font-bold uppercase"
                      >
                        <Edit size={14} /> Editar
                      </button>
                      <button
                        onClick={() => handleDeleteTabela(t)}
                        className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded flex items-center gap-2 text-xs font-bold uppercase"
                      >
                        <Trash2 size={14} /> Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tabelas.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Nenhuma tabela cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        title={editingTabela ? 'Editar tabela' : 'Adicionar tabela'}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleSave}
        confirmText={editingTabela ? 'Salvar alterações' : 'Cadastrar Tabela'}
        maxWidth="max-w-4xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome da tabela</label>
                <input
                    value={form.nome}
                    onChange={(e) => setForm({...form, nome: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 outline-none text-sm"
                    placeholder="Nome"
                />
            </div>
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de cálculo</label>
                <select
                    value={form.tipo_calculo}
                    onChange={(e) => setForm({...form, tipo_calculo: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 outline-none text-sm bg-white"
                >
                    <option value="Distância">Distância</option>
                    <option value="Fixo">Fixo</option>
                </select>
            </div>
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Selecione os Clientes</label>
                <div className="relative">
                    <div className="flex flex-wrap gap-1 p-1 border border-slate-300 rounded bg-white min-h-[38px]">
                        {selectedClientIds.map(id => {
                            const client = clientes.find(c => c.id === id);
                            return client ? (
                                <span key={id} className="bg-slate-200 text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                                    {client.nome_completo}
                                    <button onClick={() => toggleClient(id)} className="hover:text-red-500"><X size={12} /></button>
                                </span>
                            ) : null;
                        })}
                        <input 
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                            placeholder={selectedClientIds.length === 0 ? "Buscar cliente..." : ""}
                            className="flex-1 outline-none text-sm min-w-[60px]"
                        />
                    </div>
                    {clientSearch && (
                        <div className="absolute z-10 w-full bg-white border border-slate-200 rounded shadow-lg max-h-40 overflow-y-auto mt-1">
                            {filteredClientes.map(c => (
                                <div 
                                    key={c.id} 
                                    className="px-3 py-2 hover:bg-slate-100 cursor-pointer text-sm"
                                    onClick={() => toggleClient(c.id)}
                                >
                                    {c.nome_completo}
                                </div>
                            ))}
                            {filteredClientes.length === 0 && (
                                <div className="px-3 py-2 text-slate-500 text-sm">Nenhum cliente encontrado</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Valor por ponto</label>
                <div className="flex">
                    <input
                        type="number"
                        value={form.valor_por_ponto}
                        onChange={(e) => setForm({...form, valor_por_ponto: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-l focus:ring-1 focus:ring-sky-500 outline-none text-sm"
                        placeholder="0.00"/>
                    <div className="bg-slate-200 px-3 py-2 border border-l-0 border-slate-300 rounded-r text-slate-600 text-sm">R$</div>
                </div>
            </div>
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de retorno</label>
                <select
                    value={form.tipo_retorno}
                    onChange={(e) => setForm({...form, tipo_retorno: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 outline-none text-sm bg-white"
                >
                    <option value="Percentual">Percentual</option>
                    <option value="Valor Fixo">Valor Fixo</option>
                </select>
            </div>
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Retorno</label>
                <input
                    type="number"
                    value={form.valor_retorno}
                    onChange={(e) => setForm({...form, valor_retorno: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 outline-none text-sm"
                    placeholder="0.00"
                />
            </div>
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Adicional Entregador</label>
                <div className="flex">
                    <input
                        type="number"
                        value={form.valor_adicional_entregador}
                        onChange={(e) => setForm({...form, valor_adicional_entregador: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-l focus:ring-1 focus:ring-sky-500 outline-none text-sm"
                        placeholder="0.00"
                        step="0.01"
                    />
                    <div className="bg-slate-200 px-3 py-2 border border-l-0 border-slate-300 rounded-r text-slate-600 text-sm">R$</div>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Adicional para 2ª entrega em diante (soma ao valor base)</p>
            </div>
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Promoção</label>
                <div className="flex items-center gap-2 mt-2">
                    <input
                        type="checkbox"
                        id="aplicar_adicional_primeira_entrega"
                        checked={form.aplicar_adicional_primeira_entrega}
                        onChange={(e) => setForm({...form, aplicar_adicional_primeira_entrega: e.target.checked})}
                        className="w-4 h-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500"
                    />
                    <label htmlFor="aplicar_adicional_primeira_entrega" className="text-xs text-slate-600">
                        Aplicar adicional desde a 1ª entrega
                    </label>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Se ativo, todas as entregas recebem o adicional (promoção)</p>
            </div>
        </div>
      </Modal>
    </div>
  );
}
