import { useEffect, useState } from 'react';
import { Filter, Users } from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import { MapView, MapDeliveryPerson } from './MapView';
import { DeliveryPersonCard } from './DeliveryPersonCard';
import { getCoordsFromAddress } from '../utils/geo';
import type { Database } from '../lib/database.types';
type Entregador = Database['public']['Tables']['entregadores']['Row'];

export function OperationsDashboard() {
  const [deliveryPersons, setDeliveryPersons] = useState<MapDeliveryPerson[]>([]);
  const [filteredPersons, setFilteredPersons] = useState<MapDeliveryPerson[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [onlineFilter, setOnlineFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedEntregadorId, setSelectedEntregadorId] = useState<string | undefined>(undefined);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-22.9099, -47.0626]);
  const [storeLocation, setStoreLocation] = useState<[number, number] | undefined>(undefined);

  useEffect(() => {
    const loadComercioAddress = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('role, cliente_id')
        .eq('id', user.id)
        .single();

      if (userData?.role === 'cliente' && userData.cliente_id) {
        const { data: cliente } = await supabase
          .from('clientes')
          .select('rua, numero, bairro, cidade, cep')
          .eq('id', userData.cliente_id)
          .single();

        if (cliente) {
          const fullAddress = `${cliente.rua}, ${cliente.numero} - ${cliente.bairro}, ${cliente.cidade}`;
          const coords = await getCoordsFromAddress(fullAddress);
          if (coords) {
            setMapCenter(coords);
            setStoreLocation(coords);
          }
        }
      }
    };
    loadComercioAddress();
  }, []);

  useEffect(() => {
    fetchDeliveryPersons();

    const channel = supabase
      .channel('operations-entregadores-status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'entregadores' },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;
          setDeliveryPersons(prev =>
            prev.map(p => {
              if (p.id !== updated.id) return p;
              return {
                ...p,
                is_online: updated.is_online === true,
                current_latitude: updated.current_latitude ?? p.current_latitude,
                current_longitude: updated.current_longitude ?? p.current_longitude,
                heading: updated.heading ?? p.heading,
                last_location_update: updated.last_location_update ?? p.last_location_update,
                status: updated.status === 'ativo' ? p.status : 'inativo',
              };
            })
          );
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
      const mapStatus = (val: string): ('disponivel' | 'em_entrega' | 'inativo') | null => {
        switch (val) {
          case 'localizando_entregador':
          case 'aguardando_entregador':
          case 'no_estabelecimento':
          case 'a_caminho_do_cliente':
          case 'chegou_no_cliente':
          case 'retornando_ao_estabelecimento':
          case 'retornou_ao_estabelecimento':
          case 'entrega_em_andamento':
            return 'em_entrega';
          case 'finalizada':
          case 'cancelada':
          case 'devolvido':
            return 'inativo';
          case 'indiferente':
            return null;
          default:
            return null;
        }
      };
      const mapped = mapStatus(statusFilter);
      if (mapped) {
        filtered = filtered.filter((p) => p.status === mapped);
      }
    }

    if (onlineFilter === 'online') {
      filtered = filtered.filter((p) => p.is_online);
    } else if (onlineFilter === 'offline') {
      filtered = filtered.filter((p) => !p.is_online);
    }

    setFilteredPersons(filtered);
  }, [deliveryPersons, statusFilter, onlineFilter]);

  const fetchDeliveryPersons = async () => {
    const withTimeout = <T,>(p: { then: (onFulfilled: (v: T) => unknown, onRejected?: (e: unknown) => unknown) => unknown }, ms: number) =>
      new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), ms);
        p.then((v: T) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e); });
      });
    try {
      const [eRes, dRes] = await Promise.all([
        withTimeout(
          supabase
            .from('entregadores')
            .select('id, nome_completo, email, telefone, status, created_at, updated_at, foto_url, is_online, current_latitude, current_longitude, last_location_update')
            .eq('status', 'ativo')
            .order('nome_completo'),
          8000
        ),
        withTimeout(
          supabase
            .from('nova_entrega')
            .select('entregador_id, status')
            .in('status', [
              'localizando_entregador',
              'aguardando_entregador',
              'no_estabelecimento',
              'a_caminho_do_cliente',
              'chegou_no_cliente',
              'retornando_ao_estabelecimento',
              'retornou_ao_estabelecimento',
              'entrega_em_andamento',
            ]),
          8000
        ),
      ]);
      let entregadores = (eRes as { data?: Entregador[] }).data || [];
      
      // Fallback: Try RPC if empty (assuming RLS might be blocking for 'comercio' role)
      if (entregadores.length === 0) {
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_active_delivery_persons');
          if (!rpcError && rpcData && rpcData.length > 0) {
             entregadores = rpcData;
          }
        } catch (ignore) {}
      }

      const entregasAtivas = new Set(
        (((dRes as { data?: { entregador_id?: string | null }[] }).data) || [])
          .map((x) => (x.entregador_id || '').trim())
          .filter((v) => v)
      );

      const now = Date.now();
      const mapped: MapDeliveryPerson[] = entregadores.map((e) => {
        const ent = e as any;
        const baseStatus = e.status === 'ativo' ? 'disponivel' : 'inativo';
        const status: MapDeliveryPerson['status'] = entregasAtivas.has(e.id) ? 'em_entrega' : baseStatus;
        const is_online = ent.is_online === true;
        
        return {
          id: e.id,
          name: e.nome_completo,
          email: e.email || '',
          phone: e.telefone || '',
          status,
          is_online,
          current_latitude: ent.current_latitude || null,
          current_longitude: ent.current_longitude || null,
          last_location_update: ent.last_location_update || e.updated_at || null,
          created_at: e.created_at,
          updated_at: e.updated_at || e.created_at,
          foto_url: e.foto_url
        };
      });
      setDeliveryPersons(mapped);
      setErrorMessage(null);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      let msg = e?.message || 'Erro ao buscar entregadores';
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/delivery_persons?select=*`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        });
        if (r.ok) {
          const json = await r.json();
          setDeliveryPersons(json as MapDeliveryPerson[]);
          setErrorMessage(null);
          msg = '';
        } else {
          msg = `Falha ${r.status}`;
        }
      } catch (err) { void err; }
      if (msg.toLowerCase().includes('invalid api key')) {
        setErrorMessage('Chave API inválida. Atualize VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
      } else {
        if (msg) setErrorMessage(msg);
      }
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
            <MapView 
              deliveryPersons={filteredPersons} 
              selectedEntregadorId={selectedEntregadorId}
              center={mapCenter}
              origin={!selectedEntregadorId ? storeLocation : undefined}
              originTitle="Minha Loja"
            />
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
                  <option value="indiferente">Indiferente</option>
                  <option value="localizando_entregador">Localizando Entregador</option>
                  <option value="aguardando_entregador">Aguardando Entregador</option>
                  <option value="no_estabelecimento">Entregador no Estabelecimento</option>
                  <option value="a_caminho_do_cliente">Entregador a Caminho do Cliente</option>
                  <option value="chegou_no_cliente">Entregador Chegou no Cliente</option>
                  <option value="retornando_ao_estabelecimento">Entregador retornando ao Estabelecimento</option>
                  <option value="retornou_ao_estabelecimento">Entregador retornou ao Estabelecimento</option>
                  <option value="finalizada">Finalizada</option>
                  <option value="cancelada">Cancelada</option>
                  <option value="devolvido">Devolvido</option>
                  <option value="entrega_em_andamento">Entrega em andamento</option>
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
            {errorMessage && (
              <div className="mb-4 px-3 py-2 rounded border border-red-200 bg-red-50 text-red-700 text-sm">
                {errorMessage}
              </div>
            )}
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
                  <DeliveryPersonCard 
                    key={person.id} 
                    person={person} 
                    onClick={() => setSelectedEntregadorId(person.id)}
                    isSelected={selectedEntregadorId === person.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}