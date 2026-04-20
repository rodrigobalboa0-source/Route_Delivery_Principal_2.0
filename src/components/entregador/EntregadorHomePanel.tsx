import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [entregadorId, setEntregadorId] = useState<string | null>(null);
  const [ganhos, setGanhos] = useState(0);
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
        return;
      }

      const stored = Number(incomingDelivery.valor_entregador || 0);
      if (stored > 0) {
        setIncomingValorEntregadorCalc(null);
        setIncomingComissaoDestinosCalc(null);
        setIncomingComissaoRetornoCalc(null);
        return;
      }

      const km =
        typeof incomingDelivery.distancia_km === 'number' && incomingDelivery.distancia_km > 0
          ? Number(incomingDelivery.distancia_km)
          : typeof deliveryDistance === 'number' && deliveryDistance > 0
            ? Number(deliveryDistance)
            : 0;

      const pontos = safeParseArray(incomingDelivery.pontos_adicionais);
      const pointsCount = pontos.filter((p: any) => String(p?.endereco_texto || '').trim().length > 0).length;
      const hasReturn = !!incomingDelivery.retorno;

      if (!(km > 0)) {
        setIncomingValorEntregadorCalc(null);
        return;
      }

      setCalculatingIncomingValorEntregador(true);
      try {
        const { data: tablesData, error: tablesError } = await supabase
          .from('tabelas_comissoes')
          .select('*')
          .order('updated_at', { ascending: false });
        if (tablesError) throw tablesError;

        const table = findCommissionTableForClient(tablesData || [], String(incomingDelivery.cliente_id || ''));

        if (!table) {
          setIncomingValorEntregadorCalc(null);
          setIncomingComissaoDestinosCalc(null);
          setIncomingComissaoRetornoCalc(null);
          return;
        }

        const { data: faixasData, error: faixasError } = await supabase
          .from('tabelas_comissoes_faixas')
          .select('km_ate,valor')
          .eq('tabela_id', table.id)
          .order('km_ate', { ascending: true });
        if (faixasError) throw faixasError;

        const faixas = (faixasData || []) as Array<{ km_ate: number; valor: number }>;
        const computed = computeCommission({ km, hasReturn, pointsCount, faixas, table });

        const pricingDestinos = safeParseArray(incomingDelivery?.opcionais?.pricing_destinos);
        const segmentKms = pricingDestinos.map((d: any) => Number(d?.km)).filter((n: any) => typeof n === 'number' && !Number.isNaN(n) && n > 0);
        const expectedSegments = 1 + pointsCount;

        if (segmentKms.length === expectedSegments) {
          const vpp = Number((table as any).valor_por_ponto || 0);
          const comissaoDestinos = segmentKms.map((kmSeg: number, idx: number) => {
            const base = computeCommission({ km: kmSeg, hasReturn: false, pointsCount: 0, faixas, table: null });
            const extraPonto = idx >= 1 && vpp > 0 ? vpp : 0;
            return { destino: idx + 1, km: kmSeg, valor: base + extraPonto };
          });

          let retornoValor = 0;
          if (hasReturn && Number((table as any).valor_retorno || 0) > 0) {
            retornoValor = Number((table as any).valor_retorno || 0);
            const tipo = String((table as any).tipo_retorno || '').trim().toLowerCase();
            if (tipo === 'percentual' || tipo === 'porcentagem') {
              const baseTotal = comissaoDestinos.reduce((acc, d) => acc + Number(d.valor || 0), 0);
              retornoValor = baseTotal * (Number((table as any).valor_retorno || 0) / 100);
            }
          } else if (hasReturn) {
            const baseTotal = comissaoDestinos.reduce((acc, d) => acc + Number(d.valor || 0), 0);
            retornoValor = baseTotal * 0.2;
          }

          setIncomingComissaoDestinosCalc(comissaoDestinos);
          setIncomingComissaoRetornoCalc(retornoValor > 0 ? retornoValor : null);

          const opcionaisMerged = { ...(incomingDelivery.opcionais || {}), comissao_destinos: comissaoDestinos, comissao_retorno: retornoValor > 0 ? retornoValor : null };
          await supabase
            .from('nova_entrega')
            .update({ opcionais: opcionaisMerged } as any)
            .eq('id', incomingDelivery.id);
        } else {
          setIncomingComissaoDestinosCalc(null);
          setIncomingComissaoRetornoCalc(null);
        }

        if (computed > 0) {
          setIncomingValorEntregadorCalc(computed);
          await supabase
            .from('nova_entrega')
            .update({ valor_entregador: computed, updated_at: new Date().toISOString() } as any)
            .eq('id', incomingDelivery.id);
        } else {
          setIncomingValorEntregadorCalc(null);
        }
      } catch (e) {
        console.error('Falha ao calcular comissão do entregador:', e);
        setIncomingValorEntregadorCalc(null);
        setIncomingComissaoDestinosCalc(null);
        setIncomingComissaoRetornoCalc(null);
      } finally {
        setCalculatingIncomingValorEntregador(false);
      }
    };

    void compute();
  }, [incomingDelivery?.id, incomingDelivery?.cliente_id, incomingDelivery?.valor_entregador, incomingDelivery?.distancia_km, incomingDelivery?.pontos_adicionais, incomingDelivery?.retorno, deliveryDistance]);

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
             
             
             const { data: entregasData } = await supabase
              .from('nova_entrega')
              .select('*')
              .eq('entregador_id', data.id)
              .eq('status', 'entregue');
              
             const { data: acertosData } = await supabase
               .from('acertos_entregadores')
               .select('valor_pago, taxa_aplicada, status')
               .eq('entregador_id', data.id)
               .in('status', ['pendente', 'pago']);
              
             if (entregasData) {
               const totalEntregas = entregasData.reduce((acc, curr) => acc + (curr.valor_entregador || curr.valor_entrega || 0), 0);
               const totalAcertos =
                 acertosData?.reduce(
                   (acc, curr: any) => acc + (Number(curr.valor_pago) || 0) + (Number(curr.taxa_aplicada) || 0),
                   0
                 ) || 0;
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
          setIncomingDelivery(assigned);
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
            .select('valor_pago, taxa_aplicada, status')
            .eq('entregador_id', entregadorId)
            .in('status', ['pendente', 'pago']);

        const totalEntregas = entregasData?.reduce((acc, curr) => acc + (curr.valor_entregador || curr.valor_entrega || 0), 0) || 0;
        const totalAcertos = acertosData?.reduce((acc, curr) => acc + (Number(curr.valor_pago) || 0) + (Number((curr as any).taxa_aplicada) || 0), 0) || 0;
        
        setGanhos(totalEntregas - totalAcertos);
    };

    fetchBalance();

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

  const incomingExtraPoints = safeParseArray(incomingDelivery?.pontos_adicionais);
  const incomingPricingDestinos = safeParseArray(incomingDelivery?.opcionais?.pricing_destinos);
  const incomingComissaoDestinos = safeParseArray(incomingDelivery?.opcionais?.comissao_destinos);
  const incomingComissaoRetorno = typeof incomingDelivery?.opcionais?.comissao_retorno === 'number' ? Number(incomingDelivery.opcionais.comissao_retorno) : null;
  const incomingDestinos = incomingDelivery
    ? [
        {
          label: 'Destino 1',
          endereco: String(incomingDelivery.entrega_endereco_texto || '').trim(),
          valor: incomingPricingDestinos[0]?.valor,
        },
        ...incomingExtraPoints.map((pt: any, idx: number) => {
          const base = String(pt?.endereco_texto || '').trim();
          const endereco = pt?.numero ? `${base}, ${String(pt.numero).trim()}` : base;
          return {
            label: `Destino ${idx + 2}`,
            endereco,
            valor: incomingPricingDestinos[idx + 1]?.valor,
          };
        }),
      ]
    : [];
  const isIncomingMultiplo = incomingDestinos.length > 1;

  const valorEntregadorDisplay =
    typeof incomingDelivery?.valor_entregador === 'number' && incomingDelivery.valor_entregador > 0
      ? incomingDelivery.valor_entregador
      : typeof incomingValorEntregadorCalc === 'number' && incomingValorEntregadorCalc > 0
        ? incomingValorEntregadorCalc
        : 0;

  const comissaoDestinosDisplay =
    incomingComissaoDestinos.length > 0
      ? incomingComissaoDestinos
      : Array.isArray(incomingComissaoDestinosCalc) && incomingComissaoDestinosCalc.length > 0
        ? incomingComissaoDestinosCalc
        : [];
  const comissaoRetornoDisplay =
    typeof incomingComissaoRetorno === 'number' && incomingComissaoRetorno > 0
      ? incomingComissaoRetorno
      : typeof incomingComissaoRetornoCalc === 'number' && incomingComissaoRetornoCalc > 0
        ? incomingComissaoRetornoCalc
        : null;

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

       {incomingDelivery && createPortal(
         <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" style={{ zIndex: 2147483647 }}>
            <div className="bg-white w-full max-w-[450px] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300">
                <div className="p-5 overflow-y-auto">
                   <div className="flex flex-col gap-5">
                       {/* Header with image and name */}
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
                            <div className="flex flex-col items-end bg-green-50 px-3 py-1.5 rounded-lg border border-green-100 shadow-sm">
                                <span className="text-[10px] text-green-700 font-bold uppercase tracking-wide">Você recebe</span>
                                <span className="font-extrabold text-green-700 text-2xl leading-none">
                                    {calculatingIncomingValorEntregador ? (
                                      <span className="text-green-700/60 animate-pulse">...</span>
                                    ) : (
                                      `R$ ${valorEntregadorDisplay.toFixed(2)}`
                                    )}
                                </span>
                            </div>
                       </div>

                       {/* Addresses */}
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
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Entrega</p>
                                        <p className="text-sm font-medium text-slate-700 leading-snug">{incomingDelivery.entrega_endereco_texto}</p>
                                    </div>
                                </div>
                            </div>

                        {isIncomingMultiplo && (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Pedido Múltiplo</p>
                              <p className="text-xs font-semibold text-slate-700">Total: R$ {valorEntregadorDisplay.toFixed(2)}</p>
                            </div>
                            <div className="space-y-2">
                              {incomingDestinos.map((d: any, idx: number) => {
                                const c = comissaoDestinosDisplay.find((x: any) => Number(x?.destino) === idx + 1);
                                const v = c && typeof c.valor === 'number' ? c.valor : null;
                                return (
                                <div key={idx} className="bg-white border border-slate-200 rounded-lg px-2.5 py-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-bold text-slate-700">{d.label}</span>
                                    <span className="text-xs font-semibold text-slate-700">
                                      {typeof v === 'number' && !Number.isNaN(v) ? `R$ ${v.toFixed(2)}` : '-'}
                                    </span>
                                  </div>
                                  <p className="text-sm text-slate-700 mt-1">{d.endereco || '-'}</p>
                                </div>
                                );
                              })}
                            </div>
                            {comissaoRetornoDisplay !== null && (
                              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-600">Com retorno</span>
                                <span className="text-xs font-semibold text-slate-700">R$ {comissaoRetornoDisplay.toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                        )}

                            {/* Bonuses */}
                            {incomingDelivery.opcionais?.driver_bonuses && Array.isArray(incomingDelivery.opcionais.driver_bonuses) && incomingDelivery.opcionais.driver_bonuses.length > 0 && (
                                <div className="flex flex-wrap justify-end gap-1 pt-2 border-t border-slate-50">
                                    {incomingDelivery.opcionais.driver_bonuses.map((bonus: any, idx: number) => {
                                        const isReturn = bonus.description && bonus.description.toLowerCase().includes('retorno');
                                        return (
                                        <div key={idx} className="text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100 flex items-center gap-1">
                                            <span className="text-[10px] text-green-600 font-medium">{isReturn ? 'Com retorno' : bonus.description}</span>
                                        </div>
                                        );
                                    })}
                                </div>
                            )}
                       </div>

                       {/* Actions */}
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
         </div>
       , document.body)}
    </div>
  );
}
