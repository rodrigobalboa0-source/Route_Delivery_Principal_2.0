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
              <div className="space-y-4">
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="flex items-start gap-2 mb-2">
                     <MapPin className="w-4 h-4 text-green-600 mt-1 shrink-0" />
                     <div>
                       <p className="text-sm font-bold text-gray-800">Origem / Coleta</p>
                       <p className="text-sm text-gray-600">{entrega.coleta_endereco_texto || entrega.endereco_coleta || 'Endereço não informado'}</p>
                       {(entrega.coleta_contato || entrega.coleta_telefone) && (
                         <p className="text-xs text-gray-500 mt-1">
                           {entrega.coleta_contato} {entrega.coleta_telefone ? `- ${entrega.coleta_telefone}` : ''}
                         </p>
                       )}
                       {entrega.coleta_observacoes && (
                         <p className="text-xs text-orange-600 mt-1 bg-orange-50 p-1 rounded">Obs: {entrega.coleta_observacoes}</p>
                       )}
                     </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="flex items-start gap-2 mb-2">
                     <MapPin className="w-4 h-4 text-red-600 mt-1 shrink-0" />
                     <div>
                       <p className="text-sm font-bold text-gray-800">Destino / Entrega</p>
                       <p className="text-sm text-gray-600">{entrega.entrega_endereco_texto || entrega.endereco_entrega || 'Endereço não informado'}</p>
                       {(entrega.entrega_contato || entrega.entrega_telefone) && (
                         <p className="text-xs text-gray-500 mt-1">
                           {entrega.entrega_contato} {entrega.entrega_telefone ? `- ${entrega.entrega_telefone}` : ''}
                         </p>
                       )}
                       {entrega.entrega_observacoes && (
                         <p className="text-xs text-orange-600 mt-1 bg-orange-50 p-1 rounded">Obs: {entrega.entrega_observacoes}</p>
                       )}
                     </div>
                  </div>
                </div>

                {/* Informações Adicionais do Pedido */}
                {(entrega.item_descricao || entrega.observacoes || entrega.entrega_codigo_pedido) && (
                  <div className="border-t border-gray-100 pt-3 mt-2">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Detalhes do Pedido</p>
                    {entrega.entrega_codigo_pedido && (
                      <p className="text-sm text-gray-700 mb-1"><span className="font-medium">Pedido:</span> {entrega.entrega_codigo_pedido}</p>
                    )}
                    {entrega.item_descricao && (
                      <p className="text-sm text-gray-700 mb-1"><span className="font-medium">Item:</span> {entrega.item_descricao}</p>
                    )}
                    {entrega.observacoes && (
                      <div className="text-sm text-gray-600 bg-yellow-50 p-2 rounded border border-yellow-100 mt-2">
                        <span className="font-medium text-yellow-800">Observações Gerais:</span> {entrega.observacoes}
                      </div>
                    )}
                  </div>
                )}

                {/* Timeline do Pedido */}
                {entrega.opcionais?.timeline && (
                  <div className="border-t border-gray-100 pt-3 mt-2 bg-slate-50 p-2 rounded">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Linha do Tempo</p>
                    <div className="space-y-1">
                        {entrega.opcionais.timeline.chegou_coleta && (
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Chegou na Coleta:</span>
                                <span className="font-medium text-slate-700">{new Date(entrega.opcionais.timeline.chegou_coleta).toLocaleString()}</span>
                            </div>
                        )}
                        {entrega.opcionais.timeline.coletado && (
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Coletado (Saiu):</span>
                                <span className="font-medium text-slate-700">{new Date(entrega.opcionais.timeline.coletado).toLocaleString()}</span>
                            </div>
                        )}
                        {entrega.opcionais.timeline.chegou_entrega && (
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Chegou no Cliente:</span>
                                <span className="font-medium text-slate-700">{new Date(entrega.opcionais.timeline.chegou_entrega).toLocaleString()}</span>
                            </div>
                        )}
                        {entrega.opcionais.timeline.finalizado && (
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">Entregue:</span>
                                <span className="font-medium text-slate-700">{new Date(entrega.opcionais.timeline.finalizado).toLocaleString()}</span>
                            </div>
                        )}
                    </div>
                  </div>
                )}

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
