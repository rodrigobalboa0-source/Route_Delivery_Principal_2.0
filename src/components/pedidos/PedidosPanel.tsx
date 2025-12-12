import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MapView } from '../MapView';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';

type Cliente = { id: string; nome_completo: string };
type Pedido = Database['public']['Tables']['pedidos']['Row'];
type Entrega = Database['public']['Tables']['nova_entrega']['Row'];
type Entregador = { id: string; nome_completo: string };
type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

export function PedidosPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [items, setItems] = useState<Pedido[]>([]);
  const [entregasMap, setEntregasMap] = useState<Record<string, Entrega>>({});
  const [entregadores, setEntregadores] = useState<Record<string, Entregador>>({});
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: 'todos', cliente_id: '', origem: 'todos', de: '', ate: '' });
  const [activeDeliveriesByEntregador, setActiveDeliveriesByEntregador] = useState<Record<string, { lat: number; lon: number }>>({});
  const [availableEntregadores, setAvailableEntregadores] = useState<Entregador[]>([]);
    
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
  const [selectedPedidoForAllocation, setSelectedPedidoForAllocation] = useState<Pedido | null>(null);
  const [selectedEntregadorId, setSelectedEntregadorId] = useState('');

  const [mapSelectedEntregadorId, setMapSelectedEntregadorId] = useState('');
  const [selectedDeliveryPerson, setSelectedDeliveryPerson] = useState<DeliveryPerson | null>(null);

  useEffect(() => {
    fetchClientes();
    fetchEntregadoresList();
  }, []);

  useEffect(() => {
    fetchPedidos();
  }, [filters.status, filters.cliente_id, filters.origem, filters.de, filters.ate]);

  const statusCounters = useMemo(() => {
    const c: Record<string, number> = { criado: 0, confirmado: 0, em_preparo: 0, pronto: 0, cancelado: 0, entregue: 0 };
    for (const p of items) { if (p.status && p.status in c) c[p.status]++; }
    return c;
  }, [items]);

  const fetchClientes = async () => {
    const { data, error } = await supabase.from('clientes').select('id, nome_completo').order('nome_completo');
    if (error) setError(error.message);
    setClientes(((data || []) as { id: string; nome_completo: string }[]).map((c) => ({ id: c.id, nome_completo: c.nome_completo })));
  };

  const fetchEntregadoresList = async () => {
    const { data } = await supabase.from('entregadores').select('id, nome_completo').eq('ativo', true).order('nome_completo');
    setAvailableEntregadores((data || []) as Entregador[]);
    
    const map: Record<string, Entregador> = {};
    (data || []).forEach((e: Entregador) => { map[e.id] = e; });
    setEntregadores(prev => ({ ...prev, ...map }));
  };

  const fetchEntregas = async (pedidos: Pedido[]) => {
    if (pedidos.length === 0) { setEntregasMap({}); return; }
    
    const clienteIds = Array.from(new Set(pedidos.map(p => p.cliente_id).filter(Boolean)));
    const numeros = pedidos.map(p => p.numero).filter(Boolean) as string[];

    let query = supabase.from('nova_entrega').select('*');
    
    
    const { data } = await query.in('cliente_id', clienteIds).order('created_at', { ascending: false }).limit(500); // Reasonable limit
    
    const map: Record<string, Entrega> = {};
    const entregas = (data || []) as Entrega[];
    
    pedidos.forEach(p => {
      
      // 1. Try match by pedido_id (best match)
      let match = entregas.find(e => e.pedido_id === p.id);
      
      // 2. Try match by external code
      if (!match && p.numero) {
        match = entregas.find(e => e.entrega_codigo_pedido === p.numero && e.cliente_id === p.cliente_id);
      }
      
      // 3. Fallback: time proximity (within 1 hour)
      if (!match) {
        const pTime = new Date(p.created_at).getTime();
        match = entregas.find(e => {
          if (e.cliente_id !== p.cliente_id) return false;
          // Avoid matching if already matched to another pedido (simple check)
          if (e.pedido_id && e.pedido_id !== p.id) return false;
          
          const eTime = new Date(e.created_at).getTime();
          return Math.abs(eTime - pTime) < 3600000;
        });
      }

      if (match) {
        map[p.id] = match;
      }
    });

    setEntregasMap(map);
    
    
    const extraEntregadorIds = entregas.map(e => e.entregador_id).filter(Boolean) as string[];
    if (extraEntregadorIds.length > 0) {
      const { data: ents } = await supabase.from('entregadores').select('id, nome_completo').in('id', extraEntregadorIds);
      const newMap: Record<string, Entregador> = {};
      (ents || []).forEach((e: Entregador) => { newMap[e.id] = e; });
      setEntregadores(prev => ({ ...prev, ...newMap }));
    }
  };

  const fetchPedidos = async () => {
    setLoadingList(true);
    setError(null);
    let q = supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (filters.status !== 'todos') q = q.eq('status', filters.status);
    if (filters.origem !== 'todos') q = q.eq('origem', filters.origem);
    if (filters.cliente_id) q = q.eq('cliente_id', filters.cliente_id);
    if (filters.de) q = q.gte('created_at', new Date(filters.de).toISOString());
    if (filters.ate) q = q.lte('created_at', new Date(new Date(filters.ate).getTime() + 24 * 60 * 60 * 1000).toISOString());
    
    const { data, error } = await q;
    if (error) setError(error.message);
    const list = ((data || []) as Pedido[]);
    setItems(list);
    
    await fetchEntregas(list);
    setLoadingList(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este pedido?')) return;
    await supabase.from('pedidos').delete().eq('id', id);
    await fetchPedidos();
  };

  const handleOpenAllocation = (pedido: Pedido) => {
    const entrega = entregasMap[pedido.id];
    setSelectedPedidoForAllocation(pedido);
    setSelectedEntregadorId(entrega?.entregador_id || '');
    setIsAllocationModalOpen(true);
  };

  const handleSaveAllocation = async () => {
    if (!selectedPedidoForAllocation) return;
    const entrega = entregasMap[selectedPedidoForAllocation.id];
    
    if (!entrega) {
      alert('Não foi encontrada uma entrega vinculada a este pedido para alocar.');
      return;
    }

    try {
      await supabase.from('nova_entrega').update({
        entregador_id: selectedEntregadorId || null,
        status: selectedEntregadorId ? 'atribuida' : 'criada'
      }).eq('id', entrega.id);
      
      setIsAllocationModalOpen(false);
      fetchPedidos(); 
    } catch (err) {
      alert('Erro ao salvar alocação');
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      criado: 'bg-slate-100 text-slate-700',
      confirmado: 'bg-blue-100 text-blue-700',
      em_preparo: 'bg-yellow-100 text-yellow-700',
      pronto: 'bg-green-100 text-green-700',
      cancelado: 'bg-red-100 text-red-700',
      entregue: 'bg-gray-100 text-gray-700',
      
      criada: 'bg-slate-100 text-slate-700',
      atribuida: 'bg-sky-100 text-sky-700',
      em_rota: 'bg-indigo-100 text-indigo-700',
    };
    const label = status.replace('_', ' ').toUpperCase();
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-700'}`}>{label}</span>;
  };

  
  useEffect(() => {
    if (!mapSelectedEntregadorId) { setSelectedDeliveryPerson(null); return; }
    supabase
      .from('delivery_persons')
      .select('*')
      .eq('id', mapSelectedEntregadorId)
      .single()
      .then(({ data }) => { setSelectedDeliveryPerson((data || null) as DeliveryPerson | null); });
  }, [mapSelectedEntregadorId]);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Pedidos • Acompanhamento</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      
      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <select value={filters.cliente_id} onChange={(e) => setFilters({ ...filters, cliente_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Comércio</option>
            {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nome_completo}</option>))}
          </select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="todos">Status (todos)</option>
            <option value="criado">Criado</option>
            <option value="confirmado">Confirmado</option>
            <option value="em_preparo">Em preparo</option>
            <option value="pronto">Pronto</option>
            <option value="cancelado">Cancelado</option>
            <option value="entregue">Entregue</option>
          </select>
          <select value={filters.origem} onChange={(e) => setFilters({ ...filters, origem: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="todos">Origem (todas)</option>
            <option value="manual">Manual</option>
            <option value="online">Online</option>
          </select>
          <input type="date" value={filters.de} onChange={(e) => setFilters({ ...filters, de: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input type="date" value={filters.ate} onChange={(e) => setFilters({ ...filters, ate: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
        </div>
        
        {/* Counters */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3">
          {Object.entries(statusCounters).map(([key, count]) => (
            <div key={key} className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
              <div className="text-xs text-slate-600 capitalize">{key.replace('_', ' ')}</div>
              <div className="text-xl font-semibold text-slate-900">{count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Map (Optional - User didn't ask to remove it, but focus is on table. Keeping it as it was) */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-slate-700">Mapa da entrega e rota do entregador selecionado</div>
        </div>
        <div className="h-64 rounded-lg overflow-hidden border border-slate-200">
          <MapView
            deliveryPersons={selectedDeliveryPerson ? [selectedDeliveryPerson] : []}
            center={selectedDeliveryPerson?.current_latitude && selectedDeliveryPerson?.current_longitude ? [selectedDeliveryPerson.current_latitude, selectedDeliveryPerson.current_longitude] : undefined}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 font-medium text-slate-900">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Comércio</th>
                <th className="px-4 py-3">Entregador</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Logística</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loadingList ? (
                <tr><td colSpan={6} className="px-4 py-3 text-center">Carregando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-3 text-center">Nenhum pedido</td></tr>
              ) : (
                items.map((p) => {
                  const cliente = clientes.find(c => c.id === p.cliente_id);
                  const entrega = entregasMap[p.id];
                  const entregadorName = entrega?.entregador_id ? entregadores[entrega.entregador_id]?.nome_completo : '-';
                  const logisticaStatus = entrega?.status || p.status;
                  
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap">{format(new Date(p.created_at), 'dd/MM/yyyy HH:mm')}</td>
                      <td className="px-4 py-3">{cliente?.nome_completo || 'Desconhecido'}</td>
                      <td className="px-4 py-3">{entregadorName}</td>
                      <td className="px-4 py-3">
                        <button 
                          onClick={() => handleOpenAllocation(p)}
                          className="px-3 py-1 rounded bg-sky-100 text-sky-700 hover:bg-sky-200 font-medium text-xs transition-colors"
                        >
                          {entrega?.entregador_id ? 'Re-alocar' : 'Alocar'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(logisticaStatus)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800 p-1">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Allocation Modal */}
      <Modal
        open={isAllocationModalOpen}
        onClose={() => setIsAllocationModalOpen(false)}
        title="Alocar Entregador"
        confirmText="Salvar"
        onConfirm={handleSaveAllocation}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Selecione o Entregador</label>
            <select
              value={selectedEntregadorId}
              onChange={(e) => setSelectedEntregadorId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">-- Selecione --</option>
              {availableEntregadores.map(e => (
                <option key={e.id} value={e.id}>{e.nome_completo}</option>
              ))}
            </select>
          </div>
          {!entregasMap[selectedPedidoForAllocation?.id || ''] && (
             <div className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
               Aviso: Este pedido não tem uma entrega vinculada automaticamente. A alocação pode falhar se não houver registro de entrega.
             </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
