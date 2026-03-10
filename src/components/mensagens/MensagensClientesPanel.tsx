import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Cliente = { id: string; nome_completo: string };
type MsgThread = Database['public']['Tables']['conversa_mensagens']['Row'];

export function MensagensClientesPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MsgThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<string>('');
  const [canal, setCanal] = useState<'email' | 'sms' | 'push' | 'app' | ''>('');
  const [texto, setTexto] = useState('');
  const [clienteNome, setClienteNome] = useState<string>('');
  const [isClienteUser, setIsClienteUser] = useState(false);
  const [entregadorId, setEntregadorId] = useState<string | null>(null);

  useEffect(() => {
    fetchClientes();
  }, [entregadorId, isClienteUser]);

  useEffect(() => {
    try {
      const eCtxRaw = localStorage.getItem('entregador_context');
      if (eCtxRaw) {
        const ctx = JSON.parse(eCtxRaw) as { id?: string };
        if (ctx?.id) setEntregadorId(ctx.id);
      }
      const ctxRaw = localStorage.getItem('cliente_context');
      if (ctxRaw) {
        const ctx = JSON.parse(ctxRaw) as { id?: string; nome?: string };
        if (ctx?.id) {
          setIsClienteUser(true);
          setClienteNome(ctx.nome || 'Cliente');
          void handleSelectCliente(ctx.id);
        }
      }
      const raw = localStorage.getItem('mensagens_preselect');
      if (raw) {
        const v = JSON.parse(raw) as { tipo?: 'cliente' | 'entregador'; alvoId?: string };
        localStorage.removeItem('mensagens_preselect');
        if (v?.tipo === 'cliente' && v.alvoId) {
          void handleSelectCliente(v.alvoId);
        }
      }
    } catch (e) { void e; }
  }, []);

  const fetchClientes = async () => {
    if (isClienteUser) { setClientes([]); return; }
    if (entregadorId) {
      const { data } = await supabase
        .from('nova_entrega')
        .select(`
          cliente_id,
          clientes:cliente_id (id, nome_completo)
        `)
        .eq('entregador_id', entregadorId)
        .in('status', ['criada', 'atribuida', 'em_rota']);
      const rows = (data || []) as unknown as Array<{ cliente_id: string; clientes: { id: string; nome_completo: string | null } | null }>;
      const seen = new Set<string>();
      const list: Cliente[] = [];
      for (const row of rows) {
        const c = row.clientes;
        if (!c || seen.has(c.id)) continue;
        seen.add(c.id);
        list.push({ id: c.id, nome_completo: c.nome_completo || '' });
      }
      setClientes(list);
      return;
    }
    const { data } = await supabase.from('clientes').select('id, nome_completo').order('nome_completo');
    setClientes((data || []) as Cliente[]);
  };

  const ensureConversa = async (clienteId: string) => {
    if (!clienteId) throw new Error('Cliente inválido');
    
    if (entregadorId) {
      const { data } = await supabase
        .from('conversas')
        .select('id')
        .eq('cliente_id', clienteId)
        .eq('entregador_id', entregadorId)
        .maybeSingle();
      if (data && (data as { id: string }).id) return (data as { id: string }).id;
      
      const created = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => { select: (s: string) => { maybeSingle: () => Promise<{ data: unknown }> } } } })
        .from('conversas')
        .insert({ tipo_alvo: 'cliente', alvo_id: clienteId, cliente_id: clienteId, entregador_id: entregadorId })
        .select('id')
        .maybeSingle();
      const createdId = (created.data as unknown as { id?: string } | null)?.id;
      if (!createdId) throw new Error('Falha ao criar conversa');
      return createdId;
    }

    const { data } = await supabase
      .from('conversas')
      .select('id')
      .eq('tipo_alvo', 'cliente')
      .eq('alvo_id', clienteId)
      .maybeSingle();
    if (data && (data as { id: string }).id) return (data as { id: string }).id;
    const created = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => { select: (s: string) => { maybeSingle: () => Promise<{ data: unknown }> } } } })
      .from('conversas')
      .insert({ tipo_alvo: 'cliente', alvo_id: clienteId })
      .select('id')
      .maybeSingle();
    const createdId = (created.data as unknown as { id?: string } | null)?.id;
    if (!createdId) throw new Error('Falha ao criar conversa');
    return createdId;
  };

  const fetchMensagens = async (cid: string) => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('conversa_mensagens')
      .select('*')
      .eq('conversa_id', cid)
      .order('created_at', { ascending: true });
    if (error) setError(error.message);
    setMensagens((data || []) as MsgThread[]);
    setLoading(false);
  };

  const handleSelectCliente = async (id: string) => {
    setSelectedCliente(id);
    if (!id) { setConversaId(null); setMensagens([]); return; }
    try {
      const cid = await ensureConversa(id);
      setConversaId(cid);
      await fetchMensagens(cid);
    } catch (e) {
      const msg = (e as { message?: string })?.message || 'Erro ao abrir conversa';
      setError(msg);
    }
  };

  const handleSend = async () => {
    if (!conversaId || !texto.trim()) return;
    setLoading(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('conversa_mensagens')
      .insert({ conversa_id: conversaId, autor_tipo: 'operador', canal: canal || 'app', conteudo: texto });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setTexto('');
    await fetchMensagens(conversaId);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Chat com comércios</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          {!isClienteUser ? (
            <>
              <div className="text-sm text-slate-700 mb-2">Selecionar comércio</div>
              <select value={selectedCliente} onChange={(e) => handleSelectCliente(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded">
                <option value="">Escolha</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome_completo || 'Comércio'}</option>
                ))}
              </select>
            </>
          ) : (
            <div className="text-sm text-slate-700">Comércio: {clienteNome || 'Comércio'}</div>
          )}
          <div className="mt-3">
            <select value={canal} onChange={(e) => setCanal(e.target.value as 'email' | 'sms' | 'app' | '')} className="w-full px-3 py-2 border border-slate-300 rounded">
              <option value="">Canal</option>
              <option value="email">E-mail (Em breve)</option>
              <option value="sms">SMS (Em breve)</option>
              <option value="app">App</option>
            </select>
          </div>
        </div>
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-lg flex flex-col">
          <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">{conversaId ? 'Conversa' : 'Selecione um comércio'}</div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-modern">
            {loading && <div className="text-slate-600">Carregando...</div>}
            {!loading && mensagens.length === 0 && conversaId && <div className="text-slate-600">Nenhuma mensagem</div>}
            {mensagens.map((m) => (
              <div key={m.id} className={`max-w-[70%] px-3 py-2 rounded ${m.autor_tipo === 'operador' ? 'bg-sky-600 text-white self-end ml-auto' : 'bg-slate-200 text-slate-900'}`}>
                <div className="text-sm">{m.conteudo || ''}</div>
                <div className="text-[11px] opacity-80 mt-1">{m.canal || canal || 'app'}</div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-slate-200 flex gap-2">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite uma mensagem" className="flex-1 px-3 py-2 border border-slate-300 rounded" />
            <button onClick={handleSend} disabled={!conversaId || !texto.trim() || loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">Enviar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
