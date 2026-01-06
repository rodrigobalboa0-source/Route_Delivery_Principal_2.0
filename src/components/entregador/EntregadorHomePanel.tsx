import { useEffect, useState, useRef } from 'react';
import { MapView, MapDeliveryPerson } from '../MapView';
import { MapPin, Truck, Home, Power, CheckCircle, XCircle } from 'lucide-react';
import { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { Geolocation } from '@capacitor/geolocation';
import { Modal } from '../Modal';

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
  const [ganhos, setGanhos] = useState(0);
  const [incomingDelivery, setIncomingDelivery] = useState<any>(null);
  const [commerceData, setCommerceData] = useState<{ nome: string, foto: string | null } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastLocationUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (incomingDelivery?.cliente_id) {
        
        supabase.rpc('get_cliente_public_info', { cid: incomingDelivery.cliente_id })
            .single()
            .then(({ data, error }) => {
                if (error) {
                    // Ignora erro 404 se a função ainda não existir no banco (migração pendente)
                    if (error.code === 'PGRST202' || error.message.includes('404')) {
                         console.warn('Função get_cliente_public_info não encontrada. Execute a migration fix_rpc_and_bucket.sql');
                    } else {
                         console.error('Erro ao buscar dados do comércio:', error);
                    }
                    setCommerceData(null);
                    return;
                }
                if (data) {
                    setCommerceData({
                        nome: data.nome_completo,
                        foto: data.foto_url
                    });
                }
            });
    } else {
        setCommerceData(null);
    }
  }, [incomingDelivery?.cliente_id]);

  useEffect(() => {
    
    audioRef.current = new Audio('data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'); // Short silence/placeholder, need real beep. 
    
    audioRef.current = new Audio('data:audio/wav;base64,UklGRl9vT1BXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'); 
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  
  useEffect(() => {
    let interval: any;
    if (incomingDelivery) {
        
        const playBeep = () => {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        };
        playBeep();
        interval = setInterval(playBeep, 2000);
    }
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [incomingDelivery]);

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
             .ilike('email', user.email || '')
             .single();
             
           if (data) {
             setEntregadorId(data.id);
             setPhotoUrl(data.foto_url);
             setIsOnline(data.is_online || false);
             
             
             const { data: entregasData } = await supabase
              .from('nova_entrega')
              .select('*')
              .eq('entregador_id', data.id)
              .eq('status', 'entregue');
              
             if (entregasData) {
               const total = entregasData.reduce((acc, curr) => acc + (curr.valor_entregador || curr.valor_entrega || 0), 0);
               setGanhos(total);
             }
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

  useEffect(() => {
    if (!entregadorId) return;

    
    const checkPending = async () => {
        
        
        const { data: assigned } = await supabase
            .from('nova_entrega')
            .select('*')
            .eq('entregador_id', entregadorId)
            .eq('status', 'atribuida')
            .eq('atribuicao_modo', 'automatica') 
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (assigned) {
             setIncomingDelivery(assigned);
             return;
        }

        
        const { data: created } = await supabase
            .from('nova_entrega')
            .select('*')
            .eq('status', 'criada')
            .is('entregador_id', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (created) {
            setIncomingDelivery(created);
        }
    };
    checkPending();

    const channel = supabase
      .channel('home_entregas_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'nova_entrega',
        },
        (payload) => {
           if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
               const newRecord = payload.new;
               
               
               if (newRecord.status === 'atribuida' && newRecord.entregador_id === entregadorId) {
                   
                   if (newRecord.atribuicao_modo === 'automatica') {
                       setIncomingDelivery(newRecord);
                   } else {
                       
                       if (incomingDelivery?.id === newRecord.id) {
                           setIncomingDelivery(null);
                       }
                   }
               } 
               
               
               else if (newRecord.status === 'criada' && !newRecord.entregador_id) {
                   
                   setIncomingDelivery(newRecord);
               }
               
               
               else if (incomingDelivery?.id === newRecord.id) {
                   
                   if (newRecord.entregador_id !== entregadorId && newRecord.status !== 'criada') {
                        setIncomingDelivery(null);
                   }
                   
                   
                   if (incomingDelivery.status === 'criada' && newRecord.status === 'atribuida' && newRecord.entregador_id !== entregadorId) {
                        setIncomingDelivery(null);
                   }
               }
           }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [entregadorId, incomingDelivery?.id]);

  const handleAceitar = async () => {
      if (!incomingDelivery || !entregadorId) return;

      
      if (incomingDelivery.status === 'atribuida' && incomingDelivery.entregador_id === entregadorId) {
          setIncomingDelivery(null);
          return;
      }

      
      if (incomingDelivery.status === 'criada') {
          try {
              const { error } = await supabase
                  .from('nova_entrega')
                  .update({ 
                      status: 'atribuida', 
                      entregador_id: entregadorId,
                      atribuicao_modo: 'manual', 
                      updated_at: new Date().toISOString()
                  })
                  .eq('id', incomingDelivery.id)
                  .eq('status', 'criada'); 

              if (error) throw error;
              
              setIncomingDelivery(null);
              alert('Entrega aceita com sucesso!');
          } catch (e) {
              console.error(e);
              alert('Não foi possível aceitar a entrega. Talvez outro entregador já tenha pego.');
              setIncomingDelivery(null);
          }
      }
  };

  const handleRecusar = async () => {
      if (!incomingDelivery) return;
      
      
      if (incomingDelivery.status === 'criada') {
          setIncomingDelivery(null);
          return;
      }

      if (!confirm('Tem certeza que deseja recusar esta entrega?')) return;
      
      try {
          await supabase.from('nova_entrega').update({
              entregador_id: null,
              status: 'criada',
              atribuicao_modo: 'manual',
              updated_at: new Date().toISOString()
          }).eq('id', incomingDelivery.id);
          setIncomingDelivery(null);
      } catch (e) {
          console.error(e);
      }
  };

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
        onClick={() => onNavigate('carteira_extrato')}
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

       {incomingDelivery && (
         <Modal 
             open={!!incomingDelivery} 
             onClose={() => {}} 
             title={incomingDelivery.status === 'criada' ? "Nova Entrega Disponível!" : "Nova Entrega Atribuída!"}
         >
            <div className="flex flex-col gap-4 items-center p-4">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center overflow-hidden border-4 animate-bounce ${incomingDelivery.status === 'criada' ? 'border-sky-100' : 'border-green-100'}`}>
                    {commerceData?.foto ? (
                         <img src={commerceData.foto} alt={commerceData.nome} className="w-full h-full object-cover" />
                    ) : (
                        <div className={`w-full h-full flex items-center justify-center ${incomingDelivery.status === 'criada' ? 'bg-sky-100 text-sky-600' : 'bg-green-100 text-green-600'}`}>
                            <Truck size={32} />
                        </div>
                    )}
                </div>
                
                <div className="text-center">
                    {commerceData?.nome && (
                        <h3 className="text-xl font-bold text-gray-900 mb-1">{commerceData.nome}</h3>
                    )}
                    <p className="text-lg font-medium text-gray-800">
                        {incomingDelivery.status === 'criada' ? 'Nova entrega disponível na região!' : 'Você recebeu uma nova entrega!'}
                    </p>
                    <p className="text-sm text-gray-500">#{incomingDelivery.id.slice(0, 8)}</p>
                </div>

                <div className="w-full bg-gray-50 p-3 rounded-lg border border-gray-100 text-sm">
                    <p className="font-semibold text-gray-700 mb-1">Retirada:</p>
                    <p className="text-gray-600 mb-2">{incomingDelivery.coleta_endereco_texto}</p>
                    
                    <p className="font-semibold text-gray-700 mb-1">Entrega:</p>
                    <p className="text-gray-600">{incomingDelivery.entrega_endereco_texto}</p>

                    <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center">
                         <span className="font-bold text-gray-700">Valor:</span>
                         <span className="font-bold text-green-600 text-lg">
                            R$ {(incomingDelivery.valor_entregador || incomingDelivery.valor_entrega || 0).toFixed(2)}
                         </span>
                    </div>
                </div>

                <div className="flex gap-3 w-full mt-2">
                    <button
                        onClick={handleRecusar}
                        className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                        <XCircle size={20} />
                        {incomingDelivery.status === 'criada' ? 'Rejeitar' : 'Recusar'}
                    </button>
                    <button
                        onClick={handleAceitar}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-lg shadow-green-200"
                    >
                        <CheckCircle size={20} />
                        {incomingDelivery.status === 'criada' ? 'Pegar Entrega' : 'Aceitar'}
                    </button>
                </div>
            </div>
        </Modal>
      )}
    </div>
  );
}
