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
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(() => {
    try {
      const saved = localStorage.getItem('last_known_location');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [loadingLocation, setLoadingLocation] = useState(!userLocation);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [entregadorId, setEntregadorId] = useState<string | null>(null);
  const lastLocationUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (userLocation) {
      localStorage.setItem('last_known_location', JSON.stringify(userLocation));
    }
  }, [userLocation]);

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

  useEffect(() => {
    const pushLocation = async () => {
      if (!entregadorId || !userLocation || !isOnline) return;

      const now = Date.now();
      if (now - lastLocationUpdateRef.current < 10000) return;

      try {
        await supabase.from('entregadores').update({
          current_latitude: userLocation.lat,
          current_longitude: userLocation.lng,
          last_location_update: new Date().toISOString(),
          is_online: true 
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

    if (!isOnline && !photoUrl) {
      alert('Você precisa cadastrar uma foto de perfil antes de ficar online.');
      onNavigate('conta_minha_conta');
      return;
    }

    const newState = !isOnline;
    setIsOnline(newState);
    
    try {
      await supabase.from('entregadores').update({
        is_online: newState,
        last_location_update: new Date().toISOString()
      }).eq('id', entregadorId);
    } catch (e) {
      console.error('Erro ao atualizar status online:', e);
      setIsOnline(!newState); 
    }
  };

  const getFakeDeliveryPerson = (): MapDeliveryPerson | null => {
    if (!userLocation) return null;
    return {
      id: 'current-user',
      name: 'Você',
      email: '',
      phone: '',
      status: isOnline ? 'disponivel' : 'inativo',
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
    <div className="h-full w-full relative bg-slate-100">
      {/* Map covering the full screen */}
      <div className="absolute inset-0 z-0">
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

      {/* Floating Header Elements */}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={toggleOnline}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all shadow-md ${
            isOnline 
              ? 'bg-green-500 text-white border-2 border-green-600 hover:bg-green-600' 
              : 'bg-slate-700 text-white border-2 border-slate-800 hover:bg-slate-800'
          }`}
        >
          <Power size={18} />
          {isOnline ? 'Online' : 'Offline'}
        </button>
      </div>

      <button
        onClick={() => onNavigate('carteira')}
        className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-4 py-2 min-w-[120px] flex flex-col items-center border border-slate-200 hover:bg-slate-50 transition-colors"
      >
         <span className="text-xs text-slate-500 font-bold uppercase mb-0.5">Ganhos</span>
         <span className="text-lg font-bold text-slate-800 leading-none">R$ {ganhos.toFixed(2)}</span>
      </button>

      {/* Floating Bottom Buttons */}
      <div className="absolute bottom-6 left-4 right-4 z-10">
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onNavigate('entregas_disponiveis')}
            className="flex flex-col items-center justify-center py-3 bg-white/95 backdrop-blur-sm hover:bg-sky-50 border-2 border-sky-100 hover:border-sky-300 rounded-xl transition-all shadow-lg group"
          >
            <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform mb-1">
              <MapPin size={18} />
            </div>
            <span className="font-semibold text-slate-700 text-sm">Disponíveis</span>
          </button>

          <button
            onClick={() => onNavigate('entregas_andamento')}
            className="flex flex-col items-center justify-center py-3 bg-white/95 backdrop-blur-sm hover:bg-emerald-50 border-2 border-emerald-100 hover:border-emerald-300 rounded-xl transition-all shadow-lg group"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform mb-1">
              <Truck size={18} />
            </div>
            <span className="font-semibold text-slate-700 text-sm">Em Andamento</span>
          </button>
        </div>
      </div>
    </div>
  );
}