import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';

type Entregador = Database['public']['Tables']['entregadores']['Row'];
type CSVRow = {
  nome_completo?: string
  cpf?: string
  rg?: string
  data_nascimento?: string
  telefone?: string
  email?: string
  veiculo_tipo?: 'moto' | 'bike' | 'carro' | ''
  veiculo_modelo?: string
  veiculo_placa?: string
  veiculo_ano?: string
  cnh_valida?: string | boolean
  tipo_entrega?: 'proprio' | 'terceirizado' | 'parceiro' | ''
  taxa_entrega?: string
  status?: 'ativo' | 'inativo' | ''
};

const sbInsert = (table: string, values: unknown) => (supabase as unknown as { from: (rel: string) => { insert: (vals: unknown) => Promise<unknown> } }).from(table).insert(values);

export function EntregadoresPanel() {
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entregador | null>(null);
  const [editForm, setEditForm] = useState({
    nome_completo: '',
    cpf: '',
    rg: '',
    data_nascimento: '',
    telefone: '',
    email: '',
    veiculo_tipo: '',
    veiculo_modelo: '',
    veiculo_placa: '',
    veiculo_ano: '',
    cnh_valida: false,
    tipo_entrega: '',
    taxa_entrega: '',
    status: 'inativo',
  });
  const [csvFileName, setCsvFileName] = useState('');
  const [csvRows, setCsvRows] = useState<CSVRow[]>([]);
  const [form, setForm] = useState({
    nome_completo: '',
    cpf: '',
    rg: '',
    data_nascimento: '',
    telefone: '',
    email: '',
    senha: '',
    veiculo_tipo: '',
    veiculo_modelo: '',
    veiculo_placa: '',
    veiculo_ano: '',
    cnh_valida: false,
    tipo_entrega: '',
    taxa_entrega: '',
    status: 'inativo',
  });

  useEffect(() => {
    fetchEntregadores();
  }, []);

  const fetchEntregadores = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('entregadores').select('*').order('nome_completo');
    if (error) setError(error.message);
    const list = (data || []) as Entregador[];
    const byEmail = new Map<string, Entregador>();
    for (const e of list) {
      const key = ((e.email || '').trim().toLowerCase()) || e.id;
      if (!byEmail.has(key)) byEmail.set(key, e);
    }
    let dedup = Array.from(byEmail.values());
    try {
      const { data: admins } = await supabase.from('contas_gerenciais').select('email_acesso');
      const adminSet = new Set((admins || []).map((a: { email_acesso?: string | null }) => (a.email_acesso || '').trim().toLowerCase()));
      dedup = dedup.filter((e) => !adminSet.has(((e.email || '').trim().toLowerCase())));
      const { data: usersAdmin } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => Promise<{ data?: { email?: string; role?: string }[] }> } } }).from('users').select('email, role').eq('role', 'operador');
      const opSet = new Set(((usersAdmin || []) as { email?: string; role?: string }[]).map((u) => (u.email || '').trim().toLowerCase()));
      dedup = dedup.filter((e) => !opSet.has(((e.email || '').trim().toLowerCase())));
    } catch { /* ignore */ }
    setEntregadores(dedup);
    setLoading(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    const emailKey = (form.email || '').trim().toLowerCase();
    if (emailKey) {
      const { data: exists, error: existsErr } = await supabase.from('entregadores').select('id').ilike('email', emailKey).maybeSingle();
      if (!existsErr && (exists as { id?: string } | null)?.id) {
        setError('Já existe entregador com este e-mail');
        setLoading(false);
        return;
      }
      const { data: admin, error: adminErr } = await supabase.from('contas_gerenciais').select('id').ilike('email_acesso', emailKey).maybeSingle();
      if (!adminErr && (admin as { id?: string } | null)?.id) {
        setError('E-mail pertence a uma conta administrativa');
        setLoading(false);
        return;
      }
      const { data: userAdmin } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { ilike: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ data?: { id?: string }[] }> } } } }).from('users').select('id').ilike('email', emailKey).eq('role', 'operador');
      if ((userAdmin || []).length > 0) {
        setError('E-mail pertence a uma conta administrativa');
        setLoading(false);
        return;
      }
    }
    try {
      const shouldRegisterAuth = Boolean((form.email || '').trim()) && Boolean((form.senha || '').trim());
      if (shouldRegisterAuth) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: form.email,
          password: form.senha,
        });
        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        } else if (signUpData?.user?.id) {
          const uid = signUpData.user.id;
          void (supabase as unknown as { from: (t: string) => { upsert: (v: unknown) => Promise<unknown> } })
            .from('users')
            .upsert({ id: uid, email: emailKey, full_name: form.nome_completo, role: 'entregador' });
        }
      }
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      if (msg) setError(msg);
    }
    const res = await sbInsert('entregadores', {
      nome_completo: form.nome_completo,
      cpf: form.cpf || null,
      rg: form.rg || null,
      data_nascimento: form.data_nascimento || null,
      telefone: form.telefone || null,
      email: emailKey || null,
      veiculo_tipo: (form.veiculo_tipo || null) as Entregador['veiculo_tipo'],
      veiculo_modelo: form.veiculo_modelo || null,
      veiculo_placa: form.veiculo_placa || null,
      veiculo_ano: form.veiculo_ano ? Number(form.veiculo_ano) : null,
      cnh_valida: form.cnh_valida,
      tipo_entrega: (form.tipo_entrega || null) as Entregador['tipo_entrega'],
      taxa_entrega: form.taxa_entrega ? Number(form.taxa_entrega) : null,
      status: form.status as Entregador['status'],
    });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ nome_completo: '', cpf: '', rg: '', data_nascimento: '', telefone: '', email: '', senha: '', veiculo_tipo: '', veiculo_modelo: '', veiculo_placa: '', veiculo_ano: '', cnh_valida: false, tipo_entrega: '', taxa_entrega: '', status: 'inativo' });
    await fetchEntregadores();
  };

  const handleDelete = async (id: string) => {
    try {
      const { data: row } = await supabase.from('entregadores').select('email').eq('id', id).maybeSingle();
      const email = ((row as { email?: string } | null)?.email || '').trim().toLowerCase();
      await supabase.from('entregadores').delete().eq('id', id);
      if (email) {
        await (supabase as unknown as { from: (t: string) => { delete: () => { ilike: (c: string, v: string) => Promise<unknown> } } })
          .from('users')
          .delete()
          .ilike('email', email);
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/delete-auth-user-by-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
            body: JSON.stringify({ email }),
          });
        } catch (e) { void e; }
        try {
          const { data: session } = await supabase.auth.getSession();
          const currentEmail = (session.session?.user?.email || '').trim().toLowerCase();
          if (currentEmail && currentEmail === email) {
            await supabase.auth.signOut();
            try { localStorage.removeItem('entregador_context'); } catch (e) { void e; }
          }
        } catch (e) { void e; }
      }
    } finally {
      await fetchEntregadores();
    }
  };

  const openEdit = (c: Entregador) => {
    setEditing(c);
    setEditForm({
      nome_completo: c.nome_completo,
      cpf: c.cpf || '',
      rg: c.rg || '',
      data_nascimento: c.data_nascimento || '',
      telefone: c.telefone || '',
      email: c.email || '',
      veiculo_tipo: c.veiculo_tipo || '',
      veiculo_modelo: c.veiculo_modelo || '',
      veiculo_placa: c.veiculo_placa || '',
      veiculo_ano: c.veiculo_ano != null ? String(c.veiculo_ano) : '',
      cnh_valida: Boolean(c.cnh_valida),
      tipo_entrega: c.tipo_entrega || '',
      taxa_entrega: c.taxa_entrega != null ? String(c.taxa_entrega) : '',
      status: c.status,
    });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setLoading(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> } } })
      .from('entregadores')
      .update({
        nome_completo: editForm.nome_completo,
        cpf: editForm.cpf || null,
        rg: editForm.rg || null,
        data_nascimento: editForm.data_nascimento || null,
        telefone: editForm.telefone || null,
        email: editForm.email || null,
        veiculo_tipo: (editForm.veiculo_tipo || null) as Entregador['veiculo_tipo'],
        veiculo_modelo: editForm.veiculo_modelo || null,
        veiculo_placa: editForm.veiculo_placa || null,
        veiculo_ano: editForm.veiculo_ano ? Number(editForm.veiculo_ano) : null,
        cnh_valida: editForm.cnh_valida,
        tipo_entrega: (editForm.tipo_entrega || null) as Entregador['tipo_entrega'],
        taxa_entrega: editForm.taxa_entrega ? Number(editForm.taxa_entrega) : null,
        status: editForm.status as Entregador['status'],
      })
      .eq('id', editing.id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setEditing(null);
    setLoading(false);
    await fetchEntregadores();
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Entregadores</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Nome completo" value={form.nome_completo} onChange={(e) => setForm({ ...form, nome_completo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="RG" value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input type="date" placeholder="Nascimento" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input type="password" placeholder="Senha (para criar acesso)" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <select value={form.veiculo_tipo} onChange={(e) => setForm({ ...form, veiculo_tipo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Tipo de veículo</option>
            <option value="moto">Moto</option>
            <option value="bike">Bike</option>
            <option value="carro">Carro</option>
          </select>
          <input placeholder="Modelo" value={form.veiculo_modelo} onChange={(e) => setForm({ ...form, veiculo_modelo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Placa" value={form.veiculo_placa} onChange={(e) => setForm({ ...form, veiculo_placa: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Ano" value={form.veiculo_ano} onChange={(e) => setForm({ ...form, veiculo_ano: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <div className="flex items-center gap-2">
            <input id="cnh" type="checkbox" checked={form.cnh_valida} onChange={(e) => setForm({ ...form, cnh_valida: e.target.checked })} />
            <label htmlFor="cnh" className="text-sm text-slate-700">CNH válida</label>
          </div>
          <select value={form.tipo_entrega} onChange={(e) => setForm({ ...form, tipo_entrega: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Tipo de entrega</option>
            <option value="proprio">Próprio</option>
            <option value="terceirizado">Terceirizado</option>
            <option value="parceiro">Parceiro</option>
          </select>
          <input placeholder="Taxa de entrega" value={form.taxa_entrega} onChange={(e) => setForm({ ...form, taxa_entrega: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar entregador'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="text-sm text-slate-700 mb-2">Importar entregadores via CSV</div>
        <input type="file" accept=".csv" onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setCsvFileName(f.name);
          const reader = new FileReader();
          reader.onload = () => {
            const text = String(reader.result || '');
            const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
            if (lines.length === 0) return setCsvRows([]);
            const headers = lines[0].split(',').map((h) => h.trim());
            const rows: CSVRow[] = [];
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(',');
              const rec: Record<string, string> = {};
              headers.forEach((h, idx) => {
                rec[h] = String(cols[idx] ?? '').trim();
              });
              rows.push(rec as CSVRow);
            }
            setCsvRows(rows);
          };
          reader.readAsText(f);
        }} />
        {csvFileName && <div className="mt-2 text-sm text-slate-700">{csvFileName} • {csvRows.length} linhas</div>}
        <div className="mt-3">
          <button
            onClick={async () => {
              if (csvRows.length === 0) return;
              setLoading(true);
              setError(null);
              const batch = csvRows.map((r) => ({
                nome_completo: r.nome_completo || '',
                cpf: r.cpf || null,
                rg: r.rg || null,
                data_nascimento: r.data_nascimento || null,
                telefone: r.telefone || null,
                email: r.email || null,
                veiculo_tipo: (r.veiculo_tipo || null) as Entregador['veiculo_tipo'],
                veiculo_modelo: r.veiculo_modelo || null,
                veiculo_placa: r.veiculo_placa || null,
                veiculo_ano: r.veiculo_ano ? Number(r.veiculo_ano) : null,
                cnh_valida: r.cnh_valida === 'true' || r.cnh_valida === true,
                tipo_entrega: (r.tipo_entrega || null) as Entregador['tipo_entrega'],
                taxa_entrega: r.taxa_entrega ? Number(r.taxa_entrega) : null,
                status: (r.status || 'inativo') as Entregador['status'],
              }));
              const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('entregadores').insert(batch);
              const r = res as unknown as { error?: { message?: string } };
              if (r.error?.message) setError(r.error.message);
              await fetchEntregadores();
              setLoading(false);
            }}
            disabled={loading || csvRows.length === 0}
            className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50"
          >
            {loading ? 'Importando...' : 'Importar entregadores'}
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-600">Cabeçalho: nome_completo, cpf, rg, data_nascimento, telefone, email, veiculo_tipo, veiculo_modelo, veiculo_placa, veiculo_ano, cnh_valida, tipo_entrega, taxa_entrega, status</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Lista de entregadores</div>
        {loading ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : entregadores.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhum entregador cadastrado</div>
        ) : (
          <div className="divide-y">
            {entregadores.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{c.nome_completo}</div>
                  <div className="text-sm text-slate-600">{[c.telefone, c.email, c.veiculo_tipo].filter(Boolean).join(' • ')}</div>
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
        title="Editar entregador"
        onClose={() => setEditing(null)}
        onConfirm={handleUpdate}
        confirmDisabled={loading}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Nome completo" value={editForm.nome_completo} onChange={(e) => setEditForm({ ...editForm, nome_completo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="CPF" value={editForm.cpf} onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="RG" value={editForm.rg} onChange={(e) => setEditForm({ ...editForm, rg: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input type="date" placeholder="Nascimento" value={editForm.data_nascimento} onChange={(e) => setEditForm({ ...editForm, data_nascimento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Telefone" value={editForm.telefone} onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input type="email" placeholder="E-mail" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <select value={editForm.veiculo_tipo} onChange={(e) => setEditForm({ ...editForm, veiculo_tipo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Tipo de veículo</option>
            <option value="moto">Moto</option>
            <option value="bike">Bike</option>
            <option value="carro">Carro</option>
          </select>
          <input placeholder="Modelo" value={editForm.veiculo_modelo} onChange={(e) => setEditForm({ ...editForm, veiculo_modelo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Placa" value={editForm.veiculo_placa} onChange={(e) => setEditForm({ ...editForm, veiculo_placa: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Ano" value={editForm.veiculo_ano} onChange={(e) => setEditForm({ ...editForm, veiculo_ano: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <div className="flex items-center gap-2">
            <input id="cnh_edit" type="checkbox" checked={editForm.cnh_valida} onChange={(e) => setEditForm({ ...editForm, cnh_valida: e.target.checked })} />
            <label htmlFor="cnh_edit" className="text-sm text-slate-700">CNH válida</label>
          </div>
          <select value={editForm.tipo_entrega} onChange={(e) => setEditForm({ ...editForm, tipo_entrega: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Tipo de entrega</option>
            <option value="proprio">Próprio</option>
            <option value="terceirizado">Terceirizado</option>
            <option value="parceiro">Parceiro</option>
          </select>
          <input placeholder="Taxa de entrega" value={editForm.taxa_entrega} onChange={(e) => setEditForm({ ...editForm, taxa_entrega: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
      </Modal>
  </div>
);
}
