import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { MapView } from '../MapView';
// import { MapView } from '../MapViewOwnApi'; // Leaflet/OSM — desativado a pedido do cliente, ver conversa sobre Places API

type Pedido = Database['public']['Tables']['nova_entrega']['Row'];
type Cliente = Database['public']['Tables']['clientes']['Row'];

function parseLatLng(s: string | null): [number, number] | null {
  const t = (s || '').trim();
  const m = t.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  return null;
}

export function RoteirizacaoReport() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [dataRef, setDataRef] = useState<string>('');
  const [items, setItems] = useState<Pedido[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('clientes').select('id,nome_completo').order('nome_completo').then(({ data }) => setClientes((data || []) as Cliente[]));
  }, []);

  const fetchEntregas = async () => {
    setLoading(true);
    setError(null);
    const filtros: any = {};
    if (clienteId) filtros.cliente_id = clienteId;
    const { data, error } = await supabase
      .from('nova_entrega')
      .select('*')
      .eq('status', 'criada')
      .order('created_at');
    if (error) setError(error.message);
    setItems((data || []) as Pedido[]);
    setLoading(false);
  };

  useEffect(() => { fetchEntregas(); }, [clienteId, dataRef]);

  const pontos = useMemo(() => {
    const arr: Array<{ id: string; destino: [number, number] | null; texto: string }> = [];
    for (const p of items) {
      const coords = parseLatLng(p.entrega_endereco_texto || p.coleta_endereco_texto || null);
      arr.push({ id: p.id, destino: coords, texto: (p.entrega_endereco_texto || p.coleta_endereco_texto || '') });
    }
    const comCoords = arr.filter((a) => a.destino);
    const route = comCoords.map((c) => c.destino as [number, number]);
    return { arr, route };
  }, [items]);

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Relatórios • Roteirização de entregas</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Comércio (opcional)</option>
            {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nome_completo}</option>))}
          </select>
          <input type="date" value={dataRef} onChange={(e) => setDataRef(e.target.value)} className="px-3 py-2 border border-slate-300 rounded" />
          <button onClick={fetchEntregas} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">Atualizar</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Entregas</div>
          <div className="divide-y">
            {items.length === 0 ? (
              <div className="p-4 text-slate-600">Nenhuma entrega</div>
            ) : (
              items.map((p, idx) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-medium text-slate-900">{p.id}</div>
                    <div className="text-xs text-slate-600">{(p.entrega_endereco_texto || p.coleta_endereco_texto || '').slice(0, 120)}</div>
                  </div>
                  <div className="text-sm text-slate-700">#{idx + 1}</div>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Mapa (usa coordenadas em texto quando disponíveis)</div>
          <div className="h-[420px]">
            <MapView deliveryPersons={[]} destination={pontos.route[0] || null} route={pontos.route} />
          </div>
          {pontos.route.length === 0 && (
            <div className="px-4 py-3 text-xs text-slate-600">Para exibir o trajeto, inclua "lat,lng" no endereço de coleta/entrega.</div>
          )}
        </div>
      </div>
    </div>
  );
}
