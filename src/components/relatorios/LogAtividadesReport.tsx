import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { Activity, Clock, User } from 'lucide-react';

type Entregador = Pick<Database['public']['Tables']['entregadores']['Row'], 'id' | 'nome_completo'>;
type Entrega = Database['public']['Tables']['nova_entrega']['Row'];

interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'criada' | 'iniciada' | 'concluida' | 'cancelada';
  description: string;
  details: string;
}

export function LogAtividadesReport() {
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [selectedEntregadorId, setSelectedEntregadorId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('entregadores').select('id, nome_completo').order('nome_completo').then(({ data }) => {
      if (data) setEntregadores(data);
    });
  }, []);

  useEffect(() => {
    if (selectedEntregadorId && selectedDate) {
      fetchLogs();
    } else {
      setLogs([]);
    }
  }, [selectedEntregadorId, selectedDate]);

  async function fetchLogs() {
    setLoading(true);
    try {
      // Buscar entregas do entregador no dia selecionado
      const { data } = await supabase
        .from('nova_entrega')
        .select('*')
        .eq('entregador_id', selectedEntregadorId)
        .gte('created_at', `${selectedDate}T00:00:00`)
        .lte('created_at', `${selectedDate}T23:59:59`);

      if (!data) {
        setLogs([]);
        return;
      }

      const entries: LogEntry[] = [];
      const entregasData = data as Entrega[];

      entregasData.forEach(entrega => {
        
        entries.push({
          id: `create-${entrega.id}`,
          timestamp: new Date(entrega.created_at),
          type: 'criada',
          description: 'Entrega Atribuída',
          details: `Entrega #${entrega.id.slice(0,8)} - ${entrega.entrega_endereco_texto?.slice(0, 30)}...`
        });

        
        if (entrega.status === 'entregue') {
           entries.push({
            id: `complete-${entrega.id}`,
            timestamp: new Date(entrega.updated_at),
            type: 'concluida',
            description: 'Entrega Concluída',
            details: `Finalizou entrega #${entrega.id.slice(0,8)}`
          });
        } else if (entrega.status === 'cancelada') {
           entries.push({
            id: `cancel-${entrega.id}`,
            timestamp: new Date(entrega.updated_at),
            type: 'cancelada',
            description: 'Entrega Cancelada',
            details: `Cancelamento entrega #${entrega.id.slice(0,8)}`
          });
        } else if (entrega.status === 'em_rota') {
           entries.push({
            id: `route-${entrega.id}`,
            timestamp: new Date(entrega.updated_at),
            type: 'iniciada',
            description: 'Em Rota',
            details: `Saiu para entrega #${entrega.id.slice(0,8)}`
          });
        }
      });

      
      entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setLogs(entries);

    } catch (error) {
      console.error('Erro ao buscar logs:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Activity className="w-6 h-6" />
        Log de Atividades por Entregador
      </h2>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">Selecione o Entregador</label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <select
              value={selectedEntregadorId}
              onChange={(e) => setSelectedEntregadorId(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Selecione...</option>
              {entregadores.map(ent => (
                <option key={ent.id} value={ent.id}>{ent.nome_completo}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Data</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 font-medium text-slate-700">
          Linha do Tempo
        </div>
        
        {!selectedEntregadorId ? (
          <div className="p-8 text-center text-slate-500">Selecione um entregador para visualizar os logs.</div>
        ) : loading ? (
          <div className="p-8 text-center text-slate-500">Carregando atividades...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Nenhuma atividade registrada nesta data.</div>
        ) : (
          <div className="p-6 relative">
            <div className="absolute left-9 top-6 bottom-6 w-0.5 bg-slate-200"></div>
            <div className="space-y-6">
              {logs.map((log) => (
                <div key={log.id} className="relative flex items-start gap-4">
                  <div className={`relative z-10 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center shrink-0
                    ${log.type === 'concluida' ? 'bg-emerald-500' : 
                      log.type === 'iniciada' ? 'bg-blue-500' : 
                      log.type === 'cancelada' ? 'bg-red-500' : 'bg-slate-400'}`}
                  >
                  </div>
                  <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-slate-800">{log.description}</span>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {log.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{log.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
