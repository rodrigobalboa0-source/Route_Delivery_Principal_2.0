import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';

type Servico = Database['public']['Tables']['servicos_opcionais']['Row'];

export function ServicosOpcionaisPanel() {
  const [items, setItems] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: '', descricao: '', valor_adicional: '', ativo: true });
  const [editing, setEditing] = useState<Servico | null>(null);
  const [editForm, setEditForm] = useState({ nome: '', descricao: '', valor_adicional: '', ativo: true });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('servicos_opcionais').select('*').order('nome');
    if (error) setError(error.message);
    setItems((data || []) as Servico[]);
    setLoading(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('servicos_opcionais').insert({
      nome: form.nome || null,
      descricao: form.descricao || null,
      valor_adicional: form.valor_adicional ? Number(form.valor_adicional) : null,
      ativo: form.ativo,
    });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ nome: '', descricao: '', valor_adicional: '', ativo: true });
    await fetchAll();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('servicos_opcionais').delete().eq('id', id);
    await fetchAll();
  };

  const openEdit = (m: Servico) => {
    setEditing(m);
    setEditForm({ nome: m.nome || '', descricao: m.descricao || '', valor_adicional: m.valor_adicional != null ? String(m.valor_adicional) : '', ativo: Boolean(m.ativo) });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setLoading(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> } } })
      .from('servicos_opcionais')
      .update({ nome: editForm.nome || null, descricao: editForm.descricao || null, valor_adicional: editForm.valor_adicional ? Number(editForm.valor_adicional) : null, ativo: editForm.ativo })
      .eq('id', editing.id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setEditing(null);
    setLoading(false);
    await fetchAll();
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Serviços opcionais</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Valor adicional" value={form.valor_adicional} onChange={(e) => setForm({ ...form, valor_adicional: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <div className="flex items-center gap-2">
            <input id="ativo" type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
            <label htmlFor="ativo" className="text-sm text-slate-700">Ativo</label>
          </div>
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar serviço'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Lista de serviços</div>
        {loading ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhum serviço cadastrado</div>
        ) : (
          <div className="divide-y">
            {items.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{m.nome || ''}</div>
                  <div className="text-sm text-slate-600">{[
                    m.valor_adicional != null ? `+${m.valor_adicional}` : '',
                    m.descricao || '',
                    m.ativo ? 'ativo' : 'inativo',
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
      <Modal open={Boolean(editing)} title="Editar serviço" onClose={() => setEditing(null)} onConfirm={handleUpdate} confirmDisabled={loading}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Nome" value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Valor adicional" value={editForm.valor_adicional} onChange={(e) => setEditForm({ ...editForm, valor_adicional: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Descrição" value={editForm.descricao} onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <div className="flex items-center gap-2">
            <input id="ativo_edit_serv" type="checkbox" checked={editForm.ativo} onChange={(e) => setEditForm({ ...editForm, ativo: e.target.checked })} />
            <label htmlFor="ativo_edit_serv" className="text-sm text-slate-700">Ativo</label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
