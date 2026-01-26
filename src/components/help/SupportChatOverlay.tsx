import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Store, User, ChevronLeft } from 'lucide-react';

interface SupportChatOverlayProps {
  open: boolean;
  onClose: () => void;
  userRole?: 'operador' | 'cliente' | 'entregador' | 'loading';
}

type Conversa = { id: string };
type Mensagem = { id: string; conteudo: string; autor_tipo: 'operador' | 'entregador' | 'cliente' | 'sistema' | null; created_at: string };

type Cliente = { id: string; nome_completo: string };
type Entregador = { id: string; nome_completo: string };

export function SupportChatOverlay({ open, onClose, userRole }: SupportChatOverlayProps) {
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [selectionTab, setSelectionTab] = useState<'cliente' | 'entregador'>('cliente');
  const [clientesList, setClientesList] = useState<Cliente[]>([]);
  const [entregadoresList, setEntregadoresList] = useState<Entregador[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTargetName, setSelectedTargetName] = useState('');

  
  const [currentUserRole, setCurrentUserRole] = useState<'cliente' | 'entregador' | 'operador'>('operador');
  
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    
  
    setError(null);
    setConversaId(null);
    setMensagens([]);
    setIsAdminMode(false);
    
  
    if (userRole === 'operador') {
        setIsAdminMode(true);
        setCurrentUserRole('operador');
        fetchTargets();
        return;
    }

    try {
      const cRaw = localStorage.getItem('cliente_context');
      const eRaw = localStorage.getItem('entregador_context');
      
      if (userRole === 'cliente' || cRaw) {
        const c = cRaw ? JSON.parse(cRaw) : null;
        if (c?.id) { 
            setCurrentUserRole('cliente'); 
            void ensureConversa('cliente', c.id); 
            return; 
        }
      }
      
      if (userRole === 'entregador' || eRaw) {
        const e = eRaw ? JSON.parse(eRaw) : null;
        if (e?.id) { 
            setCurrentUserRole('entregador'); 
            void ensureConversa('entregador', e.id); 
            return; 
        }
      }
      
  
  
      setIsAdminMode(true);
      setCurrentUserRole('operador');
      fetchTargets();
      
    } catch (e) { void e; }
  }, [open, userRole]);

  const fetchTargets = async () => {
      const { data: cData } = await supabase.from('clientes').select('id, nome_completo').order('nome_completo').limit(50);
      setClientesList((cData || []) as Cliente[]);
      
      const { data: eData } = await supabase.from('entregadores').select('id, nome_completo').eq('status', 'ativo').order('nome_completo').limit(50);
      setEntregadoresList((eData || []) as Entregador[]);
  };

  const ensureConversa = async (tipo: 'cliente' | 'entregador', id: string) => {
    const { data } = await supabase.from('conversas').select('id').eq('tipo_alvo', tipo).eq('alvo_id', id).maybeSingle();
    const cid = (data as Conversa | null)?.id;
    if (cid) { 
        setConversaId(cid); 
        await fetchMensagens(cid); 
        return; 
    }
    const created = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => { select: (s: string) => { maybeSingle: () => Promise<{ data: unknown }> } } } }).from('conversas').insert({ tipo_alvo: tipo, alvo_id: id, assunto: 'Suporte' }).select('id').maybeSingle();
    const createdId = (created.data as { id?: string } | null)?.id || null;
    setConversaId(createdId);
    if (createdId) await fetchMensagens(createdId);
  };

  const fetchMensagens = async (cid: string) => {
    const { data } = await supabase.from('conversa_mensagens').select('id, conteudo, autor_tipo, created_at').eq('conversa_id', cid).order('created_at', { ascending: true });
    setMensagens((data || []) as Mensagem[]);
  };

  const handleSend = async () => {
    if (!conversaId || !texto.trim()) return;
    setLoading(true);
    setError(null);
    
    const autor = currentUserRole;

    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('conversa_mensagens').insert({ conversa_id: conversaId, autor_tipo: autor, canal: 'app', conteudo: texto });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setTexto('');
    await fetchMensagens(conversaId);
    
    // If user is NOT operator, system auto-reply (mock)
    if (currentUserRole !== 'operador') {
        // Simple auto-reply simulation or maybe backend trigger
        // For now, keep existing behavior:
        await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('conversa_mensagens').insert({ conversa_id: conversaId, autor_tipo: 'sistema', canal: 'app', conteudo: 'Recebemos sua mensagem! 😊 Em breve retornaremos.' });
        await fetchMensagens(conversaId);
    }
    
    setLoading(false);
  };

  const handleSelectTarget = (tipo: 'cliente' | 'entregador', id: string, nome: string) => {
      setSelectedTargetName(nome);
      void ensureConversa(tipo, id);
      setIsAdminMode(false); // Switch to chat view
  };

  const filteredList = (selectionTab === 'cliente' ? clientesList : entregadoresList).filter(i => 
      i.nome_completo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] pointer-events-none">
      <div className="absolute bottom-6 right-6 w-[22rem] sm:w-[24rem] md:w-[26rem] max-w-[calc(100vw-1.5rem)] pointer-events-auto">
        <div ref={boxRef} className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[600px]">
          
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
                {currentUserRole === 'operador' && conversaId && (
                    <button onClick={() => { setConversaId(null); setIsAdminMode(true); }} className="p-1 hover:bg-slate-200 rounded">
                        <ChevronLeft size={18} className="text-slate-600" />
                    </button>
                )}
                <div className="text-sm font-semibold text-slate-900">
                    {conversaId && currentUserRole === 'operador' ? `Chat: ${selectedTargetName}` : 'Suporte'}
                </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xs">Fechar</button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {isAdminMode && !conversaId ? (
                // Selection Mode
                <div className="p-4 flex flex-col h-full">
                    <p className="text-sm text-slate-600 mb-4">Selecione com quem deseja falar:</p>
                    
                    <div className="flex border-b border-slate-200 mb-4">
                        <button 
                            className={`flex-1 pb-2 text-sm font-medium ${selectionTab === 'cliente' ? 'text-sky-600 border-b-2 border-sky-600' : 'text-slate-500'}`}
                            onClick={() => setSelectionTab('cliente')}
                        >
                            Comércios
                        </button>
                        <button 
                            className={`flex-1 pb-2 text-sm font-medium ${selectionTab === 'entregador' ? 'text-sky-600 border-b-2 border-sky-600' : 'text-slate-500'}`}
                            onClick={() => setSelectionTab('entregador')}
                        >
                            Entregadores
                        </button>
                    </div>

                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="Buscar..." 
                            className="w-full pl-9 pr-4 py-2 border rounded text-sm"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2">
                        {filteredList.map(item => (
                            <button 
                                key={item.id} 
                                onClick={() => handleSelectTarget(selectionTab, item.id, item.nome_completo)}
                                className="w-full text-left p-3 hover:bg-slate-50 rounded border border-slate-100 flex items-center gap-3"
                            >
                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                                    {selectionTab === 'cliente' ? <Store size={16} /> : <User size={16} />}
                                </div>
                                <span className="text-sm font-medium text-slate-700 truncate">{item.nome_completo}</span>
                            </button>
                        ))}
                        {filteredList.length === 0 && (
                            <p className="text-sm text-slate-500 text-center py-4">Nenhum resultado encontrado.</p>
                        )}
                    </div>
                </div>
            ) : (
                // Chat Mode
                <>
                    <div className="flex-1 p-3 overflow-y-auto space-y-2 scrollbar-modern bg-slate-50">
                        {!loading && mensagens.length === 0 && (
                            <div className="text-center text-xs text-slate-400 py-4">Nenhuma mensagem ainda.</div>
                        )}
                        {mensagens.map((m) => {
                            const isMe = m.autor_tipo === currentUserRole;
                            const isSystem = m.autor_tipo === 'sistema';
                            return (
                                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] px-3 py-2 rounded shadow-sm text-sm ${
                                        isSystem ? 'bg-gray-200 text-gray-800 mx-auto text-center text-xs italic' :
                                        isMe ? 'bg-sky-600 text-white' : 
                                        'bg-white text-slate-800 border border-slate-200'
                                    }`}>
                                        <div>{m.conteudo}</div>
                                        <div className={`text-[10px] mt-1 ${isMe ? 'text-sky-100' : 'text-slate-400'}`}>
                                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    
                    {error && <div className="px-3 py-2 bg-red-50 text-red-600 text-xs border-t border-red-100">{error}</div>}

                    <div className="p-3 bg-white border-t border-slate-200 flex gap-2">
                        <input 
                            value={texto} 
                            onChange={(e) => setTexto(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            placeholder="Digite sua mensagem..." 
                            className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-sky-500" 
                        />
                        <button 
                            onClick={handleSend} 
                            disabled={!conversaId || !texto.trim() || loading} 
                            className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                        >
                            Enviar
                        </button>
                    </div>
                </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
