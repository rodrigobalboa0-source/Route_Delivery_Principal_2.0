import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Msg = Database['public']['Tables']['conversa_mensagens']['Row'];
type Conversa = Database['public']['Tables']['conversas']['Row'];

interface HistoricoMensagensPanelProps {
  onNavigate?: (menu: string, params?: any) => void;
  userRole?: 'operador' | 'cliente' | 'entregador' | 'loading';
  userId?: string;
}

export function HistoricoMensagensPanel({ userRole, onNavigate }: HistoricoMensagensPanelProps) {
  const [threads, setThreads] = useState<Msg[]>([]);
  const [conversas, setConversas] = useState<Record<string, Pick<Conversa, 'id' | 'tipo_alvo' | 'alvo_id'>>>({});
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'entregadores' | 'clientes'>('todos');

  useEffect(() => {
    fetchAll();
  }, [userRole]);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      let conversationIds: string[] | null = null;

      // Se for cliente, busca apenas conversas onde ele é o cliente_id
      if (userRole === 'cliente') {
        try {
          const ctx = localStorage.getItem('cliente_context');
          if (ctx) {
            const parsed = JSON.parse(ctx);
            if (parsed.id) {
              const { data } = await supabase.from('conversas').select('id').eq('cliente_id', parsed.id);
              if (data) conversationIds = data.map((c) => c.id);
            }
          }
        } catch (e) { console.error(e); }
      } 
      // Se for entregador, busca apenas conversas onde ele é o entregador_id
      else if (userRole === 'entregador') {
        try {
          const ctx = localStorage.getItem('entregador_context');
          if (ctx) {
            const parsed = JSON.parse(ctx);
            if (parsed.id) {
              const { data } = await supabase.from('conversas').select('id').eq('entregador_id', parsed.id);
              if (data) conversationIds = data.map((c) => c.id);
            }
          }
        } catch (e) { console.error(e); }
      }

      // Se usuário restrito não tiver conversas, não mostra nada
      if ((userRole === 'cliente' || userRole === 'entregador') && (!conversationIds || conversationIds.length === 0)) {
        setThreads([]);
        setConversas({});
        setLoadingList(false);
        return;
      }

      let query = supabase
        .from('conversa_mensagens')
        .select('id, conversa_id, autor_tipo, canal, conteudo, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      
      if (conversationIds) {
        query = query.in('conversa_id', conversationIds);
      }

      const rMsgs = await query;
      if (rMsgs.error?.message) setError(rMsgs.error.message);
      
      const msgs = (rMsgs.data || []) as Msg[];
      setThreads(msgs);

      const ids = Array.from(new Set(msgs.map((m) => m.conversa_id))).filter(Boolean) as string[];
      
      if (ids.length > 0) {
        const rConv = await supabase
          .from('conversas')
          .select('id, tipo_alvo, alvo_id')
          .in('id', ids);
          
        if (rConv.error?.message) setError(rConv.error.message);
        
        const map: Record<string, Pick<Conversa, 'id' | 'tipo_alvo' | 'alvo_id'>> = {};
        for (const c of (rConv.data || []) as Conversa[]) map[c.id] = { id: c.id, tipo_alvo: c.tipo_alvo, alvo_id: c.alvo_id };
        setConversas(map);

        // Carregar nomes
        const clienteIds = Array.from(new Set(Object.values(map).filter((x) => x.tipo_alvo === 'cliente').map((x) => x.alvo_id)));
        const entregadorIds = Array.from(new Set(Object.values(map).filter((x) => x.tipo_alvo === 'entregador').map((x) => x.alvo_id)));
        
        let nomesC: Record<string, string> = {};
        let nomesE: Record<string, string> = {};

        if (clienteIds.length > 0) {
          const rC = await supabase.from('clientes').select('id, nome_completo').in('id', clienteIds);
          if (!rC.error) for (const c of (rC.data || []) as { id: string; nome_completo: string }[]) nomesC[c.id] = c.nome_completo;
        }
        if (entregadorIds.length > 0) {
          const rE = await supabase.from('entregadores').select('id, nome_completo').in('id', entregadorIds);
          if (!rE.error) for (const e of (rE.data || []) as { id: string; nome_completo: string }[]) nomesE[e.id] = e.nome_completo;
        }
        
        // Cache global simples para nomes (opcional, mas mantido do original)
        (window as unknown as { __nomesC?: Record<string, string>; __nomesE?: Record<string, string> }).__nomesC = nomesC;
        (window as unknown as { __nomesC?: Record<string, string>; __nomesE?: Record<string, string> }).__nomesE = nomesE;
      } else {
        setConversas({});
      }
    } catch (e) {
      const msg = (e as { message?: string })?.message || 'Erro ao carregar mensagens';
      setError(msg);
    } finally {
      setLoadingList(false);
    }
  };

  const list = (() => {
    const latestByConv: Record<string, Msg> = {};
    for (const m of threads) {
      const prev = latestByConv[m.conversa_id];
      if (!prev || (new Date(m.created_at).getTime() > new Date(prev.created_at).getTime())) latestByConv[m.conversa_id] = m;
    }

    const nomesC = (window as unknown as { __nomesC?: Record<string, string> }).__nomesC || {};
    const nomesE = (window as unknown as { __nomesE?: Record<string, string> }).__nomesE || {};

    const enriched = Object.values(latestByConv).map((m) => {
      const conv = conversas[m.conversa_id];
      const tipo = (conv?.tipo_alvo || '') as 'cliente' | 'entregador' | '';
      const alvoId = conv?.alvo_id || '';
      const nome = tipo === 'cliente' ? (nomesC[alvoId] || 'Cliente') : tipo === 'entregador' ? (nomesE[alvoId] || 'Entregador') : '';
      return { id: m.id, conversa_id: m.conversa_id, tipo, alvoId, nome, canal: m.canal, conteudo: m.conteudo || '' };
    });

    const target = filtro === 'clientes' ? 'cliente' : filtro === 'entregadores' ? 'entregador' : '';
    const filtered = filtro === 'todos' ? enriched : enriched.filter((x) => x.tipo === target);
    
    // Ordenar por data (mais recente primeiro)
    return filtered.sort((a, b) => {
        // Encontrar a mensagem original para pegar a data
        const msgA = threads.find(t => t.id === a.id);
        const msgB = threads.find(t => t.id === b.id);
        const timeA = msgA ? new Date(msgA.created_at).getTime() : 0;
        const timeB = msgB ? new Date(msgB.created_at).getTime() : 0;
        return timeB - timeA;
    });
  })();

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Histórico de mensagens</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex gap-2">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as 'todos' | 'entregadores' | 'clientes')} className="px-3 py-2 border border-slate-300 rounded">
            <option value="todos">Todos</option>
            <option value="entregadores">Entregadores</option>
            <option value="clientes">Clientes</option>
          </select>
          <button onClick={fetchAll} className="px-3 py-2 rounded bg-slate-800 text-white text-sm">Atualizar</button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">{list.length} registros</div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : list.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhuma mensagem</div>
        ) : (
          <div className="divide-y">
            {list.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{m.nome}</div>
                  <div className="text-sm text-slate-600">{[m.tipo, m.canal || ''].filter(Boolean).join(' • ')}</div>
                  <div className="text-xs text-slate-500 mt-1">{m.conteudo || ''}</div>
                </div>
                <div>
                  <button
                    onClick={() => {
                      try {
                        localStorage.setItem('mensagens_preselect', JSON.stringify({ tipo: m.tipo, alvoId: m.alvoId }));
                        if (onNavigate) {
                          onNavigate(m.tipo === 'cliente' ? 'mensagens_clientes' : 'mensagens_entregadores');
                        } else {
                          // Fallback se onNavigate não for passado
                          window.location.hash = m.tipo === 'cliente' ? '#mensagens_clientes' : '#mensagens_entregadores';
                        }
                      } catch (e) { void e; }
                    }}
                    className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white text-xs"
                  >
                    Abrir chat
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
