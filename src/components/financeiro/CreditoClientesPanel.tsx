import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Credito = any;
type Cliente = Database['public']['Tables']['clientes']['Row'];

export function CreditoClientesPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [items, setItems] = useState<Credito[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ cliente_id: '', valor: '', motivo: '' });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const p = Promise.all([
        supabase.from('clientes').select('id, nome_completo').order('nome_completo'),
        supabase.from('creditos_clientes').select('*').order('created_at', { ascending: false }),
      ]);
      const result = await new Promise<[
        { data?: Cliente[]; error?: { message?: string } },
        { data?: Credito[]; error?: { message?: string } }
      ]>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), 8000);
        p.then(
          (v) => { clearTimeout(t); resolve(v as unknown as [
            { data?: Cliente[]; error?: { message?: string } },
            { data?: Credito[]; error?: { message?: string } }
          ]); },
          (err) => { clearTimeout(t); reject(err); }
        );
      });
      const [cRes, kRes] = result;
      if (cRes.error?.message) setError(cRes.error.message);
      if (kRes.error?.message) setError(kRes.error.message);
      setClientes((cRes.data || []) as Cliente[]);
      setItems((kRes.data || []) as Credito[]);
    } catch {
      try {
        const [cR, kR] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/clientes?select=id,nome_completo&order=nome_completo`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
          fetch(`${SUPABASE_URL}/rest/v1/creditos_clientes?select=*&order=created_at.desc`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
        ]);
        if (cR.ok) setClientes(await cR.json());
        if (kR.ok) setItems(await kR.json());
        if (!cR.ok || !kR.ok) {
          const msg = `Falha ${(cR.ok ? '' : cR.status)} ${(kR.ok ? '' : kR.status)}`.trim();
          if (msg) setError(msg);
        } else {
          setError(null);
        }
      } catch (e2) {
        const msg = (e2 as { message?: string })?.message || 'Erro ao carregar créditos';
        setError(msg);
      }
    } finally {
      setLoadingList(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.cliente_id || !form.valor) return;
    setLoadingSubmit(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('creditos_clientes')
      .insert({ cliente_id: form.cliente_id, valor: Number(form.valor), motivo: form.motivo || null, status: 'disponivel' });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ cliente_id: '', valor: '', motivo: '' });
    await fetchAll();
    setLoadingSubmit(false);
  };

  const handleToggleUtilizado = async (id: string, status: Credito['status']) => {
    setLoadingSubmit(true);
    setError(null);
    const novo = status === 'utilizado' ? 'disponivel' : 'utilizado';
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> } } })
      .from('creditos_clientes')
      .update({ status: novo })
      .eq('id', id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    await fetchAll();
    setLoadingSubmit(false);
  };

  const handleDelete = async (id: string) => {
    setLoadingSubmit(true);
    setError(null);
    const { error: delErr } = await supabase.from('creditos_clientes').delete().eq('id', id);
    if (delErr) setError(delErr.message);
    await fetchAll();
    setLoadingSubmit(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Crédito para clientes</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Cliente</option>
            {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nome_completo}</option>))}
          </select>
          <input placeholder="Valor" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Motivo (opcional)" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loadingSubmit} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loadingSubmit ? 'Salvando...' : 'Adicionar crédito'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Créditos</div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhum crédito</div>
        ) : (
          <div className="divide-y">
            {items.map((k) => (
              <div key={k.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{k.cliente_id}</div>
                  <div className="text-sm text-slate-600">{[k.valor != null ? `R$ ${k.valor}` : '', k.motivo || '', k.status || ''].filter(Boolean).join(' • ')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleToggleUtilizado(k.id, k.status)} className="text-sm text-sky-700">{k.status === 'utilizado' ? 'Desmarcar utilizado' : 'Marcar utilizado'}</button>
                  <button onClick={() => handleDelete(k.id)} className="text-sm text-red-700">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
