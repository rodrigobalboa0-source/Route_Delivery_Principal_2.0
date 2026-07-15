import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Entrega = Database['public']['Tables']['nova_entrega']['Row'];

export function OperacaoAnaliticoReport() {
  const [items, setItems] = useState<Entrega[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [periodoDias, setPeriodoDias] = useState(7);

  const fetchDados = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('nova_entrega').select('*').order('created_at', { ascending: false }).limit(5000);
    if (error) setError(error.message);
    setItems((data || []) as Entrega[]);
    setLoading(false);
  };

  useEffect(() => { fetchDados(); }, []);

  const stats = useMemo(() => {
    const agora = Date.now();
    const cutoff = agora - periodoDias * 24 * 60 * 60 * 1000;
    const recentes = items.filter((e) => {
      const t = new Date(e.created_at).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
    const porStatus: Record<string, number> = {};
    const porModal: Record<string, number> = {};
    const porCobranca: Record<string, number> = {};
    for (const r of recentes) {
      const s = r.status || 'indefinido';
      porStatus[s] = (porStatus[s] || 0) + 1;
      const m = r.modal_tipo || 'indefinido';
      porModal[m] = (porModal[m] || 0) + 1;
      const c = r.tipo_cobranca || 'indefinido';
      porCobranca[c] = (porCobranca[c] || 0) + 1;
    }
    const total = recentes.length;
    const canceladas = porStatus['cancelada'] || 0;
    const entregues = porStatus['entregue'] || 0;
    const taxaCancelamento = total ? ((canceladas / total) * 100) : 0;
    const taxaEntrega = total ? ((entregues / total) * 100) : 0;
    return { total, porStatus, porModal, porCobranca, taxaCancelamento, taxaEntrega };
  }, [items, periodoDias]);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Relatórios • Analítico da operação</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-xs text-slate-700">Período (dias)</label>
            <input type="number" min={1} max={90} value={periodoDias} onChange={(e) => setPeriodoDias(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4"><div className="text-xs text-slate-600">Total de entregas</div><div className="text-2xl font-semibold">{stats.total}</div></div>
          <div className="bg-white border border-slate-200 rounded-lg p-4"><div className="text-xs text-slate-600">Taxa de cancelamento</div><div className="text-2xl font-semibold">{stats.taxaCancelamento.toFixed(1)}%</div></div>
          <div className="bg-white border border-slate-200 rounded-lg p-4"><div className="text-xs text-slate-600">Taxa de entrega</div><div className="text-2xl font-semibold">{stats.taxaEntrega.toFixed(1)}%</div></div>
          <div>
            <button onClick={fetchDados} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">Atualizar</button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Por status</div>
          <div className="divide-y">
            {Object.keys(stats.porStatus).length === 0 ? (
              <div className="p-4 text-slate-600">Sem dados</div>
            ) : Object.entries(stats.porStatus).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-4 py-3"><div className="font-medium text-slate-900">{k}</div><div className="text-sm text-slate-700">{v}</div></div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Por modal</div>
          <div className="divide-y">
            {Object.keys(stats.porModal).length === 0 ? (
              <div className="p-4 text-slate-600">Sem dados</div>
            ) : Object.entries(stats.porModal).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-4 py-3"><div className="font-medium text-slate-900">{k}</div><div className="text-sm text-slate-700">{v}</div></div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Por tipo de cobrança</div>
          <div className="divide-y">
            {Object.keys(stats.porCobranca).length === 0 ? (
              <div className="p-4 text-slate-600">Sem dados</div>
            ) : Object.entries(stats.porCobranca).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-4 py-3"><div className="font-medium text-slate-900">{k}</div><div className="text-sm text-slate-700">{v}</div></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
