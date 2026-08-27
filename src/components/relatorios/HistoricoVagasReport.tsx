import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { Users, Clock } from 'lucide-react';
import { toUtcDayRange, todayYmd } from '../../lib/dateRange';

type Entrega = Database['public']['Tables']['nova_entrega']['Row'];

export function HistoricoVagasReport() {
  const [selectedDate, setSelectedDate] = useState(todayYmd);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  async function fetchData() {
    setLoading(true);
    try {
      
      const { gte, lt } = toUtcDayRange(selectedDate);
      const { data: entregasData } = await supabase
        .from('nova_entrega')
        .select('*')
        .gte('created_at', gte)
        .lt('created_at', lt);
      
      if (entregasData) setEntregas(entregasData as Entrega[]);

    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    
    return hours.map(hour => {
      
      const hourStart = new Date(`${selectedDate}T${hour.toString().padStart(2, '0')}:00:00`);
      const hourEnd = new Date(`${selectedDate}T${hour.toString().padStart(2, '0')}:59:59`);

      const activeDeliveries = entregas.filter(e => {
        const created = new Date(e.created_at);
        
        const isFinal = e.status === 'entregue' || e.status === 'cancelada';
        const ended = isFinal ? new Date(e.updated_at) : (new Date() > hourStart ? new Date() : created);
        
        
        return created <= hourEnd && (!isFinal || ended >= hourStart);
      });

      
      const uniqueCouriers = new Set(activeDeliveries.map(e => e.entregador_id).filter(Boolean));
      
      return {
        hour: `${hour.toString().padStart(2, '0')}:00`,
        entregasAtivas: activeDeliveries.length,
        entregadoresOcupados: uniqueCouriers.size,
        
        totalDisponiveisDia: new Set(entregas.map(e => e.entregador_id).filter(Boolean)).size
      };
    });
  }, [entregas, selectedDate]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Users className="w-6 h-6" />
          Histórico de Vagas / Ocupação
        </h2>
        
        <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
          <Clock className="w-4 h-4 text-slate-500" />
          <input 
            type="date" 
            value={selectedDate} 
            onChange={e => setSelectedDate(e.target.value)}
            className="text-sm border-none focus:ring-0 text-slate-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Entregadores Ativos no Dia</div>
          <div className="text-2xl font-bold text-slate-800">
            {new Set(entregas.map(e => e.entregador_id).filter(Boolean)).size}
          </div>
          <div className="text-xs text-slate-400 mt-1">Com pelo menos 1 entrega</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Total de Entregas do Dia</div>
          <div className="text-2xl font-bold text-blue-600">
            {entregas.length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Pico de Ocupação Simultânea</div>
          <div className="text-2xl font-bold text-emerald-600">
            {Math.max(...hourlyData.map(h => h.entregadoresOcupados))}
          </div>
          <div className="text-xs text-slate-400 mt-1">Entregadores rodando ao mesmo tempo</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 font-medium text-slate-700">
          Ocupação por Hora
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-slate-600 font-medium border-b border-slate-100">
              <tr>
                <th className="px-6 py-3">Horário</th>
                <th className="px-6 py-3">Entregas em Andamento</th>
                <th className="px-6 py-3">Entregadores Ocupados</th>
                <th className="px-6 py-3 w-1/3">Utilização</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Carregando dados...</td></tr>
              ) : (
                hourlyData.map((row) => (
                  <tr key={row.hour} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-900">{row.hour}</td>
                    <td className="px-6 py-3 text-slate-600">{row.entregasAtivas}</td>
                    <td className="px-6 py-3 text-slate-600">{row.entregadoresOcupados}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                          <div 
                            className={`h-2.5 rounded-full ${row.entregadoresOcupados > 5 ? 'bg-emerald-500' : 'bg-blue-400'}`} 
                            style={{ width: `${Math.min(100, (row.entregadoresOcupados / Math.max(1, row.totalDisponiveisDia)) * 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-slate-500 min-w-[3ch]">
                          {Math.round((row.entregadoresOcupados / Math.max(1, row.totalDisponiveisDia)) * 100)}%
                        </span>
                      </div>
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
