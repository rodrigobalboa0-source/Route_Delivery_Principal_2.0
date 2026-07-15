import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Trophy, Medal } from 'lucide-react';

export function EntregadorRankingPanel() {
  const [ranking, setRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRanking();
  }, []);

  async function fetchRanking() {
    try {
      const { data, error } = await supabase
        .from('view_entregador_ranking')
        .select('*')
        .order('entregas_semana', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRanking(data || []);
    } catch (error) {
      console.error('Erro ao buscar ranking:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Trophy className="w-6 h-6 text-yellow-500" />
        Ranking Semanal de Entregadores
      </h1>
      
      {loading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 text-sm">
              <tr>
                <th className="p-4">Posição</th>
                <th className="p-4">Entregador</th>
                <th className="p-4 text-center">Entregas (Semana)</th>
                <th className="p-4 text-center">Avaliação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ranking.map((item, index) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="p-4 font-bold text-gray-500">
                    {index + 1}º
                  </td>
                  <td className="p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
                      {item.foto_url ? (
                        <img src={item.foto_url} alt={item.nome_completo} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <Medal size={16} />
                        </div>
                      )}
                    </div>
                    <span className="font-medium">{item.nome_completo}</span>
                  </td>
                  <td className="p-4 text-center font-semibold text-blue-600">
                    {item.entregas_semana}
                  </td>
                  <td className="p-4 text-center">
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">
                      {Number(item.avaliacao_media).toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
