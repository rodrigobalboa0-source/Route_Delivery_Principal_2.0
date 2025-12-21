import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, Navigation, Package, DollarSign, Clock } from 'lucide-react';

export function EntregadorEntregasDisponiveisPanel() {
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchEntregas();
    
    const subscription = supabase
      .channel('nova_entrega_disponiveis')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'nova_entrega' 
      }, () => {
        fetchEntregas();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function fetchEntregas() {
    try {
      
      const { data, error } = await supabase
        .from('nova_entrega')
        .select(`
          *,
          clientes:cliente_id (nome_completo),
          tipo_servicos:tipo_servico_id (nome)
        `)
        .eq('status', 'criada')
        .is('entregador_id', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntregas(data || []);
    } catch (error) {
      console.error('Erro ao buscar entregas disponíveis:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAceitar(id: string) {
    setProcessingId(id);
    try {
      const { data, error } = await supabase.rpc('aceitar_entrega', { entrega_id: id });
      
      if (error) throw error;
      
      if (data && data.success) {
        
        setEntregas(prev => prev.filter(e => e.id !== id));
      } else {
        alert(data?.message || 'Erro ao aceitar entrega');
      }
    } catch (error: any) {
      console.error('Erro ao aceitar entrega:', error);
      alert('Erro ao aceitar entrega: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Package className="w-6 h-6" />
        Entregas Disponíveis
      </h1>
      
      {loading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : entregas.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm text-center text-gray-500 border border-gray-100">
          <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Nenhuma entrega disponível no momento.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entregas.map((entrega) => (
            <div key={entrega.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 hover:border-sky-200 transition-colors">
              <div className="flex justify-between items-start mb-4">
                 <div>
                   <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800">
                     {entrega.tipo_servicos?.nome || 'Entrega'}
                   </span>
                   <h3 className="font-semibold text-lg mt-1">
                     {entrega.clientes?.nome_completo || 'Cliente'}
                   </h3>
                 </div>
                 <div className="text-right">
                   <div className="flex items-center gap-1 text-green-600 font-bold text-lg">
                     <DollarSign size={18} />
                     {Number(entrega.valor_entrega || 0).toFixed(2)}
                   </div>
                   <div className="flex items-center gap-1 text-xs text-gray-400 mt-1 justify-end">
                     <Clock size={12} />
                     {new Date(entrega.created_at).toLocaleTimeString().slice(0, 5)}
                   </div>
                 </div>
              </div>

              <div className="space-y-3 mb-5">
                <div className="flex items-start gap-3">
                   <div className="mt-1 min-w-[20px] flex justify-center">
                     <div className="w-3 h-3 rounded-full bg-slate-300 ring-4 ring-slate-100" />
                   </div>
                   <div>
                     <p className="text-xs text-gray-500 uppercase font-semibold">Coleta</p>
                     <p className="text-sm text-gray-800">{entrega.endereco_id ? 'Endereço cadastrado' : (entrega.coleta_endereco_texto || 'Endereço não informado')}</p>
                   </div>
                </div>
                <div className="flex items-start gap-3">
                   <div className="mt-1 min-w-[20px] flex justify-center">
                     <MapPin className="w-4 h-4 text-sky-500" />
                   </div>
                   <div>
                     <p className="text-xs text-gray-500 uppercase font-semibold">Entrega</p>
                     <p className="text-sm text-gray-800">{entrega.entrega_endereco_texto || 'Endereço não informado'}</p>
                   </div>
                </div>
              </div>

              <button
                onClick={() => handleAceitar(entrega.id)}
                disabled={processingId === entrega.id}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingId === entrega.id ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Navigation size={18} />
                    Aceitar Corrida
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
