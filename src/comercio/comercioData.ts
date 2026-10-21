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

export async function getEntregasAbertas(clienteId: string): Promise<EntregaAberta[]> {
  const [resPedidos, resEntregas] = await Promise.all([
    supabase.from('pedidos').select('id, numero, status, created_at').eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(400),
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
