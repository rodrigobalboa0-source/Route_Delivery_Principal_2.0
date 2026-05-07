import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { Modal } from '../Modal';
import { Edit, DollarSign, Trash2, ArrowLeft, Info } from 'lucide-react';

type TabelaPreco = Database['public']['Tables']['tabelas_precos']['Row'];
type FaixaPreco = Database['public']['Tables']['tabelas_precos_faixas']['Row'];

function TabelaPrecosDetalhe({ tabela, onBack }: { tabela: TabelaPreco; onBack: () => void }) {
  const [faixas, setFaixas] = useState<FaixaPreco[]>([]);
  const [loading, setLoading] = useState(false);
  const [novoKm, setNovoKm] = useState('');

  useEffect(() => {
    fetchFaixas();
  }, [tabela.id]);

  const fetchFaixas = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tabelas_precos_faixas')
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

    const { error } = await (supabase as any).from('tabelas_precos_faixas').insert({
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

    const { error } = await (supabase as any).from('tabelas_precos_faixas').update({ valor }).eq('id', id);
    if (error) {
      console.error(error);
    } else {
        
        setFaixas(prev => prev.map(f => f.id === id ? { ...f, valor } : f));
    }
  };

  const handleDeleteFaixa = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta faixa?')) return;
    const { error } = await supabase.from('tabelas_precos_faixas').delete().eq('id', id);
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

export function TabelasPrecosPanel() {
  const [tabelas, setTabelas] = useState<TabelaPreco[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTabela, setEditingTabela] = useState<TabelaPreco | null>(null);
  const [view, setView] = useState<'list' | 'detalhe'>('list');
  const [selectedTabela, setSelectedTabela] = useState<TabelaPreco | null>(null);

  const [form, setForm] = useState({
    nome: '',
    tipo_calculo: 'Deslocamento',
    km_adicional: '',
    tipo_retorno: 'Porcentagem',
    valor_retorno: '',
    valor_por_ponto: '',
    valor_minimo: '',
    percentual_sobre_valor: '',
    valor_multiplo_comercio: ''
  });

  useEffect(() => {
    if (view === 'list') {
      fetchTabelas();
    }
  }, [view]);

  const fetchTabelas = async () => {
    setLoading(true);
    const { data } = await supabase.from('tabelas_precos').select('*').order('created_at', { ascending: false });
    setTabelas(data || []);
    setLoading(false);
  };

  const handleOpenModal = (tabela?: TabelaPreco) => {
    if (tabela) {
      setEditingTabela(tabela);
      setForm({
        nome: tabela.nome,
        tipo_calculo: tabela.tipo_calculo || 'Deslocamento',
        km_adicional: tabela.km_adicional?.toString() || '',
        tipo_retorno: tabela.tipo_retorno || 'Porcentagem',
        valor_retorno: tabela.valor_retorno?.toString() || '',
        valor_por_ponto: tabela.valor_por_ponto?.toString() || '',
        valor_minimo: tabela.valor_minimo?.toString() || '',
        percentual_sobre_valor: tabela.percentual_sobre_valor?.toString() || '',
        valor_multiplo_comercio: tabela.valor_multiplo_comercio?.toString() || ''
      });
    } else {
      setEditingTabela(null);
      setForm({
        nome: '',
        tipo_calculo: 'Deslocamento',
        km_adicional: '',
        tipo_retorno: 'Porcentagem',
        valor_retorno: '',
        valor_por_ponto: '',
        valor_minimo: '',
        percentual_sobre_valor: '',
        valor_multiplo_comercio: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome) return alert('Nome é obrigatório');

    const dataToSave = {
      nome: form.nome,
      tipo_calculo: form.tipo_calculo,
      km_adicional: form.km_adicional ? parseFloat(form.km_adicional.replace(',', '.')) : 0,
      tipo_retorno: form.tipo_retorno,
      valor_retorno: form.valor_retorno ? parseFloat(form.valor_retorno.replace(',', '.')) : 0,
      valor_por_ponto: form.valor_por_ponto ? parseFloat(form.valor_por_ponto.replace(',', '.')) : 0,
      valor_minimo: form.valor_minimo ? parseFloat(form.valor_minimo.replace(',', '.')) : 0,
      percentual_sobre_valor: form.percentual_sobre_valor ? parseFloat(form.percentual_sobre_valor.replace(',', '.')) : 0,
      valor_multiplo_comercio: form.valor_multiplo_comercio ? parseFloat(form.valor_multiplo_comercio.replace(',', '.')) : 0
    };

    let error;
    if (editingTabela) {
      ({ error } = await (supabase as any).from('tabelas_precos').update(dataToSave).eq('id', editingTabela.id));
    } else {
      ({ error } = await (supabase as any).from('tabelas_precos').insert(dataToSave));
    }

    if (error) {
      console.error(error);
      alert('Erro ao salvar tabela');
    } else {
      setIsModalOpen(false);
      fetchTabelas();
    }
  };

  if (view === 'detalhe' && selectedTabela) {
    return <TabelaPrecosDetalhe tabela={selectedTabela} onBack={() => { setView('list'); setSelectedTabela(null); }} />;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">Tabelas de preços por Km</h1>
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
                <th className="px-4 py-3">Tipo de cálculo</th>
                <th className="px-4 py-3">Km adicional</th>
                <th className="px-4 py-3">Tipo de retorno</th>
                <th className="px-4 py-3">Valor do retorno</th>
                <th className="px-4 py-3">Valor por ponto</th>
                <th className="px-4 py-3">Valor Múltiplo</th>
                <th className="px-4 py-3 text-center">Precificação</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tabelas.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.nome}</td>
                  <td className="px-4 py-3 text-slate-600">{t.tipo_calculo}</td>
                  <td className="px-4 py-3 text-slate-600">{t.km_adicional?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-600">{t.tipo_retorno}</td>
                  <td className="px-4 py-3 text-slate-600">{t.valor_retorno?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-600">{t.valor_por_ponto?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-600">{t.valor_multiplo_comercio?.toFixed(2) || '0.00'}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => { setSelectedTabela(t); setView('detalhe'); }}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded flex items-center gap-2 mx-auto text-xs font-bold uppercase"
                    >
                      <DollarSign size={14} /> Precificar
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleOpenModal(t)}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded flex items-center gap-2 ml-auto text-xs font-bold uppercase"
                    >
                      <Edit size={14} /> Editar
                    </button>
                  </td>
                </tr>
              ))}
              {tabelas.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
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
        confirmText="Cadastrar tabela"
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
                    <option value="Deslocamento">Deslocamento</option>
                    <option value="Fixo">Fixo</option>
                </select>
            </div>
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Km adicional</label>
                <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500 text-sm">R$</span>
                    <input
                        type="number"
                        value={form.km_adicional}
                        onChange={(e) => setForm({...form, km_adicional: e.target.value})}
                        className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 outline-none text-sm"
                        placeholder="0,00"
                    />
                </div>
            </div>
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de retorno</label>
                <select
                    value={form.tipo_retorno}
                    onChange={(e) => setForm({...form, tipo_retorno: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-sky-500 outline-none text-sm bg-white"
                >
                    <option value="Porcentagem">Porcentagem</option>
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
                    placeholder="0"
                />
            </div>
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Percentual sobre valor destinatário (%)</label>
                <div className="flex">
                    <input
                        type="number"
                        value={form.percentual_sobre_valor}
                        onChange={(e) => setForm({...form, percentual_sobre_valor: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-l focus:ring-1 focus:ring-sky-500 outline-none text-sm"
                        placeholder="%"
                    />
                    <div className="bg-slate-200 px-3 py-2 border border-l-0 border-slate-300 rounded-r text-slate-600 text-sm">%</div>
                </div>
            </div>
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Valor mínimo</label>
                <div className="flex">
                    <input
                        type="number"
                        value={form.valor_minimo}
                        onChange={(e) => setForm({...form, valor_minimo: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-l focus:ring-1 focus:ring-sky-500 outline-none text-sm"
                        placeholder="R$"
                    />
                    <div className="bg-slate-200 px-3 py-2 border border-l-0 border-slate-300 rounded-r text-slate-600 text-sm">R$</div>
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
                        placeholder="R$"
                    />
                    <div className="bg-slate-200 px-3 py-2 border border-l-0 border-slate-300 rounded-r text-slate-600 text-sm">R$</div>
                </div>
            </div>
            <div className="md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">Valor Múltiplo (Comércio)</label>
                <div className="flex">
                    <input
                        type="number"
                        value={form.valor_multiplo_comercio}
                        onChange={(e) => setForm({...form, valor_multiplo_comercio: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-l focus:ring-1 focus:ring-sky-500 outline-none text-sm"
                        placeholder="0.00"
                        step="0.01"
                    />
                    <div className="bg-slate-200 px-3 py-2 border border-l-0 border-slate-300 rounded-r text-slate-600 text-sm">R$</div>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Valor fixo para 2ª entrega em diante (pedidos múltiplos)</p>
            </div>
        </div>
      </Modal>
    </div>
  );
}