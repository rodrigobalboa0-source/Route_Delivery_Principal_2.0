import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Acerto = any;
type Entregador = Database['public']['Tables']['entregadores']['Row'];
type Entrega = Database['public']['Tables']['nova_entrega']['Row'];

export function AcertosEntregadoresPanel() {
  const [items, setItems] = useState<Acerto[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ entregador_id: '', entrega_id: '', valor_pago: '' });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const p = Promise.all([
        supabase.from('acertos_entregadores').select('*').order('created_at', { ascending: false }),
        supabase.from('entregadores').select('id, nome_completo').order('nome_completo'),
        supabase.from('nova_entrega').select('id, status').order('created_at', { ascending: false }).limit(200),
      ]);
      const result = await new Promise<[
        { data?: Acerto[]; error?: { message?: string } },
        { data?: Entregador[]; error?: { message?: string } },
        { data?: Entrega[]; error?: { message?: string } }
      ]>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), 8000);
        p.then(
          (v) => { clearTimeout(t); resolve(v as unknown as [
            { data?: Acerto[]; error?: { message?: string } },
            { data?: Entregador[]; error?: { message?: string } },
            { data?: Entrega[]; error?: { message?: string } }
          ]); },
          (err) => { clearTimeout(t); reject(err); }
        );
      });
      const [aRes, eRes, nRes] = result;
      if (aRes.error?.message) setError(aRes.error.message);
      if (eRes.error?.message) setError(eRes.error.message);
      if (nRes.error?.message) setError(nRes.error.message);
      setItems((aRes.data || []) as Acerto[]);
      setEntregadores((eRes.data || []) as Entregador[]);
      setEntregas((nRes.data || []) as Entrega[]);
    } catch {
      try {
        const [aR, eR, nR] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/acertos_entregadores?select=*&order=created_at.desc`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
          fetch(`${SUPABASE_URL}/rest/v1/entregadores?select=id,nome_completo&order=nome_completo`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
          fetch(`${SUPABASE_URL}/rest/v1/nova_entrega?select=id,status&order=created_at.desc&limit=200`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
        ]);
        if (aR.ok) setItems(await aR.json());
        if (eR.ok) setEntregadores(await eR.json());
        if (nR.ok) setEntregas(await nR.json());
        if (!aR.ok || !eR.ok || !nR.ok) {
          const msg = `Falha ${(aR.ok ? '' : aR.status)} ${(eR.ok ? '' : eR.status)} ${(nR.ok ? '' : nR.status)}`.trim();
          if (msg) setError(msg);
        } else {
          setError(null);
        }
      } catch (e2) {
        const msg = (e2 as { message?: string })?.message || 'Erro ao carregar acertos';
        setError(msg);
      }
    } finally {
      setLoadingList(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.entregador_id || !form.entrega_id || !form.valor_pago) return;
    setLoadingSubmit(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('acertos_entregadores')
      .insert({
        entregador_id: form.entregador_id,
        entrega_id: form.entrega_id,
        valor_pago: Number(form.valor_pago),
        status: 'pendente',
      });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ entregador_id: '', entrega_id: '', valor_pago: '' });
    await fetchAll();
    setLoadingSubmit(false);
  };

  const handleTogglePago = async (id: string, status: Acerto['status']) => {
    setLoadingSubmit(true);
    setError(null);
    const novoStatus = status === 'pago' ? 'pendente' : 'pago';
    const payload = novoStatus === 'pago' ? { status: novoStatus, pago_em: new Date().toISOString() } : { status: novoStatus, pago_em: null };
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> } } })
      .from('acertos_entregadores')
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
    const { error: delErr } = await supabase.from('acertos_entregadores').delete().eq('id', id);
    if (delErr) setError(delErr.message);
    await fetchAll();
    setLoadingSubmit(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Acerto de entregadores</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.entregador_id} onChange={(e) => setForm({ ...form, entregador_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Entregador</option>
            {entregadores.map((d) => (<option key={d.id} value={d.id}>{d.nome_completo}</option>))}
          </select>
          <select value={form.entrega_id} onChange={(e) => setForm({ ...form, entrega_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Entrega</option>
            {entregas.map((n) => (<option key={n.id} value={n.id}>{n.id}</option>))}
          </select>
          <input placeholder="Valor pago" value={form.valor_pago} onChange={(e) => setForm({ ...form, valor_pago: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loadingSubmit} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loadingSubmit ? 'Salvando...' : 'Registrar acerto'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Acertos registrados</div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhum acerto</div>
        ) : (
          <div className="divide-y">
            {items.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{a.entregador_id}</div>
                  <div className="text-sm text-slate-600">{[a.entrega_id, a.valor_pago != null ? `R$ ${a.valor_pago}` : '', a.status === 'pago' ? 'pago' : 'pendente'].filter(Boolean).join(' • ')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleTogglePago(a.id, a.status)} className="text-sm text-sky-700">{a.status === 'pago' ? 'Desmarcar pago' : 'Marcar pago'}</button>
                  <button onClick={() => handleDelete(a.id)} className="text-sm text-red-700">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
