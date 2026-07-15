import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FUNCTION_VERSION = "ifood-sync@2026-03-31.1";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapIfoodStatusToInternal(orderStatus: string | undefined): string | null {
  if (!orderStatus) return null;
  if (orderStatus === "CONFIRMED") return "confirmado";
  if (orderStatus === "PREPARATION_STARTED") return "em_preparo";
  if (orderStatus === "READY_TO_PICKUP") return "pronto";
  if (orderStatus === "DISPATCHED") return "pronto";
  if (orderStatus === "CONCLUDED") return "entregue";
  if (orderStatus === "CANCELED") return "cancelado";
  return null;
}

function shouldFetchOrderForEvent(code: string): boolean {
  return ["PLC", "CFM", "RTP", "DSP", "CON", "CAN", "SPS", "SPE"].includes(code);
}

function buildOrderItemsDescription(order: any): string | null {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length === 0) return null;
  const parts: string[] = [];
  for (const item of items) {
    const name = String(item?.name || "").trim();
    const qty = typeof item?.quantity === "number" ? item.quantity : undefined;
    if (!name) continue;
    parts.push(qty && qty > 1 ? `${qty}x ${name}` : name);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function buildAddressText(params: {
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
}) {
  const base = [params.rua, params.bairro, params.cidade].filter(Boolean).join(", ");
  const numero = String(params.numero || "").trim();
  if (!base) return null;
  return numero ? `${base}, ${numero}` : base;
}

function extractDeliveryAddress(order: any): {
  enderecoBase: string | null;
  enderecoCompleto: string | null;
  cep: string | null;
  complemento: string | null;
  referencia: string | null;
  observacoesEntrega: string | null;
} {
  const deliveryAddress = order?.delivery?.deliveryAddress || {};

  const formattedAddress = String(deliveryAddress?.formattedAddress || "").trim();
  const fromParts = `${String(deliveryAddress?.streetName || "").trim()}, ${String(deliveryAddress?.streetNumber || "").trim()} - ${String(deliveryAddress?.neighborhood || "").trim()}, ${String(deliveryAddress?.city || "").trim()} - ${String(deliveryAddress?.state || "").trim()}`.trim();
  const enderecoBase = (formattedAddress || fromParts).trim() || null;

  const complementoRaw = String(
    deliveryAddress?.complement ??
      deliveryAddress?.additionalInfo ??
      deliveryAddress?.addressComplement ??
      "",
  ).trim();
  const complemento = complementoRaw || null;

  const referenciaRaw = String(
    deliveryAddress?.reference ??
      deliveryAddress?.referencePoint ??
      deliveryAddress?.referenceDescription ??
      "",
  ).trim();
  const referencia = referenciaRaw || null;

  const cepRaw = String(deliveryAddress?.postalCode || "").trim();
  const cep = cepRaw || null;

  const deliveryObsRaw = String(order?.delivery?.observations || "").trim();
  const obsParts = [
    deliveryObsRaw || null,
    referencia ? `Referência: ${referencia}` : null,
  ].filter(Boolean) as string[];
  const observacoesEntrega = obsParts.length > 0 ? obsParts.join("\n") : null;

  const enderecoCompleto = [enderecoBase, complemento].filter(Boolean).join(" - ") || null;
  return { enderecoBase, enderecoCompleto, cep, complemento, referencia, observacoesEntrega };
}

async function refreshAccessToken(params: {
  baseUrl: string;
  appClientId: string;
  appClientSecret: string;
  refreshToken: string;
}) {
  const form = new URLSearchParams();
  form.append("grantType", "refresh_token");
  form.append("clientId", params.appClientId);
  form.append("clientSecret", params.appClientSecret);
  form.append("refreshToken", params.refreshToken);

  const resp = await fetch(`${params.baseUrl}/authentication/v1.0/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Token refresh failed (${resp.status}): ${text}`);
  }

  return await resp.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const baseUrl = Deno.env.get("IFOOD_API_BASE_URL") || "https://merchant-api.ifood.com.br";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const mode = (body?.mode as string | undefined) || "cron";

    
    const { data: integrations, error: fetchError } = await supabase
      .from('integracoes_ifood')
      .select('*')
      .eq('status', 'ativo');

    if (fetchError) throw fetchError;
    
    if (!integrations || integrations.length === 0) {
      return jsonResponse({ success: true, message: "Nenhuma integração ativa." });
    }

    
    const APP_CLIENT_ID = Deno.env.get('IFOOD_APP_CLIENT_ID') || '';
    const APP_CLIENT_SECRET = Deno.env.get('IFOOD_APP_CLIENT_SECRET') || '';

    let processedEventsCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let ackedCount = 0;
    let failedEventsCount = 0;
    const logs: string[] = [];
    const processedOrderDisplayIds = new Set<string>();
    const integrationSummaries: Array<{
      id: string;
      cliente_id: string | null;
      merchant_id_present: boolean;
      polling_status: number | null;
      polled_events: number;
      created_orders: number;
      updated_orders: number;
      failed_events: number;
      acked_events: number;
    }> = [];

    for (const integration of integrations) {
      const summary = {
        id: String(integration.id || ""),
        cliente_id: integration.cliente_id ? String(integration.cliente_id) : null,
        merchant_id_present: !!integration.merchant_id,
        polling_status: null as number | null,
        polled_events: 0,
        created_orders: 0,
        updated_orders: 0,
        failed_events: 0,
        acked_events: 0,
      };
      try {
        const getPickupFromClienteCadastro = async () => {
          const { data: cliente, error: clienteErr } = await supabase
            .from("clientes")
            .select("id, nome_completo, telefone, cep, rua, numero, bairro, cidade, complemento, referencia_entrega")
            .eq("id", integration.cliente_id)
            .maybeSingle();
          if (clienteErr) return { nome: null as string | null, telefone: null as string | null, cep: null as string | null, endereco: null as string | null, complemento: null as string | null, referencia: null as string | null };

          let rua = (cliente as any)?.rua ?? null;
          let numero = (cliente as any)?.numero ?? null;
          let bairro = (cliente as any)?.bairro ?? null;
          let cidade = (cliente as any)?.cidade ?? null;
          let cep = (cliente as any)?.cep ?? null;
          let complemento = (cliente as any)?.complemento ?? null;
          let referencia = (cliente as any)?.referencia_entrega ?? null;
          const nome = (cliente as any)?.nome_completo ?? null;
          const telefone = (cliente as any)?.telefone ?? null;

          if ((!rua || !cidade) && integration.cliente_id) {
            const { data: endRow } = await supabase
              .from("cliente_enderecos")
              .select("cep, rua, numero, complemento, bairro, cidade, referencia_entrega")
              .eq("cliente_id", integration.cliente_id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            rua = (endRow as any)?.rua ?? rua;
            numero = (endRow as any)?.numero ?? numero;
            bairro = (endRow as any)?.bairro ?? bairro;
            cidade = (endRow as any)?.cidade ?? cidade;
            cep = (endRow as any)?.cep ?? cep;
            complemento = (endRow as any)?.complemento ?? complemento;
            referencia = (endRow as any)?.referencia_entrega ?? referencia;
          }

          return {
            nome: nome ? String(nome) : null,
            telefone: telefone ? String(telefone) : null,
            cep: cep ? String(cep) : null,
            endereco: buildAddressText({ rua, numero, bairro, cidade }),
            complemento: complemento ? String(complemento) : null,
            referencia: referencia ? String(referencia) : null,
          };
        };

        let token = integration.access_token;
        
        
        const expiresAt = new Date(integration.token_expires_at || 0);
        
        const nowPlusBuffer = new Date(Date.now() + 5 * 60 * 1000);

        if (!token || expiresAt < nowPlusBuffer) {
             if (!integration.refresh_token) {
                 logs.push(`Integration ${integration.id}: No refresh token available`);
                 continue;
             }

             const tokenData = await refreshAccessToken({
               baseUrl,
               appClientId: APP_CLIENT_ID,
               appClientSecret: APP_CLIENT_SECRET,
               refreshToken: integration.refresh_token,
             });
             token = tokenData.accessToken;
             
             const newExpiresAt = new Date(Date.now() + (tokenData.expiresIn * 1000)).toISOString();
             
             
             await supabase.from('integracoes_ifood').update({
                 access_token: tokenData.accessToken,
                 refresh_token: tokenData.refreshToken || integration.refresh_token,
                 token_expires_at: newExpiresAt,
                 updated_at: new Date().toISOString()
             }).eq('id', integration.id);
             
             logs.push(`Integration ${integration.id}: Token refreshed`);
        }

        if (!integration.merchant_id) {
          const merchantsResp = await fetch(`${baseUrl}/merchant/v1.0/merchants`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (merchantsResp.ok) {
            const merchants = await merchantsResp.json();
            const first = Array.isArray(merchants) && merchants.length > 0 ? merchants[0] : null;
            if (first?.id) {
              await supabase.from("integracoes_ifood").update({
                merchant_id: String(first.id),
                updated_at: new Date().toISOString(),
              }).eq("id", integration.id);
              integration.merchant_id = String(first.id);
              summary.merchant_id_present = true;
              logs.push(`Integration ${integration.id}: merchant_id set to ${integration.merchant_id}`);
            } else {
              logs.push(`Integration ${integration.id}: No merchants returned`);
            }
          } else {
            const errText = await merchantsResp.text().catch(() => "");
            logs.push(`Integration ${integration.id}: Failed to fetch merchants (${merchantsResp.status}) - ${errText}`);
          }
        }

        
        const pollingResp = await fetch(`${baseUrl}/order/v1.0/events:polling`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-polling-merchants': integration.merchant_id || ''
            }
        });
        summary.polling_status = pollingResp.status;

        if (pollingResp.status === 204) {
            logs.push(`Integration ${integration.id}: Polling 204 (no events)`);
            integrationSummaries.push(summary);
            continue;
        }

        if (!pollingResp.ok) {
            const errText = await pollingResp.text().catch(() => "");
            logs.push(`Integration ${integration.id}: Polling failed (${pollingResp.status}) - ${errText}`);
            integrationSummaries.push(summary);
            continue;
        }

        const events = await pollingResp.json();
        summary.polled_events = Array.isArray(events) ? events.length : 0;
        logs.push(`Integration ${integration.id}: Polled events=${summary.polled_events}`);
        const eventsToAck: { id: string }[] = [];

        
        for (const event of events) {
            processedEventsCount++;
            
            // Skip optional inbox persistence to avoid 404 logs when table is not present in environment

            
            let processedOk = false;
            try {
              if (!event.code) {
                processedOk = true;
              } else if ((event.code === "CAN" || event.code === "CON") && event.orderId) {
                const orderResp = await fetch(`${baseUrl}/order/v1.0/orders/${event.orderId}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!orderResp.ok) {
                  const errText = await orderResp.text().catch(() => "");
                  throw new Error(`Failed to fetch order ${event.orderId} (${orderResp.status}): ${errText}`);
                }
                const order = await orderResp.json();
                const displayId = order?.displayId || null;
                const desiredStatus = event.code === "CAN" ? "cancelado" : "entregue";
                
                if (displayId) {
                  const runKey = `${integration.id}:${String(event.orderId || displayId)}`;
                  if (processedOrderDisplayIds.has(runKey)) {
                    processedOk = true;
                  } else {
                    processedOrderDisplayIds.add(runKey);
                  }
                  const { data: existingPedido } = await supabase
                    .from("pedidos")
                    .select("id")
                    .eq("cliente_id", integration.cliente_id)
                    .eq("numero", String(displayId))
                    .maybeSingle();
                  
                  if (existingPedido) {
                    const { error: pedidoUpdateError } = await supabase
                      .from("pedidos")
                      .update({ status: desiredStatus })
                      .eq("id", existingPedido.id);
                    if (!pedidoUpdateError) {
                      await supabase
                        .from("nova_entrega")
                        .update({ status: desiredStatus === "cancelado" ? "cancelada" : "entregue" })
                        .eq("pedido_id", existingPedido.id);
                      updatedCount++;
                    }
                  }
                }
                processedOk = true;
              } else if (shouldFetchOrderForEvent(event.code) && event.orderId) {
                const orderResp = await fetch(`${baseUrl}/order/v1.0/orders/${event.orderId}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!orderResp.ok) {
                  const errText = await orderResp.text().catch(() => "");
                  throw new Error(`Failed to fetch order ${event.orderId} (${orderResp.status}): ${errText}`);
                }
                const order = await orderResp.json();

                const displayIdStr = String(order.displayId || "");
                const ifoodOrderIdStrRaw = String(event.orderId || order.id || "");
                const ifoodOrderIdStr = ifoodOrderIdStrRaw.trim() ? ifoodOrderIdStrRaw.trim() : "";
                const runKey = `${integration.id}:${ifoodOrderIdStr || displayIdStr || String(event.id || "")}`;
                if (processedOrderDisplayIds.has(runKey)) {
                  processedOk = true;
                  eventsToAck.push({ id: event.id });
                  continue;
                } else {
                  processedOrderDisplayIds.add(runKey);
                }

                let existingPedido: { id: string; status: string | null } | null = null;
                if (ifoodOrderIdStr) {
                  const byIfood = await supabase
                    .from("pedidos")
                    .select("id, status")
                    .eq("ifood_order_id", ifoodOrderIdStr)
                    .maybeSingle();
                  if (byIfood.data) existingPedido = byIfood.data as any;
                }
                if (!existingPedido) {
                  const byDisplay = await supabase
                    .from("pedidos")
                    .select("id, status")
                    .eq("cliente_id", integration.cliente_id)
                    .eq("numero", String(order.displayId || ""))
                    .maybeSingle();
                  if (byDisplay.data) existingPedido = byDisplay.data as any;
                }

                const mappedStatus = mapIfoodStatusToInternal(order.orderStatus) || "criado";
                const extractedAddress = extractDeliveryAddress(order);
                const address = extractedAddress.enderecoCompleto || extractedAddress.enderecoBase || null;

                if (!existingPedido) {
                  const itemsDescription = buildOrderItemsDescription(order);
                  const deliveryFee = order.total?.deliveryFee ?? 0;
                  const orderAmount = order.total?.orderAmount ?? 0;
                  const payload = {
                      cliente_id: integration.cliente_id,
                      endereco_id: null,
                      numero: order.displayId ? String(order.displayId) : null,
                      ifood_order_id: ifoodOrderIdStr || null,
                      ifood_info: order || null,
                      item_descricao: itemsDescription,
                      endereco_texto: address,
                      status: mappedStatus,
                      observacoes: extractedAddress.observacoesEntrega ? `[iFood] ${extractedAddress.observacoesEntrega}` : null,
                      valor_total: typeof orderAmount === "number" ? orderAmount : Number(orderAmount || 0),
                      origem: "online",
                    };
                  const conflictTarget = ifoodOrderIdStr ? "ifood_order_id" : "cliente_id,numero";
                  let upsertRes = await supabase
                    .from("pedidos")
                    .upsert(payload, { onConflict: conflictTarget, ignoreDuplicates: true })
                    .select()
                    .maybeSingle();

                  if (upsertRes.error && (upsertRes.error as any)?.code === "42P10" && conflictTarget === "ifood_order_id") {
                    upsertRes = await supabase
                      .from("pedidos")
                      .upsert(payload, { onConflict: "cliente_id,numero", ignoreDuplicates: true })
                      .select()
                      .maybeSingle();
                  }

                  if (upsertRes.error) {
                    logs.push(
                      `Integration ${integration.id}: Failed to upsert pedido (orderId=${ifoodOrderIdStr || "-"} displayId=${displayIdStr || "-"}) - ${upsertRes.error.message}`,
                    );
                    processedOk = false;
                    failedEventsCount++;
                    summary.failed_events++;
                    continue;
                  }

                  const createdPedido = upsertRes.data
                    ? upsertRes.data
                    : (await supabase
                        .from("pedidos")
                        .select("id")
                        .eq(ifoodOrderIdStr ? "ifood_order_id" : "numero", ifoodOrderIdStr ? ifoodOrderIdStr : String(order.displayId || ""))
                        .maybeSingle()).data;

                  if (!createdPedido?.id) {
                    logs.push(
                      `Integration ${integration.id}: Pedido not found after upsert (orderId=${ifoodOrderIdStr || "-"} displayId=${displayIdStr || "-"})`,
                    );
                    processedOk = false;
                    failedEventsCount++;
                    summary.failed_events++;
                    continue;
                  }

                  createdCount++;
                  summary.created_orders++;
                  if (createdPedido?.id) {
                    const { data: existingEntrega } = await supabase
                      .from("nova_entrega")
                      .select("id")
                      .eq("pedido_id", createdPedido.id)
                      .maybeSingle();
                    if (!existingEntrega) {
                      const pickup = await getPickupFromClienteCadastro();
                      const entregaInsertRes = await supabase.from("nova_entrega").insert({
                        pedido_id: createdPedido.id,
                        cliente_id: integration.cliente_id,
                        modal_tipo: "moto",
                        atribuicao_modo: "manual",
                        valor_entrega: deliveryFee,
                        valor_entregador: deliveryFee * 0.8,
                        valor_mercadoria: orderAmount,
                        tipo_cobranca: "fatura",
                        cobrar_destinatario: false,
                        coleta_usa_endereco_cadastro: true,
                        coleta_contato: pickup.nome || "Balcão",
                        coleta_telefone: pickup.telefone || null,
                        coleta_cep: pickup.cep || null,
                        coleta_endereco_texto: pickup.endereco || null,
                        coleta_complemento: pickup.complemento || null,
                        coleta_observacoes: "Pedido iFood",
                        entrega_usa_endereco_cadastro: false,
                        entrega_contato: order.customer?.name || "",
                        entrega_telefone: order.customer?.phone?.number || "",
                        entrega_cep: extractedAddress.cep || "",
                        entrega_endereco_texto: extractedAddress.enderecoBase || address,
                        entrega_complemento: extractedAddress.complemento,
                        entrega_codigo_pedido: order.displayId,
                        entrega_observacoes: extractedAddress.observacoesEntrega || "",
                        status: "criada",
                      });
                      if (entregaInsertRes.error) {
                        logs.push(
                          `Integration ${integration.id}: Failed to create nova_entrega for pedido ${createdPedido.id} - ${entregaInsertRes.error.message}`,
                        );
                      }
                    }
                  }
                } else {
                  const updatePayload: any = {
                    status: mappedStatus,
                    ifood_info: order || null,
                    endereco_texto: address,
                    observacoes: extractedAddress.observacoesEntrega ? `[iFood] ${extractedAddress.observacoesEntrega}` : null,
                  };
                  if (ifoodOrderIdStr) updatePayload.ifood_order_id = ifoodOrderIdStr;
                  const { error: updateError } = await supabase
                    .from("pedidos")
                    .update(updatePayload)
                    .eq("id", existingPedido.id);
                  if (updateError) {
                    logs.push(
                      `Integration ${integration.id}: Failed to update pedido ${existingPedido.id} - ${updateError.message}`,
                    );
                    processedOk = false;
                    failedEventsCount++;
                    summary.failed_events++;
                    continue;
                  }
                  await supabase
                    .from("nova_entrega")
                    .update({
                      entrega_endereco_texto: extractedAddress.enderecoBase || address,
                      entrega_cep: extractedAddress.cep,
                      entrega_complemento: extractedAddress.complemento,
                      entrega_observacoes: extractedAddress.observacoesEntrega,
                    } as any)
                    .eq("pedido_id", existingPedido.id);
                  updatedCount++;
                  summary.updated_orders++;
                }

                processedOk = true;
              } else {
                processedOk = true;
              }
            } catch (e: any) {
              const errMsg = e?.message || "Unknown error processing event";
              logs.push(`Integration ${integration.id}: Event ${event?.id || ""} failed: ${errMsg}`);
              processedOk = false;
            }

            if (processedOk) {
              // Skip inbox processed marker in environments without the table
              eventsToAck.push({ id: event.id });
            }
        }

        
        if (eventsToAck.length > 0) {
          const chunkSize = 2000;
          for (let i = 0; i < eventsToAck.length; i += chunkSize) {
            const chunk = eventsToAck.slice(i, i + chunkSize);
            const ackResp = await fetch(`${baseUrl}/order/v1.0/events/acknowledgment`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(chunk),
            });

            if (ackResp.ok) {
              ackedCount += chunk.length;
              summary.acked_events += chunk.length;
              // Skip inbox ack marker in environments without the table
            } else {
              const errText = await ackResp.text().catch(() => "");
              logs.push(`Failed to acknowledge events for integration ${integration.id}: ${errText}`);
            }
          }
        }

        await supabase
          .from("integracoes_ifood")
          .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", integration.id);

      } catch (err: any) {
        logs.push(`Error processing integration ${integration.id}: ${err.message}`);
        summary.failed_events += 1;
      }
      integrationSummaries.push(summary);
    }

    return jsonResponse({
      success: true,
      version: FUNCTION_VERSION,
      mode,
      integrations: Array.isArray(integrations) ? integrations.length : 0,
      processedEvents: processedEventsCount,
      acknowledgedEvents: ackedCount,
      createdOrders: createdCount,
      updatedOrders: updatedCount,
      failedEvents: failedEventsCount,
      integrationSummaries,
      logs,
    });

  } catch (error: any) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
});