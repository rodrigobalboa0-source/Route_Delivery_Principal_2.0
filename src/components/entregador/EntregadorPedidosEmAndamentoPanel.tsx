import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, CheckCircle, Truck, AlertCircle, Phone, Navigation, Map as MapIcon, DollarSign } from 'lucide-react';
import { MapView, MapDeliveryPerson } from '../MapView';
import type { Database } from '../../lib/database.types';
import { Geolocation } from '@capacitor/geolocation';
import { getDistanceFromLatLonInKm, getCoordsFromAddress } from '../../utils/geo';
import { Modal } from '../Modal';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

type ExtraDeliveryPoint = {
  contato?: string;
  telefone?: string;
  cep?: string;
  endereco_texto?: string;
  numero?: string;
  complemento?: string;
  observacoes?: string;
};

function parseExtraDeliveryPoints(entrega: any): ExtraDeliveryPoint[] {
  const raw = entrega?.pontos_adicionais;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => ({
      contato: p?.contato || '',
      telefone: p?.telefone || '',
      cep: p?.cep || '',
      endereco_texto: p?.endereco_texto || '',
      numero: p?.numero || '',
      complemento: p?.complemento || '',
      observacoes: p?.observacoes || '',
    }))
    .filter((p) => String(p.endereco_texto || '').trim().length > 0);
}

function getCurrentDestinationIndex(entrega: any): number {
  const idx = entrega?.opcionais?.destino_atual_indice;
  if (typeof idx !== 'number' || !Number.isFinite(idx) || idx < 0) return 0;
  return Math.floor(idx);
}

function safeParseArray(value: any) {
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
}

function calculateMultiDestinoTotal(entrega: any) {
  const extraPoints = safeParseArray(entrega?.pontos_adicionais);
  const comissaoDestinos = safeParseArray(entrega?.opcionais?.comissao_destinos);
  const comissaoRetorno = typeof entrega?.opcionais?.comissao_retorno === 'number' ? Number(entrega.opcionais.comissao_retorno) : 0;
  
  const numDestinos = 1 + extraPoints.length;
  if (numDestinos <= 1) return Number(entrega.valor_entregador || 0);

  const totalDestinos = comissaoDestinos.reduce((sum: number, d: any) => sum + (typeof d?.valor === 'number' ? d.valor : 0), 0);
  return totalDestinos + comissaoRetorno;
}

