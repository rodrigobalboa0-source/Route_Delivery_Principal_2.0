import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';

type Regra = Database['public']['Tables']['preco_dinamico_entregador']['Row'];
type Entregador = Database['public']['Tables']['entregadores']['Row'];

export function PrecoDinamicoEntregadorPanel() {
  const [items, setItems] = useState<Regra[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ entregador_id: '', multiplicador: '', ativa: true, observacao: '' });
  const [editing, setEditing] = useState<Regra | null>(null);
  const [editForm, setEditForm] = useState({ entregador_id: '', multiplicador: '', ativa: true, observacao: '' });

  useEffect(() => {
    fetchEntregadores();
    fetchAll();
  }, []);

  const fetchEntregadores = async () => {
    const { data } = await supabase.from('entregadores').select('id, nome_completo').order('nome_completo');
    setEntregadores((data || []) as Entregador[]);
  };

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('preco_dinamico_entregador').select('*').order('created_at', { ascending: false });
    if (error) setError(error.message);
    setItems((data || []) as Regra[]);
    setLoading(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('preco_dinamico_entregador').insert({
      entregador_id: form.entregador_id,
      multiplicador: form.multiplicador ? Number(form.multiplicador) : null,
      ativa: form.ativa,
      observacao: form.observacao || null,
    });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ entregador_id: '', multiplicador: '', ativa: true, observacao: '' });
    await fetchAll();
  };

  const toggleActive = async (m: Regra) => {
    setLoading(true);
    const { error } = await supabase
      .from('preco_dinamico_entregador')
      .update({ ativa: !m.ativa })
      .eq('id', m.id);
    
    if (error) {
      setError(error.message);
    }
    setLoading(false);
    await fetchAll();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('preco_dinamico_entregador').delete().eq('id', id);
    await fetchAll();
  };

  const openEdit = (m: Regra) => {
    setEditing(m);
    setEditForm({
      entregador_id: m.entregador_id,
      multiplicador: m.multiplicador != null ? String(m.multiplicador) : '',
      ativa: Boolean(m.ativa),
      observacao: m.observacao || '',
    });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setLoading(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> } } })
      .from('preco_dinamico_entregador')
      .update({
        entregador_id: editForm.entregador_id,
        multiplicador: editForm.multiplicador ? Number(editForm.multiplicador) : null,
        ativa: editForm.ativa,
        observacao: editForm.observacao || null,
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
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Preço dinâmico do entregador</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.entregador_id} onChange={(e) => setForm({ ...form, entregador_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Entregador</option>
            {entregadores.map((e) => (
              <option key={e.id} value={e.id}>{e.nome_completo}</option>
            ))}
          </select>
          <input placeholder="Multiplicador" value={form.multiplicador} onChange={(e) => setForm({ ...form, multiplicador: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Observação" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
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
            {items.map((m) => {
              const ent = entregadores.find(e => e.id === m.entregador_id);
              return (
                <div key={m.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-medium text-slate-900">{ent ? ent.nome_completo : m.entregador_id}</div>
                    <div className="text-sm text-slate-600">{[
                      m.multiplicador != null ? `x${m.multiplicador}` : '',
                      m.observacao || '',
                      m.ativa ? 'ativa' : 'inativa',
                    ].filter(Boolean).join(' • ')}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleActive(m)} className={`text-sm ${m.ativa ? 'text-amber-600' : 'text-green-600'}`}>
                      {m.ativa ? 'Desativar' : 'Ativar'}
                    </button>
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
          <select value={editForm.entregador_id} onChange={(e) => setEditForm({ ...editForm, entregador_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Entregador</option>
            {entregadores.map((e) => (
              <option key={e.id} value={e.id}>{e.nome_completo}</option>
            ))}
          </select>
          <input placeholder="Multiplicador" value={editForm.multiplicador} onChange={(e) => setEditForm({ ...editForm, multiplicador: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Observação" value={editForm.observacao} onChange={(e) => setEditForm({ ...editForm, observacao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <div className="flex items-center gap-2">
            <input id="ativa_edit_entregador" type="checkbox" checked={editForm.ativa} onChange={(e) => setEditForm({ ...editForm, ativa: e.target.checked })} />
            <label htmlFor="ativa_edit_entregador" className="text-sm text-slate-700">Ativa</label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
