import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { History, MapPin } from 'lucide-react';

export function EntregadorHistoricoPanel() {
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistorico();
  }, []);

  async function fetchHistorico() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: entregador } = await supabase
        .from('entregadores')
        .select('id')
        .eq('email', user.email)
        .single();

      if (!entregador) return;

      const { data, error } = await supabase
        .from('nova_entrega')
        .select('*')
        .eq('entregador_id', entregador.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistorico(data || []);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <History className="w-6 h-6" />
        Histórico de Entregas
      </h1>
      
      {loading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : historico.length === 0 ? (
        <div className="text-center text-gray-500 py-8 bg-white rounded-lg">Nenhuma entrega realizada.</div>
      ) : (
        <div className="space-y-4">
          {historico.map((entrega) => (
            <div key={entrega.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-2">
                 <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                   entrega.status === 'entregue' ? 'bg-green-100 text-green-700' : 
                   entrega.status === 'cancelado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                 }`}>
                   {entrega.status}
                 </span>
                 <span className="text-xs text-gray-400">{new Date(entrega.created_at).toLocaleDateString()}</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                   <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                   <div>
                     <p className="text-sm font-medium text-gray-800">Origem</p>
                     <p className="text-sm text-gray-600">{entrega.endereco_coleta}</p>
                   </div>
                </div>
                <div className="flex items-start gap-2">
                   <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                   <div>
                     <p className="text-sm font-medium text-gray-800">Destino</p>
                     <p className="text-sm text-gray-600">{entrega.endereco_entrega}</p>
                   </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                 <span className="text-sm text-gray-500">Valor da entrega</span>
                 <span className="font-bold text-gray-800">R$ {Number(entrega.valor_entregador || 0).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
