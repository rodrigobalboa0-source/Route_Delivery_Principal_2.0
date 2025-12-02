import { useEffect, useState, useCallback } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Entregador = Database['public']['Tables']['entregadores']['Row'];
type MsgThread = Database['public']['Tables']['conversa_mensagens']['Row'];

export function MensagensEntregadoresPanel() {
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MsgThread[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntregador, setSelectedEntregador] = useState<string>('');
  const [texto, setTexto] = useState('');

  const fetchEntregadores = useCallback(async () => {
    try {
      const result = await withTimeout(
        supabase.from('entregadores').select('id, nome_completo').order('nome_completo'),
        8000
      );
      const { data } = result as unknown as { data?: Entregador[] };
      setEntregadores((data || []) as Entregador[]);
    } catch (e) {
      void e;
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/entregadores?select=id,nome_completo&order=nome_completo`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        });
        if (r.ok) {
          const json = await r.json();
          setEntregadores(json as Entregador[]);
        }
      } catch (e2) { void e2; }
    }
  }, []);

  useEffect(() => {
    fetchEntregadores();
  }, [fetchEntregadores]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mensagens_preselect');
      if (!raw) return;
      const v = JSON.parse(raw) as { tipo?: 'cliente' | 'entregador'; alvoId?: string };
      localStorage.removeItem('mensagens_preselect');
      if (v?.tipo === 'entregador' && v.alvoId) {
        void handleSelectEntregador(v.alvoId);
      }
    } catch (e) { void e; }
  }, []);

  const withTimeout = <T,>(p: { then: (onFulfilled: (v: T) => unknown, onRejected?: (e: unknown) => unknown) => unknown }, ms: number) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), ms);
      p.then(
        (v: T) => { clearTimeout(t); resolve(v); },
        (e: unknown) => { clearTimeout(t); reject(e); }
      );
    });

  

  const ensureConversa = async (entregadorId: string) => {
    const { data } = await supabase
      .from('conversas')
      .select('id')
      .eq('tipo_alvo', 'entregador')
      .eq('alvo_id', entregadorId)
      .single();
    if (data && (data as { id: string }).id) return (data as { id: string }).id;
    const created = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => { select: (s: string) => { single: () => Promise<{ data: unknown }> } } } })
      .from('conversas')
      .insert({ tipo_alvo: 'entregador', alvo_id: entregadorId })
      .select('id')
      .single();
    return (created.data as unknown as { id: string }).id;
  };

  const fetchMensagens = async (cid: string) => {
    setLoadingList(true);
    setError(null);
    try {
      const result = await withTimeout(
        supabase
          .from('conversa_mensagens')
          .select('*')
          .eq('conversa_id', cid)
          .order('created_at', { ascending: true }),
        8000
      );
      const { data, error } = result as unknown as { data?: MsgThread[]; error?: { message?: string } };
      if (error?.message) setError(error.message);
      setMensagens((data || []) as MsgThread[]);
    } catch (e) {
      void e;
      try {
        const url = `${SUPABASE_URL}/rest/v1/conversa_mensagens?select=*&conversa_id=eq.${cid}&order=created_at.asc`;
        const r = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
        if (r.ok) {
          const json = await r.json();
          setMensagens(json as MsgThread[]);
          setError(null);
        } else {
          setError(`Falha ${r.status}`);
        }
      } catch (e2) {
        const msg = (e2 as { message?: string })?.message || 'Erro ao carregar mensagens';
        setError(msg);
      }
    } finally {
      setLoadingList(false);
    }
  };

  const handleSelectEntregador = async (id: string) => {
    setSelectedEntregador(id);
    const cid = await ensureConversa(id);
    setConversaId(cid);
    await fetchMensagens(cid);
  };

  const handleSend = async () => {
    if (!conversaId || !texto.trim()) return;
    setLoadingSubmit(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('conversa_mensagens')
      .insert({ conversa_id: conversaId, autor_tipo: 'operador', canal: 'app', conteudo: texto });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setTexto('');
    await fetchMensagens(conversaId);
    setLoadingSubmit(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Chat com entregadores</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-700 mb-2">Selecionar entregador</div>
          <select value={selectedEntregador} onChange={(e) => handleSelectEntregador(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded">
            <option value="">Escolha</option>
            {entregadores.map((e) => (
              <option key={e.id} value={e.id}>{e.nome_completo}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-lg flex flex-col">
          <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">{conversaId ? 'Conversa' : 'Selecione um entregador'}</div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loadingList && <div className="text-slate-600">Carregando...</div>}
            {!loadingList && mensagens.length === 0 && conversaId && <div className="text-slate-600">Nenhuma mensagem</div>}
            {mensagens.map((m) => (
              <div key={m.id} className={`max-w-[70%] px-3 py-2 rounded ${m.autor_tipo === 'operador' ? 'bg-sky-600 text-white self-end ml-auto' : 'bg-slate-200 text-slate-900'}`}>
                <div className="text-sm">{m.conteudo || ''}</div>
                <div className="text-[11px] opacity-80 mt-1">{m.canal || 'app'}</div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-slate-200 flex gap-2">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite uma mensagem" className="flex-1 px-3 py-2 border border-slate-300 rounded" />
            <button onClick={handleSend} disabled={!conversaId || !texto.trim() || loadingSubmit} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">Enviar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
