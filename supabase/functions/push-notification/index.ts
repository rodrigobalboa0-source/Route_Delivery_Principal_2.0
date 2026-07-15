import { createClient } from 'jsr:@supabase/supabase-js@2'
import { JWT } from 'npm:google-auth-library'

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; 
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

async function getCoordsFromAddress(address: string): Promise<[number, number] | undefined> {
    if (!address) return undefined;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`, {
        headers: { 'User-Agent': 'RouteDeliveryApp/1.0' }
      });
      const data = await res.json();
      if (data && data[0]) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch (e) {
      console.error('Error fetching coords for address:', address, e);
    }
    return undefined;
}


Deno.serve(async (req) => {
  try {
    const { record } = await req.json()
    
    
    console.log('Webhook recebido:', record ? `ID: ${record.id}, Status: ${record.status}, Modo: ${record.atribuicao_modo}` : 'Sem record')
    
    if (!record || (record.status !== 'criada' && record.status !== 'atribuida')) {
        return new Response('Ignorado: Não é uma nova entrega ou não está com status criada/atribuida', { status: 200 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    
    if (record.pedido_id) {
        const { data: pedido } = await supabase
            .from('pedidos')
            .select('status')
            .eq('id', record.pedido_id)
            .single();
        
        if (pedido && pedido.status !== 'pronto') {
             console.log(`Pedido ${record.pedido_id} não está pronto (Status: ${pedido.status}). Notificação adiada.`);
             return new Response('Pedido não está pronto', { status: 200 });
        }
    }

    
    let radiusKm = 10;
    try {
        const { data: config } = await supabase.from('configuracoes_comercio').select('raio_busca_entregador').single();
        if (config?.raio_busca_entregador) {
            radiusKm = config.raio_busca_entregador;
        }
    } catch (e) {
        console.error('Erro ao buscar raio config:', e);
    }

    
    const { data: entregadores, error } = await supabase
      .from('entregadores')
      .select('id, fcm_token, nome_completo, current_latitude, current_longitude')
      .eq('status', 'ativo')
      .eq('is_online', true)

    if (error) {
        console.error('Erro ao buscar entregadores:', error)
        throw error
    }

    if (!entregadores || entregadores.length === 0) {
        console.log('Nenhum entregador disponível encontrado')
        return new Response('Nenhum entregador disponível encontrado', { status: 200 })
    }


    let blacklistedIds: string[] = []
    if (record.cliente_id) {
        const { data: blacklist } = await supabase
            .from('entregador_bloqueios_clientes')
            .select('entregador_id')
            .eq('cliente_id', record.cliente_id)

        if (blacklist) {
            blacklistedIds = blacklist.map(b => b.entregador_id)
        }
    }

    
    const LIMITE_SIMULTANEAS = 4
    const activeStatuses = ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega', 'coletando', 'entregando']
    const entregadorIds = entregadores.map(e => e.id)
    const { data: activeDeliveries } = await supabase
        .from('nova_entrega')
        .select('entregador_id')
        .in('entregador_id', entregadorIds)
        .in('status', activeStatuses)

    const activeCountMap: Record<string, number> = {}
    if (activeDeliveries) {
        for (const d of activeDeliveries) {
            if (d.entregador_id) {
                activeCountMap[d.entregador_id] = (activeCountMap[d.entregador_id] || 0) + 1
            }
        }
    }

    let entregadoresDisponiveis = entregadores.filter(e =>
        (activeCountMap[e.id] || 0) < LIMITE_SIMULTANEAS
    )

    console.log(`[Limite] ${entregadores.length} online, ${entregadoresDisponiveis.length} abaixo do limite de ${LIMITE_SIMULTANEAS} entregas simultâneas`)

    
    if (record.cliente_id) {
        const { data: limitRules } = await supabase
            .from('comercio_entregador_limites' as any)
            .select('entregador_id, limite')
            .eq('cliente_id', record.cliente_id)

        if (limitRules && limitRules.length > 0) {
            const defaultRule = (limitRules as any[]).find(r => r.entregador_id === null)
            const specificRules = (limitRules as any[]).filter(r => r.entregador_id !== null)

            if (defaultRule || specificRules.length > 0) {
                const { data: commerceDeliveries } = await supabase
                    .from('nova_entrega')
                    .select('entregador_id')
                    .eq('cliente_id', record.cliente_id)
                    .in('entregador_id', entregadoresDisponiveis.map(e => e.id))
                    .in('status', activeStatuses)

                const commerceCountMap: Record<string, number> = {}
                if (commerceDeliveries) {
                    for (const d of commerceDeliveries) {
                        if (d.entregador_id) {
                            commerceCountMap[d.entregador_id] = (commerceCountMap[d.entregador_id] || 0) + 1
                        }
                    }
                }

                const prevCount = entregadoresDisponiveis.length
                entregadoresDisponiveis = entregadoresDisponiveis.filter(e => {
                    const specificRule = specificRules.find(r => r.entregador_id === e.id)
                    const applicableLimit = specificRule ? specificRule.limite : defaultRule?.limite
                    if (applicableLimit === undefined) return true
                    return (commerceCountMap[e.id] || 0) < applicableLimit
                })

                console.log(`[Limite Comércio] ${prevCount} → ${entregadoresDisponiveis.length} disponíveis após limite do comércio ${record.cliente_id}`)
            }
        }
    }

    const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    if (!serviceAccountStr) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT não configurado')
    }
    
    const serviceAccount = JSON.parse(serviceAccountStr)
    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    })
    
    const accessToken = await jwtClient.authorize()

    let targetEntregadores = []

    
    if (record.status === 'atribuida' && record.entregador_id) {
        
        const { data: entregador } = await supabase
            .from('entregadores')
            .select('id, fcm_token, nome_completo')
            .eq('id', record.entregador_id)
            .single()
        
        if (entregador) {
             targetEntregadores = [entregador]
        }
    } else if (record.atribuicao_modo === 'automatica') {

        let candidates = entregadoresDisponiveis.filter(e => !blacklistedIds.includes(e.id))
        
        
        if (record.coleta_endereco_texto) {
            const pickupCoords = await getCoordsFromAddress(record.coleta_endereco_texto);
            if (pickupCoords) {
                candidates = candidates.filter(e => {
                    if (!e.current_latitude || !e.current_longitude) return false; // Skip if no location
                    const dist = getDistanceFromLatLonInKm(e.current_latitude, e.current_longitude, pickupCoords[0], pickupCoords[1]);
                    return dist <= radiusKm;
                });
            }
        }

        if (candidates.length === 0) {
            console.log('Nenhum entregador elegível (todos bloqueados, offline ou fora do raio)')
            return new Response('Nenhum entregador elegível', { status: 200 })
        }

        const randomIndex = Math.floor(Math.random() * candidates.length)
        const chosen = candidates[randomIndex]
        
        console.log(`Atribuição Automática: Escolhido ${chosen.nome_completo} (${chosen.id})`)

        const { error: updateError } = await supabase
            .from('nova_entrega')
            .update({ 
                entregador_id: chosen.id,
                status: 'atribuida',
                updated_at: new Date().toISOString()
            })
            .eq('id', record.id)
        
        if (updateError) {
            console.error('Erro ao atribuir entregador:', updateError)
            throw updateError
        }

        targetEntregadores = [chosen]
    } else {
        
        console.log('Atribuição Manual: Notificando todos os disponíveis (exceto blacklist e acima do limite)')

        let candidates = entregadoresDisponiveis.filter(e => !blacklistedIds.includes(e.id))

        
        if (record.coleta_endereco_texto) {
            const pickupCoords = await getCoordsFromAddress(record.coleta_endereco_texto);
            if (pickupCoords) {
                const inRange = candidates.filter(e => {
                    if (!e.current_latitude || !e.current_longitude) return true; 
                    const dist = getDistanceFromLatLonInKm(Number(e.current_latitude), Number(e.current_longitude), pickupCoords[0], pickupCoords[1]);
                    return dist <= radiusKm;
                });
                console.log(`[Manual Mode] Radius Check Info: ${inRange.length} of ${candidates.length} drivers are within ${radiusKm}km (Server DB Location). Sending to ALL candidates.`);
            }
        }
        
        targetEntregadores = candidates;
    }

    console.log(`Enviando notificação para ${targetEntregadores.length} entregadores`)

    const promises = targetEntregadores.map(async (entregador) => {
        if (!entregador.fcm_token) return

        const message = {
            message: {
                token: entregador.fcm_token,
                data: {
                    title: 'Nova Entrega Disponível! 🛵',
                    body: record.atribuicao_modo === 'automatica' 
                        ? 'Você recebeu uma nova entrega! Toque para ver detalhes.'
                        : 'Nova entrega disponível na área.',
                    deliveryId: String(record.id),
                    type: 'nova_entrega',
                    mode: record.atribuicao_modo || 'manual'
                },
                android: {
                    priority: 'high'
                }
            }
        }

        try {
            const res = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(message)
            })
            
            if (!res.ok) {
                const text = await res.text()
                console.error(`Erro ao enviar para token ${entregador.fcm_token}:`, text)
            }
        } catch (e) {
            console.error(`Erro envio individual:`, e)
        }
    })

    await Promise.all(promises)

    return new Response(JSON.stringify({ success: true, count: targetEntregadores.length, mode: record.atribuicao_modo }), { 
        headers: { 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    console.error('Erro geral:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
