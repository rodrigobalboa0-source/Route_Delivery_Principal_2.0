import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Database } from '../../lib/database.types';
import { MapView } from '../MapViewOwnApi';

type Entregador = Database['public']['Tables']['entregadores']['Row'];
type Entrega = Database['public']['Tables']['nova_entrega']['Row'];

function parseLatLng(s: string | null): [number, number] | null {
  const t = (s || '').trim();
  const m = t.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  return null;
}

export function TrajetoEntregadoresReport() {
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [selectedEntregadorId, setSelectedEntregadorId] = useState<string>('');
  const [dataSelecionada, setDataSelecionada] = useState(() => new Date().toISOString().split('T')[0]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('entregadores').select('*').order('nome_completo').then(({ data }) => {
      setEntregadores(data || []);
    });
  }, []);

  useEffect(() => {
    if (selectedEntregadorId && dataSelecionada) {
      fetchTrajeto();
    } else {
      setEntregas([]);
    }
  }, [selectedEntregadorId, dataSelecionada]);

  async function fetchTrajeto() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('nova_entrega')
        .select('*')
        .eq('entregador_id', selectedEntregadorId)
        .gte('created_at', `${dataSelecionada}T00:00:00`)
        .lte('created_at', `${dataSelecionada}T23:59:59`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setEntregas(data || []);
    } catch (error) {
      console.error('Erro ao buscar trajeto:', error);
    } finally {
      setLoading(false);
    }
  }

  const routeData = useMemo(() => {
    const points: [number, number][] = [];
    const markers: Array<{ id: string; lat: number; lng: number; label: string }> = [];

    entregas.forEach((entrega, index) => {
      
      let coords = parseLatLng(entrega.entrega_endereco_texto);
      
      
      if (coords) {
        points.push(coords);
        markers.push({
          id: entrega.id,
          lat: coords[0],
          lng: coords[1],
          label: `${index + 1}. ${new Date(entrega.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        });
      }
    });

    return { points, markers };
  }, [entregas]);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Trajeto dos Entregadores (Histórico)</h2>
      
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Entregador</label>
          <select
            value={selectedEntregadorId}
            onChange={(e) => setSelectedEntregadorId(e.target.value)}
            className="border rounded p-2 min-w-[200px]"
          >
            <option value="">Selecione um entregador</option>
            {entregadores.map((ent) => (
              <option key={ent.id} value={ent.id}>{ent.nome_completo}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
          <input
            type="date"
            value={dataSelecionada}
            onChange={(e) => setDataSelecionada(e.target.value)}
            className="border rounded p-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white rounded-lg shadow overflow-hidden h-[500px] overflow-y-auto">
          <div className="p-4 bg-gray-50 border-b">
            <h3 className="font-semibold text-gray-700">Sequência de Entregas</h3>
            <p className="text-xs text-gray-500 mt-1">
              Baseado nas entregas realizadas no dia selecionado.
            </p>
          </div>
          <ul className="divide-y divide-gray-200">
            {loading ? (
              <li className="p-4 text-center text-gray-500">Carregando...</li>
            ) : entregas.length === 0 ? (
              <li className="p-4 text-center text-gray-500">Nenhuma entrega encontrada.</li>
            ) : (
              entregas.map((entrega, index) => {
                const hasCoords = parseLatLng(entrega.entrega_endereco_texto);
                return (
                  <li key={entrega.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(entrega.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {entrega.status}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {entrega.entrega_endereco_texto || 'Endereço não informado'}
                        </p>
                        {!hasCoords && (
                          <span className="text-[10px] text-orange-600 block mt-1">
                            Sem coordenadas (lat,lng) no endereço
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden h-[500px] relative">
          {routeData.points.length > 0 ? (
             <MapView 
               deliveryPersons={[]} 
               route={routeData.points}
               destination={routeData.points[routeData.points.length - 1]} // Center/Focus on last point or route
               center={routeData.points[0]}
             />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-500 p-6 text-center">
              {loading 
                ? 'Carregando mapa...' 
                : 'Selecione um entregador e data para visualizar o trajeto. As entregas precisam ter coordenadas (lat,lng) no campo de endereço.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}