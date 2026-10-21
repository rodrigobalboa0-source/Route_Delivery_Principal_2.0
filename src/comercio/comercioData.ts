import { supabase } from '../lib/supabase';

/**
 * Dados da loja (comerciante) para o sistema do comércio portado do V1.
 * No 2.0 a loja é uma linha de `clientes`, ligada ao usuário por `users.cliente_id`
 * (com fallback por e-mail). Entregas são linhas de `nova_entrega` com `cliente_id`.
 */
export interface LojaAtual {
  id: string;
  nomeFantasia: string;
  email: string;
  fotoUrl: string | null;
  modalidadeCobranca: string | null;
}

export async function getLojaAtual(): Promise<LojaAtual | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // 1) cliente_id pelo registro do usuário
  let clienteId: string | null = null;
  const { data: udata } = await supabase
    .from('users')
    .select('cliente_id')
    .eq('id', user.id)
    .maybeSingle();
  clienteId = (udata as any)?.cliente_id ?? null;

  // 2) fallback: casa pelo e-mail
  if (!clienteId && user.email) {
    const { data: byEmail } = await supabase
      .from('clientes')
      .select('id')
      .ilike('email', user.email)
      .maybeSingle();
    clienteId = (byEmail as any)?.id ?? null;
  }
  if (!clienteId) return null;

  const { data: c } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', clienteId)
    .maybeSingle();
  if (!c) return null;

  const row = c as any;
  const nome = row.nome_fantasia || row.nome_completo || row.nome || 'Minha loja';
  const foto = row.foto_url || row.foto || null;
  const modalidade = row.modalidade_cobranca || row.modalidade || null;
  return {
    id: String(row.id),
    nomeFantasia: nome,
    email: row.email || user.email || '',
    fotoUrl: foto,
    modalidadeCobranca: modalidade,
  };
}

export interface EntregaAberta {
  id: string;
  numero: string;
  clienteNome: string;
  clienteTelefone: string;
  endereco: string;
  valor: number | null;
  status: string;
  entregadorNome: string | null;
  retorno: boolean;
  createdAt: string | null;
}

// Status que NÃO estão em aberto (finalizados).
const FINALIZADOS = new Set(['entregue', 'cancelada', 'cancelado', 'finalizada', 'finalizado']);

export async function getEntregasAbertas(clienteId: string): Promise<EntregaAberta[]> {
  const { data, error } = await supabase
    .from('nova_entrega')
    .select(`
      id, pedido_id, created_at, status, valor_entrega, retorno,
      entrega_contato, entrega_telefone, entrega_endereco_texto,
      pedidos ( id, numero, status ),
      entregadores ( id, nome_completo )
    `)
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;

  return (data || [])
    .filter((r: any) => !FINALIZADOS.has(String(r.status || '').toLowerCase()))
    .map((r: any) => ({
      id: String(r.id),
      numero: r.pedidos?.numero ? String(r.pedidos.numero) : String(r.id).slice(0, 8),
      clienteNome: r.entrega_contato || '—',
      clienteTelefone: r.entrega_telefone || '',
      endereco: r.entrega_endereco_texto || '',
      valor: r.valor_entrega ?? null,
      status: String(r.status || ''),
      entregadorNome: r.entregadores?.nome_completo || null,
      retorno: Boolean(r.retorno),
      createdAt: r.created_at || null,
    }));
}

export function moeda(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Rótulo + cor (badge) de um status de entrega no 2.0.
export function statusBadge(status: string): { rotulo: string; classe: string } {
  const s = status.toLowerCase();
  if (s.includes('preparando') || s.includes('criado')) return { rotulo: 'Criado', classe: 'badge-neutro' };
  if (s.includes('pendente') || s.includes('pronto')) return { rotulo: 'Pedido pronto', classe: 'badge-aviso' };
  if (s.includes('atras')) return { rotulo: 'Atrasado', classe: 'badge-critico' };
  if (s.includes('confirmado') || s.includes('aceito') || s.includes('coleta') || s.includes('caminho') || s.includes('rota')) return { rotulo: 'Com entregador', classe: 'badge-info' };
  return { rotulo: status || '—', classe: 'badge-apagado' };
}
