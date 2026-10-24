import { supabase } from '../lib/supabase';

/**
 * Dados da loja (comerciante) para o sistema do comércio portado do V1.
 * No 2.0 a loja é uma linha de `clientes`, ligada ao usuário por `users.cliente_id`
 * (com fallback por e-mail). O pedido/ciclo fica em `pedidos` (status: criado,
 * pronto, confirmado, entregue, cancelado) e os detalhes da entrega em `nova_entrega`
 * (ligada por `pedido_id`). "Marcar pronto" atualiza `pedidos.status`.
 */
export interface LojaAtual {
  id: string;
  nomeFantasia: string;
  email: string;
  fotoUrl: string | null;
  modalidadeCobranca: string | null;
  lat: number | null;
  lng: number | null;
  endereco: string | null;
  precificacaoConfig: any[] | null;
  retornoPercentual: number | null;
  modoFaturamento: string | null;
  opcoes: Record<string, boolean>;
}

// Lê as opções do menu do comerciante salvas pelo ADM em clientes.observacoes
// (JSON { extras: { opcoes_comerciante: {...} } }). Ausente = sem restrição.
function lerOpcoesComerciante(observacoesRaw: any): Record<string, boolean> {
  const text = String(observacoesRaw ?? '').trim();
  if (!text.startsWith('{')) return {};
  try {
    const parsed = JSON.parse(text);
    const o = parsed?.extras?.opcoes_comerciante;
    return (o && typeof o === 'object') ? (o as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

// Uma opção aparece a menos que o ADM a tenha desligado explicitamente (default: ligada).
export function opcaoAtiva(loja: LojaAtual, chave: string): boolean {
  return loja.opcoes?.[chave] !== false;
}

function num(v: any): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

export async function getLojaAtual(): Promise<LojaAtual | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  let clienteId: string | null = null;
  const { data: udata } = await supabase.from('users').select('cliente_id').eq('id', user.id).maybeSingle();
  clienteId = (udata as any)?.cliente_id ?? null;

  if (!clienteId && user.email) {
    const { data: byEmail } = await supabase.from('clientes').select('id').ilike('email', user.email).maybeSingle();
    clienteId = (byEmail as any)?.id ?? null;
  }
  if (!clienteId) return null;

  const { data: c } = await supabase.from('clientes').select('*').eq('id', clienteId).maybeSingle();
  if (!c) return null;

  const row = c as any;
  return {
    id: String(row.id),
    nomeFantasia: row.nome_fantasia || row.nome_completo || row.nome || 'Minha loja',
    email: row.email || user.email || '',
    fotoUrl: row.foto_url || row.foto || null,
    modalidadeCobranca: row.modalidade_cobranca || row.modalidade || null,
    lat: num(row.latitude ?? row.lat),
    lng: num(row.longitude ?? row.lng),
    endereco: row.endereco || row.endereco_texto || [row.logradouro, row.numero].filter(Boolean).join(', ') || null,
    precificacaoConfig: Array.isArray(row.precificacao_config) ? row.precificacao_config : null,
    retornoPercentual: num(row.retorno_percentual) ?? 20,
    modoFaturamento: row.modo_faturamento || null,
    opcoes: lerOpcoesComerciante(row.observacoes),
  };
}

export interface EntregaAberta {
  id: string;            // id do pedido
  entregaId: string | null;
  numero: string;
  clienteNome: string;
  clienteTelefone: string;
  endereco: string;
  valor: number | null;
  status: string;        // status do pedido
  entregadorNome: string | null;
  retorno: boolean;
  createdAt: string | null;
}

const FINALIZADOS = new Set(['entregue', 'cancelada', 'cancelado', 'finalizada', 'finalizado']);

// "Em aberto" mostra só pedidos recentes. Sem isso, pedidos antigos que ficaram
// com status 'pronto' (entregues na vida real, mas o status nunca virou
// 'entregue') poluem a lista e o mapa (um marcador por pedido).
const DIAS_JANELA_ABERTO = 2;

export async function getEntregasAbertas(clienteId: string): Promise<EntregaAberta[]> {
  const cutoff = new Date(Date.now() - DIAS_JANELA_ABERTO * 24 * 60 * 60 * 1000).toISOString();
  const [resPedidos, resEntregas] = await Promise.all([
    supabase.from('pedidos').select('id, numero, status, created_at').eq('cliente_id', clienteId).gte('created_at', cutoff).order('created_at', { ascending: false }).limit(400),
    supabase.from('nova_entrega').select('id, pedido_id, entrega_contato, entrega_telefone, entrega_endereco_texto, valor_entrega, retorno, entregadores ( id, nome_completo )').eq('cliente_id', clienteId).limit(600),
  ]);
  if (resPedidos.error) throw resPedidos.error;
  if (resEntregas.error) throw resEntregas.error;

  const entregaPorPedido = new Map<string, any>();
  for (const e of (resEntregas.data || []) as any[]) {
    if (e.pedido_id) entregaPorPedido.set(String(e.pedido_id), e);
  }

  return ((resPedidos.data || []) as any[])
    .filter(p => !FINALIZADOS.has(String(p.status || '').toLowerCase()))
    .map(p => {
      const e = entregaPorPedido.get(String(p.id));
      return {
        id: String(p.id),
        entregaId: e ? String(e.id) : null,
        numero: p.numero ? String(p.numero) : String(p.id).slice(0, 8),
        clienteNome: e?.entrega_contato || '—',
        clienteTelefone: e?.entrega_telefone || '',
        endereco: e?.entrega_endereco_texto || '',
        valor: e?.valor_entrega ?? null,
        status: String(p.status || ''),
        entregadorNome: e?.entregadores?.nome_completo || null,
        retorno: Boolean(e?.retorno),
        createdAt: p.created_at || null,
      } as EntregaAberta;
    });
}

// "Pedido pronto" — espelha o handleSetReady do PedidosPanel: atualiza o pedido e
// toca o updated_at da entrega (chama o entregador no fluxo do 2.0).
export async function marcarPronto(pedidoId: string): Promise<void> {
  const { error } = await supabase.from('pedidos').update({ status: 'pronto' }).eq('id', pedidoId);
  if (error) throw error;
  await supabase.from('nova_entrega').update({ updated_at: new Date().toISOString() }).eq('pedido_id', pedidoId);
}

export interface EntregadorMapa {
  id: string;
  nome: string;
  fotoUrl: string | null;
  lat: number;
  lng: number;
  status: string;
}

export async function getEntregadoresOnline(): Promise<EntregadorMapa[]> {
  const { data } = await supabase
    .from('entregadores')
    .select('id, nome_completo, foto_url, latitude, longitude, current_lat, current_lng, is_online, status')
    .eq('is_online', true)
    .limit(200);
  return ((data || []) as any[])
    .map(e => {
      const lat = num(e.current_lat ?? e.latitude);
      const lng = num(e.current_lng ?? e.longitude);
      if (lat == null || lng == null) return null;
      return { id: String(e.id), nome: e.nome_completo || 'Entregador', fotoUrl: e.foto_url || null, lat, lng, status: String(e.status || '') };
    })
    .filter(Boolean) as EntregadorMapa[];
}

// ----- Relatórios: entregas de um período -----
export interface RelatorioEntrega {
  id: string;
  numero: string;
  data: string | null;
  cliente: string;
  endereco: string;
  valor: number | null;
  status: string;
  entregadorNome: string | null;
}

export interface RelatorioResultado {
  linhas: RelatorioEntrega[];
  total: number;        // soma dos valores
  quantidade: number;   // nº de entregas
  entregues: number;    // nº com status entregue
}

export async function getRelatorioEntregas(clienteId: string, desdeISO: string, ateISO: string): Promise<RelatorioResultado> {
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id, numero, status, created_at, valor_total')
    .eq('cliente_id', clienteId)
    .gte('created_at', desdeISO)
    .lte('created_at', ateISO)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;

  const ids = (pedidos || []).map((p: any) => String(p.id));
  const entregaPorPedido = new Map<string, any>();
  if (ids.length > 0) {
    const { data: entregas } = await supabase
      .from('nova_entrega')
      .select('pedido_id, entrega_contato, entrega_endereco_texto, valor_entrega, entregadores ( nome_completo )')
      .in('pedido_id', ids);
    for (const e of (entregas || []) as any[]) {
      if (e.pedido_id) entregaPorPedido.set(String(e.pedido_id), e);
    }
  }

  const linhas: RelatorioEntrega[] = ((pedidos || []) as any[]).map((p) => {
    const e = entregaPorPedido.get(String(p.id));
    const valor = (e?.valor_entrega ?? p.valor_total ?? null) as number | null;
    return {
      id: String(p.id),
      numero: p.numero ? String(p.numero) : String(p.id).slice(0, 8),
      data: p.created_at || null,
      cliente: e?.entrega_contato || '—',
      endereco: e?.entrega_endereco_texto || '',
      valor,
      status: String(p.status || ''),
      entregadorNome: e?.entregadores?.nome_completo || null,
    };
  });

  const total = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const entregues = linhas.filter((l) => l.status.toLowerCase() === 'entregue').length;
  return { linhas, total, quantidade: linhas.length, entregues };
}

// ----- Agendamentos: pedidos agendados para o futuro -----
export interface Agendamento {
  id: string;
  numero: string;
  agendarEm: string | null;
  cliente: string;
  telefone: string;
  endereco: string;
  valor: number | null;
  status: string;
}

export async function getAgendamentos(clienteId: string): Promise<Agendamento[]> {
  const agora = new Date().toISOString();
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select('id, numero, status, agendar_em, valor_total')
    .eq('cliente_id', clienteId)
    .not('agendar_em', 'is', null)
    .gte('agendar_em', agora)
    .order('agendar_em', { ascending: true })
    .limit(500);
  if (error) throw error;

  const ids = (pedidos || []).map((p: any) => String(p.id));
  const entregaPorPedido = new Map<string, any>();
  if (ids.length > 0) {
    const { data: entregas } = await supabase
      .from('nova_entrega')
      .select('pedido_id, entrega_contato, entrega_telefone, entrega_endereco_texto, valor_entrega')
      .in('pedido_id', ids);
    for (const e of (entregas || []) as any[]) {
      if (e.pedido_id) entregaPorPedido.set(String(e.pedido_id), e);
    }
  }

  return ((pedidos || []) as any[])
    .filter((p) => !FINALIZADOS.has(String(p.status || '').toLowerCase()))
    .map((p) => {
      const e = entregaPorPedido.get(String(p.id));
      return {
        id: String(p.id),
        numero: p.numero ? String(p.numero) : String(p.id).slice(0, 8),
        agendarEm: p.agendar_em || null,
        cliente: e?.entrega_contato || '—',
        telefone: e?.entrega_telefone || '',
        endereco: e?.entrega_endereco_texto || '',
        valor: (e?.valor_entrega ?? p.valor_total ?? null) as number | null,
        status: String(p.status || ''),
      } as Agendamento;
    });
}

export async function cancelarPedido(pedidoId: string): Promise<void> {
  const { error } = await supabase.from('pedidos').update({ status: 'cancelado' }).eq('id', pedidoId);
  if (error) throw error;
}

// Edita os dados de um pedido/entrega (cliente, telefone, endereço, retorno e,
// quando recalculado, o valor/distância).
export async function atualizarEntregaComercio(
  pedidoId: string,
  d: { clienteNome: string; clienteTelefone: string; enderecoTexto: string; retorno: boolean; valor?: number | null; km?: number | null }
): Promise<void> {
  const pedidoPatch: any = { endereco_texto: d.enderecoTexto || null };
  if (d.valor != null) pedidoPatch.valor_total = d.valor;
  const { error: pErr } = await (supabase.from('pedidos') as any).update(pedidoPatch).eq('id', pedidoId);
  if (pErr) throw pErr;

  const entregaPatch: any = {
    entrega_contato: d.clienteNome || null,
    entrega_telefone: d.clienteTelefone || null,
    entrega_endereco_texto: d.enderecoTexto || null,
    retorno: d.retorno,
    updated_at: new Date().toISOString(),
  };
  if (d.valor != null) entregaPatch.valor_entrega = d.valor;
  if (d.km != null) entregaPatch.distancia_km = d.km;
  await (supabase.from('nova_entrega') as any).update(entregaPatch).eq('pedido_id', pedidoId);
}

// Finaliza (marca como entregue) o pedido e a entrega.
export async function finalizarPedido(pedidoId: string): Promise<void> {
  const { error } = await supabase.from('pedidos').update({ status: 'entregue' }).eq('id', pedidoId);
  if (error) throw error;
  await (supabase.from('nova_entrega') as any).update({ status: 'entregue', updated_at: new Date().toISOString() }).eq('pedido_id', pedidoId);
}

// Grava/atualiza a observação do pedido e da entrega.
export async function escreverObservacaoPedido(pedidoId: string, texto: string): Promise<void> {
  const { error } = await (supabase.from('pedidos') as any).update({ observacoes: texto || null }).eq('id', pedidoId);
  if (error) throw error;
  await (supabase.from('nova_entrega') as any).update({ entrega_observacoes: texto || null, observacoes: texto || null }).eq('pedido_id', pedidoId);
}

// Clona um pedido (cria um novo "criado" copiando os dados de entrega).
export async function clonarPedido(clienteId: string, pedidoId: string): Promise<void> {
  const { data: orig } = await supabase.from('nova_entrega').select('*').eq('pedido_id', pedidoId).maybeSingle();
  const o = (orig || {}) as any;
  const { data: p, error: pErr } = await (supabase.from('pedidos') as any)
    .insert({
      cliente_id: clienteId,
      status: 'criado',
      origem: 'manual',
      endereco_texto: o.entrega_endereco_texto || null,
      valor_total: o.valor_entrega ?? null,
      retirada_no_local: false,
    })
    .select()
    .single();
  if (pErr) throw pErr;
  const novoId = (p as any).id as string;
  const { error: eErr } = await (supabase.from('nova_entrega') as any).insert({
    pedido_id: novoId,
    cliente_id: clienteId,
    modal_tipo: o.modal_tipo || 'moto',
    atribuicao_modo: 'automatica',
    entregador_id: null,
    retirada_no_local: false,
    valor_manual: false,
    valor_entrega: o.valor_entrega ?? null,
    tipo_cobranca: o.tipo_cobranca || 'fatura',
    entrega_contato: o.entrega_contato || null,
    entrega_telefone: o.entrega_telefone || null,
    entrega_endereco_texto: o.entrega_endereco_texto || null,
    entrega_complemento: o.entrega_complemento || null,
    retorno: Boolean(o.retorno),
    status: 'criada',
    distancia_km: o.distancia_km ?? null,
  });
  if (eErr) {
    await supabase.from('pedidos').delete().eq('id', novoId);
    throw eErr;
  }
}

export function moeda(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Status do pedido (2.0) na visão "em aberto" do comércio.
export function statusBadge(status: string): { rotulo: string; classe: string; filtro: string } {
  const s = status.toLowerCase();
  if (s.includes('criado') || s.includes('preparando') || s.includes('em_preparo')) return { rotulo: 'Criado', classe: 'badge-neutro', filtro: 'CRIADO' };
  if (s === 'pronto' || s.includes('pendente')) return { rotulo: 'Pedido pronto', classe: 'badge-aviso', filtro: 'PRONTO' };
  if (s.includes('atras')) return { rotulo: 'Atrasado', classe: 'badge-critico', filtro: 'ATRASADO' };
  if (s.includes('confirmado') || s.includes('aceito') || s.includes('coleta') || s.includes('caminho') || s.includes('rota') || s.includes('entregador')) return { rotulo: 'Com entregador', classe: 'badge-info', filtro: 'COM_ENTREGADOR' };
  return { rotulo: status || '—', classe: 'badge-apagado', filtro: 'OUTRO' };
}

export const FILTROS_STATUS = [
  { valor: 'CRIADO', rotulo: 'Criado' },
  { valor: 'PRONTO', rotulo: 'Pedido pronto' },
  { valor: 'COM_ENTREGADOR', rotulo: 'Com entregador' },
  { valor: 'ATRASADO', rotulo: 'Atrasado' },
];
