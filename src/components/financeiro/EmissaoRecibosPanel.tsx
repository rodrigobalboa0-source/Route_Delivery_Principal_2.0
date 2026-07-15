import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Recibo = any;
type Cliente = Database['public']['Tables']['clientes']['Row'];

export function EmissaoRecibosPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ cliente_id: '', descricao: '', valor: '' });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const p = Promise.all([
        supabase.from('clientes').select('id, nome_completo').order('nome_completo'),
        supabase.from('recibos').select('*').order('created_at', { ascending: false }).limit(200),
      ]);
      const result = await new Promise<[
        { data?: Cliente[]; error?: { message?: string } },
        { data?: Recibo[]; error?: { message?: string } }
      ]>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), 8000);
        p.then(
          (v) => { clearTimeout(t); resolve(v as unknown as [
            { data?: Cliente[]; error?: { message?: string } },
            { data?: Recibo[]; error?: { message?: string } }
          ]); },
          (err) => { clearTimeout(t); reject(err); }
        );
      });
      const [cRes, rRes] = result;
      if (cRes.error?.message) setError(cRes.error.message);
      if (rRes.error?.message) setError(rRes.error.message);
      setClientes((cRes.data || []) as Cliente[]);
      setRecibos((rRes.data || []) as Recibo[]);
    } catch {
      try {
        const [cR, rR] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/clientes?select=id,nome_completo&order=nome_completo`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
          fetch(`${SUPABASE_URL}/rest/v1/recibos?select=*&order=created_at.desc&limit=200`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
        ]);
        if (cR.ok) setClientes(await cR.json());
        if (rR.ok) setRecibos(await rR.json());
        if (!cR.ok || !rR.ok) {
          const msg = `Falha ${(cR.ok ? '' : cR.status)} ${(rR.ok ? '' : rR.status)}`.trim();
          if (msg) setError(msg);
        } else {
          setError(null);
        }
      } catch (e2) {
        const msg = (e2 as { message?: string })?.message || 'Erro ao carregar recibos';
        setError(msg);
      }
    } finally {
      setLoadingList(false);
    }
  };

  const handleEmitir = async () => {
    if (!form.cliente_id || !form.descricao || !form.valor) return;
    setLoadingSubmit(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('recibos')
      .insert({ cliente_id: form.cliente_id, descricao: form.descricao, valor: Number(form.valor), status: 'emitido' });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ cliente_id: '', descricao: '', valor: '' });
    await fetchAll();
    setLoadingSubmit(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Emissão de recibos</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Cliente</option>
            {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nome_completo}</option>))}
          </select>
          <input placeholder="Valor" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
        </div>
        <div className="mt-4">
          <button onClick={handleEmitir} disabled={loadingSubmit} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loadingSubmit ? 'Emitindo...' : 'Emitir recibo'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Recibos emitidos</div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : recibos.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhum recibo emitido</div>
        ) : (
          <div className="divide-y">
            {recibos.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{r.cliente_id}</div>
                  <div className="text-sm text-slate-600">{[r.descricao || '', r.valor != null ? `R$ ${r.valor}` : '', r.status || ''].filter(Boolean).join(' • ')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
