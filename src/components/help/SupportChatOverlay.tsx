import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface SupportChatOverlayProps {
  open: boolean;
  onClose: () => void;
}

type Conversa = { id: string };
type Mensagem = { id: string; conteudo: string; autor_tipo: 'operador' | 'entregador' | 'cliente' | 'sistema' | null; created_at: string };

export function SupportChatOverlay({ open, onClose }: SupportChatOverlayProps) {
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'cliente' | 'entregador' | 'operador'>('operador');
  const [alvoId, setAlvoId] = useState<string>('');
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    try {
      const cRaw = localStorage.getItem('cliente_context');
      const eRaw = localStorage.getItem('entregador_context');
      if (cRaw) {
        const c = JSON.parse(cRaw) as { id?: string };
        if (c?.id) { setRole('cliente'); setAlvoId(c.id); void ensureConversa('cliente', c.id); return; }
      }
      if (eRaw) {
        const e = JSON.parse(eRaw) as { id?: string };
        if (e?.id) { setRole('entregador'); setAlvoId(e.id); void ensureConversa('entregador', e.id); return; }
      }
      setRole('operador');
      setAlvoId('');
      setError('Para usar o chat de suporte, acesse com um perfil de Cliente ou Entregador.');
    } catch (e) { void e; }
  }, [open]);

  const ensureConversa = async (tipo: 'cliente' | 'entregador', id: string) => {
    const { data } = await supabase.from('conversas').select('id').eq('tipo_alvo', tipo).eq('alvo_id', id).maybeSingle();
    const cid = (data as Conversa | null)?.id;
    if (cid) { setConversaId(cid); await fetchMensagens(cid); return; }
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
    const autor: Mensagem['autor_tipo'] = role === 'cliente' ? 'cliente' : role === 'entregador' ? 'entregador' : 'operador';
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('conversa_mensagens').insert({ conversa_id: conversaId, autor_tipo: autor, canal: 'app', conteudo: texto });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setTexto('');
    await fetchMensagens(conversaId);
    await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('conversa_mensagens').insert({ conversa_id: conversaId, autor_tipo: 'sistema', canal: 'app', conteudo: 'Recebemos sua mensagem! 😊 Em breve retornaremos.' });
    await fetchMensagens(conversaId);
    try { localStorage.setItem('mensagens_preselect', JSON.stringify({ tipo: role, alvoId })); } catch (e) { void e; }
    setLoading(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] pointer-events-none">
      <div className="absolute bottom-6 right-6 w-[22rem] sm:w-[24rem] md:w-[26rem] max-w-[calc(100vw-1.5rem)] pointer-events-auto">
        <div ref={boxRef} className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="text-sm font-semibold text-slate-900">Suporte</div>
          </div>
          <div className="p-3 text-sm text-slate-700">
            <div className="mb-2">Olá! 👋 Como posso ajudar hoje?</div>
            {error && <div className="mb-2 text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 text-xs">{error}</div>}
            <div className="max-h-64 overflow-y-auto space-y-2 scrollbar-modern">
              {mensagens.map((m) => (
                <div key={m.id} className={`max-w-[80%] px-3 py-2 rounded ${m.autor_tipo === 'sistema' ? 'bg-slate-100 text-slate-800' : 'bg-sky-600 text-white self-end ml-auto'}`}>
                  <div className="text-sm">{m.conteudo}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-3 border-t border-slate-200 flex flex-wrap items-center gap-2">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite sua mensagem" className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded" />
            <div className="flex gap-2 shrink-0">
              <button onClick={handleSend} disabled={!conversaId || !texto.trim() || loading} className="px-3 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-xs disabled:opacity-50">Enviar</button>
              <button onClick={onClose} className="px-3 py-2 rounded bg-slate-200 text-slate-800 text-xs">Fechar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
