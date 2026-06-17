import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, Navigation, Package, DollarSign, Clock, AlertCircle, XCircle } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { getDistanceFromLatLonInKm, getCoordsFromAddress } from '../../utils/geo';

export function EntregadorEntregasDisponiveisPanel() {
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<Record<string, { pickup?: [number, number], delivery?: [number, number] }>>({});
  const [distances, setDistances] = useState<Record<string, { toPickup: number, toDelivery: number }>>({});
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [entregadorId, setEntregadorId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [hasPriority, setHasPriority] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const lastCountRef = useRef(0);
  const [calcValues, setCalcValues] = useState<Record<string, { total: number; rules: any[] }>>({});

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

  const calculateMultiDestinoTotal = (entrega: any) => {
    const extraPoints = safeParseArray(entrega?.pontos_adicionais);
    const comissaoDestinos = safeParseArray(entrega?.opcionais?.comissao_destinos);
    const comissaoRetorno = typeof entrega?.opcionais?.comissao_retorno === 'number' ? Number(entrega.opcionais.comissao_retorno) : 0;
    const valorMultiplo = entrega?.opcionais?.valor_multiplo as { valorPorPonto: number; pontos: number; total: number } | undefined;
    const multiploTotal = valorMultiplo?.valorPorPonto ? valorMultiplo.valorPorPonto * (1 + extraPoints.length) : 0;

    const numDestinos = 1 + extraPoints.length;
    if (numDestinos <= 1) return Number(entrega.valor_entregador || 0) + multiploTotal;

    const totalDestinos = comissaoDestinos.reduce((sum: number, d: any) => sum + (typeof d?.valor === 'number' ? d.valor : 0), 0);
    return totalDestinos + comissaoRetorno + multiploTotal;
  };

  
  useEffect(() => {
    if (entregas.length === 0) return;
    const newIds = entregas.map(e => e.id).filter(id => !calcValues[id]);
    if (newIds.length === 0) return;

    const applyLocalRules = (baseValor: number, rules: any[]) => {
      if (baseValor > 0 || rules.length === 0) return { total: baseValor, rules: [] };
      let total = 0;
      const applied: any[] = [];
      for (const r of rules) {
        const c = (r.criterio || '').toUpperCase();
        if (c === 'TAXA_FIXA' && r.multiplicador != null) {
          applied.push({ valor: Number(r.multiplicador), observacao: r.observacao || '' });
          total += Number(r.multiplicador);
        } else if (c === 'MULTIPLICADOR' && r.multiplicador != null) {
          applied.push({ valor: total * (Number(r.multiplicador) - 1), observacao: r.observacao || '' });
          total *= Number(r.multiplicador);
        }
      }
      return { total, rules: applied };
    };

    Promise.all(
      entregas.filter(e => newIds.includes(e.id)).map(async (entrega) => {
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_entrega_comissao_debug', { entrega_id: entrega.id });
          if (!rpcError && rpcData && (rpcData as any).success === true) {
            const total = Number((rpcData as any).total || 0);
            const appliedRules = Array.isArray((rpcData as any).applied_driver_rules) ? (rpcData as any).applied_driver_rules : [];
            if (total > 0) return { id: entrega.id, total, rules: appliedRules };
          }
        } catch {}

        
        const baseValor = calculateMultiDestinoTotal(entrega);
        const { data: dynRules } = await supabase
          .from('preco_dinamico_entregador')
          .select('criterio, multiplicador, observacao')
          .eq('ativa', true)
          .order('created_at', { ascending: true });
        const result = applyLocalRules(baseValor, dynRules || []);
        return { id: entrega.id, total: result.total, rules: result.rules };
      })
    ).then(results => {
      const map: Record<string, { total: number; rules: any[] }> = {};
      for (const r of results) if (r) map[r.id] = { total: r.total, rules: r.rules };
      if (Object.keys(map).length > 0) setCalcValues(prev => ({ ...prev, ...map }));
    });
  }, [entregas]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [commerceNames, setCommerceNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchNames = async () => {
      const missingIds = [...new Set(entregas.map(e => e.cliente_id).filter(id => id && !commerceNames[id]))];
      if (missingIds.length === 0) return;

      const newNames: Record<string, string> = {};
      
      await Promise.all(missingIds.map(async (id) => {
        try {
          const { data } = await supabase.rpc('get_cliente_public_info', { cid: id });
          if (data && data.length > 0) {
            newNames[id] = data[0].nome_completo;
          }
        } catch (e) {
          console.error('Error fetching client name', e);
        }
      }));
      
      if (Object.keys(newNames).length > 0) {
        setCommerceNames(prev => ({ ...prev, ...newNames }));
      }
    };
    
    if (entregas.length > 0) {
        fetchNames();
    }
  }, [entregas]);

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
          console.error('Erro ao carregar raio de busca:', error);
          setRadiusKm(30);
          return;
        }

        if (data && typeof data.raio_busca_entregador === 'number') {
          setRadiusKm(data.raio_busca_entregador || 30);
        } else {
          setRadiusKm(30);
        }
      } catch (e) {
        setRadiusKm(30);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    async function loadProfile() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email) {
                const { data } = await supabase
                    .from('entregadores')
                    .select('id, is_online, prioridade_busca')
                    .eq('email', user.email)
                    .single();
                if (data) {
                    setEntregadorId(data.id);
                    setIsOnline(data.is_online || false);
                    setHasPriority(data.prioridade_busca || false);
                } else {
                    setProfileMissing(true);
                    setLoading(false);
                }
            }
        } catch (e) {
            console.error('Erro ao carregar perfil', e);
            setLoading(false);
        }
    }
    loadProfile();
  }, []);

  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); 
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.error('Erro ao tocar som:', e);
    }
  };

  useEffect(() => {
    Geolocation.getCurrentPosition().then(pos => {
        setCurrentLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
        });
    }).catch(err => console.error('Error getting location', err));
  }, []);

  
  useEffect(() => {
      const fetchCoords = async () => {
          const newCoords: Record<string, { pickup?: [number, number], delivery?: [number, number] }> = {};
          let hasNew = false;

          for (const entrega of entregas) {
              if (deliveryCoords[entrega.id]) continue; 

              let pickup: [number, number] | undefined;
              let delivery: [number, number] | undefined;

              if (entrega.coleta_endereco_texto) {
                  await new Promise(r => setTimeout(r, 1000)); 
                  pickup = await getCoordsFromAddress(entrega.coleta_endereco_texto);
              } else {
                  
                  try {
                    let rua: string | null = null;
                    let numero: string | null = null;
                    let bairro: string | null = null;
                    let cidade: string | null = null;
                    let cep: string | null = null;
                    
                    if (entrega.cliente_id) {
                      const { data: cli } = await supabase
                        .from('clientes')
                        .select('rua, numero, bairro, cidade, cep')
                        .eq('id', entrega.cliente_id)
                        .maybeSingle();
                      rua = cli?.rua ?? null;
                      numero = cli?.numero ?? null;
                      bairro = cli?.bairro ?? null;
                      cidade = cli?.cidade ?? null;
                      cep = cli?.cep ?? null;
                      
                      if (!rua || !cidade) {
                        const { data: alt } = await supabase
                          .from('cliente_enderecos')
                          .select('rua, numero, bairro, cidade, cep')
                          .eq('cliente_id', entrega.cliente_id)
                          .order('created_at', { ascending: false })
                          .limit(1);
                        const row = Array.isArray(alt) && alt.length > 0 ? alt[0] : null;
                        rua = rua || row?.rua || null;
                        numero = numero || row?.numero || null;
                        bairro = bairro || row?.bairro || null;
                        cidade = cidade || row?.cidade || null;
                        cep = cep || row?.cep || null;
                      }
                    }
                    
                    const parts = [rua, numero, bairro, cidade, cep].filter(Boolean);
                    const pickupText = parts.join(', ');
                    if (pickupText) {
                      await new Promise(r => setTimeout(r, 1000)); // Rate limit
                      pickup = await getCoordsFromAddress(pickupText);
                    }
                  } catch {
                    
                  }
              }
              
              if (entrega.entrega_endereco_texto) {
                  await new Promise(r => setTimeout(r, 1000)); 
                  delivery = await getCoordsFromAddress(entrega.entrega_endereco_texto);
              }
              
              if (pickup || delivery) {
                  newCoords[entrega.id] = { pickup, delivery };
                  hasNew = true;
                  
                  setDeliveryCoords(prev => ({ ...prev, [entrega.id]: { pickup, delivery } }));
              }
          }
      };
      
      if (entregas.length > 0) {
          fetchCoords();
      }
  }, [entregas]);

  
  useEffect(() => {
      if (!currentLocation) return;
      
      const newDistances: Record<string, { toPickup: number, toDelivery: number }> = {};
      
      Object.keys(deliveryCoords).forEach(id => {
          const coords = deliveryCoords[id];
          let distToPickup = 0;
          let distPickupToDelivery = 0;

          if (coords.pickup) {
              distToPickup = getDistanceFromLatLonInKm(
                  currentLocation.lat, currentLocation.lng,
                  coords.pickup[0], coords.pickup[1]
              );
              
              if (coords.delivery) {
                   distPickupToDelivery = getDistanceFromLatLonInKm(
                      coords.pickup[0], coords.pickup[1],
                      coords.delivery[0], coords.delivery[1]
                   );
              }
          } else if (coords.delivery) {
              
          }

          newDistances[id] = {
              toPickup: distToPickup,
              toDelivery: distPickupToDelivery
          };
      });
      
      setDistances(newDistances);
  }, [currentLocation, deliveryCoords]);

  useEffect(() => {
    if (!entregadorId) return;

    
    const statusChannel = supabase
        .channel('entregador_status_monitor')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'entregadores',
            filter: `id=eq.${entregadorId}`
        }, (payload) => {
            if (payload.new) {
                setIsOnline(payload.new.is_online);
            }
        })
        .subscribe();

    if (!isOnline) {
        setEntregas([]);
        setLoading(false);
        return () => { supabase.removeChannel(statusChannel); };
    }

    fetchEntregas();
    
    
    const intervalId = setInterval(() => {
      fetchEntregas();
    }, 5000);

    const subscription = supabase
      .channel('nova_entrega_disponiveis')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'nova_entrega' 
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
            setEntregas(prev => prev.filter(e => e.id !== payload.old.id));
        } else if (payload.eventType === 'UPDATE') {
            const newRecord = payload.new as any;
            
            
            if (newRecord.status !== 'criada') {
                const isAssignedToMe = newRecord.status === 'atribuida' && 
                                     newRecord.entregador_id === entregadorId &&
                                     newRecord.atribuicao_modo === 'automatica';
                
                if (!isAssignedToMe) {
                    setEntregas(prev => prev.filter(e => e.id !== newRecord.id));
                }
            }
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

    return () => {
      clearInterval(intervalId);
      subscription.unsubscribe();
      supabase.removeChannel(statusChannel);
    };
  }, [entregadorId, isOnline]);

  async function fetchEntregas() {
    if (!entregadorId) return;

    try {
      
      const [configResult, countResult] = await Promise.all([
        supabase
          .from('configuracoes_comercio')
          .select('limite_entregas_simultaneas')
          .limit(1)
          .single(),
        supabase
          .from('nova_entrega')
          .select('*', { count: 'exact', head: true })
          .eq('entregador_id', entregadorId)
          .in('status', ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega'])
      ]);

      const limit = configResult.data?.limite_entregas_simultaneas || 10;
      const effectiveLimit = Math.min(limit, 4);
      const currentActive = countResult.count || 0;

      if (currentActive >= effectiveLimit) {
        setEntregas([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('nova_entrega')
        .select(`
          *,
          clientes:cliente_id (nome_completo),
          tipo_servicos:tipo_servico_id (nome),
          pedidos!inner(status)
        `)
        .eq('pedidos.status', 'pronto')
        .or(`and(status.eq.criada,entregador_id.is.null),and(status.eq.atribuida,entregador_id.eq.${entregadorId},atribuicao_modo.eq.automatica)`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const newEntregas = data || [];
      setEntregas(newEntregas);
      
      if (newEntregas.length > lastCountRef.current) {
          playNotificationSound();
      }
      lastCountRef.current = newEntregas.length;

    } catch (error) {
      console.error('Erro ao buscar entregas disponíveis:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAceitar(id: string) {
    setProcessingId(id);
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
        .eq('entregador_id', entregadorId)
        .in('status', ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega']);

      if (countError) throw countError;

      const currentActive = count || 0;

      if (currentActive >= effectiveLimit) {
        alert(`Você atingiu o limite de ${effectiveLimit} entregas simultâneas. Finalize todas para pegar mais.`);
        setEntregas([]);
        setProcessingId(null);
        return;
      }

      const { data, error } = await supabase.rpc('aceitar_entrega', { entrega_id: id });
      
      if (error) throw error;
      
      if (data && data.success) {
        // Atualizar o valor_entregador no banco de dados com o valor calculado para pedidos múltiplos
        const entrega = entregas.find(e => e.id === id);
        if (entrega) {
          const valorCalculado = calculateMultiDestinoTotal(entrega);
          if (valorCalculado > 0 && valorCalculado !== Number(entrega.valor_entregador || 0)) {
            await supabase
              .from('nova_entrega')
              .update({ valor_entregador: valorCalculado })
              .eq('id', id);
          }
        }

        if (currentActive + 1 >= effectiveLimit) {
            setEntregas([]);
        } else {
            setEntregas(prev => prev.filter(e => e.id !== id));
        }
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

  async function handleRecusar(id: string, assignedToMe: boolean) {
    setProcessingId(id);
    
    try {
        if (assignedToMe) {
            const { error } = await supabase.from('nova_entrega').update({
                entregador_id: null,
                status: 'criada',
                atribuicao_modo: 'manual',
                updated_at: new Date().toISOString()
            }).eq('id', id);

            if (error) throw error;
            setEntregas(prev => prev.filter(e => e.id !== id));
        } else {
            setHiddenIds(prev => [...prev, id]);
        }
    } catch (e: any) {
        console.error('Erro ao recusar:', e);
        alert('Erro ao recusar entrega: ' + e.message);
    } finally {
        setProcessingId(null);
    }
  }

      const filterEntregas = (e: any) => {
      if (hiddenIds.includes(e.id)) return false;
      if (e.status === 'atribuida' && e.entregador_id === entregadorId) return true;
      
      if (!hasPriority && e.liberado_em) {
        const releaseTime = new Date(e.liberado_em).getTime();
        if (releaseTime > currentTime) return false;
      }
      
      if (radiusKm && distances[e.id]) {
          const dist = distances[e.id].toPickup;
          if (dist && dist > radiusKm) return false;
      }
      return true;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Package className="w-6 h-6" />
        Entregas Disponíveis
      </h1>
      
      {profileMissing ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-800">Perfil Incompleto</h3>
            <p className="text-sm text-amber-700 mt-1">
              Seu cadastro de entregador não foi encontrado ou está incompleto. Entre em contato com o suporte.
            </p>
          </div>
        </div>
      ) : loading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : !isOnline ? (
        <div className="bg-white p-8 rounded-lg shadow-sm text-center text-gray-500 border border-gray-100">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
             <AlertCircle className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Você está Offline</h3>
          <p className="text-sm">Fique online para visualizar as entregas disponíveis.</p>
        </div>
      ) : entregas.filter(filterEntregas).length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-sm text-center text-gray-500 border border-gray-100">
          <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Nenhuma entrega disponível no momento.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entregas.filter(filterEntregas).map((entrega) => {
             const assignedToMe = entrega.status === 'atribuida'; 
             return (
            <div key={entrega.id} className={`bg-white p-5 rounded-lg shadow-sm border border-gray-100 hover:border-sky-200 transition-colors ${assignedToMe ? 'ring-2 ring-sky-500 ring-offset-2' : ''}`}>
              <div className="flex justify-between items-start mb-4">
                 <div>
                   <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${assignedToMe ? 'bg-sky-500 text-white' : 'bg-sky-100 text-sky-800'}`}>
                     {assignedToMe ? 'Atribuída a Você' : (entrega.tipo_servicos?.nome || 'Entrega')}
                   </span>
                   <h3 className="font-semibold text-lg mt-1">
                     {commerceNames[entrega.cliente_id] || entrega.clientes?.nome_completo || 'Cliente'}
                   </h3>
                 </div>
                 <div className="text-right">
                   <div className="flex flex-col items-end">
                     <div className="flex items-center gap-1 text-green-600 font-bold text-lg">
                       <DollarSign size={18} />
                       {calcValues[entrega.id]
                         ? calcValues[entrega.id].total.toFixed(2)
                         : <span className="text-green-600/50 animate-pulse text-sm">...</span>}
                     </div>
                     {(() => {
                       const vm = entrega?.opcionais?.valor_multiplo as { valorPorPonto: number; pontos: number; total: number } | undefined;
                       const extraPts = safeParseArray(entrega?.pontos_adicionais);
                       const mt = vm?.valorPorPonto ? vm.valorPorPonto * (1 + extraPts.length) : 0;
                       return mt > 0 ? (
                         <span className="text-[10px] text-emerald-600 font-semibold mb-1">
                           + R$ {mt.toFixed(2).replace('.', ',')} (Múltiplo)
                         </span>
                       ) : null;
                     })()}
                     {entrega.opcionais?.driver_bonuses && Array.isArray(entrega.opcionais.driver_bonuses) && (
                       <div className="text-xs text-right flex flex-col items-end gap-1 mb-1">
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
                     {calcValues[entrega.id]?.rules?.length > 0 && (
                       <div className="flex flex-wrap justify-end gap-1 mt-1">
                         {calcValues[entrega.id].rules.map((rule: any, idx: number) => (
                           <span key={idx} className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 font-semibold">
                             + R$ {Number(rule.valor ?? rule.multiplicador ?? 0).toFixed(2).replace('.', ',')}
                             {rule.observacao ? ` • ${rule.observacao}` : ''}
                           </span>
                         ))}
                       </div>
                     )}
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

              {(entrega.distancia_km || distances[entrega.id]) && (
                <div className="grid grid-cols-1 gap-2 mb-4 text-xs bg-gray-50 p-2 rounded border border-gray-100">
                    <div className="text-center">
                        <span className="block text-gray-400">Entrega</span>
                        <span className="font-semibold text-gray-700 text-lg">
                            {entrega.distancia_km ? Number(entrega.distancia_km).toFixed(1) : distances[entrega.id]?.toDelivery.toFixed(1)} km
                        </span>
                    </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
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

                <button
                    onClick={() => handleRecusar(entrega.id, assignedToMe)}
                    disabled={processingId === entrega.id}
                    className="w-full bg-red-100 hover:bg-red-200 text-red-700 font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                    <XCircle size={18} />
                    Recusar entrega
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
