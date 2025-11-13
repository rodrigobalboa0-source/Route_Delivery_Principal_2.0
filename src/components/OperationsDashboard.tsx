import { useEffect, useState } from 'react';
import { Filter, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MapView } from './MapView';
import { DeliveryPersonCard } from './DeliveryPersonCard';
import type { Database } from '../lib/database.types';

type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];

export function OperationsDashboard() {
  const [deliveryPersons, setDeliveryPersons] = useState<DeliveryPerson[]>([]);
  const [filteredPersons, setFilteredPersons] = useState<DeliveryPerson[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [onlineFilter, setOnlineFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDeliveryPersons();

    const channel = supabase
      .channel('delivery_persons_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_persons',
        },
        () => {
          fetchDeliveryPersons();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let filtered = [...deliveryPersons];

    if (statusFilter !== 'all') {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    if (onlineFilter === 'online') {
      filtered = filtered.filter((p) => p.is_online);
    } else if (onlineFilter === 'offline') {
      filtered = filtered.filter((p) => !p.is_online);
    }

    setFilteredPersons(filtered);
  }, [deliveryPersons, statusFilter, onlineFilter]);

  const fetchDeliveryPersons = async () => {
    try {
      const { data, error } = await supabase
        .from('delivery_persons')
        .select('*')
        .order('name');

      if (error) throw error;
      setDeliveryPersons(data || []);
    } catch (error) {
      console.error('Error fetching delivery persons:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    total: deliveryPersons.length,
    online: deliveryPersons.filter((p) => p.is_online).length,
    disponivel: deliveryPersons.filter((p) => p.status === 'disponivel').length,
    em_entrega: deliveryPersons.filter((p) => p.status === 'em_entrega').length,
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Menu de Operações</h2>
            <p className="text-slate-600 text-sm mt-1">
              Visualização em tempo real dos entregadores
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-sky-50 px-4 py-2 rounded-lg border border-sky-200">
              <div className="text-xs text-sky-600 font-medium">Online</div>
              <div className="text-2xl font-bold text-sky-700">{stats.online}</div>
            </div>
            <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
              <div className="text-xs text-blue-600 font-medium">Em Entrega</div>
              <div className="text-2xl font-bold text-blue-700">{stats.em_entrega}</div>
            </div>
            <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
              <div className="text-xs text-slate-600 font-medium">Total</div>
              <div className="text-2xl font-bold text-slate-700">{stats.total}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-6 overflow-hidden">
          <div className="h-full bg-white rounded-lg border border-slate-200 overflow-hidden">
            <MapView deliveryPersons={filteredPersons} />
          </div>
        </div>

        <div className="w-96 border-l border-slate-200 flex flex-col bg-slate-50">
          <div className="p-4 bg-white border-b border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Filter size={18} className="text-slate-600" />
              <h3 className="font-semibold text-slate-900">Filtros</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">Todos</option>
                  <option value="disponivel">Disponível</option>
                  <option value="em_entrega">Em Entrega</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Conexão
                </label>
                <select
                  value={onlineFilter}
                  onChange={(e) => setOnlineFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">Todos</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} className="text-slate-600" />
              <h3 className="font-semibold text-slate-900">
                Entregadores ({filteredPersons.length})
              </h3>
            </div>

            {loading ? (
              <div className="text-center py-8 text-slate-500">Carregando...</div>
            ) : filteredPersons.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                Nenhum entregador encontrado
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPersons.map((person) => (
                  <DeliveryPersonCard key={person.id} person={person} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
