import { supabase } from '../lib/supabase';
import { getCoordsFromAddress, getDrivingRouteDistance } from '../utils/geo';
import type { LojaAtual } from './comercioData';

/**
 * Precificação e criação de entrega para o comércio — réplica fiel do cálculo do
 * 2.0 (components/nova/NovaEntregaPanel.tsx) para o caso da loja: 1 destino, sem
 * pontos extras, atribuição automática. Preço vem de clientes.precificacao_config
 * (por modal) + distância por rota + tabelas_precos_faixas + preço dinâmico.
 */

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface ConfigPreco { modal?: string; tipo_precificacao?: string; preco_ponto?: number | string; tabela_id?: string; }

export function configDaLoja(loja: LojaAtual): ConfigPreco | null {
  const cfgs = loja.precificacaoConfig;
  if (!Array.isArray(cfgs) || cfgs.length === 0) return null;
  return cfgs[0] as ConfigPreco;
}

export function modalDaLoja(loja: LojaAtual): string {
  return configDaLoja(loja)?.modal || 'moto';
}

export interface ResultadoPreco {
  valor: number | null;
  km: number | null;
  dinamico: boolean;
  erro?: string;
}

// Calcula a distância (rota) da loja até o destino; haversine como fallback.
export async function distanciaLojaAte(loja: LojaAtual, destino: [number, number]): Promise<number | null> {
  if (loja.lat == null || loja.lng == null) return null;
  const rota = await getDrivingRouteDistance([{ lat: loja.lat, lon: loja.lng }, { lat: destino[0], lon: destino[1] }]);
  if (typeof rota === 'number' && rota > 0) return rota;
  return haversineKm(loja.lat, loja.lng, destino[0], destino[1]);
}

export async function geocodeDestino(enderecoTexto: string): Promise<[number, number] | null> {
  const c = await getCoordsFromAddress(enderecoTexto.trim());
  return c ?? null;
}

// Réplica de calculatePrice do NovaEntregaPanel para 1 destino.
export async function calcularPreco(loja: LojaAtual, opts: { destino?: [number, number] | null; enderecoTexto?: string; retorno: boolean }): Promise<ResultadoPreco> {
  const cfg = configDaLoja(loja);
  const tipo = (cfg?.tipo_precificacao || 'Distância');

  if (tipo === 'Zerar') return { valor: 0, km: null, dinamico: false };

  if (tipo === 'Fixo') {
    let price = 2 * (Number(cfg?.preco_ponto) || 0); // 2 pontos (coleta + entrega)
    price = aplicarRetornoFixo(price, loja, cfg, null);
    const d = await aplicarDinamico(price);
    return { valor: round2(d.valor), km: null, dinamico: d.dinamico };
  }

  // Distância / tabela
  if (!cfg?.tabela_id) return { valor: null, km: null, dinamico: false, erro: 'Preço não configurado para sua loja. Fale com a equipe Route Delivery.' };

  let destino = opts.destino ?? null;
  if (!destino && opts.enderecoTexto && opts.enderecoTexto.trim().length >= 5) destino = await geocodeDestino(opts.enderecoTexto);
  if (!destino) return { valor: null, km: null, dinamico: false, erro: 'Não foi possível localizar o endereço. Selecione uma sugestão.' };

  const km = await distanciaLojaAte(loja, destino);
  if (km == null) return { valor: null, km: null, dinamico: false, erro: 'A loja não tem localização no cadastro.' };

  const [{ data: tabela }, { data: faixas }] = await Promise.all([
    supabase.from('tabelas_precos').select('*').eq('id', cfg.tabela_id).maybeSingle(),
    supabase.from('tabelas_precos_faixas').select('*').eq('tabela_id', cfg.tabela_id).order('km_ate', { ascending: true }),
  ]);
  if (!tabela || !faixas || faixas.length === 0) return { valor: null, km, dinamico: false, erro: 'Tabela de preço incompleta. Fale com a equipe.' };

  const t: any = tabela;
  const fx: any[] = faixas;
  const fallbackMin = (Number(t.valor_minimo) > 0 ? Number(t.valor_minimo) : 0) || (Number(fx[0].valor) > 0 ? Number(fx[0].valor) : 0);

  const calcPriceForKm = (kmSeg: number) => {
    if (!(kmSeg > 0)) return fallbackMin;
    const faixa = fx.find(f => Number(f.km_ate) >= kmSeg);
    let p: number;
    if (faixa) p = Number(faixa.valor);
    else {
      const last = fx[fx.length - 1];
      p = Number(last?.valor || 0) + (kmSeg - Number(last?.km_ate || 0)) * Number(t.km_adicional || 0);
    }
    if (fallbackMin > 0 && p < fallbackMin) p = fallbackMin;
    return p;
  };

  let price = calcPriceForKm(km);
  price = aplicarRetornoFixo(price, loja, cfg, t, opts.retorno);
  const d = await aplicarDinamico(price);
  return { valor: round2(d.valor), km, dinamico: d.dinamico };
}

