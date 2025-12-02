import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type ContaReceber = any;
type Cliente = Database['public']['Tables']['clientes']['Row'];

export function ContasReceberPanel() {
  const [items, setItems] = useState<ContaReceber[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ cliente_id: '', descricao: '', valor: '', vencimento: '' });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const p = Promise.all([
        supabase.from('contas_receber').select('*').order('vencimento', { ascending: true }),
        supabase.from('clientes').select('id, nome_completo').order('nome_completo'),
      ]);
      const result = await new Promise<[
        { data?: ContaReceber[]; error?: { message?: string } },
        { data?: Cliente[]; error?: { message?: string } }
      ]>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), 8000);
        p.then(
          (v) => { clearTimeout(t); resolve(v as unknown as [
            { data?: ContaReceber[]; error?: { message?: string } },
            { data?: Cliente[]; error?: { message?: string } }
          ]); },
          (err) => { clearTimeout(t); reject(err); }
        );
      });
      const [rRes, cRes] = result;
      if (rRes.error?.message) setError(rRes.error.message);
      if (cRes.error?.message) setError(cRes.error.message);
      setItems((rRes.data || []) as ContaReceber[]);
      setClientes((cRes.data || []) as Cliente[]);
    } catch {
      try {
        const [rR, cR] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/contas_receber?select=*&order=vencimento.asc`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
          fetch(`${SUPABASE_URL}/rest/v1/clientes?select=id,nome_completo&order=nome_completo`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
        ]);
        if (rR.ok) setItems(await rR.json());
        if (cR.ok) setClientes(await cR.json());
        if (!rR.ok || !cR.ok) {
          const msg = `Falha ${(rR.ok ? '' : rR.status)} ${(cR.ok ? '' : cR.status)}`.trim();
          if (msg) setError(msg);
        } else {
          setError(null);
        }
      } catch (e2) {
        const msg = (e2 as { message?: string })?.message || 'Erro ao carregar contas a receber';
        setError(msg);
      }
    } finally {
      setLoadingList(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.cliente_id || !form.descricao || !form.valor || !form.vencimento) return;
    setLoadingSubmit(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('contas_receber')
      .insert({
        cliente_id: form.cliente_id,
        descricao: form.descricao,
        valor: Number(form.valor),
        vencimento: form.vencimento,
        status: 'pendente',
      });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ cliente_id: '', descricao: '', valor: '', vencimento: '' });
    await fetchAll();
    setLoadingSubmit(false);
  };

  const handleToggleRecebido = async (id: string, status: ContaReceber['status']) => {
    setLoadingSubmit(true);
    setError(null);
    const novoStatus = status === 'recebido' ? 'pendente' : 'recebido';
    const payload = novoStatus === 'recebido' ? { status: novoStatus, recebido_em: new Date().toISOString() } : { status: novoStatus, recebido_em: null };
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> } } })
      .from('contas_receber')
      .update(payload)
      .eq('id', id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    await fetchAll();
    setLoadingSubmit(false);
  };

  const handleDelete = async (id: string) => {
    setLoadingSubmit(true);
    setError(null);
    const { error: delErr } = await supabase.from('contas_receber').delete().eq('id', id);
    if (delErr) setError(delErr.message);
    await fetchAll();
    setLoadingSubmit(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Contas a receber</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Cliente</option>
            {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nome_completo}</option>))}
          </select>
          <input placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Valor" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input type="date" placeholder="Vencimento" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loadingSubmit} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loadingSubmit ? 'Salvando...' : 'Adicionar conta'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Lista de contas</div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhuma conta</div>
        ) : (
          <div className="divide-y">
            {items.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{c.cliente_id}</div>
                  <div className="text-sm text-slate-600">{[c.descricao, c.valor != null ? `R$ ${c.valor}` : '', c.vencimento, c.status === 'recebido' ? 'recebido' : 'pendente'].filter(Boolean).join(' • ')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleToggleRecebido(c.id, c.status)} className="text-sm text-sky-700">{c.status === 'recebido' ? 'Desmarcar recebido' : 'Marcar recebido'}</button>
                  <button onClick={() => handleDelete(c.id)} className="text-sm text-red-700">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
