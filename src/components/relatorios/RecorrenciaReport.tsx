import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Database } from '../../lib/database.types';

type Entrega = Database['public']['Tables']['nova_entrega']['Row'] & {
  clientes?: { nome_completo: string } | null;
};

interface ClientRecurrence {
  clienteId: string;
  nome: string;
  totalEntregas: number;
  valorTotal: number;
  ultimaEntrega: string;
}

export function RecorrenciaReport() {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEntregas();
  }, []);

  async function fetchEntregas() {
    setLoading(true);
    try {
      // Fetch last 1000 deliveries or filter by date if needed. 
      // For recurrence, we usually want a longer history.
      const { data, error } = await supabase
        .from('nova_entrega')
        .select(`
          *,
          clientes:cliente_id(nome_completo)
        `)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;
      setEntregas(data || []);
    } catch (error) {
      console.error('Erro ao buscar dados de recorrência:', error);
    } finally {
      setLoading(false);
    }
  }

  const recurrenceData = useMemo(() => {
    const map = new Map<string, ClientRecurrence>();

    entregas.forEach((entrega) => {
      const clienteId = entrega.cliente_id;
      if (!clienteId) return;

      const nome = entrega.clientes?.nome_completo || 'Cliente Desconhecido';
      
      if (!map.has(clienteId)) {
        map.set(clienteId, {
          clienteId,
          nome,
          totalEntregas: 0,
          valorTotal: 0,
          ultimaEntrega: entrega.created_at, // Since we ordered desc, first hit is latest
        });
      }

      const current = map.get(clienteId)!;
      current.totalEntregas += 1;
      current.valorTotal += (entrega.valor_entrega || 0);
      // Keep earliest date if needed, but we initialized with latest.
    });

    return Array.from(map.values())
      .sort((a, b) => b.totalEntregas - a.totalEntregas);
  }, [entregas]);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Recorrência de Entregas (Top Clientes)</h2>
      
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Entregas</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Total</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket Médio</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Última Entrega</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center">Carregando...</td>
              </tr>
            ) : recurrenceData.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center">Nenhum dado encontrado.</td>
              </tr>
            ) : (
              recurrenceData.map((item) => (
                <tr key={item.clienteId}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {item.nome}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.totalEntregas}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    R$ {item.valorTotal.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    R$ {(item.valorTotal / item.totalEntregas).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(item.ultimaEntrega).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
