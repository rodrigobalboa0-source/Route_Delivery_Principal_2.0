import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getCoordsFromAddress, getDrivingRouteDistance, getDistanceFromLatLonInKm } from '../../utils/geo';
import { MapView, MapDeliveryPerson } from '../MapView';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';
import { format } from 'date-fns';
import { Trash2, User, CheckCircle, Truck, Plus, ArrowRight, MapPin, Settings, Edit, FileText, CheckSquare, Link, Clock, Copy, MoreVertical, X, RefreshCw, Ban, RotateCcw, MessageSquare, UserCog, Store, Search } from 'lucide-react';
import { IfoodService } from '../../services/ifoodService';

type Cliente = { 
  id: string; 
  nome_completo: string;
  telefone?: string | null;
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  cep?: string;
};

type Pedido = Database['public']['Tables']['pedidos']['Row'];
type Entrega = Database['public']['Tables']['nova_entrega']['Row'];
type Entregador = Database['public']['Tables']['entregadores']['Row'];
type DeliveryPerson = Database['public']['Tables']['delivery_persons']['Row'];
type DeliveryLog = Database['public']['Tables']['delivery_logs']['Row'] & { created_by_user?: { email: string } };

interface PedidosPanelProps {
  onNavigate?: (menu: string, params?: any) => void;
  userRole?: 'admin' | 'operador' | 'cliente' | 'entregador' | 'loading';
  userId?: string;
}


interface AddressSuggestion {
  display_name: string;
  lat?: string;
  lon?: string;
}