export function EntregadorPedidosEmAndamentoPanel() {
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mapVisibleId, setMapVisibleId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracyM?: number } | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  
  const [deliveryCoords, setDeliveryCoords] = useState<Record<string, { pickup?: [number, number], delivery?: [number, number], additional?: Record<number, [number, number]> }>>({});
  const [distances, setDistances] = useState<Record<string, { userToPickup: number, pickupToDelivery: number, userToDelivery: number }>>({});
  const [persistedDistanceIds, setPersistedDistanceIds] = useState<Record<string, boolean>>({});

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

        // Buscar coordenadas dos pontos adicionais
        const extraPoints = parseExtraDeliveryPoints(entrega);
        for (let i = 0; i < extraPoints.length; i++) {
          const point = extraPoints[i];
          if (point.endereco_texto) {
            await new Promise(r => setTimeout(r, 1000)); 
            const coords = await getCoordsFromAddress(point.endereco_texto);
            if (coords) {
              additional[i + 2] = coords; // +2 porque: 1=coleta, 2=primeira entrega
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
      console.log('Polling fallback: fetching deliveries in progress...');
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
        console.log('Real-time change detected in nova_entrega (andamento):', payload.eventType, payload.new?.id || payload.old?.id);
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
        console.log('Real-time change detected in pedidos (andamento):', newPedido.id, 'Status:', newPedido.status);
        if (newPedido.status === 'cancelado') {
            console.log('Order canceled, removing from in-progress list:', newPedido.id);
            setEntregas(prev => prev.filter(e => e.pedido_id !== newPedido.id));
            setTimeout(fetchEntregas, 1000);
        }
      })
      .subscribe();

    let watchId: string | null = null;

    const startWatching = async () => {
      try {
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
          
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : undefined
          });
        } catch (e) {
          console.warn('Erro ao obter posição inicial, aguardando watchPosition', e);
        }

        watchId = await Geolocation.watchPosition({ 
          enableHighAccuracy: true,
          timeout: 10000 
        }, (position, err) => {
          if (position) {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracyM: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : undefined
            });
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

    return () => {
      clearInterval(intervalId);
      subscription.unsubscribe();
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
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

  async function updateStatus(id: string, newStatus: string) {
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

      const newOpcionais = { ...opcionais, timeline };

      if (newStatus === 'entregue' && currentEntrega) {
        const extras = parseExtraDeliveryPoints(currentEntrega);
        const currentDestinoIdx = getCurrentDestinationIndex(currentEntrega);
        const hasNextDestination = currentDestinoIdx < extras.length;

        if (hasNextDestination) {
          const nextPoint = extras[currentDestinoIdx];
          const baseAddr = String(nextPoint.endereco_texto || '').trim();
          const nextAddr = nextPoint.numero ? `${baseAddr}, ${String(nextPoint.numero).trim()}` : baseAddr;

          if (!nextAddr) {
            await showAlert('Não foi possível avançar: próximo destino sem endereço.', 'Erro');
            setUpdatingId(null);
            return;
          }

          const advanceTimeline = {
            ...timeline,
            [`destino_${currentDestinoIdx + 1}_concluido_em`]: now,
            [`destino_${currentDestinoIdx + 2}_iniciado_em`]: now,
          };
          const advancedOpcionais = {
            ...opcionais,
            timeline: advanceTimeline,
            destino_atual_indice: currentDestinoIdx + 1,
          };

          const { error: advanceError } = await supabase
            .from('nova_entrega')
            .update({
              status: 'em_rota',
              updated_at: now,
              opcionais: advancedOpcionais,
              entrega_contato: nextPoint.contato || null,
              entrega_telefone: nextPoint.telefone || null,
              entrega_cep: nextPoint.cep || null,
              entrega_endereco_texto: nextAddr,
              entrega_complemento: nextPoint.complemento || null,
              entrega_observacoes: nextPoint.observacoes || null,
            } as any)
            .eq('id', id);

          if (advanceError) throw advanceError;

          const nextCoords = await getCoordsFromAddress(nextAddr);
          if (nextCoords) {
            setDeliveryCoords((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), delivery: nextCoords } }));
          }

          setEntregas((prev) =>
            prev.map((e) =>
              e.id === id
                ? {
                    ...e,
                    status: 'em_rota',
                    opcionais: advancedOpcionais,
                    entrega_contato: nextPoint.contato || null,
                    entrega_telefone: nextPoint.telefone || null,
                    entrega_cep: nextPoint.cep || null,
                    entrega_endereco_texto: nextAddr,
                    entrega_complemento: nextPoint.complemento || null,
                    entrega_observacoes: nextPoint.observacoes || null,
                  }
                : e,
            ),
          );

          return;
        }
      }

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
            
            const isPickupPhase = ['criada', 'atribuida', 'chegou_coleta'].includes(entrega.status);
            const destCoords = isPickupPhase ? coords?.pickup : coords?.delivery;
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
                statusLabel = 'Na Loja';
                statusColor = 'bg-orange-100 text-orange-700';
            } else if (entrega.status === 'em_rota') {
                statusLabel = 'Em Rota';
                statusColor = 'bg-blue-100 text-blue-700';
            } else if (entrega.status === 'chegou_entrega') {
                statusLabel = 'No Cliente';
                statusColor = 'bg-purple-100 text-purple-700';
            }
            
            return (
            <div key={entrega.id} className="bg-white rounded-lg shadow-lg border-l-4 border-sky-500 overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-sky-50/50">
                 <div className="flex justify-between items-start">
                   <div>
                     <span className={`inline-block px-2 py-1 rounded text-xs font-bold uppercase mb-2 ${statusColor}`}>
                       {statusLabel}
                     </span>
                     {totalDestinations > 1 && (
                      <div className="mb-2 text-xs text-slate-500">
                        Destino {currentDestinationNumber} de {totalDestinations}
                      </div>
                     )}
                     <h3 className="font-bold text-gray-800">#{entrega.entrega_codigo_pedido || String(entrega.id).slice(0, 8)}</h3>
                   </div>
                   <div className="text-right">
                     <div className="flex flex-col items-end">
                       <div className="flex items-center gap-1 text-green-600 font-bold text-lg justify-end mb-1">
                         <DollarSign size={18} />
                         {calculateMultiDestinoTotal(entrega).toFixed(2)}
                       </div>
                       {entrega.opcionais?.driver_bonuses && Array.isArray(entrega.opcionais.driver_bonuses) && (
                         <div className="text-xs text-right flex flex-col items-end gap-1">
                           {entrega.opcionais.driver_bonuses.map((bonus: any, idx: number) => {
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
                     <p className="text-sm font-medium text-gray-600">{entrega.clientes?.nome_completo}</p>
                     {(entrega.clientes?.telefone) && (
                       <a href={`tel:${entrega.clientes?.telefone}`} className="inline-flex items-center gap-1 text-xs text-sky-600 mt-1 hover:underline">
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

                {(entrega.pagamento_metodo || entrega.pagamento_na_entrega || entrega.troco_para || entrega.documento_numero) && (
                  <div className="bg-slate-50 p-3 rounded text-sm text-slate-700 border border-slate-100 space-y-1">
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

                {/* Distances */}
                {(entrega.distancia_km || distances[entrega.id]) && (
                    <div className="grid grid-cols-1 gap-2 text-xs bg-gray-50 p-2 rounded border border-gray-100">
                         <div className="text-center">
                            <span className="block text-gray-400">Entrega</span>
                            <span className="font-bold text-sky-600 text-lg">
                                {entrega.distancia_km ? Number(entrega.distancia_km).toFixed(1) : distances[entrega.id]?.pickupToDelivery.toFixed(1)} km
                            </span>
                         </div>
                    </div>
                )}

                {/* Map & Navigation Actions */}
                <div className="flex gap-2">
                  <button 
                    onClick={() => setMapVisibleId(mapVisibleId === entrega.id ? null : entrega.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors text-sm font-medium"
                  >
                    <MapIcon size={16} />
                    {mapVisibleId === entrega.id ? 'Ocultar Mapa' : 'Ver no App'}
                  </button>

                  <button 
                    onClick={async () => {
                        const address = isPickupPhase ? entrega.coleta_endereco_texto : entrega.entrega_endereco_texto;
                        if (!address) {
                          await showAlert('Endereço não disponível', 'Aviso');
                          return;
                        }
                        
                        const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
                        window.open(url, '_blank');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors text-sm font-medium border border-blue-200"
                  >
                    <Navigation size={16} />
                    Abrir GPS
                  </button>
                </div>

                {mapVisibleId === entrega.id && (
                  <div className="h-64 rounded-lg overflow-hidden border border-slate-200 relative">
                    {userLocation ? (
                      <MapView 
                        deliveryPersons={getFakeDeliveryPerson() ? [getFakeDeliveryPerson()!] : []}
                        center={userLocation ? [userLocation.lat, userLocation.lng] : undefined}
                        origin={coords?.pickup}
                        destination={destCoords}
                        originTitle="Coleta"
                        destinationTitle={`Destino ${currentDestinationNumber}`}
                        originIconType="store"
                        additionalDestinations={Object.entries(coords?.additional || {})
                          .filter(([order]) => Number(order) >= currentDestinationIndex + 2) // Apenas destinos futuros
                          .map(([order, coords]) => ({
                            coords,
                            title: `Destino ${order}`,
                            order: Number(order)
                          }))}
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
                    onClick={() => updateStatus(entrega.id, 'entregue')}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
