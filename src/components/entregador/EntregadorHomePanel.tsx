import { useEffect, useState } from 'react';
import { MapView, MapDeliveryPerson } from '../MapView';
import { MapPin, Truck, Home } from 'lucide-react';
import { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

interface EntregadorHomePanelProps {
  onNavigate: (menu: string) => void;
}

export function EntregadorHomePanel({ onNavigate }: EntregadorHomePanelProps) {
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
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

    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setLoadingLocation(false);
        },
        (error) => {
          console.error('Erro ao obter localização:', error);
          setLoadingLocation(false);
        },
        { enableHighAccuracy: true }
      );
      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    } else {
      setLoadingLocation(false);
    }
  }, []);

  const getFakeDeliveryPerson = (): MapDeliveryPerson | null => {
    if (!userLocation) return null;
    return {
      id: 'current-user',
      name: 'Você',
      email: '',
      phone: '',
      status: 'disponivel',
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
    <div className="p-6 max-w-4xl mx-auto h-full flex flex-col">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2 text-slate-800">
        <Home className="w-6 h-6" />
        Home
      </h1>

      <div className="flex-1 flex flex-col gap-6">
        {/* Map Section */}
        <div className="bg-white p-1 rounded-lg shadow-md border border-slate-200 flex-1 min-h-[300px] relative overflow-hidden flex flex-col">
          <div className="absolute top-2 left-2 z-10 bg-white/90 px-3 py-1 rounded-full text-xs font-medium text-slate-600 shadow-sm">
            Sua localização atual
          </div>

          <div className="absolute top-2 right-2 z-10 bg-white rounded-lg shadow-lg px-4 py-2 min-w-[120px] flex flex-col items-center border border-slate-100">
             <span className="text-xs text-slate-500 font-bold uppercase mb-0.5">Ganhos</span>
             <span className="text-lg font-bold text-slate-800 leading-none">R$ 0,00</span>
          </div>
          <div className="flex-1 rounded-lg overflow-hidden relative">
             {loadingLocation ? (
               <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
                 <div className="text-slate-500 flex flex-col items-center gap-2">
                   <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                   <span>Obtendo localização...</span>
                 </div>
               </div>
             ) : userLocation ? (
               <MapView 
                 deliveryPersons={getFakeDeliveryPerson() ? [getFakeDeliveryPerson()!] : []}
                 center={[userLocation.lat, userLocation.lng]}
               />
             ) : (
               <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-500 px-6 text-center">
                 Não foi possível obter sua localização. Verifique as permissões do navegador.
               </div>
             )}
          </div>
        </div>

        {/* Buttons Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-32">
          <button
            onClick={() => onNavigate('entregas_disponiveis')}
            className="flex flex-col items-center justify-center gap-3 bg-white hover:bg-sky-50 border-2 border-sky-100 hover:border-sky-300 rounded-xl transition-all shadow-sm group"
          >
            <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <MapPin size={24} />
            </div>
            <span className="font-semibold text-slate-700 text-lg">Entregas Disponíveis</span>
          </button>

          <button
            onClick={() => onNavigate('entregas_andamento')}
            className="flex flex-col items-center justify-center gap-3 bg-white hover:bg-emerald-50 border-2 border-emerald-100 hover:border-emerald-300 rounded-xl transition-all shadow-sm group"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Truck size={24} />
            </div>
            <span className="font-semibold text-slate-700 text-lg">Em Andamento</span>
          </button>
        </div>
      </div>
    </div>
  );
}