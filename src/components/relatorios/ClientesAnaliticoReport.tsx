import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Cliente = Database['public']['Tables']['clientes']['Row'];

export function ClientesAnaliticoReport() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.from('clientes').select('*').order('created_at', { ascending: false });
      if (error) setError(error.message);
      setClientes(data || []);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const stats = useMemo(() => {
    const total = clientes.length;
    const comEmail = clientes.filter((c) => (c.email || '').trim()).length;
    const comEnderecoBase = clientes.filter((c) => (c.cidade || c.rua || c.cep)).length;
    const porCidade: Record<string, number> = {};
    for (const c of clientes) {
      const k = (c.cidade || 'Sem cidade').trim() || 'Sem cidade';
      porCidade[k] = (porCidade[k] || 0) + 1;
    }
    const topCidades = Object.entries(porCidade).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { total, comEmail, comEnderecoBase, topCidades };
  }, [clientes]);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Relatórios • Analítico de clientes</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4"><div className="text-xs text-slate-600">Total</div><div className="text-2xl font-semibold">{stats.total}</div></div>
        <div className="bg-white border border-slate-200 rounded-lg p-4"><div className="text-xs text-slate-600">Com e-mail</div><div className="text-2xl font-semibold">{stats.comEmail}</div></div>
        <div className="bg-white border border-slate-200 rounded-lg p-4"><div className="text-xs text-slate-600">Com endereço base</div><div className="text-2xl font-semibold">{stats.comEnderecoBase}</div></div>
        <div className="bg-white border border-slate-200 rounded-lg p-4"><div className="text-xs text-slate-600">Atualização</div><div className="text-sm">{loading ? 'Atualizando...' : 'Atualizado'}</div></div>
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
