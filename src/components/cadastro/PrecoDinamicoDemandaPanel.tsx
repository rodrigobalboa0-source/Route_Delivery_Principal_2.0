import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';

type Regra = Database['public']['Tables']['preco_dinamico_demanda']['Row'];

export function PrecoDinamicoDemandaPanel() {
  const [items, setItems] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: '', multiplicador: '', criterio: '', ativa: true });
  const [editing, setEditing] = useState<Regra | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', multiplicador: '', criterio: '', ativa: true });

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
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('preco_dinamico_demanda').insert({
      nome: form.nome || null,
      multiplicador: form.multiplicador ? Number(form.multiplicador) : null,
      criterio: form.criterio || null,
      ativa: form.ativa,
    });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ nome: '', multiplicador: '', criterio: '', ativa: true });
    await fetchAll();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('preco_dinamico_demanda').delete().eq('id', id);
    await fetchAll();
  };

  const openEdit = (m: Regra) => {
    setEditing(m);
    setEditForm({ nome: m.nome || '', multiplicador: m.multiplicador != null ? String(m.multiplicador) : '', criterio: m.criterio || '', ativa: Boolean(m.ativa) });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setLoading(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> } } })
      .from('preco_dinamico_demanda')
      .update({ nome: editForm.nome || null, multiplicador: editForm.multiplicador ? Number(editForm.multiplicador) : null, criterio: editForm.criterio || null, ativa: editForm.ativa })
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
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Multiplicador" value={form.multiplicador} onChange={(e) => setForm({ ...form, multiplicador: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Critério" value={form.criterio} onChange={(e) => setForm({ ...form, criterio: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <div className="flex items-center gap-2">
            <input id="ativa" type="checkbox" checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} />
            <label htmlFor="ativa" className="text-sm text-slate-700">Ativa</label>
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
            {items.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{m.nome || ''}</div>
                  <div className="text-sm text-slate-600">{[
                    m.multiplicador != null ? `x${m.multiplicador}` : '',
                    m.criterio || '',
                    m.ativa ? 'ativa' : 'inativa',
                  ].filter(Boolean).join(' • ')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => openEdit(m)} className="text-sm text-sky-700">Editar</button>
                  <button onClick={() => handleDelete(m.id)} className="text-sm text-red-700">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Modal open={Boolean(editing)} title="Editar regra" onClose={() => setEditing(null)} onConfirm={handleUpdate} confirmDisabled={loading}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Nome" value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Multiplicador" value={editForm.multiplicador} onChange={(e) => setEditForm({ ...editForm, multiplicador: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Critério" value={editForm.criterio} onChange={(e) => setEditForm({ ...editForm, criterio: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <div className="flex items-center gap-2">
            <input id="ativa_edit_demanda" type="checkbox" checked={editForm.ativa} onChange={(e) => setEditForm({ ...editForm, ativa: e.target.checked })} />
            <label htmlFor="ativa_edit_demanda" className="text-sm text-slate-700">Ativa</label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
