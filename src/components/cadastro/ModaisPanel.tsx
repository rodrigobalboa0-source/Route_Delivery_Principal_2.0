import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';

type Modal = Database['public']['Tables']['modais']['Row'];

export function ModaisPanel() {
  const [items, setItems] = useState<Modal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ tipo: '', descricao: '', ativo: true });
  const [editing, setEditing] = useState<Modal | null>(null);
  const [editForm, setEditForm] = useState({ tipo: '', descricao: '', ativo: true });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('modais').select('*').order('tipo');
    if (error) setError(error.message);
    setItems((data || []) as Modal[]);
    setLoading(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('modais').insert({
      tipo: form.tipo as Modal['tipo'],
      descricao: form.descricao || null,
      ativo: form.ativo,
    });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ tipo: '', descricao: '', ativo: true });
    await fetchAll();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('modais').delete().eq('id', id);
    await fetchAll();
  };

  const openEdit = (m: Modal) => {
    setEditing(m);
    setEditForm({ tipo: m.tipo, descricao: m.descricao || '', ativo: Boolean(m.ativo) });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setLoading(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> } } })
      .from('modais')
      .update({ tipo: editForm.tipo as Modal['tipo'], descricao: editForm.descricao || null, ativo: editForm.ativo })
      .eq('id', editing.id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setEditing(null);
    setLoading(false);
    await fetchAll();
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Modais</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Tipo</option>
            <option value="moto">Moto</option>
            <option value="carro">Carro</option>
            <option value="bike">Bike</option>
            <option value="outro">Outro</option>
          </select>
          <input placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <div className="flex items-center gap-2">
            <input id="ativo" type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
            <label htmlFor="ativo" className="text-sm text-slate-700">Ativo</label>
          </div>
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar modal'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Lista de modais</div>
        {loading ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhum modal cadastrado</div>
        ) : (
          <div className="divide-y">
            {items.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{m.tipo}</div>
                  <div className="text-sm text-slate-600">{[m.descricao, m.ativo ? 'ativo' : 'inativo'].filter(Boolean).join(' • ')}</div>
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
      <Modal open={Boolean(editing)} title="Editar modal" onClose={() => setEditing(null)} onConfirm={handleUpdate} confirmDisabled={loading}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={editForm.tipo} onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="moto">Moto</option>
            <option value="carro">Carro</option>
            <option value="bike">Bike</option>
            <option value="outro">Outro</option>
          </select>
          <input placeholder="Descrição" value={editForm.descricao} onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <div className="flex items-center gap-2">
            <input id="ativo_edit" type="checkbox" checked={editForm.ativo} onChange={(e) => setEditForm({ ...editForm, ativo: e.target.checked })} />
            <label htmlFor="ativo_edit" className="text-sm text-slate-700">Ativo</label>
          </div>
        </div>
      </Modal>
    </div>
  );
}