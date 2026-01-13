import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, Navigation, Package, DollarSign, Clock, AlertCircle, XCircle } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { getDistanceFromLatLonInKm, getCoordsFromAddress } from '../../utils/geo';

export function EntregadorEntregasDisponiveisPanel() {
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<Record<string, { pickup?: [number, number], delivery?: [number, number] }>>({});
  const [distances, setDistances] = useState<Record<string, { toPickup: number, toDelivery: number }>>({});
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [entregadorId, setEntregadorId] = useState<string | null>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    async function loadProfile() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email) {
                const { data } = await supabase
                    .from('entregadores')
                    .select('id')
                    .eq('email', user.email)
                    .single();
                if (data) {
                    setEntregadorId(data.id);
                } else {
                    setProfileMissing(true);
                    setLoading(false);
                }
            }
        } catch (e) {
            console.error('Erro ao carregar perfil', e);
            setLoading(false);
        }
    }
    loadProfile();
  }, []);

  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.error('Erro ao tocar som:', e);
    }
  };

  useEffect(() => {
    Geolocation.getCurrentPosition().then(pos => {
        setCurrentLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
        });
    }).catch(err => console.error('Error getting location', err));
  }, []);

  
  useEffect(() => {
      const fetchCoords = async () => {
          const newCoords: Record<string, { pickup?: [number, number], delivery?: [number, number] }> = {};
          let hasNew = false;

          for (const entrega of entregas) {
              if (deliveryCoords[entrega.id]) continue; 

              let pickup: [number, number] | undefined;
              let delivery: [number, number] | undefined;

              if (entrega.coleta_endereco_texto) {
                  await new Promise(r => setTimeout(r, 1000)); // Rate limit
                  pickup = await getCoordsFromAddress(entrega.coleta_endereco_texto);
              }
              
              if (entrega.entrega_endereco_texto) {
                  await new Promise(r => setTimeout(r, 1000)); // Rate limit
                  delivery = await getCoordsFromAddress(entrega.entrega_endereco_texto);
              }
              
              if (pickup || delivery) {
                  newCoords[entrega.id] = { pickup, delivery };
                  hasNew = true;
                  
                  setDeliveryCoords(prev => ({ ...prev, [entrega.id]: { pickup, delivery } }));
              }
          }
      };
      
      if (entregas.length > 0) {
          fetchCoords();
      }
  }, [entregas]);

  
  useEffect(() => {
      if (!currentLocation) return;
      
      const newDistances: Record<string, { toPickup: number, toDelivery: number }> = {};
      
      Object.keys(deliveryCoords).forEach(id => {
          const coords = deliveryCoords[id];
          let distToPickup = 0;
          let distPickupToDelivery = 0;

          if (coords.pickup) {
              distToPickup = getDistanceFromLatLonInKm(
                  currentLocation.lat, currentLocation.lng,
                  coords.pickup[0], coords.pickup[1]
              );
              
              if (coords.delivery) {
                   distPickupToDelivery = getDistanceFromLatLonInKm(
                      coords.pickup[0], coords.pickup[1],
                      coords.delivery[0], coords.delivery[1]
                   );
              }
          } else if (coords.delivery) {
              
          }

          newDistances[id] = {
              toPickup: distToPickup,
              toDelivery: distPickupToDelivery
          };
      });
      
      setDistances(newDistances);
  }, [currentLocation, deliveryCoords]);

  useEffect(() => {
    if (!entregadorId) return;

    fetchEntregas();
    
    // Polling fallback every 5 seconds
    const intervalId = setInterval(fetchEntregas, 5000);

    const subscription = supabase
      .channel('nova_entrega_disponiveis')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'nova_entrega' 
      }, (payload) => {
        // Optimistic updates (Atualização em tempo real)
        if (payload.eventType === 'DELETE') {
            setEntregas(prev => prev.filter(e => e.id !== payload.old.id));
        } else if (payload.eventType === 'UPDATE') {
            const newRecord = payload.new as any;
            
            // Se o status mudou para algo diferente de 'criada' e não é atribuído a mim, remove da lista
            if (newRecord.status !== 'criada') {
                const isAssignedToMe = newRecord.status === 'atribuida' && 
                                     newRecord.entregador_id === entregadorId &&
                                     newRecord.atribuicao_modo === 'automatica';
                
                if (!isAssignedToMe) {
                    setEntregas(prev => prev.filter(e => e.id !== newRecord.id));
                }
            }
        }
        
        fetchEntregas();
      })
      .subscribe();

    return () => {
      clearInterval(intervalId);
      subscription.unsubscribe();
    };
  }, [entregadorId]);

  async function fetchEntregas() {
    if (!entregadorId) return;

    try {
      const { data, error } = await supabase
        .from('nova_entrega')
        .select(`
          *,
          clientes:cliente_id (nome_completo),
          tipo_servicos:tipo_servico_id (nome)
        `)
        .or(`and(status.eq.criada,entregador_id.is.null),and(status.eq.atribuida,entregador_id.eq.${entregadorId},atribuicao_modo.eq.automatica)`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const newEntregas = data || [];
      setEntregas(newEntregas);
      
      if (newEntregas.length > lastCountRef.current) {
          playNotificationSound();
      }
      lastCountRef.current = newEntregas.length;

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

  async function handleRecusar(id: string, assignedToMe: boolean) {
    setProcessingId(id);
    
    try {
        if (assignedToMe) {
            const { error } = await supabase.from('nova_entrega').update({
                entregador_id: null,
                status: 'criada',
                atribuicao_modo: 'manual',
                updated_at: new Date().toISOString()
            }).eq('id', id);

            if (error) throw error;
            setEntregas(prev => prev.filter(e => e.id !== id));
        } else {
            setHiddenIds(prev => [...prev, id]);
        }
    } catch (e: any) {
        console.error('Erro ao recusar:', e);
        alert('Erro ao recusar entrega: ' + e.message);
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
      
      {profileMissing ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-800">Perfil Incompleto</h3>
            <p className="text-sm text-amber-700 mt-1">
              Seu cadastro de entregador não foi encontrado ou está incompleto. Entre em contato com o suporte.
            </p>
          </div>
        </div>
      ) : loading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : entregas.filter(e => !hiddenIds.includes(e.id)).length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm text-center text-gray-500 border border-gray-100">
          <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Nenhuma entrega disponível no momento.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entregas.filter(e => !hiddenIds.includes(e.id)).map((entrega) => {
             const assignedToMe = entrega.status === 'atribuida'; 
             return (
            <div key={entrega.id} className={`bg-white p-5 rounded-lg shadow-sm border border-gray-100 hover:border-sky-200 transition-colors ${assignedToMe ? 'ring-2 ring-sky-500 ring-offset-2' : ''}`}>
              <div className="flex justify-between items-start mb-4">
                 <div>
                   <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${assignedToMe ? 'bg-sky-500 text-white' : 'bg-sky-100 text-sky-800'}`}>
                     {assignedToMe ? 'Atribuída a Você' : (entrega.tipo_servicos?.nome || 'Entrega')}
                   </span>
                   <h3 className="font-semibold text-lg mt-1">
                     {entrega.clientes?.nome_completo || 'Cliente'}
                   </h3>
                 </div>
                 <div className="text-right">
                   <div className="flex flex-col items-end">
                     <div className="flex items-center gap-1 text-green-600 font-bold text-lg">
                       <DollarSign size={18} />
                       {Number(entrega.valor_entregador ?? entrega.valor_entrega ?? 0).toFixed(2)}
                     </div>
                     {entrega.opcionais?.driver_bonuses && Array.isArray(entrega.opcionais.driver_bonuses) && (
                       <div className="text-xs text-right flex flex-col items-end gap-1 mb-1">
                         {entrega.opcionais.driver_bonuses.map((bonus: any, idx: number) => (
                           <div key={idx} className="text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100 flex items-center gap-1">
                             <span className="font-bold">+ R$ {Number(bonus.value).toFixed(2)}</span>
                             <span className="text-[10px] text-green-600 opacity-75">{bonus.description}</span>
                           </div>
                         ))}
                       </div>
                     )}
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

              {(entrega.distancia_km || distances[entrega.id]) && (
                <div className="grid grid-cols-1 gap-2 mb-4 text-xs bg-gray-50 p-2 rounded border border-gray-100">
                    <div className="text-center">
                        <span className="block text-gray-400">Entrega</span>
                        <span className="font-semibold text-gray-700 text-lg">
                            {entrega.distancia_km ? Number(entrega.distancia_km).toFixed(1) : distances[entrega.id]?.toDelivery.toFixed(1)} km
                        </span>
                    </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
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

                <button
                    onClick={() => handleRecusar(entrega.id, assignedToMe)}
                    disabled={processingId === entrega.id}
                    className="w-full bg-red-100 hover:bg-red-200 text-red-700 font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                    <XCircle size={18} />
                    Recusar entrega
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}