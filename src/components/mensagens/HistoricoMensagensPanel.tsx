import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type MsgE = Database['public']['Tables']['mensagens_entregadores']['Row'];
type MsgC = Database['public']['Tables']['mensagens_clientes']['Row'];

export function HistoricoMensagensPanel() {
  const [itemsE, setItemsE] = useState<MsgE[]>([]);
  const [itemsC, setItemsC] = useState<MsgC[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'entregadores' | 'clientes'>('todos');

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const [eRes, cRes] = await Promise.all([
        supabase.from('mensagens_entregadores').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('mensagens_clientes').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      if (eRes.error) setError(eRes.error.message);
      if (cRes.error) setError(cRes.error.message);
      setItemsE((eRes.data || []) as MsgE[]);
      setItemsC((cRes.data || []) as MsgC[]);
    } catch (e) {
      const msg = (e as { message?: string })?.message || 'Erro ao carregar mensagens';
      setError(msg);
    } finally {
      setLoadingList(false);
    }
  };

  const list = (() => {
    if (filtro === 'entregadores') return itemsE.map((m) => ({ tipo: 'entregador' as const, id: m.id, titulo: m.titulo || '', canal: m.canal, status: m.status || '' }));
    if (filtro === 'clientes') return itemsC.map((m) => ({ tipo: 'cliente' as const, id: m.id, titulo: m.titulo || '', canal: m.canal, status: m.status || '' }));
    return [
      ...itemsE.map((m) => ({ tipo: 'entregador' as const, id: m.id, titulo: m.titulo || '', canal: m.canal, status: m.status || '' })),
      ...itemsC.map((m) => ({ tipo: 'cliente' as const, id: m.id, titulo: m.titulo || '', canal: m.canal, status: m.status || '' })),
    ];
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
                  <div className="font-medium text-slate-900">{m.titulo || '(sem título)'}</div>
                  <div className="text-sm text-slate-600">{[m.tipo, m.canal || '', m.status || ''].filter(Boolean).join(' • ')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
