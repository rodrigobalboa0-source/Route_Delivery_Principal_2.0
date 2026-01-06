import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, CheckCircle, Truck, AlertCircle, Phone, Navigation, Map as MapIcon, DollarSign } from 'lucide-react';
import { MapView, MapDeliveryPerson } from '../MapView';
import type { Database } from '../../lib/database.types';
import { Geolocation } from '@capacitor/geolocation';
import { getDistanceFromLatLonInKm, getCoordsFromAddress } from '../../utils/geo';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

export function EntregadorPedidosEmAndamentoPanel() {
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mapVisibleId, setMapVisibleId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  
  const [deliveryCoords, setDeliveryCoords] = useState<Record<string, { pickup?: [number, number], delivery?: [number, number] }>>({});
  const [distances, setDistances] = useState<Record<string, { userToPickup: number, pickupToDelivery: number, userToDelivery: number }>>({});

  useEffect(() => {
    const fetchCoords = async () => {
      const newCoords: Record<string, { pickup?: [number, number], delivery?: [number, number] }> = {};
      
      for (const entrega of entregas) {
        if (deliveryCoords[entrega.id]) continue; 

        let pickup: [number, number] | undefined;
        let delivery: [number, number] | undefined;

        if (entrega.coleta_endereco_texto) {
            await new Promise(r => setTimeout(r, 1000)); 
            pickup = await getCoordsFromAddress(entrega.coleta_endereco_texto);
        }
        if (entrega.entrega_endereco_texto) {
            await new Promise(r => setTimeout(r, 1000)); 
            delivery = await getCoordsFromAddress(entrega.entrega_endereco_texto);
        }
        
        if (pickup || delivery) {
            newCoords[entrega.id] = { pickup, delivery };
            
            setDeliveryCoords(prev => ({ ...prev, [entrega.id]: { pickup, delivery } }));
        }
      }
    };
    
    if (entregas.length > 0) {
        fetchCoords();
    }
  }, [entregas]);

  useEffect(() => {
    if (!userLocation) return;

    const newDistances: Record<string, { userToPickup: number, pickupToDelivery: number, userToDelivery: number }> = {};
    
    Object.keys(deliveryCoords).forEach(id => {
        const coords = deliveryCoords[id];
        let userToPickup = 0;
        let pickupToDelivery = 0;
        let userToDelivery = 0;

        if (coords.pickup) {
            userToPickup = getDistanceFromLatLonInKm(
                userLocation.lat, userLocation.lng,
                coords.pickup[0], coords.pickup[1]
            );
            
            if (coords.delivery) {
                 pickupToDelivery = getDistanceFromLatLonInKm(
                    coords.pickup[0], coords.pickup[1],
                    coords.delivery[0], coords.delivery[1]
                 );
            }
        }
        
        if (coords.delivery) {
             userToDelivery = getDistanceFromLatLonInKm(
                userLocation.lat, userLocation.lng,
                coords.delivery[0], coords.delivery[1]
             );
        }

        newDistances[id] = { userToPickup, pickupToDelivery, userToDelivery };
    });

    setDistances(newDistances);
  }, [userLocation, deliveryCoords]);

  useEffect(() => {
    fetchEntregas();

    const fetchPhoto = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
           const { data } = await supabase.from('entregadores').select('foto_url').ilike('email', user.email).single();
           if (data?.foto_url) setPhotoUrl(data.foto_url);
        }
      } catch (e) { console.error(e); }
    };
    fetchPhoto();

    const subscription = supabase
      .channel('nova_entrega_andamento')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'nova_entrega' 
      }, () => {
        fetchEntregas();
      })
      .subscribe();

    let watchId: string | null = null;

    const startWatching = async () => {
      try {
        let permResult = await Geolocation.checkPermissions();
        
        if (permResult.location !== 'granted') {
          permResult = await Geolocation.requestPermissions();
        }

        if (permResult.location !== 'granted') {
          console.error('Permissão de localização negada');
          return;
        }

        try {
          const position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: Infinity
          });
          
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        } catch (e) {
          console.warn('Erro ao obter posição inicial, aguardando watchPosition', e);
        }

        watchId = await Geolocation.watchPosition({ 
          enableHighAccuracy: true,
          timeout: 10000 
        }, (position, err) => {
          if (position) {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
          }
          if (err) {
            console.error('Erro ao observar localização:', err);
          }
        });
      } catch (e) {
        console.error('Erro geolocalização:', e);
      }
    };

    startWatching();

    return () => {
      subscription.unsubscribe();
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  }, []);

  useEffect(() => {
    if (entregas.length > 0 && !mapVisibleId) {
      const emRota = entregas.find(e => ['em_rota', 'chegou_coleta', 'chegou_entrega'].includes(e.status));
      if (emRota) {
        setMapVisibleId(emRota.id);
      }
    }
  }, [entregas]);

  async function fetchEntregas() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: entregador } = await supabase
        .from('entregadores')
        .select('id')
        .ilike('email', user.email)
        .single();

      if (!entregador) {
        setProfileMissing(true);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('nova_entrega')
        .select(`
          *,
          clientes:cliente_id (nome_completo, telefone)
        `)
        .eq('entregador_id', entregador.id)
        .in('status', ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega', 'criada'])
        .order('created_at', { ascending: true });

      if (error) throw error;
      setEntregas(data || []);
    } catch (error) {
      console.error('Erro ao buscar entregas em andamento:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, newStatus: string) {
    setUpdatingId(id);
    try {
      const currentEntrega = entregas.find(e => e.id === id);
      const opcionais = currentEntrega?.opcionais || {};
      const timeline = opcionais.timeline || {};
      const now = new Date().toISOString();

      if (newStatus === 'chegou_coleta') timeline.chegou_coleta = now;
      if (newStatus === 'em_rota') timeline.coletado = now;
      if (newStatus === 'chegou_entrega') timeline.chegou_entrega = now;
      if (newStatus === 'entregue') timeline.finalizado = now;

      const newOpcionais = { ...opcionais, timeline };

      const { error } = await supabase
        .from('nova_entrega')
        .update({ 
            status: newStatus, 
            updated_at: now,
            opcionais: newOpcionais
        })
        .eq('id', id);

      if (error) throw error;
      
      if (newStatus === 'entregue' || newStatus === 'cancelada') {
        setEntregas(prev => prev.filter(e => e.id !== id));
      } else {
        
        setEntregas(prev => prev.map(e => e.id === id ? { ...e, status: newStatus, opcionais: newOpcionais } : e));
      }

    } catch (error: any) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status: ' + error.message);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleRejeitar(id: string) {
    if (!confirm('Deseja realmente rejeitar esta entrega?')) return;
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('nova_entrega')
        .update({ 
          entregador_id: null, 
          status: 'criada',
          atribuicao_modo: 'manual',
          updated_at: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) throw error;
      
      setEntregas(prev => prev.filter(e => e.id !== id));
      
    } catch (error: any) {
      console.error('Erro ao rejeitar:', error);
      alert('Erro ao rejeitar: ' + error.message);
    } finally {
      setUpdatingId(null);
    }
  }

  const getFakeDeliveryPerson = (): MapDeliveryPerson | null => {
    if (!userLocation) return null;
    return {
      id: 'current-user',
      name: 'Você',
      email: '',
      phone: '',
      status: 'em_entrega',
      is_online: true,
      current_latitude: userLocation.lat,
      current_longitude: userLocation.lng,
      last_location_update: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      foto_url: photoUrl
    };
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Truck className="w-6 h-6" />
        Pedidos em Andamento
      </h1>
      
      {loading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : profileMissing ? (
        <div className="bg-red-50 p-6 rounded-lg border border-red-200 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-red-800 mb-2">Perfil de Entregador Não Encontrado</h3>
            <p className="text-red-600 mb-4">
                Seu usuário não está vinculado a nenhum perfil de entregador.
            </p>
            <p className="text-sm text-red-500">
                Entre em contato com o administrador para realizar seu cadastro.
            </p>
        </div>
      ) : entregas.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm text-center text-gray-500 border border-gray-100">
          <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Nenhum pedido em andamento.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {entregas.map((entrega) => {
            const coords = deliveryCoords[entrega.id];
            // Fases de Coleta: criada, atribuida, chegou_coleta
            // Nota: Se 'chegou_coleta', o próximo passo é sair para entrega, então talvez já queira ver o destino?
            // Mas o usuário pode querer ver o mapa da loja enquanto está lá. Vamos manter pickup até sair ('em_rota').
            const isPickupPhase = ['criada', 'atribuida', 'chegou_coleta'].includes(entrega.status);
            const destCoords = isPickupPhase ? coords?.pickup : coords?.delivery;
            
            let statusLabel = 'Aguardando Coleta';
            let statusColor = 'bg-yellow-100 text-yellow-700';

            if (entrega.status === 'chegou_coleta') {
                statusLabel = 'Na Loja';
                statusColor = 'bg-orange-100 text-orange-700';
            } else if (entrega.status === 'em_rota') {
                statusLabel = 'Em Rota';
                statusColor = 'bg-blue-100 text-blue-700';
            } else if (entrega.status === 'chegou_entrega') {
                statusLabel = 'No Cliente';
                statusColor = 'bg-purple-100 text-purple-700';
            }
            
            return (
            <div key={entrega.id} className="bg-white rounded-lg shadow-lg border-l-4 border-sky-500 overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-sky-50/50">
                 <div className="flex justify-between items-start">
                   <div>
                     <span className={`inline-block px-2 py-1 rounded text-xs font-bold uppercase mb-2 ${statusColor}`}>
                       {statusLabel}
                     </span>
                     <h3 className="font-bold text-gray-800">#{entrega.entrega_codigo_pedido || String(entrega.id).slice(0, 8)}</h3>
                   </div>
                   <div className="text-right">
                     <div className="flex items-center gap-1 text-green-600 font-bold text-lg justify-end mb-1">
                       <DollarSign size={18} />
                       {Number(entrega.valor_entregador ?? entrega.valor_entrega ?? 0).toFixed(2)}
                     </div>
                     <p className="text-sm font-medium text-gray-600">{entrega.clientes?.nome_completo}</p>
                     {(entrega.clientes?.telefone) && (
                       <a href={`tel:${entrega.clientes?.telefone}`} className="inline-flex items-center gap-1 text-xs text-sky-600 mt-1 hover:underline">
                         <Phone size={12} />
                         Ligar para cliente
                       </a>
                     )}
                   </div>
                 </div>
              </div>

              <div className="p-5 space-y-6">
                {/* Coleta Info */}
                <div className="relative pl-6 border-l-2 border-gray-200">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-gray-300" />
                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Coleta</p>
                  <p className="text-gray-800">{entrega.coleta_endereco_texto || 'Endereço cadastrado'}</p>
                  {entrega.coleta_contato && <p className="text-sm text-gray-500 mt-1">Falar com: {entrega.coleta_contato}</p>}
                </div>

                {/* Entrega Info */}
                <div className="relative pl-6 border-l-2 border-gray-200">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-sky-500" />
                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Entrega</p>
                  <p className="text-gray-800">{entrega.entrega_endereco_texto}</p>
                  {entrega.entrega_complemento && <p className="text-sm text-gray-500">{entrega.entrega_complemento}</p>}
                  {entrega.entrega_contato && <p className="text-sm text-gray-500 mt-1">Recebedor: {entrega.entrega_contato}</p>}
                </div>
                
                {entrega.observacoes && (
                  <div className="bg-yellow-50 p-3 rounded text-sm text-yellow-800 flex gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <p>{entrega.observacoes}</p>
                  </div>
                )}

                {/* Distances */}
                {distances[entrega.id] && (
                    <div className="grid grid-cols-3 gap-2 text-xs bg-gray-50 p-2 rounded border border-gray-100">
                        {['em_rota', 'chegou_coleta', 'chegou_entrega'].includes(entrega.status) ? (
                           <>
                             <div className="text-center col-span-3">
                                <span className="block text-gray-400">Distância até Entrega</span>
                                <span className="font-bold text-sky-600 text-lg">{distances[entrega.id].userToDelivery.toFixed(1)} km</span>
                             </div>
                           </>
                        ) : (
                           <>
                            <div className="text-center">
                                <span className="block text-gray-400">Até Coleta</span>
                                <span className="font-semibold text-gray-700">{distances[entrega.id].userToPickup.toFixed(1)} km</span>
                            </div>
                            <div className="text-center border-l border-gray-200">
                                <span className="block text-gray-400">Entrega</span>
                                <span className="font-semibold text-gray-700">{distances[entrega.id].pickupToDelivery.toFixed(1)} km</span>
                            </div>
                            <div className="text-center border-l border-gray-200">
                                <span className="block text-gray-400">Total</span>
                                <span className="font-bold text-sky-600">{(distances[entrega.id].userToPickup + distances[entrega.id].pickupToDelivery).toFixed(1)} km</span>
                            </div>
                           </>
                        )}
                    </div>
                )}

                {/* Map Toggle */}
                <button 
                  onClick={() => setMapVisibleId(mapVisibleId === entrega.id ? null : entrega.id)}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors text-sm font-medium"
                >
                  <MapIcon size={16} />
                  {mapVisibleId === entrega.id ? 'Ocultar Mapa' : 'Acompanhar no Mapa'}
                </button>

                {mapVisibleId === entrega.id && (
                  <div className="h-64 rounded-lg overflow-hidden border border-slate-200 relative">
                    {userLocation ? (
                      <MapView 
                        deliveryPersons={getFakeDeliveryPerson() ? [getFakeDeliveryPerson()!] : []}
                        center={userLocation ? [userLocation.lat, userLocation.lng] : undefined}
                        destination={destCoords}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
                        Obtendo sua localização...
                      </div>
                    )}
                    {!destCoords && (
                       <div className="absolute bottom-2 left-2 right-2 bg-white/90 p-2 rounded text-xs text-center text-slate-600 shadow-sm">
                         Destino sem coordenadas. O mapa mostra apenas sua localização.
                       </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-5 bg-gray-50 flex gap-3 flex-wrap">


                {/* ACEITAR (Se criada) */}
                {entrega.status === 'criada' && (
                  <button
                    onClick={() => updateStatus(entrega.id, 'atribuida')}
                    disabled={updatingId === entrega.id}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {updatingId === entrega.id ? 'Atualizando...' : (
                      <>
                        <CheckCircle size={18} />
                        Aceitar Entrega
                      </>
                    )}
                  </button>
                )}

                {/* CHEGUEI NA LOJA (Se atribuida) */}
                {entrega.status === 'atribuida' && (
                  <button
                    onClick={() => updateStatus(entrega.id, 'chegou_coleta')}
                    disabled={updatingId === entrega.id}
                    className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {updatingId === entrega.id ? 'Atualizando...' : (
                      <>
                        <MapPin size={18} />
                        Cheguei na Loja
                      </>
                    )}
                  </button>
                )}

                {/* SAIR PARA ENTREGA (Se chegou_coleta) */}
                {entrega.status === 'chegou_coleta' && (
                  <button
                    onClick={() => updateStatus(entrega.id, 'em_rota')}
                    disabled={updatingId === entrega.id}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {updatingId === entrega.id ? 'Atualizando...' : (
                      <>
                        <Navigation size={18} />
                        Sair para Entrega
                      </>
                    )}
                  </button>
                )}

                {/* CHEGUEI NO CLIENTE (Se em_rota) */}
                {entrega.status === 'em_rota' && (
                  <button
                    onClick={() => updateStatus(entrega.id, 'chegou_entrega')}
                    disabled={updatingId === entrega.id}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {updatingId === entrega.id ? 'Atualizando...' : (
                      <>
                        <MapPin size={18} />
                        Cheguei no Cliente
                      </>
                    )}
                  </button>
                )}

                {/* FINALIZAR (Se chegou_entrega) */}
                {entrega.status === 'chegou_entrega' && (
                  <button
                    onClick={() => updateStatus(entrega.id, 'entregue')}
                    disabled={updatingId === entrega.id}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {updatingId === entrega.id ? 'Atualizando...' : (
                      <>
                        <CheckCircle size={18} />
                        Finalizar Entrega
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}