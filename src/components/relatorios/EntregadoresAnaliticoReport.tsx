import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Entregador = Database['public']['Tables']['entregadores']['Row'];

export function EntregadoresAnaliticoReport() {
  const [items, setItems] = useState<Entregador[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.from('entregadores').select('id, nome_completo, status, cnh_valida, tipo_entrega, veiculo_tipo, cidade, created_at').order('created_at', { ascending: false });
      if (error) setError(error.message);
      setItems(data || []);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const ativos = items.filter((e) => e.status === 'ativo').length;
    const inativos = items.filter((e) => e.status === 'inativo').length;
    const porTipoEntrega: Record<string, number> = {};
    const porVeiculo: Record<string, number> = {};
    const cnhValidos = items.filter((e) => !!e.cnh_valida).length;
    for (const e of items) {
      const k = (e.tipo_entrega || 'indefinido');
      porTipoEntrega[k] = (porTipoEntrega[k] || 0) + 1;
      const v = (e.veiculo_tipo || 'indefinido');
      porVeiculo[v] = (porVeiculo[v] || 0) + 1;
    }
    const porCidade: Record<string, number> = {};
    for (const e of items) {
      const k = (e.cidade || 'Sem cidade').trim() || 'Sem cidade';
      porCidade[k] = (porCidade[k] || 0) + 1;
    }
    const topCidades = Object.entries(porCidade).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { total, ativos, inativos, cnhValidos, porTipoEntrega, porVeiculo, topCidades };
  }, [items]);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Relatórios • Analítico de entregadores</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4"><div className="text-xs text-slate-600">Total</div><div className="text-2xl font-semibold">{stats.total}</div></div>
        <div className="bg-white border border-slate-200 rounded-lg p-4"><div className="text-xs text-slate-600">Ativos</div><div className="text-2xl font-semibold">{stats.ativos}</div></div>
        <div className="bg-white border border-slate-200 rounded-lg p-4"><div className="text-xs text-slate-600">Inativos</div><div className="text-2xl font-semibold">{stats.inativos}</div></div>
        <div className="bg-white border border-slate-200 rounded-lg p-4"><div className="text-xs text-slate-600">CNH válida</div><div className="text-2xl font-semibold">{stats.cnhValidos}</div></div>
        <div className="bg-white border border-slate-200 rounded-lg p-4"><div className="text-xs text-slate-600">Atualização</div><div className="text-sm">{loading ? 'Atualizando...' : 'Atualizado'}</div></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Entrega por tipo</div>
          <div className="divide-y">
            {Object.keys(stats.porTipoEntrega).length === 0 ? (
              <div className="p-4 text-slate-600">Sem dados</div>
            ) : Object.entries(stats.porTipoEntrega).map(([tipo, qtd]) => (
              <div key={tipo} className="flex items-center justify-between px-4 py-3"><div className="font-medium text-slate-900">{tipo}</div><div className="text-sm text-slate-700">{qtd}</div></div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Veículo</div>
          <div className="divide-y">
            {Object.keys(stats.porVeiculo).length === 0 ? (
              <div className="p-4 text-slate-600">Sem dados</div>
            ) : Object.entries(stats.porVeiculo).map(([tipo, qtd]) => (
              <div key={tipo} className="flex items-center justify-between px-4 py-3"><div className="font-medium text-slate-900">{tipo}</div><div className="text-sm text-slate-700">{qtd}</div></div>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Top cidades</div>
        <div className="divide-y">
          {stats.topCidades.length === 0 ? (
            <div className="p-4 text-slate-600">Sem dados</div>
          ) : stats.topCidades.map(([cidade, qtd]) => (
            <div key={cidade} className="flex items-center justify-between px-4 py-3">
              <div className="font-medium text-slate-900">{cidade}</div>
              <div className="text-sm text-slate-700">{qtd}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
