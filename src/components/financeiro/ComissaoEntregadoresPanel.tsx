import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Comissao = any;
type Entregador = Database['public']['Tables']['entregadores']['Row'];

function startEndOfMonth(competencia: string) {
  const [yearStr, monthStr] = competencia.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function ComissaoEntregadoresPanel() {
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [items, setItems] = useState<Comissao[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ entregador_id: '', competencia: '' as string, total_entregas: 0, valor_total: 0 });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const [eRes, cRes] = await (async () => {
        const p = Promise.all([
          supabase.from('entregadores').select('id, nome_completo, taxa_entrega').order('nome_completo'),
          supabase.from('comissoes_entregadores').select('*').order('created_at', { ascending: false }),
        ]);
        const result = await new Promise<[
          { data?: Entregador[]; error?: { message?: string } },
          { data?: Comissao[]; error?: { message?: string } }
        ]>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), 8000);
          p.then(
            (v) => { clearTimeout(t); resolve(v as unknown as [
              { data?: Entregador[]; error?: { message?: string } },
              { data?: Comissao[]; error?: { message?: string } }
            ]); },
            (err) => { clearTimeout(t); reject(err); }
          );
        });
        return result;
      })();
      if (eRes.error?.message) setError(eRes.error.message);
      if (cRes.error?.message) setError(cRes.error.message);
      setEntregadores((eRes.data || []) as Entregador[]);
      setItems((cRes.data || []) as Comissao[]);
    } catch {
      try {
        const [eR, cR] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/entregadores?select=id,nome_completo,taxa_entrega&order=nome_completo`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          }),
          fetch(`${SUPABASE_URL}/rest/v1/comissoes_entregadores?select=*&order=created_at.desc`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          }),
        ]);
        if (eR.ok) {
          setEntregadores((await eR.json()) as Entregador[]);
        }
        if (cR.ok) {
          setItems((await cR.json()) as Comissao[]);
        }
        if (!eR.ok || !cR.ok) {
          const msg = `Falha ${(eR.ok ? '' : eR.status)} ${(cR.ok ? '' : cR.status)}`.trim();
          if (msg) setError(msg);
        } else {
          setError(null);
        }
      } catch (e2) {
        const msg = (e2 as { message?: string })?.message || 'Erro ao carregar comissões';
        setError(msg);
      }
    } finally {
      setLoadingList(false);
    }
  };

  const handleCalcular = async () => {
    if (!form.entregador_id || !form.competencia) return;
    setLoadingSubmit(true);
    setError(null);
    const { start, end } = startEndOfMonth(form.competencia);
    const { data, error: err } = await supabase
      .from('nova_entrega')
      .select('id, created_at')
      .eq('entregador_id', form.entregador_id)
      .eq('status', 'entregue')
      .gte('created_at', start)
      .lt('created_at', end);
    if (err) setError(err.message);
    const total = (data || []).length;
    const entregador = entregadores.find((d) => d.id === form.entregador_id);
    const taxa = entregador?.taxa_entrega || 0;
    setForm((f) => ({ ...f, total_entregas: total, valor_total: Number((total * Number(taxa || 0)).toFixed(2)) }));
    setLoadingSubmit(false);
  };

  const handleSubmit = async () => {
    if (!form.entregador_id || !form.competencia) return;
    setLoadingSubmit(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('comissoes_entregadores')
      .insert({
        entregador_id: form.entregador_id,
        competencia: form.competencia,
        total_entregas: form.total_entregas,
        valor_total: form.valor_total,
        status: 'aberto',
      });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ entregador_id: '', competencia: '', total_entregas: 0, valor_total: 0 });
    await fetchAll();
    setLoadingSubmit(false);
  };

  const handleTogglePago = async (id: string, status: Comissao['status']) => {
    setLoadingSubmit(true);
    setError(null);
    const novo = status === 'pago' ? 'aberto' : 'pago';
    const payload = novo === 'pago' ? { status: novo, pago_em: new Date().toISOString() } : { status: novo, pago_em: null };
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> } } })
      .from('comissoes_entregadores')
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
    await supabase.from('comissoes_entregadores').delete().eq('id', id);
    await fetchAll();
    setLoadingSubmit(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Comissão de entregadores</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.entregador_id} onChange={(e) => setForm({ ...form, entregador_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Entregador</option>
            {entregadores.map((d) => (<option key={d.id} value={d.id}>{d.nome_completo}</option>))}
          </select>
          <input type="month" placeholder="Competência (AAAA-MM)" value={form.competencia} onChange={(e) => setForm({ ...form, competencia: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleCalcular} disabled={loadingSubmit || !form.entregador_id || !form.competencia} className="px-4 py-2 rounded bg-slate-200 text-slate-800 text-sm disabled:opacity-50">Calcular</button>
          <div className="text-sm text-slate-700">Total de entregas: {form.total_entregas} • Valor total: R$ {form.valor_total}</div>
        </div>
        <div className="mt-3">
          <button onClick={handleSubmit} disabled={loadingSubmit || !form.entregador_id || !form.competencia} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loadingSubmit ? 'Salvando...' : 'Registrar comissão'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Comissões</div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhuma comissão registrada</div>
        ) : (
          <div className="divide-y">
            {items.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{c.entregador_id}</div>
                  <div className="text-sm text-slate-600">{[c.competencia || '', c.total_entregas != null ? `${c.total_entregas} entregas` : '', c.valor_total != null ? `R$ ${c.valor_total}` : '', c.status || ''].filter(Boolean).join(' • ')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleTogglePago(c.id, c.status)} className="text-sm text-sky-700">{c.status === 'pago' ? 'Desmarcar pago' : 'Marcar pago'}</button>
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
