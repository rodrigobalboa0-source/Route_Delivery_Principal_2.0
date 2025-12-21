import { useEffect, useState, useRef } from 'react';
import { MapView, MapDeliveryPerson } from '../MapView';
import { MapPin, Truck, Home, Power } from 'lucide-react';
import { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { Geolocation } from '@capacitor/geolocation';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

interface EntregadorHomePanelProps {
  onNavigate: (menu: string) => void;
}

export function EntregadorHomePanel({ onNavigate }: EntregadorHomePanelProps) {
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [entregadorId, setEntregadorId] = useState<string | null>(null);
  const lastLocationUpdateRef = useRef<number>(0);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
           const { data } = await supabase
             .from('entregadores')
             .select('id, foto_url, is_online')
             .eq('email', user.email)
             .single();
             
           if (data) {
             setEntregadorId(data.id);
             setPhotoUrl(data.foto_url);
             setIsOnline(data.is_online || false);
           }
        }
      } catch (e) { console.error(e); }
    };
    fetchProfile();

    let watchId: string | null = null;

    const startWatching = async () => {
      try {
        let permResult = await Geolocation.checkPermissions();
        
        if (permResult.location !== 'granted') {
          permResult = await Geolocation.requestPermissions();
        }

        if (permResult.location !== 'granted') {
          console.error('Permissão de localização negada');
          setLoadingLocation(false);
          return;
        }

        
        let initialPositionLoaded = false;
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
          initialPositionLoaded = true;
        } catch (e) {
          console.warn('Timeout ou erro ao obter posição inicial, aguardando watchPosition', e);
        }
        
        if (initialPositionLoaded) {
          setLoadingLocation(false);
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
            setLoadingLocation(false);
          }
          if (err) {
            console.error('Erro ao observar localização:', err);
           
            setLoadingLocation((prev) => {
                if (prev) return false;
                return prev;
            });
          }
        });
      } catch (e) {
        console.error('Erro ao iniciar geolocalização:', e);
        setLoadingLocation(false);
      }
    };

    startWatching();

    return () => {
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  }, []);

  // Effect to push location to DB
  useEffect(() => {
    const pushLocation = async () => {
      if (!entregadorId || !userLocation || !isOnline) return;

      const now = Date.now();
      // Throttle updates to every 10 seconds
      if (now - lastLocationUpdateRef.current < 10000) return;

      try {
        await supabase.from('entregadores').update({
          current_latitude: userLocation.lat,
          current_longitude: userLocation.lng,
          last_location_update: new Date().toISOString(),
          is_online: true // Ensure it stays online
        }).eq('id', entregadorId);
        
        lastLocationUpdateRef.current = now;
      } catch (e) {
        console.error('Erro ao atualizar localização no servidor:', e);
      }
    };

    pushLocation();
  }, [userLocation, isOnline, entregadorId]);

  const toggleOnline = async () => {
    if (!entregadorId) return;
    const newState = !isOnline;
    setIsOnline(newState);
    
    try {
      await supabase.from('entregadores').update({
        is_online: newState,
        // If going offline, maybe clear location or just update status?
        // We'll update the timestamp at least.
        last_location_update: new Date().toISOString()
      }).eq('id', entregadorId);
    } catch (e) {
      console.error('Erro ao atualizar status online:', e);
      setIsOnline(!newState); // Revert on error
    }
  };

  const getFakeDeliveryPerson = (): MapDeliveryPerson | null => {
    if (!userLocation) return null;
    return {
      id: 'current-user',
      name: 'Você',
      email: '',
      phone: '',
      status: 'disponivel',
      is_online: isOnline,
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <Home className="w-6 h-6" />
          Home
        </h1>
        
        <button
          onClick={toggleOnline}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all shadow-sm ${
            isOnline 
              ? 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200' 
              : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
          }`}
        >
          <Power size={18} />
          {isOnline ? 'Online' : 'Offline'}
        </button>
      </div>

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
        <div className="grid grid-cols-2 gap-4 h-32">
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