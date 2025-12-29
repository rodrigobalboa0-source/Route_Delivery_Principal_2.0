import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, Navigation, Package, DollarSign, Clock, AlertCircle } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; 
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

async function getCoordsFromAddress(address: string): Promise<[number, number] | undefined> {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`, {
        headers: { 'User-Agent': 'RouteDeliveryApp/1.0' }
      });
      const data = await res.json();
      if (data && data[0]) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch (e) {
      console.error(e);
    }
    return undefined;
}

export function EntregadorEntregasDisponiveisPanel() {
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [distances, setDistances] = useState<Record<string, { toPickup: number, toDelivery: number }>>({});

  useEffect(() => {
    Geolocation.getCurrentPosition().then(pos => {
        setCurrentLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
        });
    }).catch(err => console.error('Error getting location', err));
  }, []);

  useEffect(() => {
      if (!currentLocation || entregas.length === 0) return;
      
      const calculate = async () => {
          
          const newDistances = { ...distances };
          let changed = false;

          for (const entrega of entregas) {
              if (newDistances[entrega.id]) continue; 

              if (entrega.coleta_endereco_texto) {
                  
                  await new Promise(r => setTimeout(r, 500));
                  
                  const pickupCoords = await getCoordsFromAddress(entrega.coleta_endereco_texto);
                  if (pickupCoords) {
                      const distToPickup = getDistanceFromLatLonInKm(
                          currentLocation.lat, currentLocation.lng,
                          pickupCoords[0], pickupCoords[1]
                      );
                      
                      let distPickupToDelivery = 0;
                      if (entrega.entrega_endereco_texto) {
                          const deliveryCoords = await getCoordsFromAddress(entrega.entrega_endereco_texto);
                          if (deliveryCoords) {
                               distPickupToDelivery = getDistanceFromLatLonInKm(
                                  pickupCoords[0], pickupCoords[1],
                                  deliveryCoords[0], deliveryCoords[1]
                               );
                          }
                      }
                      
                      newDistances[entrega.id] = {
                          toPickup: distToPickup,
                          toDelivery: distPickupToDelivery
                      };
                      changed = true;
                      
                      
                      setDistances(prev => ({
                          ...prev,
                          [entrega.id]: {
                              toPickup: distToPickup,
                              toDelivery: distPickupToDelivery
                          }
                      }));
                  }
              }
          }
      };
      
      calculate();
  }, [entregas, currentLocation]);

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
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: entregador } = await supabase
        .from('entregadores')
        .select('id')
        .eq('email', user.email)
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

              {distances[entrega.id] && (
                <div className="grid grid-cols-3 gap-2 mb-4 text-xs bg-gray-50 p-2 rounded border border-gray-100">
                    <div className="text-center">
                        <span className="block text-gray-400">Até Coleta</span>
                        <span className="font-semibold text-gray-700">{distances[entrega.id].toPickup.toFixed(1)} km</span>
                    </div>
                    <div className="text-center border-l border-gray-200">
                        <span className="block text-gray-400">Percurso</span>
                        <span className="font-semibold text-gray-700">{distances[entrega.id].toDelivery.toFixed(1)} km</span>
                    </div>
                    <div className="text-center border-l border-gray-200">
                        <span className="block text-gray-400">Total</span>
                        <span className="font-bold text-sky-600">{(distances[entrega.id].toPickup + distances[entrega.id].toDelivery).toFixed(1)} km</span>
                    </div>
                </div>
              )}

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
