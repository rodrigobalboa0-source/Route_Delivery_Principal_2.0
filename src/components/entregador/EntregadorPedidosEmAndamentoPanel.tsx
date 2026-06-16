import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, CheckCircle, Truck, AlertCircle, Phone, Navigation, Map as MapIcon, DollarSign, X, ChevronRight } from 'lucide-react';
import { MapView, MapDeliveryPerson } from '../MapView';
import type { Database } from '../../lib/database.types';
import { Geolocation } from '@capacitor/geolocation';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { App } from '@capacitor/app';
import { getDistanceFromLatLonInKm, getCoordsFromAddress } from '../../utils/geo';
import { Modal } from '../Modal';
import {
  parseExtraDeliveryPoints,
  getCurrentDestinationIndex,
  safeParseArray,
  calculateAdvanceDestination,
  buildFullAddress
} from '../../utils/multiDestination';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

function calculateMultiDestinoTotal(entrega: any) {
  const extraPoints = safeParseArray(entrega?.pontos_adicionais);
  const comissaoDestinos = safeParseArray(entrega?.opcionais?.comissao_destinos);
  const comissaoRetorno = typeof entrega?.opcionais?.comissao_retorno === 'number' ? Number(entrega.opcionais.comissao_retorno) : 0;
  const valorMultiplo = entrega?.opcionais?.valor_multiplo as { valorPorPonto: number; pontos: number; total: number } | undefined;
  const multiploTotal = valorMultiplo?.valorPorPonto ? valorMultiplo.valorPorPonto * (1 + extraPoints.length) : 0;

  const numDestinos = 1 + extraPoints.length;
  if (numDestinos <= 1) return Number(entrega.valor_entregador || 0) + multiploTotal;

  const totalDestinos = comissaoDestinos.reduce((sum: number, d: any) => sum + (typeof d?.valor === 'number' ? d.valor : 0), 0);
  return totalDestinos + comissaoRetorno + multiploTotal;
}

