import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapView, MapDeliveryPerson } from '../MapViewOwnApi';
import { MapPin, Truck, Home, Power, CheckCircle, XCircle } from 'lucide-react';
import { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { Geolocation } from '@capacitor/geolocation';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { App } from '@capacitor/app';
import { getCoordsFromAddress, getDistanceFromLatLonInKm } from '../../utils/geo';
import { Modal } from '../Modal';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

interface EntregadorHomePanelProps {
  onNavigate: (menu: string) => void;
}


async function fetchGanhosDia(entregadorId: string): Promise<number> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

  const { data } = await supabase
    .from('nova_entrega')
    .select('valor_entregador')
    .eq('entregador_id', entregadorId)
    .eq('status', 'entregue')
    .gte('updated_at', startOfDay.toISOString())
    .lt('updated_at', endOfDay.toISOString());

  return (data || []).reduce((acc, curr) => acc + (Number(curr.valor_entregador) || 0), 0);
}

export function EntregadorHomePanel({ onNavigate }: EntregadorHomePanelProps) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [entregadorId, setEntregadorId] = useState<string | null>(null);
  const [ganhosDia, setGanhosDia] = useState(0);
  const [incomingDelivery, setIncomingDelivery] = useState<any>(null);
  const [commerceData, setCommerceData] = useState<{ nome: string, foto: string | null } | null>(null);
  const [deliveryDistance, setDeliveryDistance] = useState<number | null>(null);
  const [calculatingDistance, setCalculatingDistance] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);

  const [rejectedIds, setRejectedIds] = useState<string[]>([]);
  const [incomingValorEntregadorCalc, setIncomingValorEntregadorCalc] = useState<number | null>(null);
  const [calculatingIncomingValorEntregador, setCalculatingIncomingValorEntregador] = useState(false);
  const [incomingComissaoDestinosCalc, setIncomingComissaoDestinosCalc] = useState<Array<{ destino: number; km: number; valor: number }> | null>(null);
  const [incomingComissaoRetornoCalc, setIncomingComissaoRetornoCalc] = useState<number | null>(null);
  const [incomingDriverDynamicRules, setIncomingDriverDynamicRules] = useState<Array<{ criterio: string; valor: number; observacao: string }>>([]);

  const safeParseArray = (value: any) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const findCommissionTableForClient = (tables: any[], clientId: string) => {
    const targetId = String(clientId || '').trim().toLowerCase();
    if (!targetId) return null;

    for (const t of tables || []) {
      const ids = safeParseArray((t as any)?.cliente_ids);
      if (ids.some((id: any) => String(id).trim().toLowerCase() === targetId)) return t;
    }
    return null;
  };

  const computeCommission = (params: {
    km: number;
    hasReturn: boolean;
    pointsCount: number;
    faixas: Array<{ km_ate: number; valor: number }>;
    table: { valor_por_ponto?: number | null; tipo_retorno?: string | null; valor_retorno?: number | null } | null;
  }) => {
    const { km, hasReturn, pointsCount, faixas, table } = params;
    if (!faixas.length) return 0;

    const faixa = faixas.find((f) => Number(f.km_ate) >= km);
    let val = faixa ? Number(faixa.valor) : Number(faixas[faixas.length - 1]?.valor || 0);

    if (table) {
      const vpp = Number(table.valor_por_ponto || 0);
      if (vpp > 0 && pointsCount > 0) val += vpp * pointsCount;

      if (hasReturn && Number(table.valor_retorno || 0) > 0) {
        let returnVal = Number(table.valor_retorno || 0);
        const tipo = String(table.tipo_retorno || '').trim().toLowerCase();
        if (tipo === 'percentual' || tipo === 'porcentagem') {
          returnVal = val * (Number(table.valor_retorno || 0) / 100);
        }
        val += returnVal;
      }
    } else if (hasReturn) {
      val += val * 0.2;
    }

    const out = Number(val);
    return Number.isFinite(out) && out > 0 ? out : 0;
  };

  const fetchFullDelivery = async (deliveryId: string) => {
    try {
      const { data: fullDelivery, error } = await supabase
        .from('nova_entrega')
        .select('*')
        .eq('id', deliveryId)
        .maybeSingle();
      
      if (error || !fullDelivery) {
        console.error('Erro ao buscar entrega completa:', error);
        return null;
      }
      
      return fullDelivery;
    } catch (e) {
      console.error('Erro no fetchFullDelivery:', e);
      return null;
    }
  };

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
                    const d = data as unknown as { nome_completo?: string | null; foto_url?: string | null };
                    setCommerceData({
                        nome: d.nome_completo || '',
                        foto: d.foto_url || null
                    });
                }
            });
    } else {
        setCommerceData(null);
    }
  }, [incomingDelivery?.cliente_id]);

  useEffect(() => {
    const compute = async () => {
      if (!incomingDelivery?.id) {
        setIncomingValorEntregadorCalc(null);
        setIncomingComissaoDestinosCalc(null);
        setIncomingComissaoRetornoCalc(null);
        setIncomingDriverDynamicRules([]);
        return;
      }

      setCalculatingIncomingValorEntregador(true);
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_entrega_comissao_debug', { entrega_id: incomingDelivery.id });

        if (!rpcError && rpcData && typeof rpcData === 'object') {
          const ok = (rpcData as any).success === true;
          if (ok) {
            const total = Number((rpcData as any).total || 0);
            const retorno = (rpcData as any).retorno;
            const destinos = safeParseArray((rpcData as any).destinos);
            const appliedDriverRules = safeParseArray((rpcData as any).applied_driver_rules);

            if (total > 0) setIncomingValorEntregadorCalc(total);
            setIncomingComissaoDestinosCalc(destinos.length ? destinos : null);
            setIncomingComissaoRetornoCalc(typeof retorno === 'number' && retorno > 0 ? retorno : null);
            setIncomingDriverDynamicRules(appliedDriverRules);
            setCalculatingIncomingValorEntregador(false);
            return;
          }
        }

        // Fallback: RPC falhou ou retornou sem sucesso.
        // Quando valor_entregador é 0 (sem tabela de comissão), busca as regras dinâmicas
        // diretamente e aplica. Quando já há um valor salvo, usa-o como está.
        const baseValor = Number(incomingDelivery.valor_entregador || 0);

        if (baseValor === 0) {
          const { data: dynamicRules } = await supabase
            .from('preco_dinamico_entregador')
            .select('criterio, multiplicador, observacao')
            .eq('ativa', true)
            .order('created_at', { ascending: true });

          if (dynamicRules && dynamicRules.length > 0) {
            let total = 0;
            const appliedRules: Array<{ criterio: string; valor: number; observacao: string }> = [];

            for (const rule of dynamicRules) {
              const criterio = (rule.criterio || '').toUpperCase();
              if (criterio === 'TAXA_FIXA' && rule.multiplicador != null) {
                appliedRules.push({ criterio, valor: Number(rule.multiplicador), observacao: rule.observacao || '' });
                total += Number(rule.multiplicador);
              } else if (criterio === 'MULTIPLICADOR' && rule.multiplicador != null) {
                const delta = total * (Number(rule.multiplicador) - 1);
                appliedRules.push({ criterio, valor: delta, observacao: rule.observacao || '' });
                total *= Number(rule.multiplicador);
              }
            }

            if (total > 0) setIncomingValorEntregadorCalc(total);
            else setIncomingValorEntregadorCalc(null);
            setIncomingDriverDynamicRules(appliedRules);
          } else {
            setIncomingValorEntregadorCalc(null);
            setIncomingDriverDynamicRules([]);
          }
        } else {
          setIncomingValorEntregadorCalc(baseValor);
          setIncomingDriverDynamicRules([]);
        }

        setIncomingComissaoDestinosCalc(null);
        setIncomingComissaoRetornoCalc(null);
      } catch (e) {
        setIncomingValorEntregadorCalc(null);
        setIncomingComissaoDestinosCalc(null);
        setIncomingComissaoRetornoCalc(null);
        setIncomingDriverDynamicRules([]);
      } finally {
        setCalculatingIncomingValorEntregador(false);
      }
    };

    void compute();
  }, [incomingDelivery?.id]);

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

             setGanhosDia(await fetchGanhosDia(data.id));
           }
        }
      } catch (e) { console.error(e); }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    let watchId: string | null = null;
    let currentEntregadorId: string | null = null;
    let foregroundServiceStarted = false;

    const startForegroundService = async () => {
      if (foregroundServiceStarted) return;
      try {
        await ForegroundService.startForegroundService({
          id: 1,
          title: 'Route Delivery',
          body: 'Rastreamento de localização ativo',
          smallIcon: 'ic_stat_name'
        });
        foregroundServiceStarted = true;
        console.log('[Foreground Service] Started');
      } catch (e) {
        console.error('[Foreground Service] Error starting:', e);
      }
    };

    const stopForegroundService = async () => {
      if (!foregroundServiceStarted) return;
      try {
        await ForegroundService.stopForegroundService();
        foregroundServiceStarted = false;
        console.log('[Foreground Service] Stopped');
      } catch (e) {
        console.error('[Foreground Service] Error stopping:', e);
      }
    };

    const updateLocationToDB = async (lat: number, lng: number, heading: number | null) => {
      if (!currentEntregadorId) return;

      try {
        const updateData: any = {
          current_latitude: lat,
          current_longitude: lng,
          last_location_update: new Date().toISOString()
        };

        if (heading !== null) {
          updateData.heading = heading;
        }

        const { error } = await supabase
          .from('entregadores')
          .update(updateData)
          .eq('id', currentEntregadorId);

        if (error) {
          console.error('[GPS Update] Error:', error);
        }
      } catch (e) {
        console.error('[GPS Update] Exception:', e);
      }
    };

    const startWatching = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          const { data: entregador } = await supabase
            .from('entregadores')
            .select('id')
            .ilike('email', user.email)
            .single();

          if (entregador) {
            currentEntregadorId = entregador.id;
          }
        }

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

          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const heading = typeof position.coords.heading === 'number' ? position.coords.heading : null;

          setUserLocation({
            lat,
            lng
          });

          if (currentEntregadorId) {
            updateLocationToDB(lat, lng, heading);
          }

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
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const heading = typeof position.coords.heading === 'number' ? position.coords.heading : null;

            setUserLocation({
              lat,
              lng
            });
            setLoadingLocation(false);

            if (currentEntregadorId) {
              updateLocationToDB(lat, lng, heading);
            }
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

    // Start foreground service if online
    if (isOnline) {
      startForegroundService();
    }

    // Listen for app state changes
    const appStateListener = App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        console.log('[App State] App is now active (foreground)');
        if (isOnline && currentEntregadorId) {
          // Ensure foreground service is running when app is active and online
          await startForegroundService();
        }
      } else {
        console.log('[App State] App is now inactive (background)');
        if (isOnline) {
          // Keep foreground service running in background when online
          await startForegroundService();
        } else {
          // Stop foreground service when offline
          await stopForegroundService();
        }
      }
    });

    return () => {
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
      appStateListener.then(listener => listener.remove());
      stopForegroundService();
    };
  }, [isOnline]);

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

        
        const { data: configData } = await supabase.from('configuracoes_comercio').select('limite_entregas_simultaneas').limit(1).single();
        const limit = configData?.limite_entregas_simultaneas || 10;
        const effectiveLimit = Math.min(limit, 4);
        
        const { count } = await supabase
            .from('nova_entrega')
            .select('*', { count: 'exact', head: true })
            .eq('entregador_id', entregadorId)
            .in('status', ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega']);
            
        const currentActive = count || 0;
        const isLocked = currentActive >= effectiveLimit;
        if (isLocked) {
             setIncomingDelivery(null);
             return;
        }

        if (assigned && !rejectedIds.includes(assigned.id)) {
          const fullDelivery = await fetchFullDelivery(assigned.id);
          if (fullDelivery) setIncomingDelivery(fullDelivery);
          else setIncomingDelivery(assigned);
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

                 const fullDelivery = await fetchFullDelivery(c.id);
                 if (fullDelivery) setIncomingDelivery(fullDelivery);
                 else setIncomingDelivery(c);
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

               if (newRecord.status === 'cancelada') {
                   if (incomingDelivery?.id === newRecord.id) {
                       setIncomingDelivery(null);
                   }
                   return;
               }

               if (newRecord.status === 'atribuida' && newRecord.entregador_id === entregadorId) {
                   
                   if (newRecord.atribuicao_modo === 'automatica') {
                       const fullDelivery = await fetchFullDelivery(newRecord.id);
                       if (fullDelivery) setIncomingDelivery(fullDelivery);
                       else setIncomingDelivery(newRecord);
                   } else {
                       
                       if (incomingDelivery?.id === newRecord.id) {
                           setIncomingDelivery(null);
                       }
                   }
               } 
               
              
               else if (newRecord.status === 'criada' && !newRecord.entregador_id) {
                   
                   
                   const { data: configData } = await supabase.from('configuracoes_comercio').select('limite_entregas_simultaneas').limit(1).single();
                   const limit = configData?.limite_entregas_simultaneas || 10;
                   const effectiveLimit = Math.min(limit, 4);
                   const { count } = await supabase
                        .from('nova_entrega')
                        .select('*', { count: 'exact', head: true })
                        .eq('entregador_id', entregadorId)
                        .in('status', ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega']);
                   
                   const currentActive = count || 0;
                   const isLocked = currentActive >= effectiveLimit;
                   if (isLocked) {
                     if (incomingDelivery?.id === newRecord.id) setIncomingDelivery(null);
                     return;
                   }

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
                                 }
                             } else {
                                 console.warn('Não foi possível obter coordenadas para verificar raio. Assumindo dentro.');
                             }
                        } catch (e) {
                             console.error('Erro realtime raio:', e);
                            
                        }
                   }
                   
                   if (inRadius) {
                       const fullDelivery = await fetchFullDelivery(newRecord.id);
                       if (fullDelivery) setIncomingDelivery(fullDelivery);
                       else setIncomingDelivery(newRecord);
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
        setGanhosDia(await fetchGanhosDia(entregadorId));
    };

    fetchBalance();

    const channel = supabase
      .channel('home_acertos_balance')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'nova_entrega',
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

  useEffect(() => {
    if (!entregadorId) return;

    const channel = supabase
      .channel('entregador_online_status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'entregadores',
          filter: `id=eq.${entregadorId}`
        },
        (payload) => {
          if (payload.new && typeof (payload.new as any).is_online === 'boolean') {
            setIsOnline((payload.new as any).is_online);
          }
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
              const effectiveLimit = Math.min(limit, 4);

              
              const { count, error: countError } = await supabase
                .from('nova_entrega')
                .select('*', { count: 'exact', head: true })
                .eq('entregador_id', currentEntregadorId)
                .in('status', ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega']);

              if (countError) throw countError;

              const currentActive = count || 0;

              if (currentActive >= effectiveLimit) {
                alert(`Você atingiu o limite de ${effectiveLimit} entregas simultâneas. Finalize todas para pegar mais.`);
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

              
              if (isIncomingMultiplo && valorEntregadorDisplayFinal > 0) {
                  const { error: updateError } = await supabase
                      .from('nova_entrega')
                      .update({ valor_entregador: valorEntregadorDisplayFinal })
                      .eq('id', incomingDelivery.id);
                  
                  if (updateError) {
                      console.error('Erro ao atualizar valor_entregador:', updateError);
                  }
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
        alert('Não foi possível verificar suas entregas. Tente novamente.');
        return;
      }
    }

    const newState = !isOnline;

    try {
      const { error } = await supabase.rpc('toggle_entregador_online_status', {
        new_status: newState
      });

      if (error) throw error;

      setIsOnline(newState);
    } catch (e) {
      alert('Não foi possível atualizar seu status. Tente novamente.');
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

  const incomingExtraPoints = safeParseArray(incomingDelivery?.pontos_adicionais);
  const incomingPricingDestinos = safeParseArray(incomingDelivery?.opcionais?.pricing_destinos);
  const incomingComissaoDestinos = safeParseArray(incomingDelivery?.opcionais?.comissao_destinos);
  const incomingComissaoRetorno = typeof incomingDelivery?.opcionais?.comissao_retorno === 'number' ? Number(incomingDelivery.opcionais.comissao_retorno) : null;
  const incomingValorMultiplo = (incomingDelivery?.opcionais as any)?.valor_multiplo as { valorPorPonto: number; pontos: number; total: number } | undefined;
  const incomingDestinos = incomingDelivery
    ? [
        {
          label: 'Destino 1',
          endereco: String(incomingDelivery.entrega_endereco_texto || '').trim(),
          valor: incomingPricingDestinos[0]?.valor,
          observacoes: incomingDelivery.entrega_observacoes || '',
        },
        ...incomingExtraPoints.map((pt: any, idx: number) => {
          const base = String(pt?.endereco_texto || '').trim();
          const endereco = pt?.numero ? `${base}, ${String(pt.numero).trim()}` : base;
          return {
            label: `Destino ${idx + 2}`,
            endereco,
            valor: incomingPricingDestinos[idx + 1]?.valor,
            observacoes: pt?.observacoes || '',
          };
        }),
      ]
    : [];
  const isIncomingMultiplo = incomingDestinos.length > 1;

  const toFiniteNumberOrNull = (value: any) => {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(n) ? n : null;
  };

  const valorEntregadorDisplay =
    typeof incomingValorEntregadorCalc === 'number' && incomingValorEntregadorCalc > 0
      ? incomingValorEntregadorCalc
      : (toFiniteNumberOrNull(incomingDelivery?.valor_entregador) ?? 0) > 0
        ? (toFiniteNumberOrNull(incomingDelivery?.valor_entregador) as number)
        : 0;

  const comissaoDestinosDisplay =
    Array.isArray(incomingComissaoDestinosCalc) && incomingComissaoDestinosCalc.length > 0
      ? incomingComissaoDestinosCalc
      : incomingComissaoDestinos.length > 0
        ? incomingComissaoDestinos
        : [];
  const comissaoRetornoDisplay =
    typeof incomingComissaoRetornoCalc === 'number' && incomingComissaoRetornoCalc > 0
      ? incomingComissaoRetornoCalc
      : typeof incomingComissaoRetorno === 'number' && incomingComissaoRetorno > 0
        ? incomingComissaoRetorno
        : null;

  const incomingMultiploTotal = incomingValorMultiplo?.valorPorPonto
    ? incomingValorMultiplo.valorPorPonto * (1 + incomingExtraPoints.length)
    : 0;

  const valorEntregadorDisplayFinal = isIncomingMultiplo
    ? comissaoDestinosDisplay.reduce((sum: number, d: any) => sum + (typeof d?.valor === 'number' ? d.valor : 0), 0) + (comissaoRetornoDisplay || 0) + incomingMultiploTotal
    : valorEntregadorDisplay + incomingMultiploTotal;

  
  return (
    <div className="h-full w-full relative bg-slate-100">
      {}
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

      {}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={toggleOnline}
          disabled={isOnline === null}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all shadow-md ${
            isOnline === null
              ? 'bg-slate-400 text-slate-300 cursor-not-allowed'
              : isOnline
              ? 'bg-green-500 text-white border-2 border-green-600 hover:bg-green-600'
              : 'bg-slate-700 text-white border-2 border-slate-800 hover:bg-slate-800'
          }`}
        >
          <Power size={18} />
          {isOnline === null ? '...' : isOnline ? 'Online' : 'Offline'}
        </button>
      </div>

      <button
        onClick={() => onNavigate('carteira_extrato')}
        className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-4 py-2 min-w-[120px] flex flex-col items-center border border-slate-200 hover:bg-slate-50 transition-colors"
      >
         <span className="text-xs text-slate-500 font-bold uppercase mb-0.5">Ganhos</span>
         <span className="text-lg font-bold text-slate-800 leading-none">R$ {ganhosDia.toFixed(2)}</span>
      </button>

       {incomingDelivery && createPortal(
         <div className={`fixed inset-0 bg-black/50 backdrop-blur-sm p-4 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent ${!isIncomingMultiplo ? 'flex items-center justify-center overflow-y-auto' : 'overflow-y-auto'}`} style={{ zIndex: 2147483647 }}>
            <div className={`flex flex-col ${!isIncomingMultiplo ? 'w-full max-w-[450px]' : 'items-center gap-4 py-4'}`}>
              {isIncomingMultiplo ? (
                [...incomingDestinos].reverse().map((d: any, idx: number) => {
                  const originalIdx = incomingDestinos.length - 1 - idx;
                  const c = comissaoDestinosDisplay.find((x: any) => Number(x?.destino) === originalIdx + 1);
                  const v = c && typeof c.valor === 'number' ? c.valor : null;
                  const isFirstDestination = originalIdx === 0;
                  return (
                    <div key={`${incomingDelivery.id}-${originalIdx}`} className="bg-white w-full max-w-[450px] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
                      <div className="p-5">
                        <div className="flex flex-col gap-5">
                          <div className="flex items-center gap-3 w-full border-b border-slate-100 pb-4">
                            <div className={`w-14 h-14 min-w-[3.5rem] rounded-full flex items-center justify-center overflow-hidden border-2 shadow-sm ${incomingDelivery.status === 'criada' ? 'border-sky-100' : 'border-green-100'}`}>
                              {commerceData?.foto ? (
                                <img src={commerceData.foto} alt={commerceData.nome} className="w-full h-full object-cover" />
                              ) : (
                                <div className={`w-full h-full flex items-center justify-center ${incomingDelivery.status === 'criada' ? 'bg-sky-50 text-sky-600' : 'bg-green-50 text-green-600'}`}>
                                  <Truck size={24} />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {commerceData?.nome && (
                                  <h3 className="text-lg font-bold text-slate-800 truncate leading-tight">{commerceData.nome}</h3>
                                )}
                                <span className="inline-flex items-center px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold uppercase rounded-full">Pedido Múltiplo</span>
                              </div>
                              {(deliveryDistance !== null || calculatingDistance) && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className="text-xs text-slate-500 font-medium">Distância:</span>
                                  {calculatingDistance ? (
                                    <span className="text-xs font-bold text-slate-400 animate-pulse">...</span>
                                  ) : (
                                    <span className="text-xs font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full">{deliveryDistance?.toFixed(1)} km</span>
                                  )}
                                </div>
                              )}
                            </div>
                            {isFirstDestination && (
                              <div className="flex flex-col items-end bg-green-50 px-3 py-1.5 rounded-lg border border-green-100 shadow-sm shrink-0">
                                <span className="text-[10px] text-green-700 font-bold uppercase tracking-wide">Você recebe</span>
                                <span className="font-extrabold text-green-700 text-2xl leading-none">
                                  {calculatingIncomingValorEntregador ? (
                                    <span className="text-green-700/60 animate-pulse">...</span>
                                  ) : (
                                    `R$ ${valorEntregadorDisplayFinal.toFixed(2)}`
                                  )}
                                </span>
                                {incomingMultiploTotal > 0 && (
                                  <span className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                                    + R$ {incomingMultiploTotal.toFixed(2).replace('.', ',')} (Múltiplo)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="w-full space-y-4">
                            <div className="flex gap-3">
                              <div className="flex flex-col items-center gap-1 pt-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-300 ring-4 ring-slate-50"></div>
                              </div>
                              <div className="flex-1">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Retirada</p>
                                <p className="text-sm font-medium text-slate-700 leading-snug">{incomingDelivery.coleta_endereco_texto}</p>
                                {isFirstDestination && incomingDelivery.coleta_observacoes && (
                                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-1 leading-snug">Obs: {incomingDelivery.coleta_observacoes}</p>
                                )}
                              </div>
                            </div>

                            <div className="flex gap-3">
                              <div className="flex flex-col items-center gap-1 pt-1.5">
                                <div className={`w-2.5 h-2.5 rounded-full ring-4 ${isFirstDestination ? 'bg-sky-500 ring-sky-50' : 'bg-purple-500 ring-purple-50'}`}></div>
                              </div>
                              <div className="flex-1">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{d.label}</p>
                                <p className="text-sm font-medium text-slate-700 leading-snug">{d.endereco || '-'}</p>
                                {d.observacoes && (
                                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-1 leading-snug">Obs: {d.observacoes}</p>
                                )}
                              </div>
                            </div>

                            {isFirstDestination && incomingDriverDynamicRules.length > 0 && (
                              <div className="flex flex-wrap justify-end gap-1 pt-2 border-t border-slate-50">
                                {incomingDriverDynamicRules
                                  .filter((r, i, arr) => arr.findIndex(x => x.observacao === r.observacao) === i)
                                  .map((rule, idx) => (
                                  <div key={idx} className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                    <span className="text-[10px] font-semibold">+ R$ {Number(rule.valor).toFixed(2).replace('.', ',')}</span>
                                    {rule.observacao && <span className="text-[10px] text-emerald-600 font-medium">• {rule.observacao}</span>}
                                  </div>
                                ))}
                              </div>
                            )}

                            {isFirstDestination && Array.isArray((incomingDelivery as any)?.opcionais?.demand_rules) && ((incomingDelivery as any).opcionais.demand_rules as any[]).length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {((incomingDelivery as any).opcionais.demand_rules as any[]).map((r: any, idx: number) => (
                                  <span key={idx} className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                                    {r.name}{r.value > 0 ? ` +R${Number(r.value).toFixed(2)}` : ''}
                                  </span>
                                ))}
                              </div>
                            )}

                            {isFirstDestination && (comissaoRetornoDisplay !== null || incomingDelivery?.retorno) && (
                              <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between">
                                <span className="text-xs font-semibold text-green-700">Com retorno</span>
                                {comissaoRetornoDisplay !== null && (
                                  <span className="text-xs font-bold text-green-700">R$ {comissaoRetornoDisplay.toFixed(2)}</span>
                                )}
                              </div>
                            )}
                          </div>

                          {isFirstDestination && (
                            <div className="flex gap-3 w-full pt-2">
                              <button
                                onClick={handleRecusar}
                                className="flex-1 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                              >
                                <XCircle size={20} />
                                {incomingDelivery.status === 'criada' ? 'Rejeitar' : 'Recusar'}
                              </button>
                              <button
                                onClick={handleAceitar}
                                className="flex-[2] bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-green-200"
                              >
                                <CheckCircle size={20} />
                                {incomingDelivery.status === 'criada' ? 'Pegar Entrega' : 'Aceitar'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-white w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300" style={{ maxHeight: 'min(90dvh, calc(100dvh - 2rem))' }}>
                  <div className="p-5 flex-1 min-h-0 overflow-y-auto">
                    <div className="flex flex-col gap-5">
                      <div className="flex items-center gap-3 w-full border-b border-slate-100 pb-4">
                        <div className={`w-14 h-14 min-w-[3.5rem] rounded-full flex items-center justify-center overflow-hidden border-2 shadow-sm ${incomingDelivery.status === 'criada' ? 'border-sky-100' : 'border-green-100'}`}>
                          {commerceData?.foto ? (
                            <img src={commerceData.foto} alt={commerceData.nome} className="w-full h-full object-cover" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${incomingDelivery.status === 'criada' ? 'bg-sky-50 text-sky-600' : 'bg-green-50 text-green-600'}`}>
                              <Truck size={24} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {commerceData?.nome && (
                            <h3 className="text-lg font-bold text-slate-800 truncate leading-tight">{commerceData.nome}</h3>
                          )}
                          {(deliveryDistance !== null || calculatingDistance) && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-xs text-slate-500 font-medium">Distância:</span>
                              {calculatingDistance ? (
                                <span className="text-xs font-bold text-slate-400 animate-pulse">...</span>
                              ) : (
                                <span className="text-xs font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full">{deliveryDistance?.toFixed(1)} km</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end bg-green-50 px-3 py-1.5 rounded-lg border border-green-100 shadow-sm shrink-0">
                          <span className="text-[10px] text-green-700 font-bold uppercase tracking-wide">Você recebe</span>
                          <span className="font-extrabold text-green-700 text-2xl leading-none">
                            {calculatingIncomingValorEntregador ? (
                              <span className="text-green-700/60 animate-pulse">...</span>
                            ) : (
                              `R$ ${valorEntregadorDisplayFinal.toFixed(2)}`
                            )}
                          </span>
                          {incomingValorMultiplo && incomingValorMultiplo.total > 0 && (
                            <span className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                              + R$ {incomingValorMultiplo.valorPorPonto.toFixed(2).replace('.', ',')} (Múltiplo)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="w-full space-y-4">
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center gap-1 pt-1.5">
                            <div className="w-2.5 h-2.5 rounded-full bg-slate-300 ring-4 ring-slate-50"></div>
                            <div className="w-0.5 h-full bg-slate-200 min-h-[30px]"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-sky-500 ring-4 ring-sky-50"></div>
                          </div>
                          <div className="flex-1 space-y-4">
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Retirada</p>
                              <p className="text-sm font-medium text-slate-700 leading-snug">{incomingDelivery.coleta_endereco_texto}</p>
                              {incomingDelivery.coleta_observacoes && (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-1 leading-snug">Obs: {incomingDelivery.coleta_observacoes}</p>
                              )}
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Entrega</p>
                              <p className="text-sm font-medium text-slate-700 leading-snug">{incomingDelivery.entrega_endereco_texto}</p>
                              {incomingDelivery.entrega_observacoes && (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-1 leading-snug">Obs: {incomingDelivery.entrega_observacoes}</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {incomingDriverDynamicRules.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-1 pt-2 border-t border-slate-50">
                            {incomingDriverDynamicRules
                              .filter((r, i, arr) => arr.findIndex(x => x.observacao === r.observacao) === i)
                              .map((rule, idx) => (
                              <div key={idx} className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                <span className="text-[10px] font-semibold">+ R$ {Number(rule.valor).toFixed(2).replace('.', ',')}</span>
                                {rule.observacao && <span className="text-[10px] text-emerald-600 font-medium">• {rule.observacao}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {Array.isArray((incomingDelivery as any)?.opcionais?.demand_rules) && ((incomingDelivery as any).opcionais.demand_rules as any[]).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {((incomingDelivery as any).opcionais.demand_rules as any[]).map((r: any, idx: number) => (
                              <span key={idx} className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-semibold">
                                {r.name}{r.value > 0 ? ` +R$${Number(r.value).toFixed(2)}` : ''}
                              </span>
                            ))}
                          </div>
                        )}

                        {(comissaoRetornoDisplay !== null || incomingDelivery?.retorno) && (
                          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between">
                            <span className="text-xs font-semibold text-green-700">Com retorno</span>
                            {comissaoRetornoDisplay !== null && (
                              <span className="text-xs font-bold text-green-700">R$ {comissaoRetornoDisplay.toFixed(2)}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-3 w-full pt-2">
                        <button
                          onClick={handleRecusar}
                          className="flex-1 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                        >
                          <XCircle size={20} />
                          {incomingDelivery.status === 'criada' ? 'Rejeitar' : 'Recusar'}
                        </button>
                        <button
                          onClick={handleAceitar}
                          className="flex-[2] bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-green-200"
                        >
                          <CheckCircle size={20} />
                          {incomingDelivery.status === 'criada' ? 'Pegar Entrega' : 'Aceitar'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
         </div>
       , document.body)}
    </div>
  );
}
