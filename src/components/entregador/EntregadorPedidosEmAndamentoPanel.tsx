import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, CheckCircle, Truck, AlertCircle, Phone, Navigation, Map as MapIcon } from 'lucide-react';
import { MapView, MapDeliveryPerson } from '../MapView';
import type { Database } from '../../lib/database.types';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

export function EntregadorPedidosEmAndamentoPanel() {
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mapVisibleId, setMapVisibleId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchEntregas();

    const fetchPhoto = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
           const { data } = await supabase.from('entregadores').select('foto_url').eq('email', user.email).single();
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

    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error('Erro ao obter localização:', error);
        },
        { enableHighAccuracy: true }
      );
      return () => {
        navigator.geolocation.clearWatch(watchId);
        subscription.unsubscribe();
      };
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (entregas.length > 0 && !mapVisibleId) {
      const emRota = entregas.find(e => e.status === 'em_rota');
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
        .eq('email', user.email)
        .single();

      if (!entregador) return;

      const { data, error } = await supabase
        .from('nova_entrega')
        .select(`
          *,
          clientes:cliente_id (nome_completo, telefone, celular)
        `)
        .eq('entregador_id', entregador.id)
        .in('status', ['atribuida', 'em_rota'])
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
      const { error } = await supabase
        .from('nova_entrega')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      
      if (newStatus === 'entregue' || newStatus === 'cancelada') {
        setEntregas(prev => prev.filter(e => e.id !== id));
      } else {
        
        setEntregas(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e));
      }

    } catch (error: any) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status: ' + error.message);
    } finally {
      setUpdatingId(null);
    }
  }

  const getDestinationCoords = (address: string): [number, number] | undefined => {
    if (!address) return undefined;
    const match = address.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    if (match) {
      return [parseFloat(match[1]), parseFloat(match[2])];
    }
    return undefined;
  };

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
      ) : entregas.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm text-center text-gray-500 border border-gray-100">
          <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Nenhum pedido em andamento.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {entregas.map((entrega) => {
            const destCoords = getDestinationCoords(entrega.entrega_endereco_texto || '') || 
                               getDestinationCoords(entrega.coleta_endereco_texto || ''); // Fallback to coleta if delivery has no coords
            
            return (
            <div key={entrega.id} className="bg-white rounded-lg shadow-lg border-l-4 border-sky-500 overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-sky-50/50">
                 <div className="flex justify-between items-start">
                   <div>
                     <span className={`inline-block px-2 py-1 rounded text-xs font-bold uppercase mb-2 ${
                       entrega.status === 'atribuida' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                     }`}>
                       {entrega.status === 'atribuida' ? 'Aguardando Coleta' : 'Em Rota'}
                     </span>
                     <h3 className="font-bold text-gray-800">#{entrega.entrega_codigo_pedido || String(entrega.id).slice(0, 8)}</h3>
                   </div>
                   <div className="text-right">
                     <p className="text-sm font-medium text-gray-600">{entrega.clientes?.nome_completo}</p>
                     {(entrega.clientes?.telefone || entrega.clientes?.celular) && (
                       <a href={`tel:${entrega.clientes?.celular || entrega.clientes?.telefone}`} className="inline-flex items-center gap-1 text-xs text-sky-600 mt-1 hover:underline">
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

              <div className="p-5 bg-gray-50 flex gap-3">
                {entrega.status === 'atribuida' && (
                  <button
                    onClick={() => updateStatus(entrega.id, 'em_rota')}
                    disabled={updatingId === entrega.id}
                    className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {updatingId === entrega.id ? 'Atualizando...' : (
                      <>
                        <Navigation size={18} />
                        Iniciei a Rota / Coletei
                      </>
                    )}
                  </button>
                )}
                
                {entrega.status === 'em_rota' && (
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