export function EntregadorPedidosEmAndamentoPanel() {
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mapVisibleId, setMapVisibleId] = useState<string | null>(null);
  const [detailModalId, setDetailModalId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracyM?: number } | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  
  const [deliveryCoords, setDeliveryCoords] = useState<Record<string, { pickup?: [number, number], delivery?: [number, number], additional?: Record<number, [number, number]> }>>({});
  const [distances, setDistances] = useState<Record<string, { userToPickup: number, pickupToDelivery: number, userToDelivery: number }>>({});
  const [persistedDistanceIds, setPersistedDistanceIds] = useState<Record<string, boolean>>({});
  const [driverDynamicRules, setDriverDynamicRules] = useState<any[]>([]);

  const [dialog, setDialog] = useState<{ open: boolean; title: string; message: string; mode: 'alert' | 'confirm' }>({
    open: false,
    title: '',
    message: '',
    mode: 'alert',
  });
  const dialogAlertResolveRef = useRef<(() => void) | null>(null);
  const dialogConfirmResolveRef = useRef<((v: boolean) => void) | null>(null);

  const showAlert = (message: string, title = 'Aviso') =>
    new Promise<void>((resolve) => {
      if (dialogConfirmResolveRef.current) dialogConfirmResolveRef.current(false);
      dialogConfirmResolveRef.current = null;
      if (dialogAlertResolveRef.current) dialogAlertResolveRef.current();
      dialogAlertResolveRef.current = resolve;
      setDialog({ open: true, title, message, mode: 'alert' });
    });

  const showConfirm = (message: string, title = 'Confirmação') =>
    new Promise<boolean>((resolve) => {
      if (dialogAlertResolveRef.current) dialogAlertResolveRef.current();
      dialogAlertResolveRef.current = null;
      if (dialogConfirmResolveRef.current) dialogConfirmResolveRef.current(false);
      dialogConfirmResolveRef.current = resolve;
      setDialog({ open: true, title, message, mode: 'confirm' });
    });

  useEffect(() => {
    supabase
      .from('preco_dinamico_entregador')
      .select('criterio, multiplicador, observacao')
      .eq('ativa', true)
      .order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setDriverDynamicRules(data); });
  }, []);

  useEffect(() => {
    const fetchCoords = async () => {
      const newCoords: Record<string, { pickup?: [number, number], delivery?: [number, number], additional?: Record<number, [number, number]> }> = {};
      
      for (const entrega of entregas) {
        let pickup: [number, number] | undefined;
        let delivery: [number, number] | undefined;
        const additional: Record<number, [number, number]> = {};

        if (entrega.coleta_endereco_texto) {
            await new Promise(r => setTimeout(r, 1000)); 
            pickup = await getCoordsFromAddress(entrega.coleta_endereco_texto);
        }
        if (entrega.entrega_endereco_texto) {
            await new Promise(r => setTimeout(r, 1000)); 
            delivery = await getCoordsFromAddress(entrega.entrega_endereco_texto);
        }

        
        const extraPoints = parseExtraDeliveryPoints(entrega);
        for (let i = 0; i < extraPoints.length; i++) {
          const point = extraPoints[i];
          if (point.endereco_texto) {
            await new Promise(r => setTimeout(r, 1000)); 
            const coords = await getCoordsFromAddress(point.endereco_texto);
            if (coords) {
              additional[i + 2] = coords; 
            }
          }
        }
        
        if (pickup || delivery || Object.keys(additional).length > 0) {
            newCoords[entrega.id] = { pickup, delivery, additional };
            
            setDeliveryCoords(prev => ({ ...prev, [entrega.id]: { pickup, delivery, additional } }));
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
    const persistDistances = async () => {
      for (const entrega of entregas) {
        if (!entrega) continue;
        if (persistedDistanceIds[entrega.id]) continue;
        const d = distances[entrega.id];
        if (!d) continue;
        if ((!entrega.distancia_km || Number(entrega.distancia_km) === 0) && d.pickupToDelivery > 0) {
          try {
            await supabase.from('nova_entrega').update({ distancia_km: d.pickupToDelivery }).eq('id', entrega.id);
            setEntregas(prev => prev.map(e => e.id === entrega.id ? { ...e, distancia_km: d.pickupToDelivery } : e));
            setPersistedDistanceIds(prev => ({ ...prev, [entrega.id]: true }));
          } catch {
            setPersistedDistanceIds(prev => ({ ...prev, [entrega.id]: true }));
          }
        }
      }
    };
    if (entregas.length > 0) persistDistances();
  }, [entregas, distances, persistedDistanceIds]);

  useEffect(() => {
    fetchEntregas();

    
    const intervalId = setInterval(() => {
      fetchEntregas();
    }, 5000);

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
      }, (payload) => {
        if (payload.eventType === 'UPDATE') {
             const newRecord = payload.new;
             
             if (newRecord.status === 'cancelada' || !newRecord.entregador_id) {
                 setEntregas(prev => prev.filter(e => e.id !== newRecord.id));
             } else {
                 
                 setEntregas(prev => prev.map(e => e.id === newRecord.id ? { ...e, ...newRecord } : e));
             }
        } else if (payload.eventType === 'DELETE') {
             setEntregas(prev => prev.filter(e => e.id !== payload.old.id));
        }

        setTimeout(fetchEntregas, 1000);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'pedidos'
      }, (payload) => {
        const newPedido = payload.new as any;
        if (newPedido.status === 'cancelado') {
            setEntregas(prev => prev.filter(e => e.pedido_id !== newPedido.id));
            setTimeout(fetchEntregas, 1000);
        }
      })
      .subscribe();

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
        console.log('[Foreground Service EmAndamento] Started');
      } catch (e) {
        console.error('[Foreground Service EmAndamento] Error starting:', e);
      }
    };

    const stopForegroundService = async () => {
      if (!foregroundServiceStarted) return;
      try {
        await ForegroundService.stopForegroundService();
        foregroundServiceStarted = false;
        console.log('[Foreground Service EmAndamento] Stopped');
      } catch (e) {
        console.error('[Foreground Service EmAndamento] Error stopping:', e);
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
          console.error('[GPS Update EmAndamento] Error:', error);
        }
      } catch (e) {
        console.error('[GPS Update EmAndamento] Exception:', e);
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
          return;
        }

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
            lng,
            accuracyM: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : undefined
          });

          if (currentEntregadorId) {
            updateLocationToDB(lat, lng, heading);
          }
        } catch (e) {
          console.warn('Erro ao obter posição inicial, aguardando watchPosition', e);
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
              lng,
              accuracyM: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : undefined
            });

            if (currentEntregadorId) {
              updateLocationToDB(lat, lng, heading);
            }
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

    // Start foreground service when in deliveries panel
    startForegroundService();

    // Listen for app state changes
    const appStateListener = App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        console.log('[App State EmAndamento] App is now active (foreground)');
        if (currentEntregadorId) {
          // Ensure foreground service is running when app is active
          await startForegroundService();
        }
      } else {
        console.log('[App State EmAndamento] App is now inactive (background)');
        if (currentEntregadorId) {
          // Keep foreground service running in background
          await startForegroundService();
        } else {
          // Stop foreground service when no deliveries
          await stopForegroundService();
        }
      }
    });

    return () => {
      clearInterval(intervalId);
      subscription.unsubscribe();
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
      appStateListener.then(listener => listener.remove());
      stopForegroundService();
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

  const BASE_MAX_DISTANCE_KM = 0.2;

  async function updateStatus(id: string, newStatus: string, extraOpcionais?: Record<string, any>) {
    setUpdatingId(id);
    try {
      const currentEntrega = entregas.find(e => e.id === id);
      const dists = distances[id];
      const coords = deliveryCoords[id];

      
      if (!userLocation) {
          await showAlert('Aguardando localização do dispositivo...', 'Localização');
          setUpdatingId(null);
          return;
      }

      if (currentEntrega) {
         const hasPickupAddress = !!currentEntrega.coleta_endereco_texto;
         const hasDeliveryAddress = !!currentEntrega.entrega_endereco_texto;
         const accuracyKm = typeof userLocation.accuracyM === 'number' ? userLocation.accuracyM / 1000 : 0;
         const effectiveMaxDistanceKm = Math.max(BASE_MAX_DISTANCE_KM, 0.25, Math.min(1, accuracyKm * 3.5));
         
         if (newStatus === 'chegou_coleta' || newStatus === 'em_rota') {
             if (hasPickupAddress) {
                 let pickupCoords = coords?.pickup;
                 if (!pickupCoords && currentEntrega.coleta_endereco_texto) {
                   pickupCoords = await getCoordsFromAddress(currentEntrega.coleta_endereco_texto);
                   if (pickupCoords) {
                     setDeliveryCoords(prev => ({ ...prev, [id]: { ...(prev[id] || {}), pickup: pickupCoords } }));
                   }
                 }

                 if (!pickupCoords) {
                     const acc = userLocation.accuracyM ? `\nPrecisão do GPS: ~${Math.round(userLocation.accuracyM)}m` : '';
                     const canBypass = typeof userLocation.accuracyM === 'number' && userLocation.accuracyM <= 120;
                     if (canBypass) {
                      const ok = await showConfirm(
                        `Não foi possível localizar o endereço de coleta para validar sua presença.\n\nEndereço de coleta: ${String(currentEntrega.coleta_endereco_texto || '').trim()}${acc}\n\nDeseja confirmar mesmo assim?`,
                        'Confirmação'
                      );
                       if (!ok) {
                         setUpdatingId(null);
                         return;
                       }
                     } else {
                      await showAlert(
                        `Não foi possível localizar o endereço de coleta para validar sua presença.\n\nEndereço de coleta: ${String(currentEntrega.coleta_endereco_texto || '').trim()}${acc}`,
                        'Localização'
                      );
                       setUpdatingId(null);
                       return;
                     }
                 } else {
                     
                     const distKm = getDistanceFromLatLonInKm(
                         userLocation.lat, 
                         userLocation.lng, 
                         pickupCoords[0], 
                         pickupCoords[1]
                     );
                     
                     if (distKm > effectiveMaxDistanceKm) {
                         const acc = userLocation.accuracyM ? `\nPrecisão do GPS: ~${Math.round(userLocation.accuracyM)}m` : '';
                        await showAlert(
                          `Você ainda não chegou no local de coleta para confirmar.\n\nEndereço de coleta: ${String(currentEntrega.coleta_endereco_texto || '').trim()}\nDistância: ${distKm.toFixed(2)} km (máx: ${effectiveMaxDistanceKm.toFixed(2)} km)${acc}`,
                          'Localização'
                        );
                         setUpdatingId(null);
                         return;
                     }
                 }
             }
         }

         if (newStatus === 'chegou_entrega' || newStatus === 'entregue') {
             if (hasDeliveryAddress) {
                 let deliveryCoordsResolved = coords?.delivery;
                 if (!deliveryCoordsResolved && currentEntrega.entrega_endereco_texto) {
                   deliveryCoordsResolved = await getCoordsFromAddress(currentEntrega.entrega_endereco_texto);
                   if (deliveryCoordsResolved) {
                     setDeliveryCoords(prev => ({ ...prev, [id]: { ...(prev[id] || {}), delivery: deliveryCoordsResolved } }));
                   }
                 }

                 if (!deliveryCoordsResolved) {
                     const acc = userLocation.accuracyM ? `\nPrecisão do GPS: ~${Math.round(userLocation.accuracyM)}m` : '';
                     const canBypass = typeof userLocation.accuracyM === 'number' && userLocation.accuracyM <= 120;
                     if (canBypass) {
                      const ok = await showConfirm(
                        `Não foi possível localizar o endereço de entrega para validar sua presença.\n\nEndereço de entrega: ${String(currentEntrega.entrega_endereco_texto || '').trim()}${acc}\n\nDeseja confirmar mesmo assim?`,
                        'Confirmação'
                      );
                       if (!ok) {
                         setUpdatingId(null);
                         return;
                       }
                     } else {
                      await showAlert(
                        `Não foi possível localizar o endereço de entrega para validar sua presença.\n\nEndereço de entrega: ${String(currentEntrega.entrega_endereco_texto || '').trim()}${acc}`,
                        'Localização'
                      );
                       setUpdatingId(null);
                       return;
                     }
                 } else {
                     
                     const distKm = getDistanceFromLatLonInKm(
                         userLocation.lat, 
                         userLocation.lng, 
                         deliveryCoordsResolved[0], 
                         deliveryCoordsResolved[1]
                     );
                     
                     if (distKm > effectiveMaxDistanceKm) {
                         const acc = userLocation.accuracyM ? `\nPrecisão do GPS: ~${Math.round(userLocation.accuracyM)}m` : '';
                        await showAlert(
                          `Você ainda não chegou no local de entrega para confirmar.\n\nEndereço de entrega: ${String(currentEntrega.entrega_endereco_texto || '').trim()}\nDistância: ${distKm.toFixed(2)} km (máx: ${effectiveMaxDistanceKm.toFixed(2)} km)${acc}`,
                          'Localização'
                        );
                         setUpdatingId(null);
                         return;
                     }
                 }
             }
         }
      }

      const opcionais = currentEntrega?.opcionais || {};
      const timeline = opcionais.timeline || {};
      const now = new Date().toISOString();

      if (newStatus === 'chegou_coleta') timeline.chegou_coleta = now;
      if (newStatus === 'em_rota') timeline.coletado = now;
      if (newStatus === 'chegou_entrega') timeline.chegou_entrega = now;
      if (newStatus === 'entregue') timeline.finalizado = now;

      const newOpcionais = { ...opcionais, timeline, ...(extraOpcionais || {}) };

      const { error } = await supabase
        .from('nova_entrega')
        .update({ 
            status: newStatus, 
            updated_at: now,
            opcionais: newOpcionais
        })
        .eq('id', id);

      if (error) throw error;
      
      
      if (newStatus === 'entregue') {
          const entrega = entregas.find(e => e.id === id);
          if (entrega?.pedido_id) {
              await supabase
                  .from('pedidos')
                  .update({ status: 'entregue' })
                  .eq('id', entrega.pedido_id);
          }
      }

      
      if (currentEntrega?.pedido_id) {
          let ifoodAction = '';
          if (newStatus === 'chegou_coleta') ifoodAction = 'dispatch';
          if (newStatus === 'em_rota') ifoodAction = 'dispatch';
          if (newStatus === 'entregue') ifoodAction = 'conclude';
          
          if (ifoodAction) {
              
              supabase.functions.invoke('ifood-update-status', {
                  body: { action: ifoodAction, pedidoId: currentEntrega.pedido_id }
              }).then(({ data, error }) => {
                  if (error || data?.success === false) console.warn('Falha ao atualizar iFood:', error || data);
              });
          }
      }
      
      if (newStatus === 'entregue' || newStatus === 'cancelada') {
        setEntregas(prev => prev.filter(e => e.id !== id));
      } else {
        
        setEntregas(prev => prev.map(e => e.id === id ? { ...e, status: newStatus, opcionais: newOpcionais } : e));
      }

    } catch (error: any) {
      console.error('Erro ao atualizar status:', error);
      await showAlert('Erro ao atualizar status: ' + error.message, 'Erro');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleRejeitar(id: string) {
    const ok = await showConfirm('Deseja realmente rejeitar esta entrega?', 'Confirmação');
    if (!ok) return;
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
      await showAlert('Erro ao rejeitar: ' + error.message, 'Erro');
    } finally {
      setUpdatingId(null);
    }
  }

  async function advanceToNextDestination(id: string) {
    setUpdatingId(id);
    try {
      const currentEntrega = entregas.find(e => e.id === id);
      const dists = distances[id];
      const coords = deliveryCoords[id];

      if (!currentEntrega) {
        await showAlert('Entrega não encontrada.', 'Erro');
        setUpdatingId(null);
        return;
      }

      // Validação de GPS - mesma lógica de updateStatus para chegou_entrega
      if (!userLocation) {
        await showAlert('Aguardando localização do dispositivo...', 'Localização');
        setUpdatingId(null);
        return;
      }

      const hasDeliveryAddress = !!currentEntrega.entrega_endereco_texto;
      const accuracyKm = typeof userLocation.accuracyM === 'number' ? userLocation.accuracyM / 1000 : 0;
      const effectiveMaxDistanceKm = Math.max(BASE_MAX_DISTANCE_KM, 0.25, Math.min(1, accuracyKm * 3.5));

      if (hasDeliveryAddress) {
        let deliveryCoordsResolved = coords?.delivery;
        if (!deliveryCoordsResolved && currentEntrega.entrega_endereco_texto) {
          deliveryCoordsResolved = await getCoordsFromAddress(currentEntrega.entrega_endereco_texto);
          if (deliveryCoordsResolved) {
            setDeliveryCoords(prev => ({ ...prev, [id]: { ...(prev[id] || {}), delivery: deliveryCoordsResolved } }));
          }
        }

        if (!deliveryCoordsResolved) {
          const acc = userLocation.accuracyM ? `\nPrecisão do GPS: ~${Math.round(userLocation.accuracyM)}m` : '';
          const canBypass = typeof userLocation.accuracyM === 'number' && userLocation.accuracyM <= 120;
          if (canBypass) {
            const ok = await showConfirm(
              `Não foi possível localizar o endereço de entrega para validar sua presença.\n\nEndereço de entrega: ${String(currentEntrega.entrega_endereco_texto || '').trim()}${acc}\n\nDeseja confirmar mesmo assim?`,
              'Confirmação'
            );
            if (!ok) {
              setUpdatingId(null);
              return;
            }
          } else {
            await showAlert(
              `Não foi possível localizar o endereço de entrega para validar sua presença.\n\nEndereço de entrega: ${String(currentEntrega.entrega_endereco_texto || '').trim()}${acc}`,
              'Localização'
            );
            setUpdatingId(null);
            return;
          }
        } else {
          const distKm = getDistanceFromLatLonInKm(
            userLocation.lat,
            userLocation.lng,
            deliveryCoordsResolved[0],
            deliveryCoordsResolved[1]
          );

          if (distKm > effectiveMaxDistanceKm) {
            const acc = userLocation.accuracyM ? `\nPrecisão do GPS: ~${Math.round(userLocation.accuracyM)}m` : '';
            await showAlert(
              `Você ainda não chegou no local de entrega para confirmar.\n\nEndereço de entrega: ${String(currentEntrega.entrega_endereco_texto || '').trim()}\nDistância: ${distKm.toFixed(2)} km (máx: ${effectiveMaxDistanceKm.toFixed(2)} km)${acc}`,
              'Localização'
            );
            setUpdatingId(null);
            return;
          }
        }
      }

      // Após validação GPS, usa helper compartilhado para calcular avanço
      const now = new Date().toISOString();
      const result = calculateAdvanceDestination(currentEntrega, now);

      if (!result.success) {
        await showAlert(result.error || 'Erro ao avançar destino', 'Erro');
        setUpdatingId(null);
        return;
      }

      if (!result.updatedFields) {
        await showAlert('Erro ao calcular campos atualizados', 'Erro');
        setUpdatingId(null);
        return;
      }

      const { error: advanceError } = await supabase
        .from('nova_entrega')
        .update(result.updatedFields as any)
        .eq('id', id);

      if (advanceError) throw advanceError;

      const nextAddr = result.updatedFields.entrega_endereco_texto;
      const nextCoords = await getCoordsFromAddress(nextAddr || '');
      if (nextCoords) {
        setDeliveryCoords((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), delivery: nextCoords } }));
      }

      setEntregas((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, ...result.updatedFields }
            : e,
        ),
      );

    } catch (error: any) {
      console.error('Erro ao avançar destino:', error);
      await showAlert('Erro ao avançar destino: ' + error.message, 'Erro');
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
      <Modal
        open={dialog.open}
        onClose={() => {
          setDialog((prev) => ({ ...prev, open: false }));
          if (dialog.mode === 'confirm') {
            dialogConfirmResolveRef.current?.(false);
            dialogConfirmResolveRef.current = null;
          } else {
            dialogAlertResolveRef.current?.();
            dialogAlertResolveRef.current = null;
          }
        }}
        onConfirm={
          dialog.mode === 'confirm'
            ? () => {
                setDialog((prev) => ({ ...prev, open: false }));
                dialogConfirmResolveRef.current?.(true);
                dialogConfirmResolveRef.current = null;
              }
            : undefined
        }
        title={dialog.title}
        cancelText={dialog.mode === 'confirm' ? 'Cancelar' : 'OK'}
        confirmText="Confirmar"
      >
        <div className="text-sm text-slate-700 whitespace-pre-wrap">{dialog.message}</div>
      </Modal>
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
            const extraPoints = parseExtraDeliveryPoints(entrega);
            const currentDestinationIndex = getCurrentDestinationIndex(entrega);
            const hasNextDestination = currentDestinationIndex < extraPoints.length;
            const totalDestinations = 1 + extraPoints.length;
            const currentDestinationNumber = Math.min(currentDestinationIndex + 1, totalDestinations);
            
            const temRetorno = Boolean((entrega as any).retorno);
            const retornoFase = entrega.opcionais?.retorno_fase as string | undefined;
            const isInReturnPhase = temRetorno && !!retornoFase;
            const isPickupPhase = ['criada', 'atribuida', 'chegou_coleta'].includes(entrega.status) && !isInReturnPhase;
            const destCoords = (isPickupPhase || isInReturnPhase) ? coords?.pickup : coords?.delivery;

            const pagamentoMetodo = entrega.pagamento_metodo ? String(entrega.pagamento_metodo).toLowerCase() : '';
            const pagamentoLabel =
              pagamentoMetodo === 'dinheiro'
                ? 'Dinheiro'
                : pagamentoMetodo === 'cartao'
                  ? 'Cartão'
                  : pagamentoMetodo === 'pix'
                    ? 'PIX'
                    : pagamentoMetodo === 'online'
                      ? 'Online'
                      : entrega.pagamento_metodo || '';

            let statusLabel = 'Aguardando Coleta';
            let statusColor = 'bg-yellow-100 text-yellow-700';

            if (entrega.status === 'chegou_coleta') {
                statusLabel = retornoFase === 'retornado' ? 'Retornou à Loja' : 'Na Loja';
                statusColor = retornoFase === 'retornado' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700';
            } else if (entrega.status === 'em_rota') {
                statusLabel = retornoFase === 'retorno' ? 'Em Retorno' : 'Em Rota';
                statusColor = retornoFase === 'retorno' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';
            } else if (entrega.status === 'chegou_entrega') {
                statusLabel = 'No Cliente';
                statusColor = 'bg-purple-100 text-purple-700';
            }
            
            return (
            <>
            <div key={entrega.id} className="bg-white rounded-lg shadow-lg border-l-4 border-sky-500 overflow-hidden">
              {/* Compact header — tap to open details */}
              <div
                className="p-5 border-b border-gray-100 bg-sky-50/50 cursor-pointer active:bg-sky-100 transition-colors"
                onClick={() => setDetailModalId(entrega.id)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className={`inline-block px-2 py-1 rounded text-xs font-bold uppercase mb-1 ${statusColor}`}>
                      {statusLabel}
                    </span>
                    {entrega.clientes?.nome_completo && (
                      <p className="text-xs font-semibold text-gray-600 mb-1">{entrega.clientes.nome_completo}</p>
                    )}
                    {totalDestinations > 1 && (
                      <div className="mb-1 text-xs text-slate-500">
                        Destino {currentDestinationNumber} de {totalDestinations}
                      </div>
                    )}
                    <h3 className="font-bold text-gray-800">#{entrega.entrega_codigo_pedido || String(entrega.id).slice(0, 8)}</h3>
                  </div>
                  <div className="flex items-center gap-1 text-sky-500">
                    <span className="text-xs font-medium">Detalhes</span>
                    <ChevronRight size={16} />
                  </div>
                </div>
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
                    onClick={() => hasNextDestination ? advanceToNextDestination(entrega.id) : updateStatus(entrega.id, 'entregue')}
                    disabled={updatingId === entrega.id}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {updatingId === entrega.id ? 'Atualizando...' : (
                      <>
                        <CheckCircle size={18} />
                        {hasNextDestination ? 'Ir para Próximo Destino' : 'Finalizar Entrega'}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Detail modal */}
            {detailModalId === entrega.id && (
              <div
                className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center"
                onClick={() => { setDetailModalId(null); setMapVisibleId(null); }}
              >
                <div
                  className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Modal header */}
                  <div className="sticky top-0 bg-white flex justify-between items-center px-5 py-4 border-b border-gray-100 z-10">
                    <div>
                      <span className={`inline-block px-2 py-1 rounded text-xs font-bold uppercase ${statusColor}`}>{statusLabel}</span>
                      {entrega.clientes?.nome_completo && (
                        <span className="ml-2 text-sm font-semibold text-gray-700">{entrega.clientes.nome_completo}</span>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">#{entrega.entrega_codigo_pedido || String(entrega.id).slice(0, 8)}</p>
                    </div>
                    <button
                      onClick={() => { setDetailModalId(null); setMapVisibleId(null); }}
                      className="p-2 rounded-full hover:bg-gray-100 text-gray-400 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="p-5 space-y-5">
                    {/* Valores */}
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">Valores</p>
                      <div className="flex items-center gap-1 text-green-600 font-bold text-2xl mb-2">
                        <DollarSign size={22} />
                        {(() => {
                          const base = calculateMultiDestinoTotal(entrega);
                          if (base > 0 || driverDynamicRules.length === 0) return base.toFixed(2);
                          let total = 0;
                          for (const r of driverDynamicRules) {
                            const c = (r.criterio || '').toUpperCase();
                            if (c === 'TAXA_FIXA' && r.multiplicador != null) total += Number(r.multiplicador);
                            else if (c === 'MULTIPLICADOR' && r.multiplicador != null) total *= Number(r.multiplicador);
                          }
                          return total.toFixed(2);
                        })()}
                      </div>
                      {(() => {
                        const vm = entrega?.opcionais?.valor_multiplo as { valorPorPonto: number; pontos: number; total: number } | undefined;
                        const extraPts = safeParseArray(entrega?.pontos_adicionais);
                        const mt = vm?.valorPorPonto ? vm.valorPorPonto * (1 + extraPts.length) : 0;
                        return mt > 0 ? (
                          <span className="inline-block text-xs text-emerald-700 bg-emerald-100 px-2 py-1 rounded font-semibold mb-1">
                            + R$ {mt.toFixed(2).replace('.', ',')} (Múltiplo)
                          </span>
                        ) : null;
                      })()}
                      {entrega.opcionais?.driver_bonuses && Array.isArray(entrega.opcionais.driver_bonuses) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entrega.opcionais.driver_bonuses.map((bonus: any, idx: number) => {
                            const isReturn = bonus.description && bonus.description.toLowerCase().includes('retorno');
                            return (
                              <span key={idx} className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded font-semibold">
                                {isReturn ? 'Com retorno' : bonus.description}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {(() => {
                        const base = calculateMultiDestinoTotal(entrega);
                        if (base > 0 || driverDynamicRules.length === 0) return null;
                        let runningTotal = 0;
                        const applied: Array<{ valor: number; observacao: string }> = [];
                        for (const r of driverDynamicRules) {
                          const c = (r.criterio || '').toUpperCase();
                          if (c === 'TAXA_FIXA' && r.multiplicador != null) {
                            applied.push({ valor: Number(r.multiplicador), observacao: r.observacao || '' });
                            runningTotal += Number(r.multiplicador);
                          } else if (c === 'MULTIPLICADOR' && r.multiplicador != null) {
                            applied.push({ valor: runningTotal * (Number(r.multiplicador) - 1), observacao: r.observacao || '' });
                            runningTotal *= Number(r.multiplicador);
                          }
                        }
                        if (applied.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {applied.map((rule, idx) => (
                              <span key={idx} className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 font-semibold">
                                + R$ {Number(rule.valor).toFixed(2).replace('.', ',')}
                                {rule.observacao ? ` • ${rule.observacao}` : ''}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Endereços */}
                    <div className="space-y-4">
                      <div className="relative pl-6 border-l-2 border-gray-200">
                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-gray-300" />
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Coleta</p>
                        <p className="text-gray-800">{entrega.coleta_endereco_texto || 'Endereço cadastrado'}</p>
                        {entrega.coleta_contato && <p className="text-sm text-gray-500 mt-1">Falar com: {entrega.coleta_contato}</p>}
                      </div>
                      <div className="relative pl-6 border-l-2 border-gray-200">
                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-sky-500" />
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">Entrega</p>
                        <p className="text-gray-800">{entrega.entrega_endereco_texto}</p>
                        {entrega.entrega_complemento && <p className="text-sm text-gray-500">{entrega.entrega_complemento}</p>}
                        {entrega.entrega_contato && <p className="text-sm text-gray-500 mt-1">Recebedor: {entrega.entrega_contato}</p>}
                      </div>
                    </div>

                    {/* Observações */}
                    {entrega.observacoes && (
                      <div className="bg-yellow-50 p-3 rounded-lg text-sm text-yellow-800 flex gap-2">
                        <AlertCircle size={16} className="shrink-0 mt-0.5" />
                        <p>{entrega.observacoes}</p>
                      </div>
                    )}

                    {/* Telefone */}
                    {entrega.clientes?.telefone && (
                      <a
                        href={`tel:${entrega.clientes.telefone}`}
                        className="flex items-center gap-2 text-sky-600 text-sm font-medium hover:underline"
                      >
                        <Phone size={16} />
                        Ligar para {entrega.clientes.nome_completo}
                      </a>
                    )}

                    {/* Pagamento */}
                    {(entrega.pagamento_metodo || entrega.pagamento_na_entrega || entrega.troco_para || entrega.documento_numero) && (
                      <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-700 border border-slate-100 space-y-1">
                        {pagamentoLabel && (
                          <p>
                            <span className="text-slate-500">Pagamento:</span> {pagamentoLabel}
                            {entrega.pagamento_na_entrega ? ' (na entrega)' : ''}
                          </p>
                        )}
                        {entrega.troco_para !== null && entrega.troco_para !== undefined && (
                          <p><span className="text-slate-500">Troco para:</span> R$ {Number(entrega.troco_para || 0).toFixed(2)}</p>
                        )}
                        {entrega.documento_numero && (
                          <p><span className="text-slate-500">Documento:</span> {(entrega.documento_tipo || '').toUpperCase()} {entrega.documento_numero}</p>
                        )}
                      </div>
                    )}

                    {/* Distância */}
                    {(entrega.distancia_km || distances[entrega.id]) && (
                      <div className="text-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <span className="block text-gray-400 text-xs mb-1">Distância da Entrega</span>
                        <span className="font-bold text-sky-600 text-2xl">
                          {entrega.distancia_km ? Number(entrega.distancia_km).toFixed(1) : distances[entrega.id]?.pickupToDelivery.toFixed(1)} km
                        </span>
                      </div>
                    )}

                    {/* Ver no App / Abrir GPS */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setMapVisibleId(mapVisibleId === entrega.id ? null : entrega.id)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors text-sm font-medium"
                      >
                        <MapIcon size={16} />
                        {mapVisibleId === entrega.id ? 'Ocultar Mapa' : 'Ver no App'}
                      </button>
                      <button
                        onClick={async () => {
                          const address = isPickupPhase ? entrega.coleta_endereco_texto : entrega.entrega_endereco_texto;
                          if (!address) { await showAlert('Endereço não disponível', 'Aviso'); return; }
                          const originParam = userLocation ? `&origin=${userLocation.lat},${userLocation.lng}` : '';
                          const destination = destCoords ? `${destCoords[0]},${destCoords[1]}` : encodeURIComponent(address);
                          window.open(`https://www.google.com/maps/dir/?api=1${originParam}&destination=${destination}&travelmode=driving`, '_blank');
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors text-sm font-medium border border-blue-200"
                      >
                        <Navigation size={16} />
                        Abrir GPS
                      </button>
                    </div>

                    {/* Mapa */}
                    {mapVisibleId === entrega.id && (
                      <div className="h-64 rounded-lg overflow-hidden border border-slate-200 relative">
                        {userLocation ? (
                          <MapView
                            deliveryPersons={getFakeDeliveryPerson() ? [getFakeDeliveryPerson()!] : []}
                            center={[userLocation.lat, userLocation.lng]}
                            origin={coords?.pickup}
                            destination={destCoords}
                            originTitle="Coleta"
                            destinationTitle={`Destino ${currentDestinationNumber}`}
                            originIconType="store"
                            additionalDestinations={Object.entries(coords?.additional || {})
                              .filter(([order]) => Number(order) >= currentDestinationIndex + 2)
                              .map(([order, pt]) => ({ coords: pt as [number, number], title: `Destino ${order}`, order: Number(order) }))}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
                            Obtendo sua localização...
                          </div>
                        )}
                        {(!coords?.pickup && !coords?.delivery && (!coords?.additional || Object.keys(coords.additional).length === 0)) && (
                          <div className="absolute bottom-2 left-2 right-2 bg-white/90 p-2 rounded text-xs text-center text-slate-600 shadow-sm">
                            Endereços sem coordenadas. O mapa mostra apenas sua localização.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            </>
            );
          })}
        </div>
      )}
    </div>
  );
}
