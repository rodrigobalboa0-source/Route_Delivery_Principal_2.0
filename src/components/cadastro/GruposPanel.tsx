import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';

type Grupo = Database['public']['Tables']['grupos_operacionais']['Row'];
type UserRow = Database['public']['Tables']['users']['Row'];

export function GruposPanel() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    tipo_funcao: '',
    responsavel_user_id: '',
    permissoes: '',
    regras_internas: '',
    limite_permissoes: '',
  });
  const [editing, setEditing] = useState<Grupo | null>(null);
  const [editForm, setEditForm] = useState({
    nome: '',
    descricao: '',
    tipo_funcao: '',
    responsavel_user_id: '',
    permissoes: '',
    regras_internas: '',
    limite_permissoes: '',
  });

  useEffect(() => {
    fetchUsers();
    fetchGrupos();
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase.from('users').select('id, full_name').order('full_name');
    setUsers((data || []) as UserRow[]);
  };

  const fetchGrupos = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('grupos_operacionais').select('*').order('nome');
    if (error) setError(error.message);
    setGrupos(data || []);
    setLoading(false);
  };

  const parseJson = (s: string) => {
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    const res = await sbInsert('grupos_operacionais', {
      nome: form.nome,
      descricao: form.descricao || null,
      tipo_funcao: (form.tipo_funcao || null) as Grupo['tipo_funcao'],
      responsavel_user_id: form.responsavel_user_id || null,
      permissoes: parseJson(form.permissoes),
      regras_internas: form.regras_internas || null,
      limite_permissoes: parseJson(form.limite_permissoes),
    });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ nome: '', descricao: '', tipo_funcao: '', responsavel_user_id: '', permissoes: '', regras_internas: '', limite_permissoes: '' });
    await fetchGrupos();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('grupos_operacionais').delete().eq('id', id);
    await fetchGrupos();
  };

  const openEdit = (g: Grupo) => {
    setEditing(g);
    setEditForm({
      nome: g.nome,
      descricao: g.descricao || '',
      tipo_funcao: g.tipo_funcao || '',
      responsavel_user_id: g.responsavel_user_id || '',
      permissoes: g.permissoes ? JSON.stringify(g.permissoes) : '',
      regras_internas: g.regras_internas || '',
      limite_permissoes: g.limite_permissoes ? JSON.stringify(g.limite_permissoes) : '',
    });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setLoading(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> } } })
      .from('grupos_operacionais')
      .update({
        nome: editForm.nome,
        descricao: editForm.descricao || null,
        tipo_funcao: (editForm.tipo_funcao || null) as Grupo['tipo_funcao'],
        responsavel_user_id: editForm.responsavel_user_id || null,
        permissoes: parseJson(editForm.permissoes),
        regras_internas: editForm.regras_internas || null,
        limite_permissoes: parseJson(editForm.limite_permissoes),
      })
      .eq('id', editing.id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setEditing(null);
    setLoading(false);
    await fetchGrupos();
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Grupos operacionais</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Nome do grupo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <select value={form.tipo_funcao} onChange={(e) => setForm({ ...form, tipo_funcao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Tipo de função</option>
            <option value="operacional">Operacional</option>
            <option value="administrativo">Administrativo</option>
            <option value="logistica">Logística</option>
          </select>
          <input placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <select value={form.responsavel_user_id} onChange={(e) => setForm({ ...form, responsavel_user_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Responsável</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || ''}</option>
            ))}
          </select>
          <input placeholder="Permissões" value={form.permissoes} onChange={(e) => setForm({ ...form, permissoes: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <input placeholder="Limite de permissões" value={form.limite_permissoes} onChange={(e) => setForm({ ...form, limite_permissoes: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <input placeholder="Regras internas" value={form.regras_internas} onChange={(e) => setForm({ ...form, regras_internas: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar grupo'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Lista de grupos</div>
        {loading ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : grupos.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhum grupo cadastrado</div>
        ) : (
          <div className="divide-y">
            {grupos.map((g) => (
              <div key={g.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{g.nome}</div>
                  <div className="text-sm text-slate-600">{[g.tipo_funcao, g.descricao].filter(Boolean).join(' • ')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => openEdit(g)} className="text-sm text-sky-700">Editar</button>
                  <button onClick={() => handleDelete(g.id)} className="text-sm text-red-700">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Modal
        open={Boolean(editing)}
        title="Editar grupo"
        onClose={() => setEditing(null)}
        onConfirm={handleUpdate}
        confirmDisabled={loading}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Nome" value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <select value={editForm.tipo_funcao} onChange={(e) => setEditForm({ ...editForm, tipo_funcao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Tipo de função</option>
            <option value="operacional">Operacional</option>
            <option value="administrativo">Administrativo</option>
            <option value="logistica">Logística</option>
          </select>
          <input placeholder="Descrição" value={editForm.descricao} onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <select value={editForm.responsavel_user_id} onChange={(e) => setEditForm({ ...editForm, responsavel_user_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Responsável</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || ''}</option>
            ))}
          </select>
          <input placeholder="Permissões" value={editForm.permissoes} onChange={(e) => setEditForm({ ...editForm, permissoes: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <input placeholder="Limite de permissões" value={editForm.limite_permissoes} onChange={(e) => setEditForm({ ...editForm, limite_permissoes: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <input placeholder="Regras internas" value={editForm.regras_internas} onChange={(e) => setEditForm({ ...editForm, regras_internas: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
        </div>
      </Modal>
  </div>
);
}
  const sbInsert = (table: string, values: unknown) => (supabase as unknown as { from: (rel: string) => { insert: (vals: unknown) => Promise<unknown> } }).from(table).insert(values);
