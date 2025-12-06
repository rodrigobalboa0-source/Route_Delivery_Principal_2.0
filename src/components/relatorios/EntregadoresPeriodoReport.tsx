import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { BarChart3, Calendar } from 'lucide-react';

type Entregador = Database['public']['Tables']['entregadores']['Row'];
type Entrega = Database['public']['Tables']['nova_entrega']['Row'];

export function EntregadoresPeriodoReport() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  async function fetchData() {
    setLoading(true);
    try {
      
      const { data: entregadoresData } = await supabase
        .from('entregadores')
        .select('*');
      
      if (entregadoresData) setEntregadores(entregadoresData);

      
      const { data: entregasData } = await supabase
        .from('nova_entrega')
        .select('*')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
        .eq('status', 'entregue');
      
      if (entregasData) setEntregas(entregasData);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  const reportData = useMemo(() => {
    const stats = entregadores.map(entregador => {
      const entregasDoEntregador = entregas.filter(e => e.entregador_id === entregador.id);
      const totalEntregas = entregasDoEntregador.length;
      const valorTotal = entregasDoEntregador.reduce((acc, curr) => acc + (curr.valor_entrega || 0), 0);
      
      return {
        id: entregador.id,
        nome: entregador.nome_completo,
        totalEntregas,
        valorTotal,
        mediaDiaria: totalEntregas / (Math.max(1, (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24) + 1))
      };
    });

    return stats.sort((a, b) => b.totalEntregas - a.totalEntregas);
  }, [entregadores, entregas, startDate, endDate]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          Entregadores por Período
        </h2>
        
        <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
          <Calendar className="w-4 h-4 text-slate-500" />
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)}
            className="text-sm border-none focus:ring-0 text-slate-600"
          />
          <span className="text-slate-400">até</span>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)}
            className="text-sm border-none focus:ring-0 text-slate-600"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Entregador</th>
                <th className="px-6 py-4 text-right">Total Entregas</th>
                <th className="px-6 py-4 text-right">Média Diária</th>
                <th className="px-6 py-4 text-right">Valor Total (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Carregando dados...</td></tr>
              ) : reportData.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Nenhum registro encontrado no período.</td></tr>
              ) : (
                reportData.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{item.nome}</td>
                    <td className="px-6 py-4 text-right text-slate-600">{item.totalEntregas}</td>
                    <td className="px-6 py-4 text-right text-slate-600">{item.mediaDiaria.toFixed(1)}</td>
                    <td className="px-6 py-4 text-right font-medium text-emerald-600">
                      {item.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
