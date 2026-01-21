import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { MapView, MapDeliveryPerson } from '../MapView';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';
import { format } from 'date-fns';
import { Trash2, User, CheckCircle, Truck, Plus, ArrowRight, MapPin, Settings, Edit, FileText, CheckSquare, Link, Clock, Copy, MoreVertical, X, RefreshCw } from 'lucide-react';

type Cliente = { 
  id: string; 
  nome_completo: string;
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

interface PedidosPanelProps {
  onNavigate?: (menu: string) => void;
  userRole?: 'operador' | 'cliente' | 'entregador' | 'loading';
  userId?: string;
}


interface AddressSuggestion {
  display_name: string;
}

function AddressAutocomplete({ value, onChange, placeholder, containerClassName }: { value: string, onChange: (val: string) => void, placeholder: string, containerClassName?: string }) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (value.length > 4 && showSuggestions) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&addressdetails=1&limit=5&countrycodes=br`, {
            headers: { 'User-Agent': 'RouteDeliveryApp/1.0' }
          });
          const data = await res.json();
          setSuggestions(data || []);
        } catch (e) {
          console.error(e);
        }
      } else {
        setSuggestions([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [value, showSuggestions]);

  return (
    <div className={`relative ${containerClassName || ''}`}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        className="w-full border rounded p-2"
      />
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-b shadow-lg max-h-60 overflow-auto mt-1">
          {suggestions.map((s, i) => (
            <li key={i} className="px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-700"
                onMouseDown={() => {
                  onChange(s.display_name);
                  setShowSuggestions(false);
                }}>
              {s.display_name}
            </li>
          ))}
        </ul>
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

      
      if (entrega) {
        let newEntregaStatus = entregaData.status;
        
        
        if (formData.status === 'em_rota') newEntregaStatus = 'em_rota';
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

function PedidoHistoryModal({ pedido }: { pedido: Pedido }) {
  const hasUpdate = pedido.updated_at && pedido.updated_at !== pedido.created_at;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Histórico de Alterações</h3>
      <div className="space-y-4 max-h-[400px] overflow-y-auto">
        
        {hasUpdate && (
             <div className="flex gap-3">
                <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <div className="w-0.5 h-full bg-slate-200"></div>
                </div>
                <div className="pb-4">
                    <p className="text-sm font-medium">Última Atualização</p>
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
        
        <p className="text-sm text-slate-500 italic mt-4 border-t pt-2">
            * Histórico detalhado de alterações não disponível nesta versão.
        </p>
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
  const [filters, setFilters] = useState({ status: 'todos', cliente_id: '', origem: 'todos', de: '', ate: '' });
  const [availableEntregadores, setAvailableEntregadores] = useState<Entregador[]>([]);
  const [mapDeliveryPersons, setMapDeliveryPersons] = useState<MapDeliveryPerson[]>([]);
  
  
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
  const [selectedPedidoForAllocation, setSelectedPedidoForAllocation] = useState<Pedido | null>(null);
  const [selectedEntregadorId, setSelectedEntregadorId] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isComercio, setIsComercio] = useState(false);
  const [allowAlocarComercio, setAllowAlocarComercio] = useState(false);

  useEffect(() => {
    if (userId) {
      const loadUserRole = async () => {
        const { data } = await supabase.from('users').select('role, cliente_id, email').eq('id', userId).single();
        
        const isClient = data?.role === 'cliente';
        setIsAdmin(data?.role === 'admin' || data?.role === 'operador');
        setIsComercio(isClient);
        
        if (isClient) {
            let targetClientId = data?.cliente_id;
            
            if (!targetClientId && data?.email) {
                const { data: clienteData } = await supabase
                    .from('clientes')
                    .select('id')
                    .eq('email', data.email)
                    .single();
                if (clienteData) targetClientId = clienteData.id;
            }

            if (targetClientId) {
                setFilters(prev => ({ ...prev, cliente_id: targetClientId }));
            }
        }
      };
      loadUserRole();
      
      
      supabase.from('configuracoes_comercio').select('permitir_alocar_entregador').maybeSingle().then(({ data }) => {
          if (data) {
              setAllowAlocarComercio(data.permitir_alocar_entregador);
          }
      });
    }
  }, [userId]);

  
  const [mapSelectedEntregadorId, setMapSelectedEntregadorId] = useState('');
  const [selectedDeliveryPerson, setSelectedDeliveryPerson] = useState<DeliveryPerson | null>(null);
  const [originCoords, setOriginCoords] = useState<[number, number] | undefined>(undefined);
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | undefined>(undefined);
  const [originTitle, setOriginTitle] = useState<string>('');
  const [destinationTitle, setDestinationTitle] = useState<string>('');
  
  
  const [menuPos, setMenuPos] = useState<{top?: number, bottom?: number, left: number} | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);

  
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleMenuClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
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

  const getCoordsFromAddress = async (address: string): Promise<[number, number] | null> => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`, {
        headers: { 'User-Agent': 'RouteDeliveryApp/1.0' }
      });
      const data = await res.json();
      if (data && data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch (e) {
      console.error('Geocoding error', e);
    }
    return null;
  };

  const handleViewMap = async (pedido: Pedido) => {
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

    
    setOriginCoords(undefined);
    setDestinationCoords(undefined);
    setOriginTitle('');
    setDestinationTitle('');
    setMapSelectedEntregadorId('');
    setSelectedDeliveryPerson(null);

    const entrega = entregasMap[pedido.id];

    
    if (entrega?.entregador_id) {
      setMapSelectedEntregadorId(entrega.entregador_id);
    }

    
    if (entrega?.coleta_endereco_texto) {
      setOriginTitle(entrega.coleta_contato || 'Coleta');
      const coords = await getCoordsFromAddress(entrega.coleta_endereco_texto);
      if (coords && isValidCoords(coords)) {
        setOriginCoords(coords);
      }
    } else {
        
        const cliente = clientes.find(c => c.id === pedido.cliente_id);
        if (cliente) {
             const address = [cliente.rua, cliente.numero, cliente.bairro, cliente.cidade].filter(Boolean).join(', ');
             if (address) {
                 setOriginTitle(cliente.nome_completo);
                 const coords = await getCoordsFromAddress(address);
                 if (coords && isValidCoords(coords)) {
                    setOriginCoords(coords);
                 }
             }
        }
    }

    
    if (entrega?.entrega_endereco_texto) {
      setDestinationTitle(entrega.entrega_contato || 'Entrega');
      const coords = await getCoordsFromAddress(entrega.entrega_endereco_texto);
      if (coords && isValidCoords(coords)) {
        setDestinationCoords(coords);
      }
    } else if (pedido.endereco_texto) {
      setDestinationTitle('Entrega');
      const coords = await getCoordsFromAddress(pedido.endereco_texto);
      if (coords && isValidCoords(coords)) {
        setDestinationCoords(coords);
      }
    }
  };

  const isValidCoords = (coords: [number, number]) => {
      return coords[0] >= -90 && coords[0] <= 90 && coords[1] >= -180 && coords[1] <= 180;
  };

  useEffect(() => {
    fetchClientes();
    fetchEntregadoresList();

    
    const channel = supabase
      .channel('entregadores-location')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'entregadores' },
        (payload) => {
          const updatedEntregador = payload.new as Entregador;
          
          setAvailableEntregadores(prev => 
            prev.map(e => e.id === updatedEntregador.id ? updatedEntregador : e)
          );

          setEntregadores(prev => ({
            ...prev,
            [updatedEntregador.id]: updatedEntregador
          }));

          setMapDeliveryPersons(prev => 
            prev.map(p => {
              if (p.id === updatedEntregador.id) {
                return {
                  ...p,
                  name: updatedEntregador.nome_completo,
                  status: updatedEntregador.status === 'ativo' ? 'disponivel' : 'inativo',
                  is_online: updatedEntregador.is_online || false,
                  current_latitude: updatedEntregador.current_latitude,
                  current_longitude: updatedEntregador.current_longitude,
                  last_location_update: updatedEntregador.last_location_update,
                  updated_at: updatedEntregador.updated_at,
                  foto_url: updatedEntregador.foto_url
                };
              }
              return p;
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
    fetchPedidos();
  }, [filters.cliente_id, filters.origem, filters.de, filters.ate]);

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

  const onlineEntregadoresCount = availableEntregadores.filter(e => e.status === 'ativo').length;
  
  const visibleDeliveryPersons = useMemo(() => {
    if (!isComercio) return mapDeliveryPersons;
    
    const assignedIds = new Set<string>();
    Object.values(entregasMap).forEach(entrega => {
        if (entrega.entregador_id) {
            assignedIds.add(entrega.entregador_id);
        }
    });
    
    return mapDeliveryPersons.filter(dp => assignedIds.has(dp.id));
  }, [isComercio, mapDeliveryPersons, entregasMap]);

  const fetchClientes = async () => {
    const { data, error } = await supabase.from('clientes').select('id, nome_completo, rua, numero, bairro, cidade, cep').order('nome_completo');
    if (error) setError(error.message);
    setClientes(((data || []) as Cliente[]));
  };

  const fetchEntregadoresList = async () => {
    const { data } = await supabase.from('entregadores').select('*').order('nome_completo');
    setAvailableEntregadores((data || []) as Entregador[]);
    
    const map: Record<string, Entregador> = {};
    const mapPersons: MapDeliveryPerson[] = [];

    (data || []).forEach((e: any) => { 
        map[e.id] = e;
        
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
    });
    setEntregadores(prev => ({ ...prev, ...map }));
    setMapDeliveryPersons(mapPersons);
  };

  const fetchPedidos = async () => {
    setLoadingList(true);
    setError(null);
    
    try {
        
        let qPedidos = supabase.from('pedidos').select('*').order('created_at', { ascending: false });
        let qEntregas = supabase.from('nova_entrega').select('*').order('created_at', { ascending: false });

        
        if (filters.cliente_id) {
            qPedidos = qPedidos.eq('cliente_id', filters.cliente_id);
            qEntregas = qEntregas.eq('cliente_id', filters.cliente_id);
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
                eMap[e.pedido_id] = e;
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
            created_at: e.created_at
        }));

        const finalPedidos = [...pedidosList, ...syntheticPedidos];

        const finalPedidosSemEntregues = finalPedidos.filter(p => p.status !== 'entregue');

        
        unlinkedEntregas.forEach(e => {
            eMap[e.id] = e; 
        });

        setAllItems(finalPedidosSemEntregues);
        
        const displayedItems = filters.status === 'todos' 
            ? finalPedidosSemEntregues 
            : finalPedidosSemEntregues.filter(p => p.status === filters.status);
            
        setItems(displayedItems);
        setEntregasMap(eMap);
        
    } catch (e: any) {
        console.error('Fetch error', e);
        setError(e.message);
    } finally {
        setLoadingList(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este pedido?')) return;
    
    
    const { error: errorEntregaFK } = await supabase.from('nova_entrega').delete().eq('pedido_id', id);
    if (errorEntregaFK) console.warn('Aviso ao deletar entrega vinculada:', errorEntregaFK);

    const { error: errorEntregaPK } = await supabase.from('nova_entrega').delete().eq('id', id);
    if (errorEntregaPK) console.warn('Aviso ao deletar entrega direta:', errorEntregaPK);
    
    const { error } = await supabase.from('pedidos').delete().eq('id', id);
    
    if (error) {
        console.error('Erro ao excluir pedido:', error);
        alert('Erro ao excluir pedido');
        return;
    }
    
    setAllItems(prev => prev.filter(p => p.id !== id));
    setItems(prev => prev.filter(p => p.id !== id));
    setOpenMenuId(null);
  };

  const handleOpenAllocation = (pedido: Pedido) => {
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
      criada: 'bg-slate-100 text-slate-700',
      confirmado: 'bg-blue-100 text-blue-700',
      em_preparo: 'bg-yellow-100 text-yellow-700',
      pronto: 'bg-green-100 text-green-700',
      cancelado: 'bg-red-100 text-red-700',
      entregue: 'bg-gray-100 text-gray-700',
      atribuida: 'bg-purple-100 text-purple-700',
      em_rota: 'bg-blue-500 text-white',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[status] || 'bg-slate-100 text-slate-700'}`}>
        {status?.toUpperCase()}
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

      {/* Map View */}
      <div className="bg-white p-1 rounded-lg shadow-sm border border-slate-200">
        <div className="h-[400px] bg-slate-100 rounded-lg overflow-hidden relative">
          <MapView 
            deliveryPersons={visibleDeliveryPersons || []} 
            selectedEntregadorId={mapSelectedEntregadorId}
            origin={originCoords}
            destination={destinationCoords}
            originTitle={originTitle}
            destinationTitle={destinationTitle}
          />
        </div>
      </div>

      {/* Summary Cards & Actions */}
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

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {!isComercio && (
            <select 
                className="bg-white border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-slate-200 outline-none"
                value={filters.cliente_id}
                onChange={e => setFilters({...filters, cliente_id: e.target.value})}
            >
                <option value="">Comércio (Todos)</option>
                {clientes.map(c => (
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
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Nº Pedido</th>
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
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Carregando pedidos...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Nenhum pedido encontrado.</td></tr>
              ) : (
                items.map(p => {
                    const cliente = clientes.find(c => c.id === p.cliente_id);
                    const entrega = entregasMap[p.id];
                    const entregador = entrega?.entregador_id ? entregadores[entrega.entregador_id] : null;

                    return (
                        <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-4 py-3 font-medium text-slate-700">
                                {p.numero || p.id.slice(0, 6)}
                                <div className="text-xs text-slate-400">{format(new Date(p.created_at), 'dd/MM HH:mm')}</div>
                            </td>
                            <td className="px-4 py-3">
                                <div className="font-medium text-slate-800">{cliente?.nome_completo || 'Cliente Desconhecido'}</div>
                                <div className="text-xs text-slate-500">{cliente?.telefone}</div>
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
                                {getStatusBadge(entrega?.status || p.status)}
                            </td>
                            <td className="px-4 py-3">
                                {entregador ? (
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
                        <button onClick={() => handleSetReady(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><CheckSquare size={16}/> Pronto</button>
                        {isAdmin && p.status !== 'entregue' && p.status !== 'cancelado' && (
                          <button
                            onClick={() => handleFinalizePedido(p)}
                            className="px-4 py-2 hover:bg-slate-50 text-sm text-emerald-700 flex items-center gap-2"
                          >
                            <CheckCircle size={16} /> Finalizar pedido
                          </button>
                        )}
                        <button onClick={() => handleCopyLink(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><Link size={16}/> Copiar link de rastreio</button>
                        <button onClick={() => handleHistory(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><Clock size={16}/> Histórico de Alterações</button>
                        <button onClick={() => handleClone(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><Copy size={16}/> Clonar</button>
                        {isAdmin && entregasMap[p.id]?.status === 'atribuida' && (
                             <button onClick={() => handleReprocurar(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2 border-t border-slate-100 mt-1"><RefreshCw size={16}/> Reprocurar</button>
                        )}
                        {isAdmin && entregasMap[p.id]?.entregador_id && (
                             <button onClick={() => handleBlacklist(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-red-600 flex items-center gap-2 border-t border-slate-100 mt-1"><User size={16}/> Blacklist Entregador</button>
                        )}
                        {userRole !== 'entregador' && (
                             <button onClick={() => handleDelete(p.id)} className="px-4 py-2 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2 border-t border-slate-100 mt-1"><Trash2 size={16}/> Cancelar</button>
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
        title="Alocar Entregador"
        onConfirm={handleSaveAllocation}
        confirmText="Confirmar Alocação"
        cancelText="Cancelar"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Selecione um entregador para o pedido <strong>{selectedPedidoForAllocation?.numero}</strong>
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
             />
         )}
      </Modal>

    </div>
  );
}
