import { useEffect, useState, useRef } from 'react';
import { MapView, MapDeliveryPerson } from '../MapView';
import { MapPin, Truck, Home, Power, CheckCircle, XCircle } from 'lucide-react';
import { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { Geolocation } from '@capacitor/geolocation';
import { getCoordsFromAddress, getDistanceFromLatLonInKm } from '../../utils/geo';
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
  const [deliveryDistance, setDeliveryDistance] = useState<number | null>(null);
  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastLocationUpdateRef = useRef<number>(0);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);

  const [rejectedIds, setRejectedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('rejected_deliveries');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('rejected_deliveries', JSON.stringify(rejectedIds));
  }, [rejectedIds]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('configuracoes_comercio')
          .select('raio_busca_entregador')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('Erro ao carregar raio de busca do comércio:', error);
          setRadiusKm(30);
          return;
        }

        if (data && typeof data.raio_busca_entregador === 'number') {
          setRadiusKm(data.raio_busca_entregador || 30);
        } else {
          setRadiusKm(30);
        }
      } catch (e) {
        console.error('Erro inesperado ao carregar configurações do comércio:', e);
        setRadiusKm(30);
      }
    };

    fetchConfig();
  }, []);

  useEffect(() => {
    if (incomingDelivery?.cliente_id) {
        
        supabase.rpc('get_cliente_public_info', { cid: incomingDelivery.cliente_id })
            .single()
            .then(({ data, error }) => {
                if (error) {
                    
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
        
        const playSound = () => {
            
            const audio = new Audio('/notification.mp3');
            audio.play().catch(e => {
                console.warn('Som personalizado não encontrado ou erro ao tocar, usando fallback:', e);
                
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
            });
        };
        playSound();
        interval = setInterval(playSound, 2000); 
    }
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [incomingDelivery]);

  useEffect(() => {
    if (incomingDelivery?.distancia_km !== undefined && incomingDelivery?.distancia_km !== null) {
        setDeliveryDistance(Number(incomingDelivery.distancia_km));
        setCalculatingDistance(false);
        return;
    }

    if (incomingDelivery?.coleta_endereco_texto && incomingDelivery?.entrega_endereco_texto) {
        const calcDist = async () => {
            setCalculatingDistance(true);
            try {
                const [pickup, delivery] = await Promise.all([
                    getCoordsFromAddress(incomingDelivery.coleta_endereco_texto),
                    getCoordsFromAddress(incomingDelivery.entrega_endereco_texto)
                ]);
                
                if (pickup && delivery) {
                    const dist = getDistanceFromLatLonInKm(pickup[0], pickup[1], delivery[0], delivery[1]);
                    setDeliveryDistance(dist);
                } else {
                    setDeliveryDistance(null);
                }
            } catch (e) {
                setDeliveryDistance(null);
            } finally {
                setCalculatingDistance(false);
            }
        };
        calcDist();
    } else {
        setDeliveryDistance(null);
        setCalculatingDistance(false);
    }
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
             .select('id, foto_url, foto_base64, is_online')
             .ilike('email', user.email || '')
             .single();
             
           if (data) {
             setEntregadorId(data.id);
             setPhotoUrl(data.foto_url || data.foto_base64);
             setIsOnline(data.is_online || false);
             
             
             const { data: entregasData } = await supabase
              .from('nova_entrega')
              .select('*')
              .eq('entregador_id', data.id)
              .eq('status', 'entregue');
              
             const { data: acertosData } = await supabase
               .from('acertos_entregadores')
               .select('valor_pago')
               .eq('entregador_id', data.id)
               .eq('status', 'pago');
              
             if (entregasData) {
               const totalEntregas = entregasData.reduce((acc, curr) => acc + (curr.valor_entregador || curr.valor_entrega || 0), 0);
               const totalAcertos = acertosData?.reduce((acc, curr) => acc + (Number(curr.valor_pago) || 0), 0) || 0;
               setGanhos(totalEntregas - totalAcertos);
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
        if (!isOnline) {
             setIncomingDelivery(null);
             return;
        }

        const effectiveRadiusKm = radiusKm ?? 30;
        
        const { data: assigned } = await supabase
            .from('nova_entrega')
            .select('*')
            .eq('entregador_id', entregadorId)
            .eq('status', 'atribuida')
            .eq('atribuicao_modo', 'automatica') 
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (assigned && !rejectedIds.includes(assigned.id)) {
             setIncomingDelivery(assigned);
             return;
        }

        // Check limit before looking for pool deliveries
        const { data: configData } = await supabase.from('configuracoes_comercio').select('limite_entregas_simultaneas').limit(1).single();
        const limit = configData?.limite_entregas_simultaneas || 10;
        
        const { count } = await supabase
            .from('nova_entrega')
            .select('*', { count: 'exact', head: true })
            .eq('entregador_id', entregadorId)
            .in('status', ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega']);
            
        const currentActive = count || 0;
        
        // Lógica de histerese: Se atingir o limite, bloqueia até zerar tudo
        const isLocked = localStorage.getItem('delivery_limit_locked') === 'true';
        let newLockedState = isLocked;

        if (currentActive === 0) {
            newLockedState = false;
        } else if (currentActive >= limit) {
            newLockedState = true;
        }

        if (newLockedState !== isLocked) {
            localStorage.setItem('delivery_limit_locked', String(newLockedState));
        }
        
        if (newLockedState) {
             if (!assigned) setIncomingDelivery(null);
             return;
        }

        
        const { data: createdCandidates } = await supabase
            .from('nova_entrega')
            .select('*, pedidos!inner(status)')
            .eq('status', 'criada')
            .is('entregador_id', null)
            .eq('pedidos.status', 'pronto')
            .order('created_at', { ascending: false })
            .limit(20);

        if (createdCandidates) {
             for (const c of createdCandidates) {
                 if (rejectedIds.includes(c.id)) continue;

                 
                 if (c.coleta_endereco_texto && userLocation) {
                     try {
                         const pickupCoords = await getCoordsFromAddress(c.coleta_endereco_texto);
                         if (pickupCoords) {
                             const dist = getDistanceFromLatLonInKm(
                                 userLocation.lat, userLocation.lng,
                                 pickupCoords[0], pickupCoords[1]
                             );
                             if (dist > effectiveRadiusKm) continue;
                         }
                     } catch (e) {
                         console.error('Erro ao verificar raio:', e);
                     }
                 }

                 setIncomingDelivery(c);
                 return;
             }
        }
        
        if (!assigned) {
            setIncomingDelivery(null);
        }
    };
    
    const intervalId = setInterval(() => {
        checkPending();
    }, 5000); 

    
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
        async (payload) => {
           
           if (!isOnline) return;

           if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
               const newRecord = payload.new;

               
               if (newRecord.pedido_id) {
                   const { data: p, error: pError } = await supabase
                       .from('pedidos')
                       .select('status')
                       .eq('id', newRecord.pedido_id)
                       .single();
                   
                   if (pError) {
                       console.warn('Erro ao verificar status do pedido. Verifique se a política RLS "Entregadores podem ver pedidos" foi aplicada.', pError);
                   }
                   
                   if (!p || p.status !== 'pronto') {
                       
                       if (incomingDelivery?.id === newRecord.id) {
                           setIncomingDelivery(null);
                       }
                       return;
                   }
               }
               
               if (rejectedIds.includes(newRecord.id)) return;

               
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
                  
                   // Check limit
                   const { data: configData } = await supabase.from('configuracoes_comercio').select('limite_entregas_simultaneas').limit(1).single();
                   const limit = configData?.limite_entregas_simultaneas || 10;
                   const { count } = await supabase
                        .from('nova_entrega')
                        .select('*', { count: 'exact', head: true })
                        .eq('entregador_id', entregadorId)
                        .in('status', ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega']);
                   
                   const currentActive = count || 0;
                   // Lógica de histerese: Se atingir o limite, bloqueia até zerar tudo
                   const isLocked = localStorage.getItem('delivery_limit_locked') === 'true';
                   let newLockedState = isLocked;

                   if (currentActive === 0) {
                       newLockedState = false;
                   } else if (currentActive >= limit) {
                       newLockedState = true;
                   }

                   if (newLockedState !== isLocked) {
                       localStorage.setItem('delivery_limit_locked', String(newLockedState));
                   }

                   if (newLockedState) return;

                   const effectiveRadiusKm = radiusKm ?? 30;
                   let inRadius = true;
                   if (newRecord.coleta_endereco_texto && userLocation) {
                        try {
                             const pickupCoords = await getCoordsFromAddress(newRecord.coleta_endereco_texto);
                             if (pickupCoords) {
                                 const dist = getDistanceFromLatLonInKm(
                                     userLocation.lat, userLocation.lng,
                                     pickupCoords[0], pickupCoords[1]
                                 );
                                 if (dist > effectiveRadiusKm) {
                                     inRadius = false;
                                     console.log(`Entrega fora do raio: ${dist.toFixed(2)}km > ${effectiveRadiusKm}km`);
                                 }
                             } else {
                                 console.warn('Não foi possível obter coordenadas para verificar raio. Assumindo dentro.');
                             }
                        } catch (e) {
                             console.error('Erro realtime raio:', e);
                            
                        }
                   }
                   
                   if (inRadius) {
                       setIncomingDelivery(newRecord);
                   }
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
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [entregadorId, incomingDelivery?.id, rejectedIds, isOnline]);

  useEffect(() => {
    if (!entregadorId) return;

    const fetchBalance = async () => {
        const { data: entregasData } = await supabase
            .from('nova_entrega')
            .select('valor_entrega, valor_entregador')
            .eq('entregador_id', entregadorId)
            .eq('status', 'entregue');

        const { data: acertosData } = await supabase
            .from('acertos_entregadores')
            .select('valor_pago')
            .eq('entregador_id', entregadorId)
            .eq('status', 'pago');

        const totalEntregas = entregasData?.reduce((acc, curr) => acc + (curr.valor_entregador || curr.valor_entrega || 0), 0) || 0;
        const totalAcertos = acertosData?.reduce((acc, curr) => acc + (Number(curr.valor_pago) || 0), 0) || 0;
        
        setGanhos(totalEntregas - totalAcertos);
    };

    const channel = supabase
      .channel('home_acertos_balance')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'acertos_entregadores',
          filter: `entregador_id=eq.${entregadorId}`
        },
        () => {
            fetchBalance();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [entregadorId]);

  const handleAceitar = async () => {
      if (!incomingDelivery) return;

      let currentEntregadorId = entregadorId;

      if (!currentEntregadorId) {
          try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user?.email) {
                   const { data } = await supabase
                     .from('entregadores')
                     .select('id')
                     .ilike('email', user.email)
                     .single();
                   if (data) {
                       currentEntregadorId = data.id;
                       setEntregadorId(data.id);
                   }
              }
          } catch (e) {
              console.error('Erro ao tentar recuperar entregador_id on-the-fly', e);
          }
      }

      if (!currentEntregadorId) {
          console.error('Entregador ID não encontrado ao tentar aceitar entrega');
          alert('Erro: Seu perfil de entregador não foi carregado corretamente. Por favor, recarregue a página.');
          return;
      }

      
      if (incomingDelivery.status === 'atribuida' && incomingDelivery.entregador_id === currentEntregadorId) {
          setIncomingDelivery(null);
          onNavigate('entregas_andamento');
          return;
      }

      
      if (incomingDelivery.status === 'criada') {
          try {
             
              const { data: configData } = await supabase
                .from('configuracoes_comercio')
                .select('limite_entregas_simultaneas')
                .limit(1)
                .single();
              
              const limit = configData?.limite_entregas_simultaneas || 10;

              
              const { count, error: countError } = await supabase
                .from('nova_entrega')
                .select('*', { count: 'exact', head: true })
                .eq('entregador_id', currentEntregadorId)
                .in('status', ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega']);

              if (countError) throw countError;

              const currentActive = count || 0;
              
              const isLocked = localStorage.getItem('delivery_limit_locked') === 'true';
              if (isLocked) {
                   alert('Você precisa finalizar suas entregas pendentes antes de pegar novas.');
                   setIncomingDelivery(null);
                   return;
              }

              if (currentActive >= limit) {
                localStorage.setItem('delivery_limit_locked', 'true');
                alert(`Você atingiu o limite de ${limit} entregas simultâneas. Finalize todas para pegar mais.`);
                setIncomingDelivery(null);
                return;
              }

              const { data, error } = await supabase.rpc('aceitar_entrega', {
                  entrega_id: incomingDelivery.id
              });

              if (error) throw error;
              
              if (data && !data.success) {
                  throw new Error(data.message || 'Erro ao aceitar entrega');
              }
              
              if (currentActive + 1 >= limit) {
                  localStorage.setItem('delivery_limit_locked', 'true');
              }
              
              setIncomingDelivery(null);
              
              onNavigate('entregas_andamento'); 
          } catch (e: any) {
              console.error(e);
              alert(e.message || 'Não foi possível aceitar a entrega. Talvez outro entregador já tenha pego.');
              setIncomingDelivery(null);
          }
      }
  };

  const handleRecusar = async () => {
      if (!incomingDelivery) return;
      
      
      setRejectedIds(prev => [...prev, incomingDelivery.id]);
      
      
      if (incomingDelivery.status === 'criada') {
          setIncomingDelivery(null);
          return;
      }

      
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

    if (isOnline) {
      try {
        const { count, error } = await supabase
          .from('nova_entrega')
          .select('*', { count: 'exact', head: true })
          .eq('entregador_id', entregadorId)
          .neq('status', 'entregue')
          .neq('status', 'cancelada');

        if (error) throw error;

        if (count && count > 0) {
          alert('Você não pode ficar offline enquanto tiver entregas em andamento. Finalize suas entregas primeiro.');
          return;
        }
      } catch (e) {
        console.error('Erro ao verificar entregas ativas:', e);
        alert('Não foi possível verificar suas entregas. Tente novamente.');
        return;
      }
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

       {incomingDelivery && (
         <Modal 
             open={!!incomingDelivery} 
             onClose={() => {}} 
             title=""
             hideFooter={true}
         >
            <div className="flex flex-col gap-4 items-center p-4">
               <div className={`w-20 h-20 rounded-full flex items-center justify-center overflow-hidden border-4 ${incomingDelivery.status === 'criada' ? 'border-sky-100' : 'border-green-100'}`}>
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

                    {(deliveryDistance !== null || calculatingDistance) && (
                        <div className="mt-2 bg-gray-50 px-3 py-1 rounded-full inline-block border border-gray-200">
                             <span className="text-sm text-gray-500 font-medium">Entrega: </span>
                             {calculatingDistance ? (
                                 <span className="text-sm font-bold text-slate-400 animate-pulse">Calc...</span>
                             ) : (
                                 <span className="text-sm font-bold text-sky-600">{deliveryDistance?.toFixed(1)} km</span>
                             )}
                        </div>
                    )}
                </div>

                <div className="w-full bg-gray-50 p-3 rounded-lg border border-gray-100 text-sm">
                    <p className="font-semibold text-gray-700 mb-1">Retirada:</p>
                    <p className="text-gray-600 mb-2">{incomingDelivery.coleta_endereco_texto}</p>
                    
                    <p className="font-semibold text-gray-700 mb-1">Entrega:</p>
                    <p className="text-gray-600">{incomingDelivery.entrega_endereco_texto}</p>

                    <div className="mt-3 pt-3 border-t border-gray-200 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                             <span className="font-bold text-gray-700">Valor:</span>
                             <span className="font-bold text-green-600 text-lg">
                                R$ {(incomingDelivery.valor_entregador ?? incomingDelivery.valor_entrega ?? 0).toFixed(2)}
                             </span>
                        </div>
                        {incomingDelivery.opcionais?.driver_bonuses && Array.isArray(incomingDelivery.opcionais.driver_bonuses) && (
                            <div className="flex flex-col items-end gap-1">
                                {incomingDelivery.opcionais.driver_bonuses.map((bonus: any, idx: number) => {
                                    const isReturn = bonus.description && bonus.description.toLowerCase().includes('retorno');
                                    return (
                                    <div key={idx} className="text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100 flex items-center gap-1">
                                        <span className="text-[10px] text-green-600 opacity-75">{isReturn ? 'Com retorno' : bonus.description}</span>
                                    </div>
                                    );
                                })}
                            </div>
                        )}
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