function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  containerClassName,
  onSelectCoords,
  onSuggestCoords,
}: {
  value: string,
  onChange: (val: string) => void,
  placeholder: string,
  containerClassName?: string,
  onSelectCoords?: (coords: [number, number] | undefined) => void,
  onSuggestCoords?: (coords: [number, number] | undefined, typedText: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const requestSeqRef = useRef(0);
  const cacheRef = useRef<Map<string, AddressSuggestion[]>>(new Map());
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [didSearch, setDidSearch] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const selectSuggestion = (s: AddressSuggestion) => {
    onChange(s.display_name);
    if (onSelectCoords) {
      const lat = Number(s.lat);
      const lon = Number(s.lon);
      onSelectCoords(!Number.isNaN(lat) && !Number.isNaN(lon) ? [lat, lon] : undefined);
    }
    setOpen(false);
    setActiveIndex(-1);
  };

  useEffect(() => {
    const trimmed = (value || '').trim();
    if (!open || trimmed.length < 3) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      setSuggestionsError(null);
      return;
    }

    const timer = setTimeout(async () => {
      const seq = ++requestSeqRef.current;
      const normalizedKey = trimmed
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

      const cached = cacheRef.current.get(normalizedKey);
      if (cached) {
        setSuggestions(cached);
        setLoadingSuggestions(false);
        setSuggestionsError(null);
        setDidSearch(true);
        return;
      }

      setLoadingSuggestions(true);
      setSuggestionsError(null);
      setDidSearch(true);

      try {
        let query = trimmed;
        const queryNormalized = query
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();

        const regionCities = [
          'campinas',
          'valinhos',
          'vinhedo',
          'hortolandia',
          'hortolândia',
          'sumare',
          'sumaré',
          'paulinia',
          'paulínia',
          'indaiatuba',
          'jaguariuna',
          'jaguariúna',
          'monte mor',
          'itupeva',
        ];

        const hasCityHint = regionCities.some((c) => queryNormalized.includes(c));
        const hasStateHint = queryNormalized.includes(', sp') || queryNormalized.includes(' sao paulo') || queryNormalized.includes('são paulo');
        if (!hasCityHint && !hasStateHint) {
          query = `${query}, Campinas, SP`;
        }

        const callProxy = async (bounded: boolean) => {
          const { data, error } = await supabase.functions.invoke('geocode', {
            body: { q: query, limit: 8, bounded },
          });
          if (error) return { ok: false as const, results: [] as any[] };
          const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
          return { ok: true as const, results };
        };

        const callDirect = async (bounded: boolean) => {
          const viewbox = '-47.60,-22.55,-46.60,-23.35';
          const url =
            `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}` +
            `&addressdetails=1&limit=8&countrycodes=br` +
            (bounded ? `&bounded=1&viewbox=${viewbox}` : '');
          const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
          if (!res.ok) return [] as any[];
          const data = await res.json();
          return Array.isArray(data) ? data : [];
        };

        const first = await callProxy(true);
        let results = first.ok ? first.results : [];
        if (results.length === 0) {
          results = (await callProxy(false)).results;
        }
        if (results.length === 0) {
          results = await callDirect(true);
          if (results.length === 0) results = await callDirect(false);
        }

        if (seq !== requestSeqRef.current) return;

        const campinasCenter: [number, number] = [-22.9056, -47.0608];
        const deg2rad = (deg: number) => deg * (Math.PI / 180);
        const haversineKm = (a: [number, number], b: [number, number]) => {
          const R = 6371;
          const dLat = deg2rad(b[0] - a[0]);
          const dLon = deg2rad(b[1] - a[1]);
          const x =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(a[0])) * Math.cos(deg2rad(b[0])) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
          return R * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
        };

        const suggestionsScored = (Array.isArray(results) ? results : [])
          .map((item: any) => {
            const addr = item.address || {};
            const road = addr.road || addr.pedestrian || addr.street || item.name || '';
            const district = addr.suburb || addr.neighbourhood || addr.city_district || '';
            const city = addr.city || addr.town || addr.municipality || addr.village || '';
            const state = addr.state || '';

            const lat = typeof item.lat === 'string' ? item.lat : undefined;
            const lon = typeof item.lon === 'string' ? item.lon : undefined;

            const parts = [
              road || '',
              district ? ` - ${district}` : '',
              city ? ` - ${city}` : '',
              state ? ` - ${state}` : '',
            ].join('');

            const display =
              (road ? parts : (item.display_name || '')).replace(/, ,/g, ',').replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();

            const cityNorm = String(city || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase();

            let score = 0;
            if (cityNorm.includes('campinas')) score += 50;
            else if (cityNorm) score += 20;
            if (district) score += 3;
            if (typeof item.importance === 'number') score += item.importance * 10;

            const nLat = Number(lat);
            const nLon = Number(lon);
            if (!Number.isNaN(nLat) && !Number.isNaN(nLon)) {
              const dist = haversineKm(campinasCenter, [nLat, nLon]);
              score += Math.max(0, 40 - dist);
            }

            return { display_name: display, lat, lon, score };
          })
          .filter((s: any) => !!s.display_name)
          .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
          .map((s: any) => ({ display_name: s.display_name, lat: s.lat, lon: s.lon } as AddressSuggestion));

        const deduped: AddressSuggestion[] = [];
        const seen = new Set<string>();
        for (const s of suggestionsScored) {
          const k = s.display_name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ');
          if (seen.has(k)) continue;
          seen.add(k);
          deduped.push(s);
        }

        cacheRef.current.set(normalizedKey, deduped);
        setSuggestions(deduped);

        if (onSuggestCoords && trimmed.length >= 6) {
          const top = deduped[0];
          const lat = Number(top?.lat);
          const lon = Number(top?.lon);
          const coords = !Number.isNaN(lat) && !Number.isNaN(lon) ? ([lat, lon] as [number, number]) : undefined;
          onSuggestCoords(coords, trimmed);
        }
      } catch (e) {
        setSuggestions([]);
        setSuggestionsError('Falha ao buscar endereços. Tente novamente.');
      } finally {
        const isLatest = seq === requestSeqRef.current;
        if (isLatest) setLoadingSuggestions(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [value, open]);

  const trimmedValue = (value || '').trim();

  return (
    <div ref={containerRef} className={`relative ${containerClassName || ''}`}>
      <input
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onSelectCoords?.(undefined);
          setActiveIndex(-1);
          setOpen(true);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'Escape') {
            setOpen(false);
            setActiveIndex(-1);
            return;
          }
          if (suggestions.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((v) => (v + 1) % suggestions.length);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((v) => (v <= 0 ? suggestions.length - 1 : v - 1));
            return;
          }
          if (e.key === 'Enter') {
            if (activeIndex >= 0 && activeIndex < suggestions.length) {
              e.preventDefault();
              selectSuggestion(suggestions[activeIndex]);
            }
          }
        }}
        placeholder={placeholder}
        className="w-full border rounded p-2"
      />
      {open && trimmedValue.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded shadow-lg overflow-hidden">
          {trimmedValue.length < 3 ? (
            <div className="px-3 py-2 text-sm text-slate-500">Digite pelo menos 3 caracteres</div>
          ) : loadingSuggestions ? (
            <div className="px-3 py-2 text-sm text-slate-500">Buscando endereços...</div>
          ) : suggestionsError ? (
            <div className="px-3 py-2 text-sm text-red-700">{suggestionsError}</div>
          ) : suggestions.length === 0 && didSearch ? (
            <div className="px-3 py-2 text-sm text-slate-500">Nenhum endereço encontrado. Tente incluir bairro ou número.</div>
          ) : (
            <ul className="max-h-60 overflow-auto">
              {suggestions.map((s, i) => (
                <li
                  key={`${s.display_name}-${i}`}
                  className={`px-3 py-2 cursor-pointer text-sm ${
                    i === activeIndex ? 'bg-sky-50 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSuggestion(s);
                  }}
                >
                  {s.display_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PedidoEditForm({ pedido, entrega, onClose, onSave }: { pedido: Pedido, entrega?: Entrega, onClose: () => void, onSave: () => void }) {
  const [formData, setFormData] = useState<Partial<Pedido>>({ ...pedido });
  const [entregaData, setEntregaData] = useState<Partial<Entrega>>(entrega || {});
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {


      const validStatuses = ['criado', 'confirmado', 'em_preparo', 'pronto', 'cancelado', 'entregue'];
      let statusForPedido = formData.status;

      if ((statusForPedido as any) === 'em_rota') {
          statusForPedido = 'pronto';
      }
      
      if (!validStatuses.includes(statusForPedido as any)) {
          console.warn('Invalid status detected:', statusForPedido);
          statusForPedido = 'confirmado'; 
      }

      const pedidoPayload = {
          id: pedido.id,
          cliente_id: pedido.cliente_id,
          endereco_id: pedido.endereco_id,
          numero: formData.numero,
          item_descricao: formData.item_descricao,
          valor_total: formData.valor_total,
          observacoes: formData.observacoes,
          endereco_texto: formData.endereco_texto,
          status: statusForPedido,
          origem: pedido.origem || 'manual'
      };

      const { error: pError } = await supabase.from('pedidos').upsert(pedidoPayload);

      if (pError) throw pError;

      
      if (formData.status !== pedido.status) {
         let action = '';
         if (formData.status === 'confirmado') action = 'confirm';
         if (formData.status === 'em_preparo') action = 'startPreparation';
         if (formData.status === 'pronto') action = 'readyToPickup';
         if (formData.status === 'cancelado') action = 'requestCancellation';
         
         if (action) {
             supabase.functions.invoke('ifood-update-status', {
                 body: { action, orderId: pedido.id }
             }).then(({ error }) => {
                 if (error) console.warn('iFood update failed', error);
             });
         }
      }

      
      if (entrega) {
        let newEntregaStatus = entregaData.status;
        
        
        if (formData.status === 'entregue') newEntregaStatus = 'entregue';
        if (formData.status === 'cancelado') newEntregaStatus = 'cancelada';

        const { error: eError } = await supabase.from('nova_entrega').update({
          pedido_id: pedido.id, 
          coleta_endereco_texto: entregaData.coleta_endereco_texto,
          entrega_endereco_texto: entregaData.entrega_endereco_texto,
          status: newEntregaStatus,
          valor_entrega: entregaData.valor_entrega,
          observacoes: entregaData.observacoes
        }).eq('id', entrega.id);
        
        if (eError) throw eError;
      }

      onSave();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar alterações');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Editar Pedido</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Número</label>
          <input 
            type="text" 
            className="w-full border rounded p-2" 
            value={formData.numero || ''} 
            onChange={e => setFormData({...formData, numero: e.target.value})}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Status</label>
          <select 
            className="w-full border rounded p-2" 
            value={formData.status || 'criado'} 
            onChange={e => setFormData({...formData, status: e.target.value as any})}
          >
            <option value="criado">Criado</option>
            <option value="confirmado">Confirmado</option>
            <option value="em_preparo">Em Preparo</option>
            <option value="pronto">Pronto</option>
            <option value="em_rota">Em Rota (Entrega)</option>
            <option value="entregue">Entregue</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700">Descrição do Item</label>
          <input 
            type="text" 
            className="w-full border rounded p-2" 
            value={formData.item_descricao || ''} 
            onChange={e => setFormData({...formData, item_descricao: e.target.value})}
          />
        </div>
        <div className="col-span-2">
           <label className="block text-sm font-medium text-slate-700">Endereço de Coleta (Origem)</label>
           <AddressAutocomplete 
             value={entregaData.coleta_endereco_texto || ''}
             onChange={val => setEntregaData({...entregaData, coleta_endereco_texto: val})}
             placeholder="Endereço de retirada"
           />
        </div>
        <div className="col-span-2">
           <label className="block text-sm font-medium text-slate-700">Endereço de Entrega (Destino)</label>
           <AddressAutocomplete 
             value={entregaData.entrega_endereco_texto || formData.endereco_texto || ''}
             onChange={val => {
                setEntregaData({...entregaData, entrega_endereco_texto: val});
                setFormData({...formData, endereco_texto: val});
             }}
             placeholder="Endereço de entrega"
           />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Valor Total (R$)</label>
          <input 
            type="number" 
            className="w-full border rounded p-2" 
            value={formData.valor_total || 0} 
            onChange={e => setFormData({...formData, valor_total: parseFloat(e.target.value)})}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Valor Entrega (R$)</label>
          <input 
            type="number" 
            className="w-full border rounded p-2" 
            value={entregaData.valor_entrega || 0} 
            onChange={e => setEntregaData({...entregaData, valor_entrega: parseFloat(e.target.value)})}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700">Observações</label>
          <textarea 
            className="w-full border rounded p-2" 
            rows={3}
            value={formData.observacoes || ''} 
            onChange={e => setFormData({...formData, observacoes: e.target.value})}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
        <button onClick={handleSave} disabled={loading} className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700">
          {loading ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>
    </div>
  );
}

function PedidoDetailsView({ pedido, entrega, cliente, onClose }: { pedido: Pedido, entrega?: Entrega, cliente?: Cliente, onClose: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <h3 className="text-xl font-bold text-slate-800">Detalhes do Pedido #{pedido.numero || pedido.id.slice(0,6)}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-lg">
            <h4 className="font-semibold text-slate-700 mb-2 flex items-center gap-2"><User size={16}/> Cliente</h4>
            <p className="text-sm font-medium">{cliente?.nome_completo || 'Cliente não identificado'}</p>
            <p className="text-sm text-slate-500">{cliente?.telefone || '-'}</p>
          </div>
          
          <div className="bg-slate-50 p-4 rounded-lg">
            <h4 className="font-semibold text-slate-700 mb-2 flex items-center gap-2"><FileText size={16}/> Informações do Pedido</h4>
            <div className="space-y-2 text-sm">
              <p><span className="text-slate-500">Item:</span> {pedido.item_descricao || '-'}</p>
              <p><span className="text-slate-500">Valor Pedido:</span> R$ {pedido.valor_total?.toFixed(2) || '0.00'}</p>
              <p><span className="text-slate-500">Status:</span> {pedido.status.toUpperCase()}</p>
              <p><span className="text-slate-500">Criado em:</span> {format(new Date(pedido.created_at), 'dd/MM/yyyy HH:mm')}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-lg">
            <h4 className="font-semibold text-slate-700 mb-2 flex items-center gap-2"><Truck size={16}/> Entrega</h4>
            <div className="space-y-2 text-sm">
              <p><span className="text-slate-500">Status Entrega:</span> {entrega?.status?.toUpperCase() || '-'}</p>
              <p><span className="text-slate-500">Valor Entrega:</span> R$ {entrega?.valor_entrega?.toFixed(2) || '0.00'}</p>
              <p><span className="text-slate-500">Modal:</span> {entrega?.modal_tipo || '-'}</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-lg">
            <h4 className="font-semibold text-slate-700 mb-2 flex items-center gap-2"><MapPin size={16}/> Endereços</h4>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-bold text-emerald-600">COLETA</p>
                <p>{entrega?.coleta_endereco_texto || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-blue-600">ENTREGA</p>
                <p>{entrega?.entrega_endereco_texto || pedido.endereco_texto || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {pedido.observacoes && (
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
          <h4 className="font-semibold text-yellow-800 mb-1">Observações</h4>
          <p className="text-sm text-yellow-700">{pedido.observacoes}</p>
        </div>
      )}
    </div>
  );
}

function PedidoHistoryModal({ pedido, entregaId }: { pedido: Pedido, entregaId?: string }) {
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (entregaId) {
        setLoading(true);
        supabase.from('delivery_logs')
            .select('*, created_by_user:created_by(email)')
            .eq('delivery_id', entregaId)
            .order('created_at', { ascending: false })
            .then(({ data, error }) => {
                if (!error) setLogs((data || []) as DeliveryLog[]);
                setLoading(false);
            });
    }
  }, [entregaId]);

  const hasUpdate = pedido.updated_at && pedido.updated_at !== pedido.created_at;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Histórico de Alterações</h3>
      <div className="space-y-4 max-h-[400px] overflow-y-auto">
        
        {loading && <p className="text-sm text-slate-500">Carregando logs...</p>}

        {!loading && logs.map(log => (
             <div key={log.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                    <div className="w-0.5 h-full bg-slate-200"></div>
                </div>
                <div className="pb-4">
                    <p className="text-sm font-medium">{log.action}</p>
                    <p className="text-xs text-slate-500">{format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')} - {log.created_by_user?.email || 'Sistema'}</p>
                    {log.description && <p className="text-xs text-slate-600 mt-1">{log.description}</p>}
                </div>
            </div>
        ))}

        {hasUpdate && (
             <div className="flex gap-3">
                <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <div className="w-0.5 h-full bg-slate-200"></div>
                </div>
                <div className="pb-4">
                    <p className="text-sm font-medium">Última Atualização (Pedido)</p>
                    <p className="text-xs text-slate-500">{format(new Date(pedido.updated_at), 'dd/MM/yyyy HH:mm')}</p>
                </div>
            </div>
        )}

        <div className="flex gap-3">
            <div className="flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <div className="w-0.5 h-full bg-slate-200"></div>
            </div>
            <div className="pb-4">
                <p className="text-sm font-medium">Pedido Criado</p>
                <p className="text-xs text-slate-500">{format(new Date(pedido.created_at), 'dd/MM/yyyy HH:mm')}</p>
            </div>
        </div>
      </div>
    </div>
  );
}


export function PedidosPanel({ onNavigate, userRole, userId }: PedidosPanelProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [items, setItems] = useState<Pedido[]>([]);
  const [allItems, setAllItems] = useState<Pedido[]>([]);
  const [entregasMap, setEntregasMap] = useState<Record<string, Entrega>>({});
  const [entregadores, setEntregadores] = useState<Record<string, Entregador>>({});
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: 'todos', cliente_id: '', origem: 'todos', de: '', ate: '', cidade: 'todos' });
  const [availableEntregadores, setAvailableEntregadores] = useState<Entregador[]>([]);
  const [mapDeliveryPersons, setMapDeliveryPersons] = useState<MapDeliveryPerson[]>([]);
  
  
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
  const [selectedPedidoForAllocation, setSelectedPedidoForAllocation] = useState<Pedido | null>(null);
  const [selectedEntregadorId, setSelectedEntregadorId] = useState('');
  const [isSwappingFinalized, setIsSwappingFinalized] = useState(false);
  const normalizedUserRole = typeof userRole === 'string' ? userRole : '';
  const isComercio = normalizedUserRole === 'cliente' || normalizedUserRole === '' || normalizedUserRole === 'loading';
  const isAdmin = normalizedUserRole === 'admin' || normalizedUserRole === 'operador';
  const [allowAlocarComercio, setAllowAlocarComercio] = useState(false);
  const [bloquearFinalizarPedido, setBloquearFinalizarPedido] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkAllocation, setIsBulkAllocation] = useState(false);
  const [ibgeCities, setIbgeCities] = useState<string[]>([]);
  
  
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');

  
  const [quickAddress, setQuickAddress] = useState('');
  const [quickNumber, setQuickNumber] = useState('');
  const [quickPaymentMethod, setQuickPaymentMethod] = useState('Dinheiro');
  const [quickRetorno, setQuickRetorno] = useState(false);
  const [comercioAddress, setComercioAddress] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);

  
  const [quickContact, setQuickContact] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickComplement, setQuickComplement] = useState('');
  const [quickDistance, setQuickDistance] = useState<number | null>(null);
  const [quickDistanceLoading, setQuickDistanceLoading] = useState(false);
  const [quickPrice, setQuickPrice] = useState<number>(0);
  const [quickDriverPrice, setQuickDriverPrice] = useState<number>(0);
  const [quickDestinationCoords, setQuickDestinationCoords] = useState<[number, number] | undefined>(undefined);
  const quickDistanceCalcIdRef = useRef(0);
  const pedidosFetchSeqRef = useRef(0);
  const pedidosRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  
  const [pricingTables, setPricingTables] = useState<any[]>([]);
  const [pricingRanges, setPricingRanges] = useState<any[]>([]);
  const [commissionTables, setCommissionTables] = useState<any[]>([]);
  const [commissionRanges, setCommissionRanges] = useState<any[]>([]);
  const [dynamicRules, setDynamicRules] = useState<any[]>([]);
  const [activeDynamicRules, setActiveDynamicRules] = useState<{ name: string; value: number }[]>([]);
  const [clientPricingConfig, setClientPricingConfig] = useState<any[]>([]);
  const [selectedTabelaId, setSelectedTabelaId] = useState<string | null>(null);
  const [pricePerPoint, setPricePerPoint] = useState(0);
  const [pricingMode, setPricingMode] = useState<'Distância' | 'Fixo' | 'Zerar'>('Distância');

  useEffect(() => {
    
    const fetchPricing = async () => {
        const [tp, tpf, dr, tc, tcf] = await Promise.all([
            supabase.from('tabelas_precos').select('*'),
            supabase.from('tabelas_precos_faixas').select('*'),
            supabase.from('preco_dinamico_demanda').select('*'),
            supabase.from('tabelas_comissoes').select('*'),
            supabase.from('tabelas_comissoes_faixas').select('*')
        ]);
        if (tp.data) setPricingTables(tp.data);
        if (tpf.data) setPricingRanges(tpf.data);
        if (tc.data) setCommissionTables(tc.data);
        if (tcf.data) setCommissionRanges(tcf.data);
        if (dr.data) {
            setDynamicRules(dr.data);
            
        }
        if (dr.error) {
            console.error('Error fetching dynamic rules:', dr.error);
        }
    };
    fetchPricing();

    fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios')
        .then(res => res.json())
        .then(data => {
            const cities = data.map((c: any) => c.nome).sort();
            setIbgeCities(cities);
        })
        .catch(err => console.error('Erro ao buscar cidades do IBGE:', err));
  }, []);

  useEffect(() => {
    if (pricingMode !== 'Distância') return;
    if (!pricingTables || pricingTables.length === 0) return;

    const currentValid =
      selectedTabelaId &&
      pricingTables.some((t) => String(t.id) === String(selectedTabelaId));

    if (!currentValid) {
      setSelectedTabelaId(String(pricingTables[0].id));
    }
  }, [pricingMode, pricingTables, selectedTabelaId]);

  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
      const allSelected = items.length > 0 && items.every(i => selectedIds.has(i.id));
      if (allSelected) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(items.map(i => i.id)));
      }
  };

  const handleBulkAllocate = () => {
    if (selectedIds.size === 0) return;
    setIsBulkAllocation(true);
    setSelectedEntregadorId('');
    setIsAllocationModalOpen(true);
  };


  const logAction = async (pedidoId: string, action: string, description: string, oldData?: any, newData?: any) => {
    const entrega = entregasMap[pedidoId];
    if (!entrega) return;
    
    try {
        await supabase.from('delivery_logs').insert({
            delivery_id: entrega.id,
            action,
            description,
            old_data: oldData,
            new_data: newData,
            created_by: userId
        });
    } catch (e) {
        console.error('Error logging action:', e);
    }
  };

  useEffect(() => {
    if (userId) {
      const loadUserRole = async () => {
        const getUserRow = async (id: string) => {
          try {
            const { data } = await supabase.from('users').select('role, cliente_id, email').eq('id', id).maybeSingle();
            return data ?? null;
          } catch (e) {
            void e;
            return null;
          }
        };

        const userRow = (await getUserRow(userId)) ?? null;
        const normalizeEmail = (v: unknown) => {
          const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
          return e || null;
        };
        const isCommerceCandidate =
          normalizedUserRole === 'cliente' ||
          normalizedUserRole === '' ||
          normalizedUserRole === 'loading' ||
          userRow?.role === 'cliente';

        if (!isCommerceCandidate) return;

        let targetClientId: string | null = userRow?.cliente_id ?? null;
        let targetEmail: string | null = normalizeEmail(userRow?.email);

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            targetEmail = targetEmail ?? normalizeEmail(user.email);
            if (!targetClientId) {
              const row = await getUserRow(user.id);
              targetClientId = row?.cliente_id ?? targetClientId;
              targetEmail = normalizeEmail(row?.email) ?? targetEmail;
            }
          }
        } catch (e) {
          void e;
        }

        const clienteSelect = 'id, nome_completo, rua, numero, bairro, cidade, cep, precificacao_config, telefone, observacoes';
        const selectClienteById = async (id: string) => {
          const { data } = await supabase.from('clientes').select(clienteSelect).eq('id', id).maybeSingle();
          return data ?? null;
        };
        const selectClienteByEmail = async (emailRaw: string) => {
          const email = normalizeEmail(emailRaw);
          if (!email) return null;

          const tryEmail = async (pattern: string) => {
            const { data, error } = await supabase.from('clientes').select(clienteSelect).ilike('email', pattern).limit(1);
            if (error) return null;
            return Array.isArray(data) && data.length > 0 ? (data[0] as any) : null;
          };

          const exact = await tryEmail(email);
          if (exact) return exact;

          const contains = await tryEmail(`%${email}%`);
          if (contains) return contains;

          try {
            const { data, error } = await supabase
              .from('clientes')
              .select(clienteSelect)
              .contains('faturamento_emails', [email])
              .limit(1);
            if (!error && Array.isArray(data) && data.length > 0) return data[0] as any;
          } catch (e) {
            void e;
          }

          return null;
        };

        let clienteData: any | null = null;
        if (targetClientId) {
          clienteData = await selectClienteById(targetClientId);
        }
        if (!clienteData && targetEmail) {
          clienteData = await selectClienteByEmail(targetEmail);
          if (clienteData && !targetClientId) targetClientId = clienteData.id;
        }
        if (!clienteData) {
          const { data, error } = await supabase.from('clientes').select(clienteSelect).limit(2);
          if (!error && Array.isArray(data) && data.length === 1) {
            clienteData = data[0] as any;
            if (!targetClientId) targetClientId = String((data[0] as any).id || '');
          }
        }

        if (targetClientId) {
          setFilters(prev => ({ ...prev, cliente_id: targetClientId }));
        }

        if (!clienteData) return;

        if (clienteData.observacoes) {
          try {
            const raw = String(clienteData.observacoes || '').trim();
            if (raw.startsWith('{')) {
              const parsed = JSON.parse(raw);
              setBloquearFinalizarPedido(!!parsed?.extras?.bloquear_finalizar_pedido);
            } else {
              setBloquearFinalizarPedido(false);
            }
          } catch (e) {
            void e;
            setBloquearFinalizarPedido(false);
          }
        } else {
          setBloquearFinalizarPedido(false);
        }

        if (clienteData.precificacao_config) {
          setClientPricingConfig(clienteData.precificacao_config as any);

          const configs = clienteData.precificacao_config as any[];
          const config = configs.find((c: any) => c.modal === 'moto') || configs[0];

          if (config) {
            setPricingMode(config.tipo_precificacao);
            if (config.tipo_precificacao === 'Fixo') {
              setPricePerPoint(Number(config.preco_ponto) || 0);
            } else if (config.tipo_precificacao === 'Distância') {
              setPricePerPoint(0);
              if (config.tabela_id) {
                setSelectedTabelaId(config.tabela_id);
              }
            }
          }
        }

        const hasBaseAddress = !!(clienteData.rua && clienteData.cidade);
        let fallbackAddr: any | null = null;
        if (!hasBaseAddress && (targetClientId || clienteData.id)) {
          const cid = String(targetClientId || clienteData.id);
          const { data } = await supabase
            .from('cliente_enderecos')
            .select('rua, numero, bairro, cidade, cep')
            .eq('cliente_id', cid)
            .order('created_at', { ascending: false })
            .limit(1);
          fallbackAddr = Array.isArray(data) && data.length > 0 ? data[0] : null;
        }

        const addressParts = [
          (fallbackAddr?.rua || clienteData.rua) ?? null,
          (fallbackAddr?.numero || clienteData.numero) ?? null,
          (fallbackAddr?.bairro || clienteData.bairro) ?? null,
          (fallbackAddr?.cidade || clienteData.cidade) ?? null,
          (fallbackAddr?.cep || clienteData.cep) ?? null,
        ].filter(Boolean);

        if (addressParts.length > 0) {
          const fullAddress = addressParts.join(', ');
          setComercioAddress(fullAddress);
          const resolveCoordsWithFallback = async (text: string) => {
            const baseText = String(text || '').trim();
            if (!baseText) return undefined;

            let c = await getCoordsFromAddress(baseText);
            if (c) return c;

            const normalized = baseText.replace(/\s+-\s+/g, ', ');
            const parts = normalized
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean);

            const noCep = parts.filter((p) => !/^\d{5}-?\d{3}$/.test(p));
            const candidates: string[] = [];

            if (noCep.length >= 4) {
              const rua = noCep[0];
              const numero = noCep[1];
              const bairro = noCep[2];
              const cidade = noCep[3];

              candidates.push([rua, numero, bairro, cidade].filter(Boolean).join(', '));
              candidates.push([rua, bairro, cidade].filter(Boolean).join(', '));
              candidates.push([bairro, cidade].filter(Boolean).join(', '));
            }

            if (noCep.length >= 2) {
              candidates.push(noCep.slice(1).join(', '));
              candidates.push(noCep.slice(-2).join(', '));
            }

            const seen = new Set<string>();
            for (const q of candidates) {
              const k = q
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .trim()
                .replace(/\s+/g, ' ');
              if (!k || seen.has(k)) continue;
              seen.add(k);

              c = await getCoordsFromAddress(q);
              if (c) return c;
            }

            return undefined;
          };

          const coords = await resolveCoordsWithFallback(fullAddress);
          if (coords) {
            setOriginCoords(coords);
            setOriginTitle(clienteData.nome_completo || 'Minha Loja');
            setCommerceDefaultCoords(coords);
            setCommerceDefaultTitle(clienteData.nome_completo || 'Minha Loja');
          } else {
            setCommerceDefaultTitle(clienteData.nome_completo || 'Minha Loja');
          }
        } else {
          setCommerceDefaultTitle(clienteData.nome_completo || 'Minha Loja');
        }
      };
      loadUserRole();
      
      
      supabase.from('configuracoes_comercio').select('permitir_alocar_entregador').maybeSingle().then(({ data }) => {
          if (data) {
              setAllowAlocarComercio(data.permitir_alocar_entregador);
          }
      });
    }
  }, [userId, normalizedUserRole]);

  
  const [mapSelectedEntregadorId, setMapSelectedEntregadorId] = useState('');
  const [selectedDeliveryPerson, setSelectedDeliveryPerson] = useState<DeliveryPerson | null>(null);
  const [originCoords, setOriginCoords] = useState<[number, number] | undefined>(undefined);
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | undefined>(undefined);
  const [originTitle, setOriginTitle] = useState<string>('');
  const [destinationTitle, setDestinationTitle] = useState<string>('');
  
  
  const [commerceDefaultCoords, setCommerceDefaultCoords] = useState<[number, number] | undefined>(undefined);
  const [commerceDefaultTitle, setCommerceDefaultTitle] = useState<string>('');
  
  const [menuPos, setMenuPos] = useState<{top?: number, bottom?: number, left: number} | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [statusMenuPos, setStatusMenuPos] = useState<{top?: number, bottom?: number, left: number} | null>(null);
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);

  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);

  
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuId(null);
      setOpenStatusMenuId(null);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleMenuClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setOpenStatusMenuId(null);
    if (openMenuId === id) {
      setOpenMenuId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const screenHeight = window.innerHeight;
    const spaceBelow = screenHeight - rect.bottom;
    const approximateMenuHeight = 320; 

    
    if (spaceBelow < approximateMenuHeight) {
       setMenuPos({
         bottom: screenHeight - rect.top, 
         left: rect.right - 224
       });
    } else {
       setMenuPos({ 
         top: rect.bottom, 
         left: rect.right - 224 
       });
    }
    setOpenMenuId(id);
  };

  const handleStatusMenuClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setOpenMenuId(null);
    if (openStatusMenuId === id) {
      setOpenStatusMenuId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const screenHeight = window.innerHeight;
    const spaceBelow = screenHeight - rect.bottom;
    const approximateMenuHeight = 340;
    const menuWidth = 256;

    if (spaceBelow < approximateMenuHeight) {
      setStatusMenuPos({
        bottom: screenHeight - rect.top,
        left: Math.max(8, rect.left - (menuWidth / 2) + (rect.width / 2))
      });
    } else {
      setStatusMenuPos({
        top: rect.bottom,
        left: Math.max(8, rect.left - (menuWidth / 2) + (rect.width / 2))
      });
    }
    setOpenStatusMenuId(id);
  };

  const handleManualPedidoStatusChange = async (pedidoId: string, newStatus: string) => {
    const nowIso = new Date().toISOString();

    setAllItems(prev => prev.map(p => (p.id === pedidoId ? { ...p, status: newStatus as any, updated_at: nowIso } : p)));
    queueSilentPedidosRefresh();

    const { error } = await supabase
      .from('pedidos')
      .update({ status: newStatus as any, updated_at: nowIso } as any)
      .eq('id', pedidoId);

    if (error) {
      alert('Erro ao atualizar status: ' + error.message);
      queueSilentPedidosRefresh();
      return;
    }

    setOpenStatusMenuId(null);
  };

  const handleManualEntregaStatusChange = async (pedidoId: string, newStatus: string) => {
    const entrega = entregasMap[pedidoId];
    if (!entrega?.id) return;
    const nowIso = new Date().toISOString();

    setEntregasMap(prev => ({ ...prev, [pedidoId]: { ...prev[pedidoId], status: newStatus as any, updated_at: nowIso } as any }));
    queueSilentPedidosRefresh();

    const { error } = await supabase
      .from('nova_entrega')
      .update({ status: newStatus as any, updated_at: nowIso } as any)
      .eq('id', entrega.id);

    if (error) {
      alert('Erro ao atualizar status: ' + error.message);
      queueSilentPedidosRefresh();
      return;
    }

    if (newStatus === 'entregue') {
      void handleManualPedidoStatusChange(pedidoId, 'entregue');
    }

    setOpenStatusMenuId(null);
  };

  const getColetaAddress = (p: Pedido) => {
    const entrega = entregasMap[p.id];
    if (entrega?.coleta_endereco_texto) return entrega.coleta_endereco_texto;
    
    return '-';
  };

  const getEntregaAddress = (p: Pedido) => {
    const entrega = entregasMap[p.id];
    if (entrega?.entrega_endereco_texto) return entrega.entrega_endereco_texto;
    if (p.endereco_texto) return p.endereco_texto;
    return '-';
  };
  
  const handleEdit = (p: Pedido) => { 
    setSelectedPedido(p);
    setIsEditModalOpen(true);
    setOpenMenuId(null); 
  };

  const handleDetails = (p: Pedido) => { 
    setSelectedPedido(p);
    setIsDetailsModalOpen(true);
    setOpenMenuId(null); 
  };

  const handleHistory = (p: Pedido) => {
    setSelectedPedido(p);
    setIsHistoryModalOpen(true);
    setOpenMenuId(null);
  };

  const handleReprocurar = async (pedido: Pedido) => {
    const entrega = entregasMap[pedido.id];
    if (!entrega || !entrega.id) return;

    if (!confirm('Deseja realmente colocar este pedido para reprocura? O entregador atual será removido.')) return;

    try {
        const { error } = await supabase
            .from('nova_entrega')
            .update({
                entregador_id: null,
                status: 'criada',
                atribuicao_modo: 'automatica',
                updated_at: new Date().toISOString()
            })
            .eq('id', entrega.id);

        if (error) throw error;
        
        fetchPedidos();
        setOpenMenuId(null);
    } catch (e) {
        console.error('Erro ao reprocurar:', e);
        alert('Erro ao realizar operação');
    }
  };

  const handleBlacklist = async (pedido: Pedido) => {
      const entrega = entregasMap[pedido.id];
      if (!entrega || !entrega.entregador_id) return;

      if (!confirm('Deseja colocar este entregador na blacklist deste comércio? Ele não receberá mais pedidos desta loja.')) return;

      const motivo = prompt('Motivo do bloqueio (opcional):');

      try {
          const { error } = await supabase.from('entregador_bloqueios_clientes').insert({
              entregador_id: entrega.entregador_id,
              cliente_id: pedido.cliente_id,
              motivo: motivo || null
          });

          if (error) throw error;

          alert('Entregador adicionado à blacklist com sucesso.');
          setOpenMenuId(null);
      } catch (e: any) {
          console.error('Erro ao adicionar à blacklist:', e);
          alert('Erro ao realizar operação: ' + e.message);
      }
  };

  const handleSetReady = async (p: Pedido) => { 
    if (!confirm('Marcar pedido como Pronto?')) return;
    const { error } = await supabase.from('pedidos').update({ status: 'pronto' }).eq('id', p.id);
    if (error) {
        alert('Erro ao atualizar status: ' + error.message);
    } else {
        const nowIso = new Date().toISOString();
        await supabase
            .from('nova_entrega')
            .update({ updated_at: nowIso })
            .eq('pedido_id', p.id);
        fetchPedidos();
    }
    setOpenMenuId(null); 
  };

  const handleFinalizePedido = async (p: Pedido) => {
    if (isComercio && bloquearFinalizarPedido) {
      alert('Seu comércio não tem permissão para finalizar pedidos.');
      return;
    }
    if (!confirm('Finalizar pedido e marcar como Entregue?')) return;
    
    
    const { error: errorPedido } = await supabase.from('pedidos').update({ status: 'entregue' }).eq('id', p.id);
    if (errorPedido) {
        alert('Erro ao atualizar status do pedido: ' + errorPedido.message);
        return;
    }

    
    const { error: errorEntrega } = await supabase.from('nova_entrega').update({ status: 'entregue' }).eq('pedido_id', p.id);
    if (errorEntrega) {
        console.error('Erro ao atualizar entrega:', errorEntrega);
    }

    fetchPedidos();
    setOpenMenuId(null);
  };

  const handleCopyLink = (p: Pedido) => { 
    navigator.clipboard.writeText(`${window.location.origin}/rastreio/${p.id}`);
    alert('Link de rastreio copiado!'); 
    setOpenMenuId(null); 
  };

  const handleClone = async (p: Pedido) => { 
    if (!confirm('Deseja clonar este pedido?')) return;
    try {
        
        const { data: newPedido, error: pError } = await supabase.from('pedidos').insert({
            cliente_id: p.cliente_id,
            endereco_id: p.endereco_id,
            numero: p.numero ? `${p.numero} (Cópia)` : null,
            item_descricao: p.item_descricao,
            endereco_texto: p.endereco_texto,
            origem: 'manual',
            valor_total: p.valor_total,
            status: 'criado',
            observacoes: p.observacoes
        }).select().single();

        if (pError || !newPedido) throw pError;

        
        const entrega = entregasMap[p.id];
        if (entrega) {
           await supabase.from('nova_entrega').insert({
               pedido_id: newPedido.id,
               cliente_id: entrega.cliente_id,
               endereco_id: entrega.endereco_id,
               tipo_servico_id: entrega.tipo_servico_id,
               modal_tipo: entrega.modal_tipo,
               atribuicao_modo: 'manual',
               entregador_id: null, 
               solicitar_comprovante: entrega.solicitar_comprovante,
               valor_manual: entrega.valor_manual,
               valor_entrega: entrega.valor_entrega,
               valor_entregador: entrega.valor_entregador,
               valor_mercadoria: entrega.valor_mercadoria,
               opcionais: entrega.opcionais,
               retorno: entrega.retorno,
               tipo_cobranca: entrega.tipo_cobranca,
               cobrar_destinatario: entrega.cobrar_destinatario,
               coleta_usa_endereco_cadastro: entrega.coleta_usa_endereco_cadastro,
               coleta_contato: entrega.coleta_contato,
               coleta_telefone: entrega.coleta_telefone,
               coleta_cep: entrega.coleta_cep,
               coleta_endereco_texto: entrega.coleta_endereco_texto,
               coleta_complemento: entrega.coleta_complemento,
               coleta_observacoes: entrega.coleta_observacoes,
               entrega_usa_endereco_cadastro: entrega.entrega_usa_endereco_cadastro,
               entrega_contato: entrega.entrega_contato,
               entrega_telefone: entrega.entrega_telefone,
               entrega_cep: entrega.entrega_cep,
               entrega_endereco_texto: entrega.entrega_endereco_texto,
               entrega_complemento: entrega.entrega_complemento,
               entrega_observacoes: entrega.entrega_observacoes,
               status: 'criada'
           });
        }
        fetchPedidos();
        alert('Pedido clonado com sucesso!');
    } catch (e) {
        console.error(e);
        alert('Erro ao clonar pedido.');
    }
    setOpenMenuId(null); 
  };

  
  useEffect(() => {
    const calcId = ++quickDistanceCalcIdRef.current;
    const calculateDistance = async () => {
        if (!quickAddress) {
            setQuickDistance(null);
            setQuickDistanceLoading(false);
            return;
        }

        setQuickDistance(null);
        setQuickDistanceLoading(true);

        try {
            const fullAddress = quickNumber ? `${quickAddress}, ${quickNumber}` : quickAddress;

            let origin = commerceDefaultCoords ?? originCoords;
            if (!origin && comercioAddress) {
                const buildAreaCandidates = (text: string) => {
                    const normalized = String(text || '').replace(/\s+-\s+/g, ', ');
                    const parts = normalized
                        .split(',')
                        .map((p) => p.trim())
                        .filter(Boolean);
                    if (parts.length < 2) return [] as string[];
                    const area = parts.slice(1).join(', ');
                    const candidates: string[] = [area];
                    const areaNorm = area
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase()
                        .trim()
                        .replace(/\s+/g, ' ');
                    if (!areaNorm.includes('campinas')) candidates.push(`${area}, Campinas, SP`);
                    return candidates;
                };

                let coords = await getCoordsFromAddress(comercioAddress);
                if (!coords) {
                    const areaCandidates = buildAreaCandidates(comercioAddress);
                    for (const q of areaCandidates) {
                        coords = await getCoordsFromAddress(q);
                        if (coords) break;
                    }
                }
                if (quickDistanceCalcIdRef.current !== calcId) return;
                if (coords) {
                    origin = coords;
                    setCommerceDefaultCoords(coords);
                }
            }

            if (!origin) return;

            let destCoords = quickDestinationCoords;
            if (!destCoords) {
                let c = await getCoordsFromAddress(fullAddress);
                if (!c && quickNumber) c = await getCoordsFromAddress(quickAddress);
                if (!c) {
                    const normalized = String(quickAddress || '').replace(/\s+-\s+/g, ', ');
                    const parts = normalized
                        .split(',')
                        .map((p) => p.trim())
                        .filter(Boolean);
                    if (parts.length >= 2) {
                        const area = parts.slice(1).join(', ');
                        const candidates: string[] = [area];
                        const areaNorm = area
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .toLowerCase()
                            .trim()
                            .replace(/\s+/g, ' ');
                        if (!areaNorm.includes('campinas')) candidates.push(`${area}, Campinas, SP`);
                        for (const q of candidates) {
                            c = await getCoordsFromAddress(q);
                            if (c) break;
                        }
                    }
                }
                if (c) {
                    destCoords = c;
                    setQuickDestinationCoords(c);
                }
            }
            if (quickDistanceCalcIdRef.current !== calcId) return;
            if (!destCoords) return;

            const points = [
                { lat: origin[0], lon: origin[1] },
                { lat: destCoords[0], lon: destCoords[1] }
            ];

            let dist: number | null = await getDrivingRouteDistance(points);
            if (quickDistanceCalcIdRef.current !== calcId) return;
            if (dist === null) {
                dist = getDistanceFromLatLonInKm(origin[0], origin[1], destCoords[0], destCoords[1]);
            }

            if (dist !== null && !Number.isNaN(dist) && dist > 0) {
                setQuickDistance(parseFloat(dist.toFixed(2)));
            }
        } catch (e) {
            void e;
        } finally {
            if (quickDistanceCalcIdRef.current === calcId) {
                setQuickDistanceLoading(false);
            }
        }
    };
    
    const timer = setTimeout(calculateDistance, 400);
    return () => clearTimeout(timer);
  }, [quickAddress, quickNumber, originCoords, commerceDefaultCoords, comercioAddress, quickDestinationCoords]);

  
    useEffect(() => {
        
        const activeRules = dynamicRules.filter(r => r.ativa);

        const calculatePrice = () => {
            const dist = quickDistance;
            
            let price = 0;
            
            if (pricingMode === 'Fixo') {
                price = pricePerPoint * 2; 
            } else if (pricingMode === 'Zerar') {
                price = 0;
            } else if (pricingMode === 'Distância' && selectedTabelaId) {
                 const tabela = pricingTables.find(t => String(t.id) === String(selectedTabelaId));
                 if (tabela) {
                     const ranges = pricingRanges
                       .filter(f => String(f.tabela_id) === String(selectedTabelaId))
                       .sort((a,b) => a.km_ate - b.km_ate);
                     if (!dist || dist <= 0) {
                         const fallback =
                            (Number(tabela.valor_minimo) > 0 ? Number(tabela.valor_minimo) : 0) ||
                            (ranges.length > 0 && Number(ranges[0].valor) > 0 ? Number(ranges[0].valor) : 0);

                         if (fallback > 0) {
                             price = fallback;
                             const min = Number(tabela.valor_minimo);
                             if (!isNaN(min) && min > 0 && price < min) price = min;
                         }
                    } else {

                     const faixa = ranges.find(f => f.km_ate >= dist);
                     
                     if (faixa) {
                         price = Number(faixa.valor);
                     } else {
                         const lastFaixa = ranges[ranges.length - 1];
                         if (lastFaixa) {
                             const extraKm = dist - Number(lastFaixa.km_ate);
                             price = Number(lastFaixa.valor) + (extraKm * Number(tabela.km_adicional || 0));
                         }
                     }
                     const min = Number(tabela.valor_minimo);
                     if (!isNaN(min) && min > 0 && price < min) price = min;
                    }
                 }
            }
            
            
            if (quickRetorno) {
                 const tabela = pricingTables.find(t => String(t.id) === String(selectedTabelaId));
                 let applied = false;
                 if (tabela) {
                      const valorRetorno = Number(tabela.valor_retorno);
                      if (!isNaN(valorRetorno) && valorRetorno > 0) {
                          const tipo = (tabela.tipo_retorno || '').trim().toLowerCase();
                          if (tipo === 'percentual' || tipo === 'porcentagem') {
                              price += price * (valorRetorno / 100);
                          } else {
                              price += valorRetorno;
                          }
                          applied = true;
                      }
                 }
                 if (!applied) {
                      price = price * 1.20;
                 }
            }

            
            const calculatedActiveRules: { name: string; value: number }[] = [];
            if (activeRules.length > 0) {
                activeRules.forEach(rule => {
                    let addedValue = 0;
                    const criterio = (rule.criterio || '').toUpperCase();
                    
                    if (criterio === 'MULTIPLICADOR' && rule.multiplicador) {
                       const increase = price * (rule.multiplicador - 1);
                       addedValue = increase;
                       price *= rule.multiplicador;
                    } else if (criterio === 'TAXA_FIXA' && rule.multiplicador) {
                       addedValue = rule.multiplicador;
                       price += rule.multiplicador;
                    }
    
                    calculatedActiveRules.push({ name: rule.nome || 'Regra Dinâmica', value: addedValue });
                });
            }
            
            setActiveDynamicRules(calculatedActiveRules);
            setQuickPrice(!isNaN(price) && price > 0 ? price : 0);

            
            let driverPrice = 0;
            const clienteId = filters.cliente_id;
            
            if (clienteId && dist && dist > 0) {
                 const table = commissionTables.find(t => {
                    let ids = t.cliente_ids;
                    if (typeof ids === 'string') {
                        try { const parsed = JSON.parse(ids); if (Array.isArray(parsed)) ids = parsed; } catch (e) {}
                    }
                    if (Array.isArray(ids)) {
                        return ids.some((id: any) => String(id).trim().toLowerCase() === String(clienteId).trim().toLowerCase());
                    }
                    return false;
                 });

                 if (table) {
                     const ranges = commissionRanges.filter(f => f.tabela_id === table.id).sort((a,b) => a.km_ate - b.km_ate);
                     const faixa = ranges.find(f => f.km_ate >= dist);
                     if (faixa) {
                         driverPrice = Number(faixa.valor);
                     } else {
                         const lastFaixa = ranges[ranges.length - 1];
                         if (lastFaixa) driverPrice = Number(lastFaixa.valor);
                     }
                     
                     
                     if (table.valor_por_ponto && table.valor_por_ponto > 0) {
                         driverPrice += Number(table.valor_por_ponto); 
                     }

                     
                     if (quickRetorno && table.valor_retorno && table.valor_retorno > 0) {
                          const tipo = (table.tipo_retorno || '').trim().toLowerCase();
                          if (tipo === 'percentual' || tipo === 'porcentagem') {
                              driverPrice += driverPrice * (Number(table.valor_retorno) / 100);
                          } else {
                              driverPrice += Number(table.valor_retorno);
                          }
                     }
                 }
            }
            setQuickDriverPrice(driverPrice);
        };
    
        calculatePrice();
      }, [quickAddress, quickNumber, quickDistance, quickRetorno, pricingMode, selectedTabelaId, pricingTables, pricingRanges, pricePerPoint, dynamicRules, filters.cliente_id, commissionTables, commissionRanges]);

  const handleViewMap = async (pedido: Pedido) => {
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const resolveCoordsWithFallback = async (text: string) => {
      const baseText = String(text || '').trim();
      if (!baseText) return undefined;

      let c = await getCoordsFromAddress(baseText);
      if (c) return c;

      const normalized = baseText.replace(/\s+-\s+/g, ', ');
      const parts = normalized
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

      if (parts.length >= 2) {
        const area = parts.slice(1).join(', ');
        const candidates: string[] = [area];
        const areaNorm = area
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()
          .replace(/\s+/g, ' ');
        if (!areaNorm.includes('campinas')) candidates.push(`${area}, Campinas, SP`);

        for (const q of candidates) {
          c = await getCoordsFromAddress(q);
          if (c) return c;
        }
      }

      return undefined;
    };

    
    setOriginCoords(undefined);
    setDestinationCoords(undefined);
    setOriginTitle('');
    setDestinationTitle('');
    setMapSelectedEntregadorId('');
    setSelectedDeliveryPerson(null);

    const entrega = entregasMap[pedido.id];

    
    if (entrega?.entregador_id) {
      if (
        !isComercio ||
        ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega', 'coletando', 'entregando'].includes(entrega.status)
      ) {
        setMapSelectedEntregadorId(entrega.entregador_id);
      }
    }

    
    if (entrega?.coleta_endereco_texto) {
      setOriginTitle(entrega.coleta_contato || 'Coleta');
      const coords = await resolveCoordsWithFallback(entrega.coleta_endereco_texto);
      if (coords && isValidCoords(coords)) {
        setOriginCoords(coords);
      } else if (isComercio) {
        if (commerceDefaultCoords) {
          setOriginTitle(commerceDefaultTitle);
          setOriginCoords(commerceDefaultCoords);
        } else if (comercioAddress) {
          setOriginTitle(commerceDefaultTitle || 'Minha Loja');
          const fallbackCoords = await resolveCoordsWithFallback(comercioAddress);
          if (fallbackCoords && isValidCoords(fallbackCoords)) {
            setOriginCoords(fallbackCoords);
            setCommerceDefaultCoords(fallbackCoords);
          }
        }
      }
    } else {
        
        
        if (isComercio) {
          if (commerceDefaultCoords) {
            setOriginTitle(commerceDefaultTitle);
            setOriginCoords(commerceDefaultCoords);
          } else if (comercioAddress) {
            setOriginTitle(commerceDefaultTitle || 'Minha Loja');
            const coords = await resolveCoordsWithFallback(comercioAddress);
            if (coords && isValidCoords(coords)) {
              setOriginCoords(coords);
              setCommerceDefaultCoords(coords);
            }
          }
        } else {
          const cliente = clientes.find(c => c.id === pedido.cliente_id);
          if (cliente) {
            let address = [cliente.rua, cliente.numero, cliente.bairro, cliente.cidade].filter(Boolean).join(', ');
            if (!address) {
              const { data } = await supabase
                .from('cliente_enderecos')
                .select('rua, numero, bairro, cidade')
                .eq('cliente_id', cliente.id)
                .order('created_at', { ascending: false })
                .limit(1);
              const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
              address = [row?.rua, row?.numero, row?.bairro, row?.cidade].filter(Boolean).join(', ');
            }

            if (address) {
              setOriginTitle(cliente.nome_completo);
              const coords = await resolveCoordsWithFallback(address);
              if (coords && isValidCoords(coords)) {
                setOriginCoords(coords);
              }
            }
          }
        }
    }

    
    if (entrega?.entrega_endereco_texto) {
      setDestinationTitle(entrega.entrega_contato || 'Entrega');
      const coords = await resolveCoordsWithFallback(entrega.entrega_endereco_texto);
      if (coords && isValidCoords(coords)) {
        setDestinationCoords(coords);
      }
    } else if (pedido.endereco_texto) {
      setDestinationTitle('Entrega');
      const coords = await resolveCoordsWithFallback(pedido.endereco_texto);
      if (coords && isValidCoords(coords)) {
        setDestinationCoords(coords);
      }
    }
  };

  const isValidCoords = (coords: [number, number]) => {
      return coords[0] >= -90 && coords[0] <= 90 && coords[1] >= -180 && coords[1] <= 180;
  };

  useEffect(() => {
    if (isComercio) {
      void (async () => {
        const normalizeEmail = (v: unknown) => {
          const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
          return e || '';
        };
        let clienteId = '';

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: uRow } = await supabase.from('users').select('cliente_id, email').eq('id', user.id).maybeSingle();
            const userEmail = normalizeEmail((uRow as any)?.email || user.email);

            const rowClientId = String((uRow as any)?.cliente_id || '').trim();
            if (!clienteId && rowClientId) clienteId = rowClientId;

            if (!clienteId) {
              try {
                const { data: resolvedId } = await supabase.rpc('resolve_my_cliente_id');
                if (resolvedId) clienteId = String(resolvedId).trim();
              } catch (e) {
                void e;
              }
            }

            if (!clienteId && userEmail) {
              const { data: byEmail } = await supabase.from('clientes').select('id').ilike('email', userEmail).maybeSingle();
              if ((byEmail as any)?.id) clienteId = String((byEmail as any).id).trim();
            }

            if (!clienteId && userEmail) {
              try {
                const { data: byBilling } = await supabase.from('clientes').select('id').contains('faturamento_emails', [userEmail]).limit(1);
                if (Array.isArray(byBilling) && byBilling[0]?.id) clienteId = String(byBilling[0].id).trim();
              } catch (e) {
                void e;
              }
            }
          }
        } catch (e) {
          void e;
        }

        if (!clienteId) {
          setClientes([]);
          return;
        }

        const { data: cliente, error: clienteError } = await supabase
          .from('clientes')
          .select('id, nome_completo, telefone, rua, numero, bairro, cidade, cep')
          .eq('id', clienteId)
          .maybeSingle();

        if (clienteError?.message) {
          setError(clienteError.message);
          setClientes([]);
          return;
        }

        if (cliente) {
          setClientes([cliente as Cliente]);
          setFilters((prev) => ({ ...prev, cliente_id: String((cliente as any).id || '') }));
        } else {
          setClientes([]);
        }
      })();
    } else {
      fetchClientes();
    }

    fetchEntregadoresList();

    
    const channel = supabase
      .channel('entregadores-location')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entregadores' },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === 'UPDATE') {
            const prev = (oldRecord || null) as Entregador | null;
            const next = (newRecord || null) as Entregador | null;
            if (!next) return;

            const changed =
              !prev ||
              prev.current_latitude !== next.current_latitude ||
              prev.current_longitude !== next.current_longitude ||
              prev.last_location_update !== next.last_location_update ||
              prev.is_online !== next.is_online ||
              prev.status !== next.status ||
              prev.foto_url !== next.foto_url;

            if (!changed) return;
          }

          if (eventType === 'INSERT' || eventType === 'UPDATE') {
             const updatedEntregador = newRecord as Entregador;
             
             setAvailableEntregadores(prev => {
                 const exists = prev.some(e => e.id === updatedEntregador.id);
                 if (exists) {
                     return prev.map(e => e.id === updatedEntregador.id ? updatedEntregador : e);
                 }
                 return [...prev, updatedEntregador];
             });

             setEntregadores(prev => ({
               ...prev,
               [updatedEntregador.id]: updatedEntregador
             }));

             setMapDeliveryPersons(prev => {
               const exists = prev.some(p => p.id === updatedEntregador.id);
               const mappedPerson: MapDeliveryPerson = {
                   id: updatedEntregador.id,
                   name: updatedEntregador.nome_completo,
                   email: updatedEntregador.email || '',
                   phone: updatedEntregador.telefone || '',
                   status: updatedEntregador.status === 'ativo' ? 'disponivel' : 'inativo',
                   is_online: updatedEntregador.is_online || false,
                   current_latitude: updatedEntregador.current_latitude,
                   current_longitude: updatedEntregador.current_longitude,
                   last_location_update: updatedEntregador.last_location_update,
                   created_at: updatedEntregador.created_at,
                   updated_at: updatedEntregador.updated_at,
                   foto_url: updatedEntregador.foto_url
               };

               if (exists) {
                 return prev.map(p => p.id === updatedEntregador.id ? mappedPerson : p);
               }
               return [...prev, mappedPerson];
             });
          } else if (eventType === 'DELETE') {
             const deletedId = oldRecord.id;
             setAvailableEntregadores(prev => prev.filter(e => e.id !== deletedId));
             setEntregadores(prev => {
                 const next = { ...prev };
                 delete next[deletedId];
                 return next;
             });
             setMapDeliveryPersons(prev => prev.filter(p => p.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);



  useEffect(() => {
    const displayedItems = filters.status === 'todos' 
        ? allItems 
        : allItems.filter(p => p.status === filters.status);
    setItems(displayedItems);
  }, [filters.status, allItems]);

  const statusCounters = useMemo(() => {
    const c: Record<string, number> = { criado: 0, confirmado: 0, em_preparo: 0, pronto: 0, cancelado: 0, entregue: 0 };
    for (const p of allItems) { if (p.status && p.status in c) c[p.status]++; }
    return c;
  }, [allItems]);

  const uniqueCidades = useMemo(() => {
    const dbCities = clientes.map(c => c.cidade).filter(Boolean) as string[];
    const combined = new Set([...dbCities, ...ibgeCities]);
    return Array.from(combined).sort();
  }, [clientes, ibgeCities]);

  const onlineEntregadoresCount = availableEntregadores.filter(e => e.is_online).length;
  
  const visibleDeliveryPersons = useMemo(() => {
    if (!isComercio) return mapDeliveryPersons;
    
    const assignedIds = new Set<string>();
    Object.values(entregasMap).forEach(entrega => {
        if (
          entrega.entregador_id &&
          ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega', 'coletando', 'entregando'].includes(entrega.status)
        ) {
            assignedIds.add(entrega.entregador_id);
        }
    });
    
    return mapDeliveryPersons.filter(dp => assignedIds.has(dp.id));
  }, [isComercio, mapDeliveryPersons, entregasMap]);

  const fetchClientes = async () => {
    const { data, error } = await supabase.from('clientes').select('id, nome_completo, telefone, rua, numero, bairro, cidade, cep').order('nome_completo');
    if (error) setError(error.message);
    setClientes(((data || []) as Cliente[]));
  };

  const fetchEntregadoresList = async () => {
    const selectFields = [
      'id',
      'nome_completo',
      'email',
      'telefone',
      'status',
      'is_online',
      'current_latitude',
      'current_longitude',
      'last_location_update',
      'created_at',
      'updated_at',
      'foto_url',
      'veiculo_tipo',
    ].join(', ');

    const { data } = await supabase.from('entregadores').select(selectFields).order('nome_completo');
    setAvailableEntregadores((data || []) as unknown as Entregador[]);
    
    const map: Record<string, Entregador> = {};
    const mapPersons: MapDeliveryPerson[] = [];

    (data || []).forEach((e: any) => { 
        map[e.id] = e;
        
        if (e.current_latitude && e.current_longitude) {
          mapPersons.push({
              id: e.id,
              name: e.nome_completo,
              email: e.email || '',
              phone: e.telefone || '',
              status: e.status === 'ativo' ? 'disponivel' : 'inativo',
              is_online: e.is_online || false,
              current_latitude: e.current_latitude,
              current_longitude: e.current_longitude,
              last_location_update: e.last_location_update,
              created_at: e.created_at,
              updated_at: e.updated_at,
              foto_url: e.foto_url
          });
        }
    });
    setEntregadores(prev => ({ ...prev, ...map }));
    setMapDeliveryPersons(mapPersons);
  };

  const fetchPedidos = useCallback(async (silent = false) => {
    const fetchSeq = ++pedidosFetchSeqRef.current;
    if (!silent) setLoadingList(true);
    setError(null);
    
    if (isComercio && !filters.cliente_id) {
        if (!silent && fetchSeq === pedidosFetchSeqRef.current) {
            setItems([]);
            setAllItems([]);
        }
        return;
    }

    try {
        
        let qPedidos = supabase.from('pedidos').select('*').order('created_at', { ascending: false });
        let qEntregas = supabase.from('nova_entrega').select('*').order('created_at', { ascending: false });

        const isStatusFilter = filters.status !== 'todos';
        const isCityFilter = filters.cidade !== 'todos';
        const isDateFilter = !!filters.de;
        const isClientFilter = filters.cliente_id !== '' && !isComercio;
        const isOriginFilter = filters.origem !== 'todos';
        const hasActiveFilters = isStatusFilter || isCityFilter || isDateFilter || isClientFilter || isOriginFilter;

        if (!hasActiveFilters) {
            qPedidos = qPedidos.neq('status', 'entregue').neq('status', 'cancelado');
            qEntregas = qEntregas.neq('status', 'entregue').neq('status', 'cancelada');
        }

        
        if (filters.cliente_id) {
            qPedidos = qPedidos.eq('cliente_id', filters.cliente_id);
            qEntregas = qEntregas.eq('cliente_id', filters.cliente_id);
        } else if (filters.cidade && filters.cidade !== 'todos') {
            const clientIdsInCity = clientes.filter(c => c.cidade === filters.cidade).map(c => c.id);
            if (clientIdsInCity.length > 0) {
                qPedidos = qPedidos.in('cliente_id', clientIdsInCity);
                qEntregas = qEntregas.in('cliente_id', clientIdsInCity);
            } else {
                qPedidos = qPedidos.in('cliente_id', ['00000000-0000-0000-0000-000000000000']);
                qEntregas = qEntregas.in('cliente_id', ['00000000-0000-0000-0000-000000000000']);
            }
        }
        if (filters.de) {
             qPedidos = qPedidos.gte('created_at', new Date(filters.de).toISOString());
             qEntregas = qEntregas.gte('created_at', new Date(filters.de).toISOString());
        }

        const [resPedidos, resEntregas] = await Promise.all([qPedidos, qEntregas]);
        
        const pedidosList = (resPedidos.data || []) as Pedido[];
        const entregasList = (resEntregas.data || []) as Entrega[];

        
        const eMap: Record<string, Entrega> = {};
        const unlinkedEntregas: Entrega[] = [];

        entregasList.forEach(e => {
            if (e.pedido_id) {
                
                if (!eMap[e.pedido_id]) {
                    eMap[e.pedido_id] = e;
                }
            } else {
                unlinkedEntregas.push(e);
            }
        });

        
        const syntheticPedidos: Pedido[] = unlinkedEntregas.map(e => ({
            id: e.pedido_id || e.id, 
            cliente_id: e.cliente_id,
            endereco_id: e.endereco_id,
            numero: e.entrega_codigo_pedido,
            item_descricao: 'Entrega Direta (Sem Pedido)',
            endereco_texto: e.entrega_endereco_texto,
            origem: 'manual',
            valor_total: e.valor_entrega,
            status: (e.status as any) || 'criado', 
            observacoes: e.observacoes,
            created_at: e.created_at,
            updated_at: e.updated_at
        }));

        const finalPedidos = [...pedidosList, ...syntheticPedidos];

        const finalPedidosSemEntregues = finalPedidos.filter(p => {
            if (hasActiveFilters) return true;

            if (p.status === 'entregue' || p.status === 'cancelado') return false;
            
            const entrega = eMap[p.id];
            if (entrega && (entrega.status === 'entregue' || entrega.status === 'cancelada')) return false;
            
            return true;
        });

        
        unlinkedEntregas.forEach(e => {
            eMap[e.id] = e; 
        });

        if (fetchSeq !== pedidosFetchSeqRef.current) return;
        setAllItems(finalPedidosSemEntregues);
        
        const displayedItems = filters.status === 'todos' 
            ? finalPedidosSemEntregues 
            : finalPedidosSemEntregues.filter(p => p.status === filters.status);
            
        setItems(displayedItems);
        setEntregasMap(eMap);
        
    } catch (e: any) {
        console.error('Fetch error', e);
        if (fetchSeq === pedidosFetchSeqRef.current) setError(e.message);
    } finally {
        if (!silent && fetchSeq === pedidosFetchSeqRef.current) setLoadingList(false);
    }
  }, [filters, clientes, isComercio]);

  const queueSilentPedidosRefresh = useCallback(() => {
    if (pedidosRefreshTimeoutRef.current) return;
    pedidosRefreshTimeoutRef.current = setTimeout(() => {
      pedidosRefreshTimeoutRef.current = null;
      void fetchPedidos(true);
    }, 120);
  }, [fetchPedidos]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  useEffect(() => {
    
    const interval = setInterval(() => {
        queueSilentPedidosRefresh();
    }, 3000);

    return () => clearInterval(interval);
  }, [queueSilentPedidosRefresh]);

  useEffect(() => {
    let interval: any = null;
    let running = false;

    const setupIfoodSync = async () => {
      try {
        const { data, error } = await supabase
          .from('integracoes_ifood')
          .select('id')
          .eq('status', 'ativo')
          .limit(1);

        if (error) {
          console.error('Erro ao verificar integrações iFood ativas:', error);
          return;
        }

        if (!data || data.length === 0) return;

        const runSync = async () => {
          if (running) return;
          running = true;
          try {
            await IfoodService.syncOrders();
            await fetchPedidos(true);
          } catch (e) {
            console.error('Erro ao sincronizar pedidos iFood:', e);
          } finally {
            running = false;
          }
        };

        await runSync();

        interval = setInterval(runSync, 30000);
      } catch (e) {
        console.error('Erro ao iniciar sincronização iFood automática na tela de pedidos:', e);
      }
    };

    setupIfoodSync();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchPedidos]);

  useEffect(() => {
    const channel = supabase
      .channel('realtime-pedidos-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        (payload) => {
          const eventType = (payload as any).eventType as string | undefined;
          if (eventType === 'DELETE') {
            const oldPedido = (payload as any).old as Pedido | undefined;
            if (oldPedido?.id) {
              setAllItems(prev => prev.filter(p => p.id !== oldPedido.id));
            }
          } else {
            const newPedido = (payload as any).new as Pedido | undefined;
            if (newPedido?.id) {
              setAllItems(prev => {
                const idx = prev.findIndex(p => p.id === newPedido.id);
                if (idx === -1) return [newPedido, ...prev];
                return prev.map(p => (p.id === newPedido.id ? { ...p, ...newPedido } : p));
              });
            }
          }
          queueSilentPedidosRefresh();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nova_entrega' },
        (payload) => {
          const eventType = (payload as any).eventType as string | undefined;
          if (eventType === 'DELETE') {
            const oldEntrega = (payload as any).old as Partial<Entrega> | undefined;
            const oldKey = (oldEntrega as any)?.pedido_id || (oldEntrega as any)?.id;
            if (oldKey) {
              setEntregasMap(prev => {
                if (!(oldKey in prev)) return prev;
                const next = { ...prev };
                delete next[oldKey];
                return next;
              });
            }
          } else {
            const newEntrega = (payload as any).new as Entrega | undefined;
            const oldEntrega = (payload as any).old as Partial<Entrega> | undefined;
            const newKey = (newEntrega as any)?.pedido_id || (newEntrega as any)?.id;
            const oldKey = (oldEntrega as any)?.pedido_id || (oldEntrega as any)?.id;
            if (newEntrega && newKey) {
              setEntregasMap(prev => {
                const next = { ...prev, [newKey]: newEntrega };
                if (oldKey && oldKey !== newKey) delete (next as any)[oldKey];
                return next;
              });
            }
          }
          queueSilentPedidosRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queueSilentPedidosRefresh]);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja cancelar este pedido?')) return;
    
    try {
        
        await supabase.from('pedidos').update({ status: 'cancelado' }).eq('id', id);
        
        
        await supabase.from('nova_entrega').update({ status: 'cancelada' }).eq('pedido_id', id);
        await supabase.from('nova_entrega').update({ status: 'cancelada' }).eq('id', id);
        
        await logAction(id, 'CANCELAR_PEDIDO', 'Pedido cancelado via menu', 
            { status: 'ativo' }, 
            { status: 'cancelado' }
        );
        
        fetchPedidos();
        setOpenMenuId(null);
        alert('Pedido cancelado com sucesso!');
    } catch (e) {
        console.error('Erro ao cancelar pedido:', e);
        alert('Erro ao cancelar pedido');
    }
  };

  const handleOpenAllocation = (pedido: Pedido) => {
    setIsBulkAllocation(false);
    const entrega = entregasMap[pedido.id];
    setSelectedPedidoForAllocation(pedido);
    setSelectedEntregadorId(entrega?.entregador_id || '');
    setIsAllocationModalOpen(true);
  };

  const handleQuickAssign = () => {
      const unassigned = items.find(p => {
          const status = p.status;
          if (status === 'entregue' || status === 'cancelado') return false;
          const entrega = entregasMap[p.id];
          return !entrega?.entregador_id;
      });

      if (unassigned) {
          handleOpenAllocation(unassigned);
      } else {
          alert('Não há pedidos pendentes de alocação.');
      }
  };

  const handleEditCommerce = (p: Pedido) => {
    if (onNavigate && p.cliente_id) {
        onNavigate('cadastro_clientes', { editId: p.cliente_id });
    }
  };

  const handleEditDeliverer = (p: Pedido) => {
    const entrega = entregasMap[p.id];
    if (onNavigate && entrega?.entregador_id) {
        onNavigate('cadastro_entregadores', { editId: entrega.entregador_id });
    }
  };

  const handleRevertFinalized = async (p: Pedido) => {
      if (!confirm('Deseja realmente cancelar esta entrega finalizada? O valor será estornado para o comércio.')) return;
      
      const entrega = entregasMap[p.id];
      
      try {
        await supabase.from('pedidos').update({ status: 'cancelado' }).eq('id', p.id);
        
        if (entrega) {
            await supabase.from('nova_entrega').update({ status: 'cancelada' }).eq('id', entrega.id);

            if (entrega.cliente_id && entrega.valor_entrega && entrega.valor_entrega > 0) {
                const { data: cliente } = await supabase
                    .from('clientes')
                    .select('saldo_creditos')
                    .eq('id', entrega.cliente_id)
                    .single();
                
                if (cliente) {
                    const currentSaldo = cliente.saldo_creditos || 0;
                    const newSaldo = currentSaldo + entrega.valor_entrega;
                    
                    await supabase.from('clientes')
                        .update({ saldo_creditos: newSaldo })
                        .eq('id', entrega.cliente_id);
                        
                    await supabase.from('creditos_clientes').insert({
                        cliente_id: entrega.cliente_id,
                        valor: entrega.valor_entrega,
                        tipo: 'estorno',
                        descricao: `Estorno de entrega cancelada #${entrega.id.slice(0, 8)}`,
                        saldo_anterior: currentSaldo,
                        saldo_novo: newSaldo
                    });
                }
            }
        }
        
        await logAction(p.id, 'CANCELAR_FINALIZADA', 'Entrega finalizada cancelada e estornada', 
            { pedido_status: p.status, entrega_status: entrega?.status }, 
            { pedido_status: 'cancelado', entrega_status: 'cancelada' }
        );
        
        fetchPedidos();
        setOpenMenuId(null);
        alert('Entrega cancelada e valor estornado com sucesso!');
      } catch (e) {
          console.error('Erro ao cancelar entrega:', e);
          alert('Erro ao cancelar entrega');
      }
  };

  const handleSwapFinalized = (p: Pedido) => {
      const entrega = entregasMap[p.id];
      setSelectedPedidoForAllocation(p);
      setSelectedEntregadorId(entrega?.entregador_id || '');
      setIsSwappingFinalized(true);
      setIsAllocationModalOpen(true);
      setOpenMenuId(null);
  };

  const handleAddObservation = async (p: Pedido) => {
      const currentObs = p.observacoes || '';
      const newObs = prompt('Escrever Observação:', currentObs);
      if (newObs === null || newObs === currentObs) return;
      
      try {
        await supabase.from('pedidos').update({ observacoes: newObs }).eq('id', p.id);
        await logAction(p.id, 'ALTERAR_OBSERVACAO', `Observação alterada: ${newObs}`, { observacoes: currentObs }, { observacoes: newObs });
        fetchPedidos();
        setOpenMenuId(null);
      } catch (e) {
          console.error('Erro ao adicionar observação:', e);
      }
  };

  const handleSaveAllocation = async () => {
    if (isBulkAllocation) {
        if (!selectedEntregadorId) {
            alert('Selecione um entregador');
            return;
        }

        try {
            const promises = Array.from(selectedIds).map(async (pedidoId) => {
                const entrega = entregasMap[pedidoId];
                if (!entrega) return;

                await supabase.from('nova_entrega').update({
                    entregador_id: selectedEntregadorId,
                    status: 'atribuida'
                }).eq('id', entrega.id);

                await logAction(pedidoId, 'ALOCAR_ENTREGADOR_EM_MASSA', 
                    `Alocação em massa: ${selectedEntregadorId}`, 
                    { status: entrega.status, entregador_id: entrega.entregador_id }, 
                    { status: 'atribuida', entregador_id: selectedEntregadorId });
            });

            await Promise.all(promises);
            
            setIsAllocationModalOpen(false);
            setIsBulkAllocation(false);
            setSelectedIds(new Set());
            fetchPedidos();
            alert('Pedidos alocados com sucesso!');
        } catch (err) {
            alert('Erro ao alocar pedidos em massa');
            console.error(err);
        }
        return;
    }

    if (!selectedPedidoForAllocation) return;
    const entrega = entregasMap[selectedPedidoForAllocation.id];
    
    if (!entrega) {
      alert('Não foi encontrada uma entrega vinculada a este pedido para alocar.');
      return;
    }

    try {
      if (isSwappingFinalized) {
          const oldEntregador = entrega.entregador_id;
          await supabase.from('nova_entrega').update({
            entregador_id: selectedEntregadorId || null,
          }).eq('id', entrega.id);

          await logAction(selectedPedidoForAllocation.id, 'TROCAR_ENTREGADOR_FINALIZADA', 
              `Troca de entregador em entrega finalizada: de ${oldEntregador} para ${selectedEntregadorId}`, 
              { entregador_id: oldEntregador }, { entregador_id: selectedEntregadorId });
              
          alert('Entregador trocado com sucesso.');
      } else {
          await supabase.from('nova_entrega').update({
            entregador_id: selectedEntregadorId || null,
            status: selectedEntregadorId ? 'atribuida' : 'criada'
          }).eq('id', entrega.id);

          await logAction(selectedPedidoForAllocation.id, 'ALOCAR_ENTREGADOR', 
              `Alocação manual: ${selectedEntregadorId || 'removido'}`, 
              { status: entrega.status, entregador_id: entrega.entregador_id }, 
              { status: selectedEntregadorId ? 'atribuida' : 'criada', entregador_id: selectedEntregadorId });
      }
      
      setIsAllocationModalOpen(false);
      setIsSwappingFinalized(false);
      fetchPedidos(); 
    } catch (err) {
      alert('Erro ao salvar alocação');
      console.error(err);
    }
  };

  const handleQuickCreate = async () => {
    if (!quickAddress) {
        alert('Por favor, informe o endereço de entrega.');
        return;
    }

    const fullAddress = quickNumber ? `${quickAddress}, ${quickNumber}` : quickAddress;

    if (!comercioAddress) {
        alert('Endereço do comércio não encontrado. Verifique seu cadastro.');
        return;
    }

    setQuickLoading(true);

    try {
        const clienteId = filters.cliente_id;
            if (!clienteId) throw new Error('Cliente não identificado');

            
            const valorEntrega = quickPrice;
            let createdPedidoId: string | null = null;

            
            const { data: pData, error: pError } = await supabase
                .from('pedidos')
                .insert({
                    cliente_id: clienteId,
                    endereco_texto: fullAddress,
                    origem: 'manual',
                    valor_total: valorEntrega,
                    status: 'criado',
                observacoes: `Pedido Rápido - Pagamento: ${quickPaymentMethod} - Contato: ${quickContact} ${quickPhone ? `(${quickPhone})` : ''}`
            })
            .select()
            .single();

        if (pError) throw pError;
        createdPedidoId = pData.id;

        
        const { error: eError } = await supabase
            .from('nova_entrega')
            .insert({
                pedido_id: pData.id,
                cliente_id: clienteId,
                status: 'criada',
                coleta_endereco_texto: comercioAddress,
                entrega_endereco_texto: fullAddress,
                entrega_contato: quickContact,
                entrega_telefone: quickPhone,
                entrega_complemento: quickComplement,
                distancia_km: quickDistance,
                valor_entrega: valorEntrega,
                valor_entregador: quickDriverPrice,
                retorno: quickRetorno,
                atribuicao_modo: 'manual',
                tipo_cobranca: 'fatura',
                cobrar_destinatario: false
            });

        if (eError) {
            if (createdPedidoId) {
                try {
                    await supabase.from('pedidos').delete().eq('id', createdPedidoId);
                } catch (e) {
                    void e;
                }
            }
            throw eError;
        }

        alert('Pedido criado com sucesso!');
        setQuickAddress('');
        setQuickNumber('');
    
    
    setQuickPaymentMethod('Dinheiro');
    setQuickRetorno(false);

        
        setQuickContact('');
        setQuickPhone('');
        setQuickComplement('');
        setQuickDistance(0);
        setQuickPrice(0);
        
        fetchPedidos();

    } catch (e: any) {
        console.error('Erro ao criar pedido rápido:', e);
        alert('Erro ao criar pedido: ' + e.message);
    } finally {
        setQuickLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      criado: 'bg-slate-100 text-slate-700',
      criada: 'bg-slate-100 text-slate-700',
      confirmado: 'bg-blue-100 text-blue-700',
      em_preparo: 'bg-yellow-100 text-yellow-700',
      pronto: 'bg-green-100 text-green-700',
      cancelado: 'bg-red-100 text-red-700',
      cancelada: 'bg-red-100 text-red-700',
      entregue: 'bg-gray-100 text-gray-700',
      atribuida: 'bg-purple-100 text-purple-700',
      chegou_coleta: 'bg-orange-100 text-orange-700',
      em_rota: 'bg-blue-500 text-white',
      chegou_entrega: 'bg-teal-500 text-white',
    };
    
    const labels: Record<string, string> = {
        criado: 'CRIADO',
        criada: 'CRIADA',
        confirmado: 'CONFIRMADO',
        em_preparo: 'EM PREPARO',
        pronto: 'PRONTO',
        cancelado: 'CANCELADO',
        cancelada: 'CANCELADA',
        entregue: 'ENTREGUE',
        atribuida: 'ATRIBUÍDA',
        chegou_coleta: 'NA LOJA',
        em_rota: 'EM ROTA',
        chegou_entrega: 'NO CLIENTE',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[status] || 'bg-slate-100 text-slate-700'}`}>
        {labels[status] || status?.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Pedidos • Acompanhamento</h2>
        </div>
      </div>

      {/* Quick Launch Bar (Comercio Only) */}
      {isComercio && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <div className="bg-sky-100 p-2 rounded-lg text-sky-600">
                    <Store size={20} />
                </div>
                Lançamento Rápido
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                {/* Row 1 */}
                <div className="md:col-span-4">
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Endereço de Entrega</label>
                    <AddressAutocomplete 
                        value={quickAddress}
                        onChange={setQuickAddress}
                        onSelectCoords={setQuickDestinationCoords}
                        onSuggestCoords={(coords) => {
                          if (!coords) return;
                          setQuickDestinationCoords(coords);
                        }}
                        placeholder="Rua, Bairro..."
                        containerClassName="w-full"
                    />
                </div>

                <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Número</label>
                    <input 
                        type="text"
                        value={quickNumber}
                        onChange={e => setQuickNumber(e.target.value)}
                        placeholder="Nº"
                        className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Complemento</label>
                    <input 
                        type="text"
                        value={quickComplement}
                        onChange={e => setQuickComplement(e.target.value)}
                        placeholder="Apto, Bloco..."
                        className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                    />
                </div>

                <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Nome do Cliente</label>
                    <input 
                        type="text"
                        value={quickContact}
                        onChange={e => setQuickContact(e.target.value)}
                        placeholder="Nome do cliente"
                        className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Telefone</label>
                    <input 
                        type="text"
                        value={quickPhone}
                        onChange={e => setQuickPhone(e.target.value)}
                        placeholder="(00) 00000-0000"
                        className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                    />
                </div>

                {/* Row 2 */}
                <div className="md:col-span-4">
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">
                        Valor Entrega {quickDistance > 0 ? <span className="text-sky-600 font-normal">({quickDistance} km)</span> : quickDistanceLoading ? <span className="text-slate-400 font-normal">(calculando...)</span> : null}
                    </label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400 text-sm">R$</span>
                        <input 
                            type="text"
                            value={quickPrice.toFixed(2).replace('.', ',')}
                            readOnly
                            className="w-full pl-8 pr-3 py-2 border border-slate-200 bg-slate-50 rounded text-slate-600 font-bold outline-none cursor-not-allowed"
                        />
                    </div>
                    {activeDynamicRules.length > 0 && (
                        <div className="mt-1">
                            {activeDynamicRules.map((rule, idx) => (
                                <span key={idx} className="text-[10px] text-amber-600 font-bold block">
                                    {rule.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="md:col-span-4">
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Pagamento</label>
                    <select 
                        value={quickPaymentMethod}
                        onChange={e => setQuickPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 outline-none bg-white h-[42px]"
                    >
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Cartão">Cartão</option>
                        <option value="Pix">Pix</option>
                        <option value="Online">Online</option>
                    </select>
                </div>

                <div className="md:col-span-4 flex justify-end pb-0">
                    <button 
                        onClick={handleQuickCreate}
                        disabled={quickLoading}
                        className="w-full h-[42px] bg-sky-600 hover:bg-sky-700 text-white font-bold rounded transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Lançar Pedido"
                    >
                        {quickLoading ? <RefreshCw className="animate-spin" size={20} /> : <>Lançar Pedido <Plus size={20} /></>}
                    </button>
                </div>
            </div>
            
            <div className="mt-3 flex items-center gap-4">
                 <label className="flex items-center gap-2 cursor-pointer select-none group">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${quickRetorno ? 'bg-sky-600 border-sky-600' : 'border-slate-300 bg-white group-hover:border-sky-400'}`}>
                        {quickRetorno && <CheckSquare size={14} className="text-white" />}
                    </div>
                    <input 
                        type="checkbox"
                        checked={quickRetorno}
                        onChange={e => setQuickRetorno(e.target.checked)}
                        className="hidden"
                    />
                    <span className="text-sm text-slate-600 font-medium group-hover:text-sky-600 transition-colors">Adicionar Retorno</span>
                </label>
                
                <div className="text-xs text-slate-400 ml-auto flex items-center gap-1">
                    <MapPin size={12} />
                    Origem: {comercioAddress || 'Carregando...'}
                </div>
            </div>
        </div>
      )}

      {/* Map View */}
      <div className="bg-white p-1 rounded-lg shadow-sm border border-slate-200">
        <div className="h-[400px] bg-slate-100 rounded-lg overflow-hidden relative">
          <MapView 
            center={[-22.9099, -47.0626]}
            deliveryPersons={visibleDeliveryPersons || []} 
            selectedEntregadorId={mapSelectedEntregadorId}
            origin={originCoords}
            destination={destinationCoords}
            originTitle={originTitle}
            destinationTitle={destinationTitle}
            originIconType={isComercio ? 'store' : 'truck'}
          />
        </div>
      </div>

      {/* Summary Cards & Actions */}
      {!isComercio && (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {!isComercio && (
        <div className="bg-white p-4 rounded-lg border border-slate-200 flex items-center gap-3">
            <div className="bg-slate-50 p-3 rounded-lg text-slate-600">
                <User size={24} />
            </div>
            <div>
                <div className="text-lg font-bold text-slate-800">{onlineEntregadoresCount} Entregadores</div>
                <div className="text-xs text-slate-500">Online</div>
            </div>
        </div>
        )}

        <div className="bg-white p-4 rounded-lg border border-slate-200 flex items-center gap-3">
            <div className="bg-slate-50 p-3 rounded-lg text-slate-600">
                <CheckCircle size={24} />
            </div>
            <div>
                <div className="text-lg font-bold text-slate-800">Todas Finalizadas</div>
                <div className="text-xs text-slate-500">Entregas</div>
            </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 flex items-center gap-3">
            <div className="bg-slate-50 p-3 rounded-lg text-slate-600">
                <Truck size={24} />
            </div>
            <div>
                <div className="text-lg font-bold text-slate-800">Todas Atribuídas</div>
                <div className="text-xs text-slate-500">Alocação</div>
            </div>
        </div>

        <div className="flex gap-2">
             {!isComercio && (
             <button 
                onClick={handleQuickAssign}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg flex items-center justify-center gap-2 shadow-sm"
             >
                <User size={20} />
                Atribuir
             </button>
             )}
             <button 
                onClick={() => onNavigate?.('nova_criar')} 
                className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg flex items-center justify-center gap-2 shadow-sm"
             >
                <Plus size={20} />
                Nova Entrega
             </button>
        </div>
      </div>
      )}

      {/* Filters */}
      {!isComercio && (
      <>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <button 
                className="bg-white border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-slate-200 outline-none text-left flex justify-between items-center"
                onClick={() => setCityModalOpen(true)}
            >
                <span className="truncate block">{filters.cidade === 'todos' ? 'Cidade (Todas)' : filters.cidade}</span>
                <Search size={16} className="text-slate-400 min-w-[16px]" />
            </button>

            {!isComercio && (
            <select 
                className="bg-white border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-slate-200 outline-none"
                value={filters.cliente_id}
                onChange={e => setFilters({...filters, cliente_id: e.target.value})}
            >
                <option value="">Comércio (Todos)</option>
                {clientes
                    .filter(c => filters.cidade === 'todos' || c.cidade === filters.cidade)
                    .map(c => (
                    <option key={c.id} value={c.id}>{c.nome_completo}</option>
                ))}
            </select>
            )}

            <select 
                className="bg-white border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-slate-200 outline-none"
                value={filters.status}
                onChange={e => setFilters({...filters, status: e.target.value})}
            >
                <option value="todos">Status (todos)</option>
                {!isComercio && (
                <>
                <option value="criado">Criado</option>
                <option value="confirmado">Confirmado</option>
                <option value="em_preparo">Em Preparo</option>
                <option value="pronto">Pronto</option>
                <option value="em_rota">Em Rota</option>
                <option value="entregue">Entregue</option>
                </>
                )}
                {isComercio && (
                    <option value="finalizados">Finalizados</option>
                )}
                <option value="cancelado">Cancelado</option>
            </select>

            <select 
                className="bg-white border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-slate-200 outline-none"
                value={filters.origem}
                onChange={e => setFilters({...filters, origem: e.target.value})}
            >
                <option value="todos">Origem (todas)</option>
                <option value="manual">Manual</option>
                <option value="api">Integração</option>
            </select>

            <input 
                type="date" 
                className="bg-white border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-slate-200 outline-none text-slate-500"
                value={filters.de}
                onChange={e => setFilters({...filters, de: e.target.value})}
                placeholder="dd/mm/aaaa"
            />
            <input 
                type="date" 
                className="bg-white border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-slate-200 outline-none text-slate-500"
                value={filters.ate}
                onChange={e => setFilters({...filters, ate: e.target.value})}
                placeholder="dd/mm/aaaa"
            />
      </div>

      <Modal
        open={cityModalOpen}
        onClose={() => setCityModalOpen(false)}
        title="Filtrar por Cidade"
        hideFooter
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Buscar cidade..."
              className="w-full pl-10 p-3 border border-slate-200 rounded-lg outline-none focus:border-sky-500"
              value={citySearch}
              onChange={e => setCitySearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            <button
                onClick={() => {
                    setFilters({...filters, cidade: 'todos', cliente_id: ''});
                    setCityModalOpen(false);
                }}
                className="w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-center justify-between"
            >
                <span className={filters.cidade === 'todos' ? 'font-bold text-sky-600' : 'text-slate-700'}>Cidade (Todas)</span>
                {filters.cidade === 'todos' && <CheckCircle size={16} className="text-sky-600" />}
            </button>
            {uniqueCidades
                .filter(c => c.toLowerCase().includes(citySearch.toLowerCase()))
                .map(c => (
                <button
                    key={c}
                    onClick={() => {
                        setFilters({...filters, cidade: c, cliente_id: ''});
                        setCityModalOpen(false);
                    }}
                    className="w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-center justify-between"
                >
                    <span className={filters.cidade === c ? 'font-bold text-sky-600' : 'text-slate-700'}>{c}</span>
                    {filters.cidade === c && <CheckCircle size={16} className="text-sky-600" />}
                </button>
            ))}
            {uniqueCidades.filter(c => c.toLowerCase().includes(citySearch.toLowerCase())).length === 0 && (
                <div className="p-4 text-center text-slate-500 text-sm">
                    Nenhuma cidade encontrada
                </div>
            )}
          </div>
        </div>
      </Modal>
      </>
      )}

      {/* Status Counters */}
      {!isComercio && (
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {['Criado', 'Confirmado', 'Em Preparo', 'Pronto', 'Cancelado', 'Entregue'].map(status => (
            <div key={status} className="bg-white p-4 rounded-lg border border-slate-200 text-center shadow-sm">
                <div className="text-xs text-slate-500 mb-1">{status}</div>
                <div className="text-2xl font-bold text-slate-800">
                    {statusCounters[status.toLowerCase().replace(' ', '_')] || 0}
                </div>
            </div>
        ))}
      </div>
      )}

      {/* Table */}
      {!isComercio && selectedIds.size > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
                <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded-full">{selectedIds.size}</span>
                <span className="text-emerald-900 font-medium text-sm">pedidos selecionados</span>
            </div>
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => setSelectedIds(new Set())}
                    className="text-slate-500 hover:text-slate-700 text-sm px-3 py-1.5 font-medium"
                >
                    Cancelar
                </button>
                <button 
                    onClick={handleBulkAllocate} 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-1.5 rounded-lg font-medium shadow-sm flex items-center gap-2 transition-colors"
                >
                    <User size={16} />
                    Alocar para Entregador
                </button>
            </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                {!isComercio && (
                <th className="w-12 px-4 py-3 text-center">
                    <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                        checked={items.length > 0 && items.every(i => selectedIds.has(i.id))}
                        onChange={toggleSelectAll}
                    />
                </th>
                )}
                <th className="px-4 py-3">Nº Pedido</th>
                <th className="px-4 py-3">Comércio</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Coleta</th>
                <th className="px-4 py-3">Entrega</th>
                <th className="px-4 py-3">Taxa</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Entregador</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingList ? (
                <tr><td colSpan={!isComercio ? 9 : 8} className="px-4 py-8 text-center text-slate-500">Carregando pedidos...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={!isComercio ? 9 : 8} className="px-4 py-8 text-center text-slate-500">Nenhum pedido encontrado.</td></tr>
              ) : (
                items.map(p => {
                    const cliente = clientes.find(c => c.id === p.cliente_id);
                    const entrega = entregasMap[p.id];
                    const entregador = entrega?.entregador_id ? entregadores[entrega.entregador_id] : null;

                    return (
                        <tr key={p.id} className={`hover:bg-slate-50 transition-colors group ${selectedIds.has(p.id) ? 'bg-emerald-50 hover:bg-emerald-100' : ''}`}>
                            {!isComercio && (
                            <td className="px-4 py-3 text-center">
                                <input 
                                    type="checkbox" 
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                                    checked={selectedIds.has(p.id)}
                                    onChange={() => toggleSelection(p.id)}
                                />
                            </td>
                            )}
                            <td className="px-4 py-3 font-medium text-slate-700">
                                {p.numero || p.id.slice(0, 6)}
                                <div className="text-xs text-slate-400">{format(new Date(p.created_at), 'dd/MM HH:mm')}</div>
                            </td>
                            <td className="px-4 py-3">
                                <div className="font-medium text-slate-800">{cliente?.nome_completo || 'Comércio Desconhecido'}</div>
                                <div className="text-xs text-slate-500">{cliente?.telefone}</div>
                            </td>
                            <td className="px-4 py-3">
                                <div className="font-medium text-slate-800">{entrega?.entrega_contato || 'Cliente Desconhecido'}</div>
                                <div className="text-xs text-slate-500">{entrega?.entrega_telefone}</div>
                            </td>
                            <td className="px-4 py-3 max-w-[200px] truncate" title={getColetaAddress(p)}>
                                {getColetaAddress(p)}
                            </td>
                            <td className="px-4 py-3 max-w-[200px] truncate" title={getEntregaAddress(p)}>
                                {getEntregaAddress(p)}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-700">
                                {entrega?.valor_entrega ? `R$ ${entrega.valor_entrega.toFixed(2)}` : '-'}
                            </td>
                            <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={(e) => handleStatusMenuClick(e, p.id)}
                                  className="inline-flex items-center gap-2 hover:opacity-90"
                                  title="Alterar status"
                                  disabled={userRole === 'entregador'}
                                >
                                  {getStatusBadge(entrega?.status || p.status)}
                                  <Settings size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            </td>
                            <td className="px-4 py-3">
                                {entregador &&
                                (!isComercio ||
                                  ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega', 'coletando', 'entregando', 'entregue', 'finalizada'].includes(
                                    entrega?.status
                                  )) ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
                                            {entregador.foto_url ? (
                                                <img src={entregador.foto_url} alt="" className="w-full h-full object-cover"/>
                                            ) : (
                                                <User size={14} className="text-slate-500"/>
                                            )}
                                        </div>
                                        <span className="text-slate-700">{entregador.nome_completo.split(' ')[0]}</span>
                                    </div>
                                ) : (
                                    (!entregador ||
                                      (isComercio &&
                                        ![
                                          'atribuida',
                                          'chegou_coleta',
                                          'em_rota',
                                          'chegou_entrega',
                                          'coletando',
                                          'entregando',
                                          'entregue',
                                          'finalizada',
                                        ].includes(entrega?.status))) &&
                                      (!isComercio || allowAlocarComercio) && (
                                    <button 
                                        onClick={() => handleOpenAllocation(p)}
                                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded border border-slate-200"
                                    >
                                        Alocar
                                    </button>
                                    )
                                )}
                            </td>
                            <td className="px-4 py-3 relative">
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => handleViewMap(p)}
                                        className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded transition-colors"
                                        title="Ver no Mapa"
                                    >
                                        <MapPin size={18} />
                                    </button>
                                    <button 
                                        onClick={(e) => handleMenuClick(e, p.id)}
                                        className="p-1.5 hover:bg-slate-100 text-slate-500 rounded transition-colors"
                                    >
                                        <MoreVertical size={18} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Action Menu */}
      {openMenuId && menuPos && (
          <div 
            className="fixed bg-white border border-slate-200 rounded-lg shadow-xl z-[9999] py-1 text-left flex flex-col w-56"
            style={{ 
                top: menuPos.top, 
                bottom: menuPos.bottom, 
                left: menuPos.left 
            }}
            onClick={(e) => e.stopPropagation()}
          >
             {(() => {
                 const p = items.find(i => i.id === openMenuId);
                 if (!p) return null;
                 return (
                     <>
                        <button onClick={() => handleEdit(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><Edit size={16}/> Editar</button>
                        <button onClick={() => handleDetails(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><FileText size={16}/> Detalhes</button>
                        {(isAdmin || isComercio) && (
                        <button onClick={() => handleSetReady(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><CheckSquare size={16}/> Pronto</button>
                        )}
                        {(isAdmin || (isComercio && !bloquearFinalizarPedido)) && p.status !== 'entregue' && p.status !== 'cancelado' && (
                          <button
                            onClick={() => handleFinalizePedido(p)}
                            className="px-4 py-2 hover:bg-slate-50 text-sm text-emerald-700 flex items-center gap-2"
                          >
                            <CheckCircle size={16} /> Finalizar pedido
                          </button>
                        )}
                        <button onClick={() => handleCopyLink(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><Link size={16}/> Copiar link de rastreio</button>
                        <button onClick={() => handleHistory(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><Clock size={16}/> Logs</button>
                        <button onClick={() => handleClone(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><Copy size={16}/> Clonar</button>
                        
                        {isAdmin && (
                            <>
                                <button onClick={() => handleAddObservation(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><MessageSquare size={16}/> Escrever Observação</button>
                                <button onClick={() => handleEditCommerce(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><Store size={16}/> Editar Comércio</button>
                                {entregasMap[p.id]?.entregador_id && (
                                    <button onClick={() => handleEditDeliverer(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><UserCog size={16}/> Editar Entregador</button>
                                )}
                                {entregasMap[p.id]?.entregador_id && (
                                     <button onClick={() => handleBlacklist(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-red-600 flex items-center gap-2 border-t border-slate-100 mt-1"><Ban size={16}/> Bloquear Entregador</button>
                                )}
                                {p.status === 'entregue' && (
                                    <>
                                        <button onClick={() => handleRevertFinalized(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-orange-600 flex items-center gap-2 border-t border-slate-100 mt-1"><RotateCcw size={16}/> Cancelar entrega Finalizada</button>
                                        <button onClick={() => handleSwapFinalized(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-blue-600 flex items-center gap-2"><RefreshCw size={16}/> Trocar finalizada</button>
                                    </>
                                )}
                            </>
                        )}

                        {isAdmin && entregasMap[p.id]?.status === 'atribuida' && (
                             <button onClick={() => handleReprocurar(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2 border-t border-slate-100 mt-1"><RefreshCw size={16}/> Reprocurar</button>
                        )}
                        {userRole !== 'entregador' && (
                             <button onClick={() => handleDelete(p.id)} className="px-4 py-2 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2 border-t border-slate-100 mt-1"><Trash2 size={16}/> Cancelar</button>
                        )}
                     </>
                 );
             })()}
          </div>
      )}

      {/* Status Menu */}
      {openStatusMenuId && statusMenuPos && (
        <div
          className="fixed bg-white border border-slate-200 rounded-lg shadow-xl z-[9999] py-1 text-left flex flex-col w-64"
          style={{
            top: statusMenuPos.top,
            bottom: statusMenuPos.bottom,
            left: statusMenuPos.left
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const p = items.find(i => i.id === openStatusMenuId) || allItems.find(i => i.id === openStatusMenuId);
            if (!p) return null;
            const entrega = entregasMap[p.id];

            const pedidoOptions = [
              { value: 'criado', label: 'CRIADO' },
              { value: 'confirmado', label: 'CONFIRMADO' },
              { value: 'em_preparo', label: 'EM PREPARO' },
              { value: 'pronto', label: 'PRONTO' },
              { value: 'entregue', label: 'ENTREGUE' },
              { value: 'cancelado', label: 'CANCELADO' }
            ];

            const entregaOptions = [
              { value: 'criada', label: 'CRIADA' },
              { value: 'atribuida', label: 'ATRIBUÍDA' },
              { value: 'chegou_coleta', label: 'NA LOJA' },
              { value: 'em_rota', label: 'EM ROTA' },
              { value: 'chegou_entrega', label: 'CHEGUEI NO CLIENTE' },
              { value: 'entregue', label: 'ENTREGUE' },
              { value: 'cancelada', label: 'CANCELADA' }
            ];

            const canEditPedido = userRole !== 'entregador' && (isAdmin || isComercio);
            const canEditEntrega = userRole !== 'entregador' && (isAdmin || isComercio);

            const filteredPedidoOptions = isAdmin
              ? pedidoOptions
              : pedidoOptions.filter(o => ['criado', 'confirmado', 'em_preparo', 'pronto'].includes(o.value));

            const filteredEntregaOptions = isAdmin
              ? entregaOptions
              : entregaOptions.filter(o => o.value === 'chegou_entrega');

            return (
              <>
                <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Status do Pedido</div>
                {filteredPedidoOptions.map(opt => {
                  const disabled = !canEditPedido || (opt.value === 'entregue' && !isAdmin) || (opt.value === 'cancelado' && !isAdmin);
                  return (
                    <button
                      key={`p-${opt.value}`}
                      disabled={disabled}
                      onClick={() => handleManualPedidoStatusChange(p.id, opt.value)}
                      className={`px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center justify-between ${
                        disabled ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <span>{opt.label}</span>
                      {p.status === opt.value && <CheckCircle size={16} className="text-emerald-600" />}
                    </button>
                  );
                })}

                {entrega && (
                  <>
                    <div className="border-t border-slate-100 mt-1" />
                    <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Status da Entrega</div>
                    {filteredEntregaOptions.map(opt => {
                      const disabled = !canEditEntrega;
                      return (
                        <button
                          key={`e-${opt.value}`}
                          disabled={disabled}
                          onClick={() => handleManualEntregaStatusChange(p.id, opt.value)}
                          className={`px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center justify-between ${
                            disabled ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          <span>{opt.label}</span>
                          {entrega.status === opt.value && <CheckCircle size={16} className="text-emerald-600" />}
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Allocation Modal */}
      <Modal
        open={isAllocationModalOpen}
        onClose={() => setIsAllocationModalOpen(false)}
        title={isBulkAllocation ? `Alocar ${selectedIds.size} Pedidos` : "Alocar Entregador"}
        onConfirm={handleSaveAllocation}
        confirmText="Confirmar Alocação"
        cancelText="Cancelar"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {isBulkAllocation ? (
                <span>Selecione um entregador para os <strong>{selectedIds.size}</strong> pedidos selecionados.</span>
            ) : (
                <span>Selecione um entregador para o pedido <strong>{selectedPedidoForAllocation?.numero}</strong></span>
            )}
          </p>
          
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {availableEntregadores.map(entregador => (
              <label 
                key={entregador.id} 
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedEntregadorId === entregador.id 
                    ? 'border-emerald-500 bg-emerald-50' 
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input 
                    type="radio" 
                    name="entregador"
                    value={entregador.id}
                    checked={selectedEntregadorId === entregador.id}
                    onChange={(e) => setSelectedEntregadorId(e.target.value)}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="font-medium text-slate-800">{entregador.nome_completo}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${entregador.status === 'ativo' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                        {entregador.status.toUpperCase()}
                    </div>
                  </div>
                </div>
                {entregador.veiculo_tipo && (
                  <span className="text-xs px-2 py-1 bg-slate-100 rounded text-slate-600 uppercase">
                      {entregador.veiculo_tipo}
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="" hideFooter={true}>
         {selectedPedido && (
            <PedidoEditForm 
                pedido={selectedPedido} 
                entrega={entregasMap[selectedPedido.id]}
                onClose={() => setIsEditModalOpen(false)}
                onSave={fetchPedidos}
            />
         )}
      </Modal>

      {/* Details Modal */}
      <Modal open={isDetailsModalOpen} onClose={() => setIsDetailsModalOpen(false)} title="" cancelText="Fechar">
         {selectedPedido && (
            <PedidoDetailsView
                pedido={selectedPedido}
                entrega={entregasMap[selectedPedido.id]}
                cliente={clientes.find(c => c.id === selectedPedido.cliente_id)}
                onClose={() => setIsDetailsModalOpen(false)}
            />
         )}
      </Modal>

      {/* History Modal */}
      <Modal open={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} title="" cancelText="Fechar">
         {selectedPedido && (
             <PedidoHistoryModal
                pedido={selectedPedido}
                entregaId={entregasMap[selectedPedido.id]?.id}
             />
         )}
      </Modal>

    </div>
  );
}