function aplicarRetornoFixo(price: number, loja: LojaAtual, _cfg: ConfigPreco | null, tabela: any | null, retorno = false): number {
  if (!retorno) return price;
  if (tabela && Number(tabela.valor_retorno) > 0) {
    const tipo = String(tabela.tipo_retorno || '').trim().toLowerCase();
    if (tipo === 'percentual' || tipo === 'porcentagem') return price + price * (Number(tabela.valor_retorno) / 100);
    return price + Number(tabela.valor_retorno);
  }
  const pct = (loja.retornoPercentual ?? 20) / 100;
  return price * (1 + pct);
}

async function aplicarDinamico(price: number): Promise<{ valor: number; dinamico: boolean }> {
  try {
    const { data } = await supabase.from('preco_dinamico_demanda').select('*').eq('ativa', true);
    let p = price;
    let dinamico = false;
    for (const rule of (data || []) as any[]) {
      if (rule.criterio === 'MULTIPLICADOR' && rule.multiplicador) { p *= Number(rule.multiplicador); dinamico = true; }
      else if (rule.criterio === 'TAXA_FIXA' && rule.multiplicador) { p += Number(rule.multiplicador); dinamico = true; }
    }
    return { valor: p, dinamico };
  } catch {
    return { valor: price, dinamico: false };
  }
}

function round2(v: number): number { return Math.round(v * 100) / 100; }

export interface DadosNovaEntrega {
  clienteNome: string;
  clienteTelefone: string;
  enderecoTexto: string;      // endereço de ENTREGA
  coletaTexto?: string | null; // endereço de COLETA (quando diferente da loja — endereços invertidos)
  complemento?: string;
  observacao?: string;
  formaPagamento?: string;
  agendadoPara?: string | null; // ISO
  retorno: boolean;
  pronto: boolean;
  valor: number | null;
  km: number | null;
}

// Cria o pedido + a entrega no Supabase (espelha o insert do NovaEntregaPanel).
export async function criarEntregaComercio(loja: LojaAtual, d: DadosNovaEntrega): Promise<{ pedidoId: string } > {
  const agendarIso = d.agendadoPara || null;

  const { data: pData, error: pErr } = await supabase
    .from('pedidos')
    .insert({
      cliente_id: loja.id,
      numero: null,
      endereco_texto: d.enderecoTexto || null,
      origem: 'manual',
      valor_total: d.valor ?? null,
      status: d.pronto ? 'pronto' : 'criado',
      observacoes: d.observacao || null,
      agendar_em: agendarIso,
      retirada_no_local: false,
      pagamento_metodo: d.formaPagamento || null,
    })
    .select()
    .single();
  if (pErr) throw pErr;
  const pedidoId = (pData as any).id as string;

  const { error: eErr } = await supabase
    .from('nova_entrega')
    .insert({
      pedido_id: pedidoId,
      cliente_id: loja.id,
      modal_tipo: modalDaLoja(loja),
      atribuicao_modo: 'automatica',
      entregador_id: null,
      agendar_em: agendarIso,
      retirada_no_local: false,
      valor_manual: false,
      valor_entrega: d.valor ?? null,
      tipo_cobranca: 'fatura',
      pagamento_metodo: d.formaPagamento || null,
      entrega_contato: d.clienteNome || null,
      entrega_telefone: d.clienteTelefone || null,
      entrega_endereco_texto: d.enderecoTexto || null,
      // Coleta: endereço informado (modo invertido) ou o endereço da própria loja.
      coleta_endereco_texto: d.coletaTexto || loja.endereco || null,
      entrega_complemento: d.complemento || null,
      entrega_observacoes: d.observacao || null,
      retorno: d.retorno,
      observacoes: d.observacao || null,
      status: 'criada',
      distancia_km: d.km && d.km > 0 ? d.km : null,
    });
  if (eErr) {
    // desfaz o pedido órfão para não poluir a lista
    await supabase.from('pedidos').delete().eq('id', pedidoId);
    throw eErr;
  }
  return { pedidoId };
}
