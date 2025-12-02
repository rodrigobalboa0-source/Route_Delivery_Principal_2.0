import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
type ContaReceber = any;
type Faturamento = any;

function toYearMonth(dateStr: string) {
  const d = new Date(dateStr);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function FaturamentoMensalPanel() {
  const [items, setItems] = useState<Faturamento[]>([]);
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [competencia, setCompetencia] = useState<string>('');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const p = Promise.all([
        supabase.from('faturamento_mensal').select('*').order('competencia', { ascending: false }),
        supabase.from('contas_receber').select('*').order('vencimento', { ascending: false }).limit(1000),
      ]);
      const result = await new Promise<[
        { data?: Faturamento[]; error?: { message?: string } },
        { data?: ContaReceber[]; error?: { message?: string } }
      ]>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), 8000);
        p.then(
          (v) => { clearTimeout(t); resolve(v as unknown as [
            { data?: Faturamento[]; error?: { message?: string } },
            { data?: ContaReceber[]; error?: { message?: string } }
          ]); },
          (err) => { clearTimeout(t); reject(err); }
        );
      });
      const [fRes, rRes] = result;
      if (fRes.error?.message) setError(fRes.error.message);
      if (rRes.error?.message) setError(rRes.error.message);
      setItems((fRes.data || []) as Faturamento[]);
      setContas((rRes.data || []) as ContaReceber[]);
    } catch {
      try {
        const [fR, rR] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/faturamento_mensal?select=*&order=competencia.desc`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
          fetch(`${SUPABASE_URL}/rest/v1/contas_receber?select=*&order=vencimento.desc&limit=1000`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
        ]);
        if (fR.ok) setItems(await fR.json());
        if (rR.ok) setContas(await rR.json());
        if (!fR.ok || !rR.ok) {
          const msg = `Falha ${(fR.ok ? '' : fR.status)} ${(rR.ok ? '' : rR.status)}`.trim();
          if (msg) setError(msg);
        } else {
          setError(null);
        }
      } catch (e2) {
        const msg = (e2 as { message?: string })?.message || 'Erro ao carregar faturamento';
        setError(msg);
      }
    } finally {
      setLoadingList(false);
    }
  };

  const calcularResumo = (comp: string) => {
    const doMes = contas.filter((c) => c.vencimento && toYearMonth(c.vencimento) === comp);
    const totalFaturado = doMes.reduce((sum, c) => sum + (c.valor || 0), 0);
    const totalRecebido = doMes.filter((c) => c.status === 'recebido').reduce((sum, c) => sum + (c.valor || 0), 0);
    return { totalFaturado, totalRecebido };
  };

  const handleGerar = async () => {
    if (!competencia) return;
    const { totalFaturado, totalRecebido } = calcularResumo(competencia);
    setLoadingSubmit(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('faturamento_mensal')
      .insert({ competencia, total_faturado: totalFaturado, total_recebido: totalRecebido, status: 'aberto' });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    await fetchAll();
    setLoadingSubmit(false);
  };

  const handleFechar = async (id: string, status: Faturamento['status']) => {
    setLoadingSubmit(true);
    setError(null);
    const novo = status === 'fechado' ? 'aberto' : 'fechado';
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> } } })
      .from('faturamento_mensal')
      .update({ status: novo })
      .eq('id', id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    await fetchAll();
    setLoadingSubmit(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Faturamento mensal</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input placeholder="Competência (YYYY-MM)" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="px-3 py-2 border border-slate-300 rounded" />
          <button onClick={handleGerar} disabled={loadingSubmit || !competencia} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">Gerar resumo</button>
        </div>
        {competencia && (
          <div className="mt-4 text-sm text-slate-700">
            {(() => { const r = calcularResumo(competencia); return `Faturado: R$ ${r.totalFaturado.toFixed(2)} • Recebido: R$ ${r.totalRecebido.toFixed(2)}`; })()}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Registros</div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhum registro</div>
        ) : (
          <div className="divide-y">
            {items.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{f.competencia}</div>
                  <div className="text-sm text-slate-600">{[`Faturado: R$ ${f.total_faturado ?? 0}`, `Recebido: R$ ${f.total_recebido ?? 0}`, f.status === 'fechado' ? 'fechado' : 'aberto'].filter(Boolean).join(' • ')}</div>
                </div>
                <button onClick={() => handleFechar(f.id, f.status)} className="text-sm text-sky-700">{f.status === 'fechado' ? 'Reabrir' : 'Fechar'}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
