import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { MapView } from '../MapView';
import type { Database } from '../../lib/database.types';

type Cliente = { id: string; nome_completo: string };
type Pedido = { id: string; cliente_id: string; endereco_id: string | null; numero: string | null; item_descricao: string | null; endereco_texto: string | null; origem: 'manual' | 'online'; valor_total: number | null; status: 'criado' | 'confirmado' | 'em_preparo' | 'pronto' | 'cancelado' | 'entregue'; observacoes: string | null; created_at: string };
type Entrega = { id: string; cliente_id: string; entregador_id: string | null; status: 'criada' | 'atribuida' | 'em_rota' | 'entregue' | 'cancelada' | null; created_at: string };
type Entregador = { id: string; nome_completo: string };
type Delivery = Database['public']['Tables']['deliveries']['Row'];
type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

export function PedidosPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [items, setItems] = useState<Pedido[]>([]);
  const [entregasByCliente, setEntregasByCliente] = useState<Record<string, Entrega | undefined>>({});
  const [entregadores, setEntregadores] = useState<Record<string, Entregador>>({});
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: 'todos', cliente_id: '', origem: 'todos', de: '', ate: '' });
  const [activeDeliveriesByEntregador, setActiveDeliveriesByEntregador] = useState<Record<string, { lat: number; lon: number }>>({});
  const [activeDeliveryByCliente, setActiveDeliveryByCliente] = useState<Record<string, { delivery_person_id: string; lat: number; lon: number }>>({});
  const [availableEntregadores, setAvailableEntregadores] = useState<string[]>([]);
  const [selectedEntregadorId, setSelectedEntregadorId] = useState('');
  const [selectedDeliveryPerson, setSelectedDeliveryPerson] = useState<DeliveryPerson | null>(null);
  const [selectedPedidoId, setSelectedPedidoId] = useState('');

  useEffect(() => {
    fetchClientes();
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

  const fetchEntregas = async (clienteIds: string[]) => {
    if (clienteIds.length === 0) { setEntregasByCliente({}); return; }
    const { data } = await supabase
      .from('nova_entrega')
      .select('id, cliente_id, entregador_id, status, created_at')
      .in('cliente_id', clienteIds)
      .order('created_at', { ascending: false });
    const latestByCliente: Record<string, Entrega> = {};
    for (const e of (data || []) as Entrega[]) {
      if (!latestByCliente[e.cliente_id]) latestByCliente[e.cliente_id] = e;
    }
    setEntregasByCliente(latestByCliente);
    const entregadorIds = Array.from(new Set((data || []).map((x: any) => x.entregador_id).filter(Boolean)));
    if (entregadorIds.length) {
      const { data: ents } = await supabase.from('entregadores').select('id, nome_completo').in('id', entregadorIds);
      const map: Record<string, Entregador> = {};
      for (const en of (ents || []) as Entregador[]) { map[en.id] = en; }
      setEntregadores(map);
    } else {
      setEntregadores({});
    }
  };

  const fetchActiveDeliveries = async (clienteIds: string[]) => {
    if (clienteIds.length === 0) { setActiveDeliveriesByEntregador({}); setAvailableEntregadores([]); return; }
    const { data } = await supabase
      .from('deliveries')
      .select('delivery_person_id, delivery_latitude, delivery_longitude, status, cliente_id, created_at')
      .in('cliente_id', clienteIds)
      .in('status', ['pendente', 'em_rota'])
      .order('created_at', { ascending: false });
    const map: Record<string, { lat: number; lon: number }> = {};
    const byCliente: Record<string, { delivery_person_id: string; lat: number; lon: number }> = {};
    const setIds = new Set<string>();
    for (const d of (data || []) as Delivery[]) {
      const id = d.delivery_person_id || '';
      if (!id) continue;
      if (!map[id]) {
        map[id] = { lat: d.delivery_latitude, lon: d.delivery_longitude };
        setIds.add(id);
      }
      if (d.cliente_id && !byCliente[d.cliente_id]) {
        byCliente[d.cliente_id] = { delivery_person_id: id, lat: d.delivery_latitude, lon: d.delivery_longitude };
      }
    }
    setActiveDeliveriesByEntregador(map);
    setActiveDeliveryByCliente(byCliente);
    setAvailableEntregadores(Array.from(setIds));
    if (setIds.size && !selectedEntregadorId) setSelectedEntregadorId(Array.from(setIds)[0]);
    if (setIds.size) {
      const { data: ents } = await supabase.from('entregadores').select('id, nome_completo').in('id', Array.from(setIds));
      const mapNames: Record<string, Entregador> = {};
      for (const en of (ents || []) as Entregador[]) { mapNames[en.id] = en; }
      setEntregadores((prev) => ({ ...prev, ...mapNames }));
    }
  };

  const fetchPedidos = async () => {
    setLoadingList(true);
    setError(null);
    let q = supabase
      .from('pedidos')
      .select('id, cliente_id, endereco_id, numero, item_descricao, endereco_texto, origem, valor_total, status, observacoes, created_at')
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
    const clienteIds = Array.from(new Set(list.map((p) => p.cliente_id).filter(Boolean)));
    await Promise.all([fetchEntregas(clienteIds), fetchActiveDeliveries(clienteIds)]);
    setLoadingList(false);
  };

  const entregaInfo = (p: Pedido) => {
    const e = entregasByCliente[p.cliente_id];
    if (!e) return { status: 'sem entrega', entregador: '' };
    const nome = e.entregador_id ? (entregadores[e.entregador_id]?.nome_completo || '') : '';
    return { status: e.status || 'criada', entregador: nome };
  };

  useEffect(() => {
    if (!selectedEntregadorId) { setSelectedDeliveryPerson(null); return; }
    supabase
      .from('delivery_persons')
      .select('*')
      .eq('id', selectedEntregadorId)
      .single()
      .then(({ data }) => { setSelectedDeliveryPerson((data || null) as DeliveryPerson | null); });
  }, [selectedEntregadorId]);

  useEffect(() => {
    if (!selectedPedidoId) return;
    const pedido = items.find((x) => x.id === selectedPedidoId);
    if (!pedido) return;
    const ad = activeDeliveryByCliente[pedido.cliente_id];
    if (ad) {
      setSelectedEntregadorId(ad.delivery_person_id);
    }
  }, [selectedPedidoId, items, activeDeliveryByCliente]);

  const handleDelete = async (id: string) => {
    await supabase.from('pedidos').delete().eq('id', id);
    await fetchPedidos();
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Pedidos • Acompanhamento</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
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
          <select value={selectedEntregadorId} onChange={(e) => setSelectedEntregadorId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Entregador</option>
            {availableEntregadores.map((id) => (
              <option key={id} value={id}>{entregadores[id]?.nome_completo || id}</option>
            ))}
          </select>
          <select value={selectedPedidoId} onChange={(e) => setSelectedPedidoId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Pedido</option>
            {items.map((p) => (
              <option key={p.id} value={p.id}>{p.numero || p.id}</option>
            ))}
          </select>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
            <div className="text-xs text-slate-600">Criado</div>
            <div className="text-xl font-semibold text-slate-900">{statusCounters.criado}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
            <div className="text-xs text-slate-600">Confirmado</div>
            <div className="text-xl font-semibold text-slate-900">{statusCounters.confirmado}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
            <div className="text-xs text-slate-600">Em preparo</div>
            <div className="text-xl font-semibold text-slate-900">{statusCounters.em_preparo}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
            <div className="text-xs text-slate-600">Pronto</div>
            <div className="text-xl font-semibold text-slate-900">{statusCounters.pronto}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
            <div className="text-xs text-slate-600">Cancelado</div>
            <div className="text-xl font-semibold text-slate-900">{statusCounters.cancelado}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
            <div className="text-xs text-slate-600">Entregue</div>
            <div className="text-xl font-semibold text-slate-900">{statusCounters.entregue}</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-slate-700">Mapa da entrega e rota do entregador selecionado</div>
        </div>
        <div className="h-96 rounded-lg overflow-hidden border border-slate-200">
          <MapView
            deliveryPersons={selectedDeliveryPerson ? [selectedDeliveryPerson] : []}
            center={selectedDeliveryPerson?.current_latitude && selectedDeliveryPerson?.current_longitude ? [selectedDeliveryPerson.current_latitude, selectedDeliveryPerson.current_longitude] : undefined}
            destination={selectedEntregadorId && activeDeliveriesByEntregador[selectedEntregadorId] ? [activeDeliveriesByEntregador[selectedEntregadorId].lat, activeDeliveriesByEntregador[selectedEntregadorId].lon] : undefined}
            route={selectedDeliveryPerson?.current_latitude && selectedDeliveryPerson?.current_longitude && selectedEntregadorId && activeDeliveriesByEntregador[selectedEntregadorId] ? [
              [selectedDeliveryPerson.current_latitude, selectedDeliveryPerson.current_longitude],
              [activeDeliveriesByEntregador[selectedEntregadorId].lat, activeDeliveriesByEntregador[selectedEntregadorId].lon],
            ] : undefined}
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Pedidos</div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhum pedido</div>
        ) : (
          <div className="divide-y">
            {items.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{p.numero || p.id}</div>
                  <div className="text-sm text-slate-600">{[p.status || '', p.valor_total != null ? `R$ ${p.valor_total}` : '', p.origem || ''].filter(Boolean).join(' • ')}</div>
                  <div className="text-xs text-slate-700">{p.item_descricao || ''}</div>
                  <div className="text-xs text-slate-700">{p.endereco_texto || ''}</div>
                </div>
                <div className="text-right">
                  {(() => { const info = entregaInfo(p); return (
                    <>
                      <div className="text-xs text-slate-600">Entrega: {info.status}</div>
                      <div className="text-xs text-slate-600">Entregador: {info.entregador || '-'}</div>
                      <button onClick={() => setSelectedPedidoId(p.id)} className="mt-1 text-xs text-sky-700">Selecionar</button>
                      <button onClick={() => handleDelete(p.id)} className="mt-1 text-xs text-red-700">Excluir pedido</button>
                    </>
                  ); })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
