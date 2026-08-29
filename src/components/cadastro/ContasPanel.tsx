import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';

type Conta = Database['public']['Tables']['contas_gerenciais']['Row'];

function sha256(s: string) {
  const enc = new TextEncoder();
  const data = enc.encode(s);
  return crypto.subtle.digest('SHA-256', data).then((buf) => {
    const arr = Array.from(new Uint8Array(buf));
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  });
}

export function ContasPanel() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Conta | null>(null);
  const [editForm, setEditForm] = useState({
    nome_completo: '',
    cargo: '',
    email_acesso: '',
    telefone: '',
    usuario_login: '',
    senha: '',
    nivel_permissao: 'operacional',
    status: 'ativa',
  });
  const [form, setForm] = useState({
    nome_completo: '',
    cargo: '',
    email_acesso: '',
    telefone: '',
    usuario_login: '',
    senha: '',
    nivel_permissao: 'operacional',
    status: 'ativa',
  });

  useEffect(() => {
    fetchContas();
  }, []);

  const fetchContas = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('contas_gerenciais').select('*').order('nome_completo');
    if (error) setError(error.message);
    setContas(data || []);
    setLoading(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    // Provisiona a conta de verdade (auth.users + public.users role='operador' +
    // contas_gerenciais) via RPC SECURITY DEFINER. O INSERT direto de antes só
    // gravava contas_gerenciais com um hash SHA-256 que o login nunca lê.
    const { error } = await supabase.rpc('cadastrar_conta_gerencial', {
      payload: {
        nome_completo: form.nome_completo || null,
        cargo: form.cargo || null,
        email_acesso: form.email_acesso || null,
        telefone: form.telefone || null,
        usuario_login: form.usuario_login || null,
        senha: form.senha,
        nivel_permissao: form.nivel_permissao,
        status: form.status,
      },
    });
    if (error) {
      setError(error.message || 'Falha ao criar conta.');
      setLoading(false);
      return;
    }
    setForm({ nome_completo: '', cargo: '', email_acesso: '', telefone: '', usuario_login: '', senha: '', nivel_permissao: 'operacional', status: 'ativa' });
    await fetchContas();
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('contas_gerenciais').delete().eq('id', id);
    await fetchContas();
  };

  const openEdit = (c: Conta) => {
    setEditing(c);
    setEditForm({
      nome_completo: c.nome_completo,
      cargo: c.cargo || '',
      email_acesso: c.email_acesso || '',
      telefone: c.telefone || '',
      usuario_login: c.usuario_login || '',
      senha: '',
      nivel_permissao: (c.nivel_permissao || 'operacional') as string,
      status: (c.status || 'ativa') as string,
    });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setLoading(true);
    setError(null);
    const senha_hash = editForm.senha ? await sha256(editForm.senha) : undefined;
    const updateVals: Record<string, unknown> = {
      nome_completo: editForm.nome_completo,
      cargo: editForm.cargo || null,
      email_acesso: editForm.email_acesso || null,
      telefone: editForm.telefone || null,
      usuario_login: editForm.usuario_login || null,
      nivel_permissao: editForm.nivel_permissao as Conta['nivel_permissao'],
      status: editForm.status as Conta['status'],
    };
    if (senha_hash) updateVals.senha_hash = senha_hash;
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> } } })
      .from('contas_gerenciais')
      .update(updateVals)
      .eq('id', editing.id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setEditing(null);
    setLoading(false);
    await fetchContas();
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Contas gerenciais</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-700">Nome completo</label>
            <input value={form.nome_completo} onChange={(e) => setForm({ ...form, nome_completo: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Cargo / Função</label>
            <input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Email de acesso</label>
            <input type="email" value={form.email_acesso} onChange={(e) => setForm({ ...form, email_acesso: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Telefone</label>
            <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Usuário (login)</label>
            <input value={form.usuario_login} onChange={(e) => setForm({ ...form, usuario_login: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Senha</label>
            <input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Nível de permissão</label>
            <select value={form.nivel_permissao} onChange={(e) => setForm({ ...form, nivel_permissao: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded">
              <option value="admin_geral">Admin geral</option>
              <option value="supervisor">Supervisor</option>
              <option value="financeiro">Financeiro</option>
              <option value="atendimento">Atendimento</option>
              <option value="operacional">Operacional</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-700">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded">
              <option value="ativa">Ativa</option>
              <option value="inativa">Inativa</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar conta'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Lista de contas</div>
        {loading ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : contas.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhuma conta cadastrada</div>
        ) : (
          <div className="divide-y">
            {contas.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{c.nome_completo}</div>
                  <div className="text-sm text-slate-600">{[c.cargo, c.email_acesso, c.usuario_login].filter(Boolean).join(' • ')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => openEdit(c)} className="text-sm text-sky-700">Editar</button>
                  <button onClick={() => handleDelete(c.id)} className="text-sm text-red-700">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Modal
        open={Boolean(editing)}
        title="Editar conta"
        onClose={() => setEditing(null)}
        onConfirm={handleUpdate}
        confirmDisabled={loading}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-700">Nome completo</label>
            <input value={editForm.nome_completo} onChange={(e) => setEditForm({ ...editForm, nome_completo: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Cargo / Função</label>
            <input value={editForm.cargo} onChange={(e) => setEditForm({ ...editForm, cargo: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Email de acesso</label>
            <input type="email" value={editForm.email_acesso} onChange={(e) => setEditForm({ ...editForm, email_acesso: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Telefone</label>
            <input value={editForm.telefone} onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Usuário (login)</label>
            <input value={editForm.usuario_login} onChange={(e) => setEditForm({ ...editForm, usuario_login: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Senha</label>
            <input type="password" value={editForm.senha} onChange={(e) => setEditForm({ ...editForm, senha: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Nível de permissão</label>
            <select value={editForm.nivel_permissao} onChange={(e) => setEditForm({ ...editForm, nivel_permissao: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded">
              <option value="admin_geral">Admin geral</option>
              <option value="supervisor">Supervisor</option>
              <option value="financeiro">Financeiro</option>
              <option value="atendimento">Atendimento</option>
              <option value="operacional">Operacional</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-700">Status</label>
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded">
              <option value="ativa">Ativa</option>
              <option value="inativa">Inativa</option>
            </select>
          </div>
        </div>
      </Modal>
  </div>
);
}