import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';

type Regra = Database['public']['Tables']['preco_dinamico_demanda']['Row'];

export function PrecoDinamicoDemandaPanel() {
  const [items, setItems] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: '', valor: '', tipo: 'MULTIPLICADOR', ativa: true });
  const [editing, setEditing] = useState<Regra | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', valor: '', tipo: 'MULTIPLICADOR', ativa: true });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('preco_dinamico_demanda').select('*').order('nome');
    if (error) setError(error.message);
    setItems((data || []) as Regra[]);
    setLoading(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    
    const criterio = form.tipo; 
    const multiplicador = form.valor ? Number(form.valor.replace(',', '.')) : null;

    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('preco_dinamico_demanda').insert({
      nome: form.nome || null,
      multiplicador: multiplicador,
      criterio: criterio,
      ativa: form.ativa,
    });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ nome: '', valor: '', tipo: 'MULTIPLICADOR', ativa: true });
    await fetchAll();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('preco_dinamico_demanda').delete().eq('id', id);
    await fetchAll();
  };

  const openEdit = (m: Regra) => {
    setEditing(m);
    
    const tipo = (m.criterio === 'TAXA_FIXA' || m.criterio === 'MULTIPLICADOR') ? m.criterio : 'MULTIPLICADOR';
    
    setEditForm({ 
      nome: m.nome || '', 
      valor: m.multiplicador != null ? String(m.multiplicador) : '', 
      tipo: tipo, 
      ativa: Boolean(m.ativa) 
    });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setLoading(true);
    setError(null);

    const criterio = editForm.tipo;
    const multiplicador = editForm.valor ? Number(editForm.valor.replace(',', '.')) : null;

    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> } } })
      .from('preco_dinamico_demanda')
      .update({ 
        nome: editForm.nome || null, 
        multiplicador: multiplicador, 
        criterio: criterio, 
        ativa: editForm.ativa 
      })
      .eq('id', editing.id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setEditing(null);
    setLoading(false);
    await fetchAll();
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Preço dinâmico (demanda)</h2>
      <p className="text-slate-500 mb-4 text-sm">Configure regras para aumentar o valor da entrega em situações específicas (ex: Chuva, Alta Demanda).</p>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Nome da Regra</label>
            <input placeholder="Ex: Taxa de Chuva" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de Aplicação</label>
            <select 
              value={form.tipo} 
              onChange={(e) => setForm({ ...form, tipo: e.target.value })} 
              className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
            >
              <option value="MULTIPLICADOR">Multiplicador (x)</option>
              <option value="TAXA_FIXA">Valor Fixo (+ R$)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {form.tipo === 'MULTIPLICADOR' ? 'Fator Multiplicador' : 'Valor Adicional (R$)'}
            </label>
            <input 
              placeholder={form.tipo === 'MULTIPLICADOR' ? "Ex: 1.5 para +50%" : "Ex: 5.00"} 
              type="number"
              step="0.1"
              value={form.valor} 
              onChange={(e) => setForm({ ...form, valor: e.target.value })} 
              className="w-full px-3 py-2 border border-slate-300 rounded" 
            />
          </div>

          <div className="flex items-center gap-2 md:col-span-2 mt-2">
            <input id="ativa" type="checkbox" checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} />
            <label htmlFor="ativa" className="text-sm text-slate-700">Regra Ativa</label>
          </div>
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar regra'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Lista de regras</div>
        {loading ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhuma regra cadastrada</div>
        ) : (
          <div className="divide-y">
            {items.map((m) => {
              const isFixed = m.criterio === 'TAXA_FIXA';
              const displayValue = isFixed 
                ? `+ R$ ${Number(m.multiplicador).toFixed(2)}` 
                : `x ${m.multiplicador}`;
                
              return (
                <div key={m.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-medium text-slate-900">{m.nome || 'Sem nome'}</div>
                    <div className="text-sm text-slate-600 flex gap-2 items-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${isFixed ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                        {displayValue}
                      </span>
                      <span className={`text-xs ${m.ativa ? 'text-green-600' : 'text-slate-400'}`}>
                        {m.ativa ? '• Ativa' : '• Inativa'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => openEdit(m)} className="text-sm text-sky-700">Editar</button>
                    <button onClick={() => handleDelete(m.id)} className="text-sm text-red-700">Excluir</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Modal open={Boolean(editing)} title="Editar regra" onClose={() => setEditing(null)} onConfirm={handleUpdate} confirmDisabled={loading}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Nome da Regra</label>
            <input placeholder="Nome" value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de Aplicação</label>
            <select 
              value={editForm.tipo} 
              onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })} 
              className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
            >
              <option value="MULTIPLICADOR">Multiplicador (x)</option>
              <option value="TAXA_FIXA">Valor Fixo (+ R$)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {editForm.tipo === 'MULTIPLICADOR' ? 'Fator Multiplicador' : 'Valor Adicional (R$)'}
            </label>
            <input 
              placeholder="Valor" 
              type="number"
              step="0.1"
              value={editForm.valor} 
              onChange={(e) => setEditForm({ ...editForm, valor: e.target.value })} 
              className="w-full px-3 py-2 border border-slate-300 rounded" 
            />
          </div>
          
          <div className="flex items-center gap-2 md:col-span-2 mt-2">
            <input id="ativa_edit_demanda" type="checkbox" checked={editForm.ativa} onChange={(e) => setEditForm({ ...editForm, ativa: e.target.checked })} />
            <label htmlFor="ativa_edit_demanda" className="text-sm text-slate-700">Regra Ativa</label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
