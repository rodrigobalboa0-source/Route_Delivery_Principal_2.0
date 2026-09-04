import { Fragment, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getCoordsFromAddress, getDrivingRouteDistance, getDistanceFromLatLonInKm } from '../../utils/geo';
import { AddressAutocomplete } from '../AddressAutocomplete';
// import { MapView, MapDeliveryPerson } from '../MapView'; // Google Maps SDK — fallback rápido, ver plano-integracao-routedelivery.md
import { MapView, MapDeliveryPerson } from '../MapViewOwnApi';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';
import { format } from 'date-fns';
import { Trash2, User, CheckCircle, Truck, Plus, ArrowRight, MapPin, Settings, Edit, FileText, CheckSquare, Link, Clock, Copy, MoreVertical, X, RefreshCw, Ban, RotateCcw, MessageSquare, UserCog, Store, Search, DollarSign, AlertCircle } from 'lucide-react';
import { IfoodService } from '../../services/ifoodService';
import {
  hasMultipleDestinations,
  hasNextDestination,
  isLastDestination,
  calculateAdvanceDestination
} from '../../utils/multiDestination';
import { pickFallbackTabelaId } from '../../utils/pricingTables';
import { toUtcRange, todayYmd } from '../../lib/dateRange';

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

function PedidoEditForm({
  pedido,
  entrega,
  onClose,
  onSave,
  onAlert,
  pricingTables = [],
  isAdmin = false,
}: {
  pedido: Pedido,
  entrega?: Entrega,
  onClose: () => void,
  onSave: () => void,
  onAlert?: (message: string, title?: string) => Promise<void>,
  pricingTables?: any[],
  isAdmin?: boolean,
}) {
  const [formData, setFormData] = useState<Partial<Pedido>>({ ...pedido });
  const [entregaData, setEntregaData] = useState<Partial<Entrega>>(entrega || {});
  const [loading, setLoading] = useState(false);
  const [coletaSelectedCoords, setColetaSelectedCoords] = useState<[number, number] | undefined>(
    typeof (entrega as any)?.coleta_lat === 'number' && typeof (entrega as any)?.coleta_lng === 'number'
      ? [(entrega as any).coleta_lat, (entrega as any).coleta_lng]
      : undefined
  );
  const [entregaSelectedCoords, setEntregaSelectedCoords] = useState<[number, number] | undefined>(
    typeof (entrega as any)?.entrega_lat === 'number' && typeof (entrega as any)?.entrega_lng === 'number'
      ? [(entrega as any).entrega_lat, (entrega as any).entrega_lng]
      : undefined
  );
  const [retorno, setRetorno] = useState<boolean>(Boolean((entrega as any)?.retorno));
  const [retornoTabelaId, setRetornoTabelaId] = useState<string>(
    pricingTables.length > 0 ? String(pricingTables[0].id) : ''
  );

  const retornoTabela = pricingTables.find((t: any) => String(t.id) === retornoTabelaId);

  const applyRetorno = (base: number, tabela: any): number => {
    if (!tabela?.valor_retorno || Number(tabela.valor_retorno) <= 0) return base;
    const tipo = (tabela.tipo_retorno || '').trim().toLowerCase();
    const vr = Number(tabela.valor_retorno);
    return tipo === 'percentual' || tipo === 'porcentagem' ? base * (1 + vr / 100) : base + vr;
  };

  
  const baseValorEntrega = useMemo(() => {
    const cur = Number(entrega?.valor_entrega || 0);
    if (!Boolean((entrega as any)?.retorno) || !retornoTabela) return cur;
    const tipo = (retornoTabela.tipo_retorno || '').trim().toLowerCase();
    const vr = Number(retornoTabela.valor_retorno || 0);
    if (vr <= 0) return cur;
    return tipo === 'percentual' || tipo === 'porcentagem' ? cur / (1 + vr / 100) : cur - vr;
  
  }, []);

  const baseValorEntregador = useMemo(() => {
    const cur = Number(entrega?.valor_entregador || 0);
    if (!Boolean((entrega as any)?.retorno) || !retornoTabela) return cur;
    const tipo = (retornoTabela.tipo_retorno || '').trim().toLowerCase();
    const vr = Number(retornoTabela.valor_retorno || 0);
    if (vr <= 0) return cur;
    return tipo === 'percentual' || tipo === 'porcentagem' ? cur / (1 + vr / 100) : cur - vr;
  
  }, []);

  const baseValorTotal = useMemo(() => {
    const cur = Number(pedido.valor_total || 0);
    if (!Boolean((entrega as any)?.retorno) || !retornoTabela) return cur;
    const tipo = (retornoTabela.tipo_retorno || '').trim().toLowerCase();
    const vr = Number(retornoTabela.valor_retorno || 0);
    if (vr <= 0) return cur;
    return tipo === 'percentual' || tipo === 'porcentagem' ? cur / (1 + vr / 100) : cur - vr;
  
  }, []);

  const handleToggleRetorno = (checked: boolean) => {
    setRetorno(checked);
    if (!retornoTabela) return;
    if (checked) {
      setEntregaData(d => ({
        ...d,
        valor_entrega: +applyRetorno(baseValorEntrega, retornoTabela).toFixed(2),
        valor_entregador: +applyRetorno(baseValorEntregador, retornoTabela).toFixed(2),
      }));
      setFormData(d => ({ ...d, valor_total: +applyRetorno(baseValorTotal, retornoTabela).toFixed(2) }));
    } else {
      setEntregaData(d => ({
        ...d,
        valor_entrega: +baseValorEntrega.toFixed(2),
        valor_entregador: +baseValorEntregador.toFixed(2),
      }));
      setFormData(d => ({ ...d, valor_total: +baseValorTotal.toFixed(2) }));
    }
  };

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

      
      if (formData.status !== pedido.status && (pedido.origem === 'online' || !!(pedido as any).ifood_order_id)) {
         let action = '';
         if (formData.status === 'confirmado') action = 'confirm';
         if (formData.status === 'em_preparo') action = 'startPreparation';
         if (formData.status === 'pronto') action = 'readyToPickup';
         if (formData.status === 'entregue') action = 'conclude';
         if (formData.status === 'cancelado') action = 'requestCancellation';
         
         if (action) {
             supabase.functions.invoke('ifood-update-status', {
                 body: { action, pedidoId: pedido.id }
             }).then(({ data, error }) => {
                 if (error || data?.success === false) console.warn('iFood update failed', error || data);
             });
         }
      }

      
      if (entrega) {
        let newEntregaStatus = entregaData.status;
        
        
        if (formData.status === 'entregue') {
          if (hasMultipleDestinations(entrega) && hasNextDestination(entrega)) {
            newEntregaStatus = 'em_rota';
          } else {
            newEntregaStatus = 'entregue';
          }
        }
        if (formData.status === 'cancelado') newEntregaStatus = 'cancelada';

        const retornoComissaoValor = retorno && retornoTabela
          ? +(applyRetorno(baseValorEntregador, retornoTabela) - baseValorEntregador).toFixed(2)
          : 0;

        const { error: eError } = await supabase.from('nova_entrega').update({
          pedido_id: pedido.id,
          coleta_endereco_texto: entregaData.coleta_endereco_texto,
          entrega_endereco_texto: entregaData.entrega_endereco_texto,
          coleta_lat: coletaSelectedCoords ? coletaSelectedCoords[0] : ((entrega as any)?.coleta_lat ?? null),
          coleta_lng: coletaSelectedCoords ? coletaSelectedCoords[1] : ((entrega as any)?.coleta_lng ?? null),
          entrega_lat: entregaSelectedCoords ? entregaSelectedCoords[0] : ((entrega as any)?.entrega_lat ?? null),
          entrega_lng: entregaSelectedCoords ? entregaSelectedCoords[1] : ((entrega as any)?.entrega_lng ?? null),
          status: newEntregaStatus,
          valor_entrega: entregaData.valor_entrega,
          valor_entregador: entregaData.valor_entregador,
          observacoes: entregaData.observacoes,
          retorno,
          opcionais: {
            ...((entrega?.opcionais as any) || {}),
            comissao_retorno: retornoComissaoValor > 0 ? retornoComissaoValor : null,
          },
        }).eq('id', entrega.id);
        
        if (eError) throw eError;
      }

      onSave();
      onClose();
    } catch (e) {
      console.error(e);
      if (onAlert) await onAlert('Erro ao salvar alterações', 'Erro');
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
             onChange={val => {
                setColetaSelectedCoords(undefined);
                setEntregaData({...entregaData, coleta_endereco_texto: val});
             }}
             onSelectCoords={setColetaSelectedCoords}
             placeholder="Endereço de retirada"
             inputClassName={
               entregaData.coleta_endereco_texto && !coletaSelectedCoords
                 ? 'border-red-400 bg-red-50'
                 : undefined
             }
           />
        </div>
        <div className="col-span-2">
           <label className="block text-sm font-medium text-slate-700">Endereço de Entrega (Destino)</label>
           <AddressAutocomplete
             value={entregaData.entrega_endereco_texto || formData.endereco_texto || ''}
             onChange={val => {
                setEntregaSelectedCoords(undefined);
                setEntregaData({...entregaData, entrega_endereco_texto: val});
                setFormData({...formData, endereco_texto: val});
             }}
             onSelectCoords={setEntregaSelectedCoords}
             placeholder="Endereço de entrega"
             inputClassName={
               (entregaData.entrega_endereco_texto || formData.endereco_texto) && !entregaSelectedCoords
                 ? 'border-red-400 bg-red-50'
                 : undefined
             }
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
        <div className="col-span-2 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${retorno ? 'bg-sky-600 border-sky-600' : 'border-slate-300 bg-white group-hover:border-sky-400'}`}>
                {retorno && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <input type="checkbox" checked={retorno} onChange={e => handleToggleRetorno(e.target.checked)} className="hidden" />
              <span className="text-sm text-slate-600 font-medium group-hover:text-sky-600 transition-colors">Adicionar Retorno</span>
            </label>
            {retorno && retornoTabela && Number(retornoTabela.valor_retorno) > 0 && (() => {
              const tipo = (retornoTabela.tipo_retorno || '').trim().toLowerCase();
              const isPerc = tipo === 'percentual' || tipo === 'porcentagem';
              const label = isPerc
                ? `+ ${retornoTabela.valor_retorno}%`
                : `+ R$ ${Number(retornoTabela.valor_retorno).toFixed(2).replace('.', ',')}`;
              return (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                  {label}
                </span>
              );
            })()}
          </div>
          {isAdmin && pricingTables.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Tabela de preços:</span>
              <select
                value={retornoTabelaId}
                onChange={e => setRetornoTabelaId(e.target.value)}
                className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-700"
              >
                {pricingTables.map((t: any) => (
                  <option key={t.id} value={String(t.id)}>{t.nome || `Tabela ${t.id}`}</option>
                ))}
              </select>
            </div>
          )}
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

function PedidoDetailsView({ pedido, entrega, cliente, onClose, onAlert, onRefresh }: { pedido: Pedido, entrega?: Entrega, cliente?: Cliente, onClose: () => void, onAlert?: (message: string, title?: string) => Promise<void>, onRefresh?: () => void }) {
  const agendadoEm = pedido.agendar_em || entrega?.agendar_em || null;
  const retiradaNoLocal = Boolean(pedido.retirada_no_local || entrega?.retirada_no_local);
  const pagamentoMetodo = pedido.pagamento_metodo || entrega?.pagamento_metodo || null;
  const pagamentoNaEntrega = Boolean(pedido.pagamento_na_entrega || entrega?.pagamento_na_entrega);
  const trocoPara = (pedido.troco_para ?? entrega?.troco_para) ?? null;
  const documentoTipo = pedido.documento_tipo || entrega?.documento_tipo || null;
  const documentoNumero = pedido.documento_numero || entrega?.documento_numero || null;
  const pontosAdicionais = Array.isArray((entrega as any)?.pontos_adicionais) ? ((entrega as any).pontos_adicionais as any[]) : [];
  const [removingDestino, setRemovingDestino] = useState<number | null>(null);
  const [confirmingDestino, setConfirmingDestino] = useState<number | null>(null);

  const handleRemoveDestino = async (destinoIndex: number, isPrincipal: boolean = false) => {
    if (!entrega) return;

    const destinoLabel = isPrincipal ? 'Destino Principal' : `Destino ${destinoIndex + 2}`;
    const confirmMessage = `Tem certeza que deseja remover ${destinoLabel}? Esta ação não pode ser desfeita.`;

    if (!window.confirm(confirmMessage)) return;

    setRemovingDestino(isPrincipal ? -1 : destinoIndex);

    try {
      const { data, error } = await supabase.rpc('remove_destino', {
        p_entrega_id: entrega.id,
        p_destino_index: isPrincipal ? -1 : destinoIndex,
        p_motivo: null
      });

      if (error) throw error;

      if (!data || data.success === false) {
        const errorMsg = data?.message || data?.error || 'Erro ao remover destino';
        if (data?.error === 'invalid_status') {
          throw new Error('Apenas é possível remover destinos quando a entrega está com status "criada"');
        }
        if (data?.error === 'cannot_remove_last_destination') {
          throw new Error('Não é possível remover o único destino da entrega');
        }
        if (data?.error === 'no_additional_destinations') {
          throw new Error('Não é possível remover o destino principal quando não há destinos adicionais');
        }
        throw new Error(errorMsg);
      }
      
      if (onAlert) {
        await onAlert(`${destinoLabel} removido com sucesso`, 'Sucesso');
      }
      
      if (onRefresh) {
        onRefresh();
      } else {
        onClose();
      }
    } catch (e: any) {
      console.error('Erro ao remover destino:', e);
      if (onAlert) {
        await onAlert(e.message || 'Erro ao remover destino', 'Erro');
      }
    } finally {
      setRemovingDestino(null);
    }
  };

  const handleConfirmDestino = async (destinoIndex: number) => {
    if (!entrega) return;

    const destinoLabel = destinoIndex === 0 ? 'Destino 1' : `Destino ${destinoIndex + 1}`;
    const confirmMessage = `Confirmar entrega em ${destinoLabel}?`;

    if (!window.confirm(confirmMessage)) return;

    setConfirmingDestino(destinoIndex);

    try {
      const opcionais = entrega.opcionais || {};
      const timeline = opcionais.timeline || {};
      const nowIso = new Date().toISOString();

      const updatedTimeline = {
        ...timeline,
        [`destino_${destinoIndex + 1}_concluido_em`]: nowIso,
      };

      const { error } = await supabase
        .from('nova_entrega')
        .update({
          opcionais: {
            ...opcionais,
            timeline: updatedTimeline,
          },
          updated_at: nowIso,
        })
        .eq('id', entrega.id);

      if (error) throw error;

      if (onAlert) {
        await onAlert(`${destinoLabel} marcado como concluído`, 'Sucesso');
      }

      if (onRefresh) {
        onRefresh();
      } else {
        onClose();
      }
    } catch (e: any) {
      console.error('Erro ao confirmar destino:', e);
      if (onAlert) {
        await onAlert(e.message || 'Erro ao confirmar destino', 'Erro');
      }
    } finally {
      setConfirmingDestino(null);
    }
  };

  const formatPagamentoMetodo = (m: string) => {
    const v = String(m || '').trim().toLowerCase();
    if (v === 'dinheiro') return 'Dinheiro';
    if (v === 'cartao') return 'Cartão';
    if (v === 'pix') return 'PIX';
    if (v === 'online') return 'Online';
    return m;
  };

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
              <p><span className="text-slate-500">Modalidade:</span> {retiradaNoLocal ? 'RETIRADA NO LOCAL' : 'ENTREGA'}</p>
              <p><span className="text-slate-500">Criado em:</span> {format(new Date(pedido.created_at), 'dd/MM/yyyy HH:mm')}</p>
              {agendadoEm && (
                <p><span className="text-slate-500">Agendado para:</span> {format(new Date(agendadoEm), 'dd/MM/yyyy HH:mm')}</p>
              )}
              {pedido.ifood_order_id && (
                <p><span className="text-slate-500">iFood Order ID:</span> {pedido.ifood_order_id}</p>
              )}
            </div>
          </div>

          {(pagamentoMetodo || pagamentoNaEntrega || trocoPara !== null || documentoNumero || pedido.voucher_codigo) && (
            <div className="bg-slate-50 p-4 rounded-lg">
              <h4 className="font-semibold text-slate-700 mb-2 flex items-center gap-2"><DollarSign size={16}/> Pagamento</h4>
              <div className="space-y-2 text-sm">
                {pagamentoMetodo && <p><span className="text-slate-500">Método:</span> {formatPagamentoMetodo(pagamentoMetodo)}</p>}
                <p><span className="text-slate-500">Na entrega:</span> {pagamentoNaEntrega ? 'SIM' : 'NÃO'}</p>
                {trocoPara !== null && <p><span className="text-slate-500">Troco para:</span> R$ {Number(trocoPara || 0).toFixed(2)}</p>}
                {documentoNumero && <p><span className="text-slate-500">Documento:</span> {(documentoTipo || '').toUpperCase()} {documentoNumero}</p>}
                {pedido.voucher_codigo && <p><span className="text-slate-500">Voucher/Cupom:</span> {pedido.voucher_codigo}</p>}
              </div>
            </div>
          )}

          {(pedido.status === 'cancelado' || pedido.cancelado_em || pedido.cancelamento_origem || pedido.cancelamento_codigo || pedido.cancelamento_motivo) && (
            <div className="bg-red-50 p-4 rounded-lg border border-red-100">
              <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2"><AlertCircle size={16}/> Cancelamento</h4>
              <div className="space-y-2 text-sm text-red-700">
                {pedido.cancelado_em && <p><span className="text-red-700/70">Cancelado em:</span> {format(new Date(pedido.cancelado_em), 'dd/MM/yyyy HH:mm')}</p>}
                {pedido.cancelamento_origem && <p><span className="text-red-700/70">Origem:</span> {String(pedido.cancelamento_origem).toUpperCase()}</p>}
                {pedido.cancelamento_codigo && <p><span className="text-red-700/70">Código:</span> {pedido.cancelamento_codigo}</p>}
                {pedido.cancelamento_motivo && <p><span className="text-red-700/70">Motivo:</span> {pedido.cancelamento_motivo}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-lg">
            <h4 className="font-semibold text-slate-700 mb-2 flex items-center gap-2"><Truck size={16}/> Entrega</h4>
            <div className="space-y-2 text-sm">
              {retiradaNoLocal ? (
                <p className="text-slate-600">Pedido para retirada no local (sem motoboy).</p>
              ) : (
                <>
                  <p><span className="text-slate-500">Status Entrega:</span> {entrega?.status?.toUpperCase() || '-'}</p>
                  <p><span className="text-slate-500">Valor Entrega:</span> R$ {entrega?.valor_entrega?.toFixed(2) || '0.00'}</p>
                  <p><span className="text-slate-500">Modal:</span> {entrega?.modal_tipo || '-'}</p>
                </>
              )}
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
                <p>{retiradaNoLocal ? 'Retirada no local' : (entrega?.entrega_endereco_texto || pedido.endereco_texto || '-')}</p>
              </div>
              {!retiradaNoLocal && pontosAdicionais.length > 0 && entrega?.status === 'criada' && (
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-xs font-bold text-slate-700">DESTINOS ADICIONAIS ({pontosAdicionais.length})</p>
                  <div className="mt-2 space-y-2">
                    {pontosAdicionais.map((p, idx) => {
                      const base = String(p?.endereco_texto || '').trim();
                      const addr = p?.numero ? `${base}, ${String(p.numero).trim()}` : base;
                      const contato = p?.contato ? String(p.contato).trim() : '';
                      const tel = p?.telefone ? String(p.telefone).trim() : '';
                      const obs = p?.observacoes ? String(p.observacoes).trim() : '';
                      return (
                        <div key={idx} className="bg-white rounded border border-slate-200 p-2">
                          <div className="flex justify-between items-start">
                            <div className="text-xs font-semibold text-slate-700">Destino {idx + 2}</div>
                            <button
                              onClick={() => handleRemoveDestino(idx)}
                              disabled={removingDestino === idx}
                              className="text-red-500 hover:text-red-700 disabled:text-red-300 disabled:cursor-not-allowed"
                              title="Remover destino"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="text-sm text-slate-800">{addr || '-'}</div>
                          {(contato || tel) && <div className="text-xs text-slate-500">{[contato, tel].filter(Boolean).join(' • ')}</div>}
                          {obs && <div className="text-xs text-slate-500 mt-1">{obs}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!retiradaNoLocal && pontosAdicionais.length > 0 && entrega?.status !== 'criada' && (
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-xs font-bold text-slate-700">DESTINOS ADICIONAIS ({pontosAdicionais.length})</p>
                  <div className="mt-2 space-y-2">
                    {pontosAdicionais.map((p, idx) => {
                      const base = String(p?.endereco_texto || '').trim();
                      const addr = p?.numero ? `${base}, ${String(p.numero).trim()}` : base;
                      const contato = p?.contato ? String(p.contato).trim() : '';
                      const tel = p?.telefone ? String(p.telefone).trim() : '';
                      const obs = p?.observacoes ? String(p.observacoes).trim() : '';
                      return (
                        <div key={idx} className="bg-white rounded border border-slate-200 p-2">
                          <div className="text-xs font-semibold text-slate-700">Destino {idx + 2}</div>
                          <div className="text-sm text-slate-800">{addr || '-'}</div>
                          {(contato || tel) && <div className="text-xs text-slate-500">{[contato, tel].filter(Boolean).join(' • ')}</div>}
                          {obs && <div className="text-xs text-slate-500 mt-1">{obs}</div>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500 mt-2 italic">Destinos não podem ser removidos após a entrega entrar em execução.</p>
                </div>
              )}
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

function IfoodCancellationReasonsModal({ 
  reasons, 
  onSelect, 
  onClose 
}: { 
  reasons: Array<{ code: string; title: string; description?: string }>, 
  onSelect: (reason: { code: string; title: string }) => void, 
  onClose: () => void 
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <h3 className="text-xl font-bold text-red-800">Selecione o Motivo do Cancelamento</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-sm text-red-700 mb-4">
          Selecione o motivo do cancelamento conforme as opções disponíveis na plataforma iFood:
        </p>
        
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {reasons.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum motivo disponível. Tente novamente mais tarde.</p>
          ) : (
            reasons.map((reason) => (
              <button
                key={reason.code}
                onClick={() => onSelect(reason)}
                className="w-full text-left p-4 bg-white border border-red-100 rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors"
              >
                <div className="font-medium text-red-800">{reason.title}</div>
                {reason.description && (
                  <div className="text-sm text-red-600 mt-1">{reason.description}</div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PedidoCancelamentoModal({ pedido, onClose }: { pedido: Pedido, onClose: () => void }) {
  
  const parseMotivo = (motivo: string) => {
    if (!motivo) return { titulo: '', descricao: '' };
    
    const parts = motivo.split('\n\n');
    if (parts.length > 1) {
      return {
        titulo: parts[0].trim(),
        descricao: parts.slice(1).join('\n\n').trim()
      };
    }
    return {
      titulo: '',
      descricao: motivo.trim()
    };
  };

  const { titulo, descricao } = parseMotivo(pedido.cancelamento_motivo || '');

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <h3 className="text-xl font-bold text-red-800">Motivo do Cancelamento</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-red-600" size={24} />
            <div>
              <h4 className="font-semibold text-red-800">Pedido #{pedido.numero || pedido.id.slice(0,6)} Cancelado</h4>
              <p className="text-sm text-red-600">
                {pedido.cancelado_em ? `Cancelado em ${format(new Date(pedido.cancelado_em), 'dd/MM/yyyy HH:mm')}` : 'Data não disponível'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded border border-red-100 p-4">
            <div className="space-y-3">
              {pedido.cancelamento_origem && (
                <div>
                  <span className="text-sm font-medium text-red-700">Origem: </span>
                  <span className="text-sm text-red-600 font-semibold">
                    {String(pedido.cancelamento_origem).toUpperCase() === 'IFOOD' ? 'iFood' : String(pedido.cancelamento_origem).toUpperCase()}
                  </span>
                </div>
              )}
              
              {pedido.cancelamento_codigo && (
                <div>
                  <span className="text-sm font-medium text-red-700">Código: </span>
                  <span className="text-sm text-red-600 font-mono bg-red-50 px-2 py-1 rounded">
                    {pedido.cancelamento_codigo}
                  </span>
                </div>
              )}
              
              {}
              {titulo && (
                <div>
                  <span className="text-sm font-medium text-red-700 block mb-2">Título do Motivo:</span>
                  <div className="text-sm font-semibold text-red-800 bg-red-50 border border-red-100 rounded p-3">
                    {titulo}
                  </div>
                </div>
              )}
              
              {}
              {descricao && (
                <div>
                  <span className="text-sm font-medium text-red-700 block mb-2">
                    {titulo ? 'Descrição do Cliente:' : 'Motivo do Cancelamento:'}
                  </span>
                  <div className="text-sm text-red-600 bg-white border border-red-50 rounded p-3 whitespace-pre-wrap">
                    {descricao}
                  </div>
                </div>
              )}
            </div>
          </div>

          {pedido.origem === 'online' && pedido.cancelamento_origem === 'ifood' && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-xs text-blue-700">
                <strong>Informação iFood:</strong> O cancelamento foi processado através da plataforma iFood e o motivo foi informado diretamente pelo cliente no momento do cancelamento.
              </p>
            </div>
          )}
        </div>
      </div>
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


const COMMERCE_PIN_COLORS = [
  '#f97316', '#8b5cf6', '#0ea5e9', '#d97706', '#059669',
  '#dc2626', '#2563eb', '#db2777', '#65a30d', '#0891b2',
];

function getCommerceColor(clienteId: string): string {
  if (!clienteId) return '#f97316';
  let h = 0;
  for (let i = 0; i < clienteId.length; i++) {
    h = (h * 31 + clienteId.charCodeAt(i)) | 0;
  }
  return COMMERCE_PIN_COLORS[Math.abs(h) % COMMERCE_PIN_COLORS.length];
}

export function PedidosPanel({ onNavigate, userRole, userId }: PedidosPanelProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [items, setItems] = useState<Pedido[]>([]);
  const [allItems, setAllItems] = useState<Pedido[]>([]);
  const [statusCountsWindow, setStatusCountsWindow] = useState<Record<string, number>>({});
  const [entregasMap, setEntregasMap] = useState<Record<string, Entrega>>({});
  const [entregadores, setEntregadores] = useState<Record<string, Entregador>>({});
  const [expandedMultiPedidos, setExpandedMultiPedidos] = useState<Record<string, boolean>>({});
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(() => {
    const today = todayYmd();
    return { status: 'todos', cliente_id: '', origem: 'todos', de: today, ate: today, cidade: 'todos' };
  });
  const [availableEntregadores, setAvailableEntregadores] = useState<Entregador[]>([]);
  const [mapDeliveryPersons, setMapDeliveryPersons] = useState<MapDeliveryPerson[]>([]);
  const [dialog, setDialog] = useState<{ open: boolean; title: string; message: string; mode: 'alert' | 'confirm' | 'prompt' }>({
    open: false,
    title: '',
    message: '',
    mode: 'alert',
  });
  const [dialogInput, setDialogInput] = useState('');
  const [removingDestino, setRemovingDestino] = useState<{ pedidoId: string; destinoIndex: number } | null>(null);
  const dialogAlertResolveRef = useRef<(() => void) | null>(null);
  const dialogConfirmResolveRef = useRef<((v: boolean) => void) | null>(null);
  const dialogPromptResolveRef = useRef<((v: string | null) => void) | null>(null);

  const showAlert = useCallback((message: string, title = 'Aviso') => {
    return new Promise<void>((resolve) => {
      if (dialogConfirmResolveRef.current) dialogConfirmResolveRef.current(false);
      if (dialogPromptResolveRef.current) dialogPromptResolveRef.current(null);
      if (dialogAlertResolveRef.current) dialogAlertResolveRef.current();
      dialogConfirmResolveRef.current = null;
      dialogPromptResolveRef.current = null;
      dialogAlertResolveRef.current = resolve;
      setDialog({ open: true, title, message, mode: 'alert' });
    });
  }, []);

  const showConfirm = useCallback((message: string, title = 'Confirmação') => {
    return new Promise<boolean>((resolve) => {
      if (dialogAlertResolveRef.current) dialogAlertResolveRef.current();
      if (dialogPromptResolveRef.current) dialogPromptResolveRef.current(null);
      if (dialogConfirmResolveRef.current) dialogConfirmResolveRef.current(false);
      dialogAlertResolveRef.current = null;
      dialogPromptResolveRef.current = null;
      dialogConfirmResolveRef.current = resolve;
      setDialog({ open: true, title, message, mode: 'confirm' });
    });
  }, []);

  const toggleMultiPedido = useCallback((pedidoId: string) => {
    setExpandedMultiPedidos((prev) => ({ ...prev, [pedidoId]: !prev[pedidoId] }));
  }, []);

  const handleRemoveDestino = async (pedidoId: string, destinoIndex: number, isPrincipal: boolean = false) => {
    const entrega = entregasMap[pedidoId];
    if (!entrega) return;
    
    const destinoLabel = isPrincipal ? 'Destino Principal' : `Destino ${destinoIndex + 2}`;
    const confirmMessage = `Tem certeza que deseja remover ${destinoLabel}? Esta ação não pode ser desfeita.`;
    
    if (!window.confirm(confirmMessage)) return;
    
    setRemovingDestino({ pedidoId, destinoIndex: isPrincipal ? -1 : destinoIndex });
    
    try {
      const { data, error } = await supabase.rpc('remove_destino', {
        p_entrega_id: entrega.id,
        p_destino_index: isPrincipal ? -1 : destinoIndex,
        p_motivo: null
      });
      
      if (error) throw error;
      
      if (!data || data.success === false) {
        const errorMsg = data?.message || data?.error || 'Erro ao remover destino';
        if (data?.error === 'invalid_status') {
          throw new Error('Apenas é possível remover destinos quando a entrega está com status "criada"');
        }
        if (data?.error === 'cannot_remove_last_destination') {
          throw new Error('Não é possível remover o único destino da entrega');
        }
        if (data?.error === 'no_additional_destinations') {
          throw new Error('Não é possível remover o destino principal quando não há destinos adicionais');
        }
        throw new Error(errorMsg);
      }
      
      await showAlert(`${destinoLabel} removido com sucesso`, 'Sucesso');
      await fetchPedidos(true);
    } catch (e: any) {
      console.error('Erro ao remover destino:', e);
      await showAlert(e.message || 'Erro ao remover destino', 'Erro');
    } finally {
      setRemovingDestino(null);
    }
  };

  const showPrompt = useCallback((message: string, opts?: { title?: string; defaultValue?: string }) => {
    return new Promise<string | null>((resolve) => {
      if (dialogAlertResolveRef.current) dialogAlertResolveRef.current();
      if (dialogConfirmResolveRef.current) dialogConfirmResolveRef.current(false);
      if (dialogPromptResolveRef.current) dialogPromptResolveRef.current(null);
      dialogAlertResolveRef.current = null;
      dialogConfirmResolveRef.current = null;
      dialogPromptResolveRef.current = resolve;
      setDialogInput(opts?.defaultValue ?? '');
      setDialog({ open: true, title: opts?.title ?? 'Informe', message, mode: 'prompt' });
    });
  }, []);

  const hasIfoodVisible = useMemo(() => items.some(i => i.origem === 'online'), [items]);
  
  
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
  const [selectedPedidoForAllocation, setSelectedPedidoForAllocation] = useState<Pedido | null>(null);
  const [selectedEntregadorId, setSelectedEntregadorId] = useState('');
  const [isSwappingFinalized, setIsSwappingFinalized] = useState(false);
  const normalizedUserRole = typeof userRole === 'string' ? userRole : '';
  const isComercio = normalizedUserRole === 'cliente' || normalizedUserRole === '' || normalizedUserRole === 'loading';
  const isAdmin = normalizedUserRole === 'admin' || normalizedUserRole === 'operador';
  const tableColCount = (isComercio ? 9 : 10) + (hasIfoodVisible ? 1 : 0);
  const [allowAlocarComercio, setAllowAlocarComercio] = useState(false);
  const [bloquearFinalizarPedido, setBloquearFinalizarPedido] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkAllocation, setIsBulkAllocation] = useState(false);
  const [ibgeCities, setIbgeCities] = useState<string[]>([]);
  
  
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');

  
  const [quickAddress, setQuickAddress] = useState('');
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
  const [quickDestinationSelected, setQuickDestinationSelected] = useState(false);
  const quickDistanceCalcIdRef = useRef(0);
  const pedidosFetchSeqRef = useRef(0);
  const pedidosRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSilentRefreshRef = useRef<() => void>(() => {});
  
  
  const [pricingTables, setPricingTables] = useState<any[]>([]);
  const [pricingRanges, setPricingRanges] = useState<any[]>([]);
  const [commissionTables, setCommissionTables] = useState<any[]>([]);
  const [commissionRanges, setCommissionRanges] = useState<any[]>([]);
  const [dynamicRules, setDynamicRules] = useState<any[]>([]);
  const [driverDynamicRules, setDriverDynamicRules] = useState<any[]>([]);
  const [activeDynamicRules, setActiveDynamicRules] = useState<{ name: string; value: number }[]>([]);
  const [clientPricingConfig, setClientPricingConfig] = useState<any[]>([]);
  const [selectedTabelaId, setSelectedTabelaId] = useState<string | null>(null);
  const [pricePerPoint, setPricePerPoint] = useState(0);
  const [pricingMode, setPricingMode] = useState<'Distância' | 'Fixo' | 'Zerar'>('Distância');
  const [tabelasComFaixas, setTabelasComFaixas] = useState<Set<string>>(new Set());
  const [pricingUnavailable, setPricingUnavailable] = useState<string | null>(null);

  useEffect(() => {
    
    const fetchPricing = async () => {
        const [tp, tpf, dr, tc, tcf, dde] = await Promise.all([
            supabase.from('tabelas_precos').select('*'),
            supabase.from('tabelas_precos_faixas').select('*'),
            supabase.from('preco_dinamico_demanda').select('*'),
            supabase.from('tabelas_comissoes').select('*'),
            supabase.from('tabelas_comissoes_faixas').select('*'),
            supabase.from('preco_dinamico_entregador').select('*'),
        ]);
        if (tp.data) setPricingTables(tp.data);
        if (tpf.data) {
          setPricingRanges(tpf.data);
          setTabelasComFaixas(new Set(tpf.data.map((r: any) => r.tabela_id)));
        }
        if (tc.data) setCommissionTables(tc.data);
        if (tcf.data) setCommissionRanges(tcf.data);
        if (dr.data) {
            setDynamicRules(dr.data);

        }
        if (dr.error) {
            console.error('Error fetching dynamic rules:', dr.error);
        }
        if (dde.data) setDriverDynamicRules(dde.data);
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
    const channel = supabase
      .channel('preco_dinamico_entregador_pedidos_panel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'preco_dinamico_entregador' },
        () => {
          supabase.from('preco_dinamico_entregador').select('*').then(({ data }) => {
            if (data) setDriverDynamicRules(data);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (pricingMode !== 'Distância') return;
    if (!pricingTables || pricingTables.length === 0) return;

    const currentValid =
      selectedTabelaId &&
      pricingTables.some((t) => String(t.id) === String(selectedTabelaId)) &&
      tabelasComFaixas.has(String(selectedTabelaId));

    if (!currentValid) {
      const fallbackId = pickFallbackTabelaId(pricingTables, tabelasComFaixas);
      setSelectedTabelaId(fallbackId || null);
    }
  }, [pricingMode, pricingTables, selectedTabelaId, tabelasComFaixas]);

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

        const clienteSelect = 'id, nome_completo, rua, numero, bairro, cidade, cep, precificacao_config, telefone, observacoes, latitude, longitude';
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

          const storedLat = (clienteData as any).latitude;
          const storedLng = (clienteData as any).longitude;
          const coords: [number, number] | undefined =
            typeof storedLat === 'number' && typeof storedLng === 'number'
              ? [storedLat, storedLng]
              : await resolveCoordsWithFallback(fullAddress);
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
  const [additionalDestinationsCoords, setAdditionalDestinationsCoords] = useState<Array<{ coords: [number, number]; title: string; order: number }>>([]);
  const [deliveryPins, setDeliveryPins] = useState<Array<{ id: string; coords: [number, number]; tooltip: string; color: string; label?: string; agendado?: boolean }>>([]);

  const [commerceDefaultCoords, setCommerceDefaultCoords] = useState<[number, number] | undefined>(undefined);
  const [commerceDefaultTitle, setCommerceDefaultTitle] = useState<string>('');
  
  const [menuPos, setMenuPos] = useState<{top?: number, bottom?: number, left: number} | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [statusMenuPos, setStatusMenuPos] = useState<{top?: number, bottom?: number, left: number} | null>(null);
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);

  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isCancelamentoModalOpen, setIsCancelamentoModalOpen] = useState(false);
  const [isIfoodCancellationReasonsModalOpen, setIsIfoodCancellationReasonsModalOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [ifoodCancellationReasons, setIfoodCancellationReasons] = useState<Array<{ code: string; title: string; description?: string }>>([]);

  
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
    const entrega = entregasMap[pedidoId];
    
    if (newStatus === 'entregue' && entrega && hasMultipleDestinations(entrega) && hasNextDestination(entrega)) {
      await handleManualAdvanceDestination(pedidoId);
      return;
    }
    
    const nowIso = new Date().toISOString();

    setAllItems(prev => prev.map(p => (p.id === pedidoId ? { ...p, status: newStatus as any, updated_at: nowIso } : p)));
    queueSilentPedidosRefresh();

    const { error } = await supabase
      .from('pedidos')
      .update({ status: newStatus as any, updated_at: nowIso } as any)
      .eq('id', pedidoId);

    if (error) {
      await showAlert('Erro ao atualizar status: ' + error.message, 'Erro');
      queueSilentPedidosRefresh();
      return;
    }

    setOpenStatusMenuId(null);
  };

  const handleManualEntregaStatusChange = async (pedidoId: string, newStatus: string) => {
    const entrega = entregasMap[pedidoId];
    if (!entrega?.id) return;
    const nowIso = new Date().toISOString();
    
    if (newStatus === 'entregue' && hasMultipleDestinations(entrega)) {
      if (hasNextDestination(entrega)) {
        await handleManualAdvanceDestination(pedidoId);
        return;
      }
    }

    setEntregasMap(prev => ({ ...prev, [pedidoId]: { ...prev[pedidoId], status: newStatus as any, updated_at: nowIso } as any }));
    queueSilentPedidosRefresh();

    const { error } = await supabase
      .from('nova_entrega')
      .update({ status: newStatus as any, updated_at: nowIso } as any)
      .eq('id', entrega.id);

    if (error) {
      await showAlert('Erro ao atualizar status: ' + error.message, 'Erro');
      queueSilentPedidosRefresh();
      return;
    }

    if (newStatus === 'entregue') {
      void handleManualPedidoStatusChange(pedidoId, 'entregue');
    }

    setOpenStatusMenuId(null);
  };

  const handleManualAdvanceDestination = async (pedidoId: string) => {
    const entrega = entregasMap[pedidoId];
    if (!entrega?.id) return;
    const nowIso = new Date().toISOString();

    
    if (!hasMultipleDestinations(entrega)) {
      await showAlert('Este pedido não tem múltiplos destinos.', 'Aviso');
      return;
    }

    
    if (!hasNextDestination(entrega)) {
      await showAlert('Não há mais destinos para avançar. Finalize a entrega.', 'Aviso');
      return;
    }

    
    const result = calculateAdvanceDestination(entrega, nowIso);

    if (!result.success) {
      await showAlert(result.error || 'Erro ao avançar destino', 'Erro');
      return;
    }

    if (!result.updatedFields) {
      await showAlert('Erro ao calcular campos atualizados', 'Erro');
      return;
    }

    setEntregasMap(prev => ({ ...prev, [pedidoId]: { ...prev[pedidoId], ...result.updatedFields } as any }));
    queueSilentPedidosRefresh();

    const { error } = await supabase
      .from('nova_entrega')
      .update(result.updatedFields as any)
      .eq('id', entrega.id);

    if (error) {
      await showAlert('Erro ao avançar destino: ' + error.message, 'Erro');
      queueSilentPedidosRefresh();
      return;
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

  const handleViewCancelamento = (p: Pedido) => {
    setSelectedPedido(p);
    setIsCancelamentoModalOpen(true);
    setOpenMenuId(null);
  };

  const handleAcceptIfood = async (p: Pedido) => {
    try {
      if (!(p as any).ifood_order_id) {
        await showAlert('Este pedido iFood ainda não tem o ID do iFood salvo. Rode a sincronização iFood e tente novamente.', 'Aviso');
        return;
      }
      await IfoodService.acceptOrder(p.id, p.cliente_id, (p as any).ifood_order_id);
      await supabase.from('pedidos').update({ status: 'confirmado' }).eq('id', p.id);
      fetchPedidos();
      setOpenMenuId(null);
      await showAlert('Pedido iFood aceito com sucesso!', 'Sucesso');
    } catch (err: any) {
      await showAlert(`Erro ao aceitar pedido iFood: ${err?.message || 'erro desconhecido'}`, 'Erro');
    }
  };

  const handleReprocurar = async (pedido: Pedido) => {
    const entrega = entregasMap[pedido.id];
    if (!entrega || !entrega.id) return;

    const ok = await showConfirm('Deseja realmente colocar este pedido para reprocura? O entregador atual será removido.');
    if (!ok) return;

    try {
        const { error } = await supabase
            .from('nova_entrega')
            .update({
                entregador_id: null,
                status: 'criada',
                atribuicao_modo: 'manual',
                updated_at: new Date().toISOString()
            })
            .eq('id', entrega.id);

        if (error) throw error;
        
        fetchPedidos();
        setOpenMenuId(null);
    } catch (e) {
        console.error('Erro ao reprocurar:', e);
        await showAlert('Erro ao realizar operação', 'Erro');
    }
  };

  const handleBlacklist = async (pedido: Pedido) => {
      const entrega = entregasMap[pedido.id];
      if (!entrega || !entrega.entregador_id) return;

      const ok = await showConfirm('Deseja colocar este entregador na blacklist deste comércio? Ele não receberá mais pedidos desta loja.');
      if (!ok) return;

      const motivo = await showPrompt('Motivo do bloqueio (opcional):', { title: 'Blacklist' });

      try {
          const { error } = await supabase.from('entregador_bloqueios_clientes').insert({
              entregador_id: entrega.entregador_id,
              cliente_id: pedido.cliente_id,
              motivo: motivo || null
          });

          if (error) throw error;

          await showAlert('Entregador adicionado à blacklist com sucesso.', 'Sucesso');
          setOpenMenuId(null);
      } catch (e: any) {
          console.error('Erro ao adicionar à blacklist:', e);
          await showAlert('Erro ao realizar operação: ' + e.message, 'Erro');
      }
  };

  const handleSetReady = async (p: Pedido) => { 
    const ok = await showConfirm('Marcar pedido como Pronto?');
    if (!ok) return;
    const { error } = await supabase.from('pedidos').update({ status: 'pronto' }).eq('id', p.id);
    if (error) {
        await showAlert('Erro ao atualizar status: ' + error.message, 'Erro');
    } else {
        if (p.origem === 'online' || !!(p as any).ifood_order_id) {
            supabase.functions.invoke('ifood-update-status', {
                body: { action: 'readyToPickup', pedidoId: p.id }
            }).then(({ data, error }) => {
                if (error || data?.success === false) console.warn('iFood update failed', error || data);
            });
        }
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
      await showAlert('Seu comércio não tem permissão para finalizar pedidos.', 'Aviso');
      return;
    }
    
    const entrega = entregasMap[p.id];
    
    // Se há múltiplos destinos e ainda existe próximo destino, avança automaticamente
    if (entrega && hasMultipleDestinations(entrega)) {
      if (hasNextDestination(entrega)) {
        await handleManualAdvanceDestination(p.id);
        fetchPedidos();
        setOpenMenuId(null);
        return;
      }
      // Se é o último destino, procede com finalização normal abaixo
    }
    
    const ok = await showConfirm('Finalizar pedido e marcar como Entregue?');
    if (!ok) return;
    
    
    const { error: errorPedido } = await supabase.from('pedidos').update({ status: 'entregue' }).eq('id', p.id);
    if (errorPedido) {
        await showAlert('Erro ao atualizar status do pedido: ' + errorPedido.message, 'Erro');
        return;
    }

    if (p.origem === 'online' || !!(p as any).ifood_order_id) {
        const { data, error } = await supabase.functions.invoke('ifood-update-status', {
            body: { action: 'conclude', pedidoId: p.id }
        });
        if (error || data?.success === false) {
            const msg = (data as any)?.error || (data as any)?.message || error?.message || 'erro desconhecido';
            await showAlert(`Falha ao finalizar no iFood: ${msg}`, 'Erro');
        } else if (data?.ifood?.fallbackUsed) {
            await showAlert('iFood não permite concluir diretamente; aplicamos o status de saída para entrega (dispatch) como fallback.', 'Aviso');
        }
    }

    
    const { error: errorEntrega } = await supabase.from('nova_entrega').update({ status: 'entregue' }).eq('pedido_id', p.id);
    if (errorEntrega) {
        console.error('Erro ao atualizar entrega:', errorEntrega);
    }

    fetchPedidos();
    setOpenMenuId(null);
  };

  const handleCopyLink = async (p: Pedido) => { 
    await navigator.clipboard.writeText(`${window.location.origin}/rastreio/${p.id}`);
    await showAlert('Link de rastreio copiado!', 'Sucesso');
    setOpenMenuId(null); 
  };

  const handleClone = async (p: Pedido) => { 
    const ok = await showConfirm('Deseja clonar este pedido?');
    if (!ok) return;
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
           let pickupText = String(entrega.coleta_endereco_texto || '').trim();
           let deliveryText = String(entrega.entrega_endereco_texto || '').trim();
           
           
           if (!deliveryText) {
             deliveryText = String(p.endereco_texto || '').trim();
           }
           
           
           if (!pickupText) {
             try {
               const { data: cli } = await supabase
                 .from('clientes')
                 .select('rua, numero, bairro, cidade, cep')
                 .eq('id', p.cliente_id)
                 .maybeSingle();
               
               let rua = cli?.rua ?? null;
               let numero = cli?.numero ?? null;
               let bairro = cli?.bairro ?? null;
               let cidade = cli?.cidade ?? null;
               let cep = cli?.cep ?? null;
               
               if (!rua || !cidade) {
                 const { data: alt } = await supabase
                   .from('cliente_enderecos')
                   .select('rua, numero, bairro, cidade, cep')
                   .eq('cliente_id', p.cliente_id)
                   .order('created_at', { ascending: false })
                   .limit(1);
                 const row = Array.isArray(alt) && alt.length > 0 ? alt[0] : null;
                 rua = rua || row?.rua || null;
                 numero = numero || row?.numero || null;
                 bairro = bairro || row?.bairro || null;
                 cidade = cidade || row?.cidade || null;
                 cep = cep || row?.cep || null;
               }
               
               const parts = [rua, numero, bairro, cidade, cep].filter(Boolean);
               pickupText = parts.join(', ');
             } catch {
               pickupText = '';
             }
           }
           
           
           let distanciaKm: number | null = null;
           try {
             const [pickupCoords, deliveryCoords] = await Promise.all([
               pickupText ? getCoordsFromAddress(pickupText) : Promise.resolve(undefined),
               deliveryText ? getCoordsFromAddress(deliveryText) : Promise.resolve(undefined)
             ]);
             
             if (pickupCoords && deliveryCoords) {
               distanciaKm = getDistanceFromLatLonInKm(
                 pickupCoords[0], pickupCoords[1],
                 deliveryCoords[0], deliveryCoords[1]
               );
             }
           } catch {
             distanciaKm = null;
           }
           
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
               distancia_km: distanciaKm !== null ? distanciaKm : null,
               status: 'criada'
           });
        }
        fetchPedidos();
        await showAlert('Pedido clonado com sucesso!', 'Sucesso');
    } catch (e) {
        console.error(e);
        await showAlert('Erro ao clonar pedido.', 'Erro');
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
            const fullAddress = quickAddress;

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
  }, [quickAddress, originCoords, commerceDefaultCoords, comercioAddress, quickDestinationCoords]);

  
    useEffect(() => {
        
        const activeRules = dynamicRules.filter(r => r.ativa);

        const calculatePrice = () => {
            const dist = quickDistance;
            
            let price = 0;
            
            if (pricingMode === 'Fixo') {
                setPricingUnavailable(null);
                price = pricePerPoint * 2;
            } else if (pricingMode === 'Zerar') {
                setPricingUnavailable(null);
                price = 0;
            } else if (pricingMode === 'Distância') {
                 const tabela = selectedTabelaId ? pricingTables.find(t => String(t.id) === String(selectedTabelaId)) : undefined;
                 const tabelaValida = !!tabela && tabelasComFaixas.has(String(tabela.id));

                 if (!tabelaValida) {
                     if (pricingTables.length > 0) {
                         setPricingUnavailable('Nenhuma tabela de preço configurada — selecione uma tabela válida ou contate o suporte.');
                     }
                 } else {
                     setPricingUnavailable(null);
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


                    if ((tabela.valor_multiplo_comercio || 0) > 0) {
                        price += tabela.valor_multiplo_comercio || 0;
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

            // Aplica regras de preço dinâmico do entregador sobre a comissão base
            const activeDriverRules = driverDynamicRules.filter(r => r.ativa);
            activeDriverRules.forEach(rule => {
                const criterio = (rule.criterio || '').toUpperCase();
                if (criterio === 'MULTIPLICADOR' && rule.multiplicador) {
                    driverPrice *= Number(rule.multiplicador);
                } else if (criterio === 'TAXA_FIXA' && rule.multiplicador) {
                    driverPrice += Number(rule.multiplicador);
                }
            });

            setQuickDriverPrice(driverPrice);
        };

        calculatePrice();
      }, [quickAddress, quickDistance, quickRetorno, pricingMode, selectedTabelaId, pricingTables, pricingRanges, pricePerPoint, dynamicRules, filters.cliente_id, commissionTables, commissionRanges, driverDynamicRules, tabelasComFaixas]);

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

    
    const pontosAdicionais = Array.isArray((entrega as any)?.pontos_adicionais) ? ((entrega as any).pontos_adicionais as any[]) : [];
    const additionalDestinations: Array<{ coords: [number, number]; title: string; order: number }> = [];
    
    for (let i = 0; i < pontosAdicionais.length; i++) {
      const ponto = pontosAdicionais[i];
      const enderecoCompleto = ponto.numero ? `${ponto.endereco_texto}, ${ponto.numero}` : ponto.endereco_texto;
      
      if (enderecoCompleto) {
        const coords = await resolveCoordsWithFallback(enderecoCompleto);
        if (coords && isValidCoords(coords)) {
          additionalDestinations.push({
            coords,
            title: `Destino ${i + 2}`,
            order: i + 2
          });
        }
      }
    }
    
    setAdditionalDestinationsCoords(additionalDestinations);
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
              prev.heading !== next.heading ||
              prev.last_location_update !== next.last_location_update ||
              prev.is_online !== next.is_online ||
              prev.status !== next.status ||
              prev.foto_url !== next.foto_url;

            if (!changed) {
              return;
            }
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
                   heading: updatedEntregador.heading,
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

    const pedidosChannel = supabase
      .channel('pedidos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        queueSilentRefreshRef.current();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nova_entrega' }, () => {
        queueSilentRefreshRef.current();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(pedidosChannel);
    };
  }, []);

  useEffect(() => {
    const isFinalizado = (p: Pedido) => {
      if (p.status === 'entregue' || p.status === 'cancelado') return true;
      const e = entregasMap[p.id];
      return !!e && (e.status === 'entregue' || e.status === 'cancelada');
    };
    // "Status: Todos" SEMPRE esconde entregues/cancelados (com ou sem filtro de
    // data). Finalizados só aparecem ao filtrar explicitamente por um status
    // específico ('Entregue'/'Cancelado', ou 'Finalizados' no comércio).
    const displayedItems = filters.status === 'todos'
        ? allItems.filter(p => !isFinalizado(p))
        : filters.status === 'finalizados'
            ? allItems.filter(isFinalizado)
            : allItems.filter(p => p.status === filters.status);
    setItems(displayedItems);
  }, [filters.status, allItems, entregasMap]);

  // Contadores por status da JANELA DE DATA inteira (não da lista filtrada):
  // preenchidos por fetchPedidos via query separada, sem esconder finalizados.
  const statusCounters = useMemo(
    () => ({ criado: 0, confirmado: 0, em_preparo: 0, pronto: 0, cancelado: 0, entregue: 0, ...statusCountsWindow }),
    [statusCountsWindow],
  );

  const uniqueCidades = useMemo(() => {
    const dbCities = clientes.map(c => c.cidade).filter(Boolean) as string[];
    const combined = new Set([...dbCities, ...ibgeCities]);
    return Array.from(combined).sort();
  }, [clientes, ibgeCities]);

  const onlineEntregadoresCount = availableEntregadores.filter(e => e.is_online).length;
  
  const visibleDeliveryPersons = useMemo(() => {
    
    if (isComercio) {
      const acceptedStatuses = ['atribuida', 'chegue_coleta', 'em_rota', 'chegue_entrega', 'coletando', 'entregando'];
      
      
      if (!items || items.length === 0) {
        return [];
      }
      
      
      const acceptedEntregadorIds = new Set<string>();
      items.forEach(pedido => {
        const entrega = entregasMap[pedido.id];
        if (entrega?.entregador_id && acceptedStatuses.includes(entrega.status)) {
          acceptedEntregadorIds.add(entrega.entregador_id);
        }
      });
      
      
      return mapDeliveryPersons.filter(person => 
        acceptedEntregadorIds.has(person.id)
      );
    }
    

    return mapDeliveryPersons.filter(person => person.is_online);
  }, [mapDeliveryPersons, isComercio, items, entregasMap]);

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
      'heading',
      'last_location_update',
      'created_at',
      'updated_at',
      'foto_url',
      'veiculo_tipo',
    ].join(', ');

    const { data, error } = await supabase
      .from('entregadores')
      .select(selectFields)
      .eq('status', 'ativo')
      .order('nome_completo');
    
    if (error) {
      console.error('[fetchEntregadoresList] Error:', error);
      return;
    }
    
    let filteredData = data || [];

    
    if (isComercio) {
      const acceptedStatuses = ['atribuida', 'chegou_coleta', 'em_rota', 'chegou_entrega', 'coletando', 'entregando'];
      const { data: entregasData, error: entregasError } = await supabase
        .from('nova_entrega')
        .select('entregador_id')
        .in('status', acceptedStatuses);
      
      if (entregasError) {
        console.error('[fetchEntregadoresList] Error fetching entregas:', entregasError);
      } else {
        const entregadorIdsWithAcceptedOrders = new Set(
          (entregasData || []).map((e: any) => e.entregador_id).filter(Boolean)
        );
        filteredData = filteredData.filter((e: any) => entregadorIdsWithAcceptedOrders.has(e.id));
      }
    }
    
    setAvailableEntregadores(filteredData as unknown as Entregador[]);
    
    const map: Record<string, Entregador> = {};
    const mapPersons: MapDeliveryPerson[] = [];

    filteredData.forEach((e: any) => {
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
              heading: e.heading,
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
    
    try {
        
        // "Status: Todos" = mostra TUDO que cai no filtro de data, inclusive
        // entregue/cancelado. Não há mais `.neq` de status finalizado nem
        // reconciliação de status-stale — a lista respeita só data + status.
        let qPedidos = supabase.from('pedidos').select('*').order('created_at', { ascending: false });
        let qEntregas = supabase.from('nova_entrega').select('*').order('created_at', { ascending: false });

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
        
        // Filtro de data: inclui o pedido se o `created_at` OU o `agendar_em`
        // cair dentro do período. Limites em UTC a partir do dia-calendário de
        // São Paulo; limite superior exclusivo (`.lt`).
        const gteBound = filters.de ? toUtcRange(filters.de, filters.de).gte : null;
        const ltBound = filters.ate ? toUtcRange(filters.ate, filters.ate).lt : null;
        let dateOrExpr: string | null = null;

        if (gteBound || ltBound) {
             // Condição da janela para uma coluna; se só um dos limites existir,
             // usa só ele (sem quebrar o `and(...)`).
             const rangeFor = (col: string) => {
                 const parts: string[] = [];
                 if (gteBound) parts.push(`${col}.gte.${gteBound}`);
                 if (ltBound) parts.push(`${col}.lt.${ltBound}`);
                 return parts.length > 1 ? `and(${parts.join(',')})` : parts[0];
             };
             dateOrExpr = `${rangeFor('created_at')},${rangeFor('agendar_em')}`;
             qPedidos = qPedidos.or(dateOrExpr);
             qEntregas = qEntregas.or(dateOrExpr);
        }

        // Contadores por status: contagem SEPARADA da lista. Aplica só o filtro de
        // data (created_at OU agendar_em na janela) + cliente/cidade/origem — SEM o
        // "esconder finalizados" nem a reconciliação de status-stale. Assim os tiles
        // Entregue/Cancelado refletem o período inteiro mesmo com status='todos'
        // (que na lista mostra só os ativos).
        // Sem filtro de data explícito, a janela dos tiles é o DIA ATUAL (nunca a
        // tabela inteira) — Opção A.
        let contadoresOrExpr = dateOrExpr;
        if (!contadoresOrExpr) {
            const hoje = todayYmd();
            const r = toUtcRange(hoje, hoje);
            contadoresOrExpr = `and(created_at.gte.${r.gte},created_at.lt.${r.lt}),and(agendar_em.gte.${r.gte},agendar_em.lt.${r.lt})`;
        }
        let qContadores = supabase.from('pedidos').select('status, origem');
        if (filters.cliente_id) {
            qContadores = qContadores.eq('cliente_id', filters.cliente_id);
        } else if (filters.cidade && filters.cidade !== 'todos') {
            const idsCidade = clientes.filter(c => c.cidade === filters.cidade).map(c => c.id);
            qContadores = qContadores.in('cliente_id', idsCidade.length > 0 ? idsCidade : ['00000000-0000-0000-0000-000000000000']);
        }
        qContadores = qContadores.or(contadoresOrExpr);

        const [resPedidos, resEntregas, resContadores] = await Promise.all([qPedidos, qEntregas, qContadores]);
        if (resPedidos.error) throw resPedidos.error;
        if (resEntregas.error) throw resEntregas.error;

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
            agendar_em: e.agendar_em || null,
            retirada_no_local: e.retirada_no_local || false,
            pagamento_metodo: e.pagamento_metodo || null,
            pagamento_na_entrega: e.pagamento_na_entrega || false,
            troco_para: e.troco_para ?? null,
            documento_tipo: e.documento_tipo || null,
            documento_numero: e.documento_numero || null,
            voucher_codigo: null,
            voucher_tipo: null,
            desconto_total: null,
            desconto_entrega: null,
            cancelamento_origem: null,
            cancelamento_codigo: null,
            cancelamento_motivo: null,
            cancelado_em: null,
            created_at: e.created_at,
            updated_at: e.updated_at
        }));

        const finalPedidos = [...pedidosList, ...syntheticPedidos];

        const finalPedidosComOrigem = filters.origem === 'todos'
          ? finalPedidos
          : finalPedidos.filter(p => (filters.origem === 'manual' ? p.origem === 'manual' : p.origem === 'online'));

        unlinkedEntregas.forEach(e => {
            eMap[e.id] = e;
        });

        if (fetchSeq !== pedidosFetchSeqRef.current) return;
        setAllItems(finalPedidosComOrigem);
        
        const isPedidoFinalizado = (p: Pedido) => {
            if (p.status === 'entregue' || p.status === 'cancelado') return true;
            const entrega = eMap[p.id];
            return !!entrega && (entrega.status === 'entregue' || entrega.status === 'cancelada');
        };

        // "Status: Todos" SEMPRE esconde entregues/cancelados (com ou sem filtro de
        // data). Finalizados só aparecem ao filtrar explicitamente por um status
        // específico ('Entregue'/'Cancelado', ou 'Finalizados' no comércio).
        const displayedItems = filters.status === 'todos'
            ? finalPedidosComOrigem.filter(p => !isPedidoFinalizado(p))
            : filters.status === 'finalizados'
                ? finalPedidosComOrigem.filter(isPedidoFinalizado)
                : finalPedidosComOrigem.filter(p => p.status === filters.status);

        setItems(displayedItems);
        setEntregasMap(eMap);

        // Contadores da janela de data (ou do dia atual, se não houver filtro de
        // data — ver query qContadores acima).
        if (!resContadores.error) {
            const rows = (resContadores.data || []) as { status: string | null; origem: string | null }[];
            const rowsComOrigem = filters.origem === 'todos'
              ? rows
              : rows.filter(r => (filters.origem === 'manual' ? r.origem === 'manual' : r.origem === 'online'));
            const c: Record<string, number> = { criado: 0, confirmado: 0, em_preparo: 0, pronto: 0, cancelado: 0, entregue: 0 };
            for (const r of rowsComOrigem) { if (r.status && r.status in c) c[r.status]++; }
            setStatusCountsWindow(c);
        }

    } catch (e: any) {
        console.error('Fetch error', e);
        if (fetchSeq === pedidosFetchSeqRef.current) setError(e.message);
    } finally {
        
        if (fetchSeq === pedidosFetchSeqRef.current) setLoadingList(false);
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
    queueSilentRefreshRef.current = queueSilentPedidosRefresh;
  }, [queueSilentPedidosRefresh]);

  useEffect(() => {
    fetchPedidos();
    // Ao trocar de filtro (fetchPedidos muda de identidade), cancela qualquer
    // "silent refresh" pendente. Sem isso, um setTimeout agendado antes da troca
    // dispara depois com o fetchPedidos ANTIGO (filtros velhos), incrementa o
    // fetchSeq e faz o fetch novo abortar no guard — deixando lista e contadores
    // presos na janela anterior.
    return () => {
      if (pedidosRefreshTimeoutRef.current) {
        clearTimeout(pedidosRefreshTimeoutRef.current);
        pedidosRefreshTimeoutRef.current = null;
      }
    };
  }, [fetchPedidos]);

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
          if (!isComercio) return;
        }

        if (!error && (!data || data.length === 0)) return;

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
  }, [fetchPedidos, isComercio]);

  useEffect(() => {
    let cancelled = false;

    const uniqueEntregas = new Map<string, Entrega>();
    Object.values(entregasMap).forEach((e) => {
      if (e?.id) uniqueEntregas.set(e.id, e);
    });

    const activeEntregas = Array.from(uniqueEntregas.values()).filter(
      (e) => e.entrega_endereco_texto && e.status !== 'entregue' && e.status !== 'cancelada'
    );

    const activeIds = new Set(activeEntregas.map((e) => e.id));
    setDeliveryPins((prev) => prev.filter((p) => activeIds.has(p.id)));

    (async () => {
      for (const entrega of activeEntregas) {
        if (cancelled) break;
        try {
          const storedLat = (entrega as any).entrega_lat;
          const storedLng = (entrega as any).entrega_lng;
          const coords: [number, number] | undefined =
            typeof storedLat === 'number' && typeof storedLng === 'number'
              ? [storedLat, storedLng]
              : await getCoordsFromAddress(entrega.entrega_endereco_texto!);
          if (coords && !cancelled) {
            const codigo = entrega.entrega_codigo_pedido || entrega.id.slice(0, 8);
            // label: rótulo curto, sempre visível em cima do pin (só o nome).
            // tooltip: detalhe completo, aberto ao tocar no pin (código + agendado).
            const label = entrega.entrega_contato || codigo;
            const tooltip = [codigo, entrega.entrega_contato, (entrega as any).agendar_em ? '(agendado)' : null]
              .filter(Boolean)
              .join(' — ');
            const color = isComercio ? '#f97316' : getCommerceColor(entrega.cliente_id || '');
            const agendado = !!(entrega as any).agendar_em;
            setDeliveryPins((prev) => {
              const next = prev.filter((p) => p.id !== entrega.id);
              next.push({ id: entrega.id, coords, tooltip, color, label, agendado });
              return next;
            });
          }
        } catch {
          
        }
      }
    })();

    return () => { cancelled = true; };
  }, [entregasMap, isComercio]);

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
                if (idx === -1) return prev;
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

  const handleDelete = async (p: Pedido) => {
    const ifoodOrderId = typeof (p as any).ifood_order_id === 'string' ? String((p as any).ifood_order_id).trim() : '';
    const isIfoodOrder = !!ifoodOrderId;

    
    if (isIfoodOrder) {
        setSelectedPedido(p);
        setOpenMenuId(null);
        
        
        const reasons = await IfoodService.getCancellationReasons(p.id, p.cliente_id, ifoodOrderId);
        setIfoodCancellationReasons(reasons);
        
        if (reasons.length > 0) {
            setIsIfoodCancellationReasonsModalOpen(true);
        } else {
            
            await handleDeleteWithReason(p, null);
        }
        return;
    }
    
    const ok = await showConfirm('Tem certeza que deseja cancelar este pedido?');
    if (!ok) return;
    
    await handleDeleteWithReason(p, null);
  };

  const handleDeleteWithReason = async (p: Pedido, reason: { code: string; title: string } | null) => {
    try {
        let showCancellationModal = false;
        
        
        const ifoodOrderId = typeof (p as any).ifood_order_id === 'string' ? String((p as any).ifood_order_id).trim() : '';
        const isIfoodOrder = !!ifoodOrderId;
        if (isIfoodOrder) {
            const result = await IfoodService.handleCancellation(
                p.id, 
                ifoodOrderId,
                reason?.title,
                reason?.code
            );
            if (result?.success === false) {
              throw new Error(result?.message || 'Falha ao cancelar pedido no iFood');
            }
            showCancellationModal = result?.showModal || false;
        } else {
            
            await supabase.from('pedidos').update({ 
                status: 'cancelado',
                cancelamento_origem: 'manual',
                cancelado_em: new Date().toISOString()
            }).eq('id', p.id);
        }
        
        await supabase.from('nova_entrega').update({ status: 'cancelada' }).eq('pedido_id', p.id);
        
        await logAction(p.id, 'CANCELAR_PEDIDO', 'Pedido cancelado via menu', 
            { status: 'ativo' }, 
            { status: 'cancelado' }
        );
        
        
        const { data: updatedPedido } = await supabase
          .from('pedidos')
          .select('*')
          .eq('id', p.id)
          .maybeSingle();
        
        
        if (showCancellationModal) {
            if (updatedPedido && (updatedPedido.cancelamento_motivo || updatedPedido.cancelamento_codigo)) {
                setSelectedPedido(updatedPedido);
                setIsCancelamentoModalOpen(true);
            }
        }
        
        await fetchPedidos();
        setOpenMenuId(null);
        await showAlert('Pedido cancelado com sucesso!', 'Sucesso');
    } catch (e) {
        console.error('Erro ao cancelar pedido:', e);
        await showAlert('Erro ao cancelar pedido', 'Erro');
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
          void showAlert('Não há pedidos pendentes de alocação.', 'Aviso');
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
      const ok = await showConfirm('Deseja realmente cancelar esta entrega finalizada? O valor será estornado para o comércio.');
      if (!ok) return;
      
      const entrega = entregasMap[p.id];
      
      try {
        await supabase.from('pedidos').update({ status: 'cancelado' }).eq('id', p.id);

        if (p.origem === 'online' || !!(p as any).ifood_order_id) {
            supabase.functions.invoke('ifood-update-status', {
                body: { action: 'requestCancellation', pedidoId: p.id }
            }).then(({ data, error }) => {
                if (error || data?.success === false) console.warn('iFood update failed', error || data);
            });
        }
        
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
        await showAlert('Entrega cancelada e valor estornado com sucesso!', 'Sucesso');
      } catch (e) {
          console.error('Erro ao cancelar entrega:', e);
          await showAlert('Erro ao cancelar entrega', 'Erro');
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

  const handleSwapInProgress = (p: Pedido) => {
      const entrega = entregasMap[p.id];
      setSelectedPedidoForAllocation(p);
      setSelectedEntregadorId(entrega?.entregador_id || '');
      setIsSwappingFinalized(false);
      setIsAllocationModalOpen(true);
      setOpenMenuId(null);
  };

  const handleAddObservation = async (p: Pedido) => {
      const currentObs = p.observacoes || '';
      const newObs = await showPrompt('Escrever Observação:', { title: 'Observação', defaultValue: currentObs });
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
            await showAlert('Selecione um entregador', 'Aviso');
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
            await showAlert('Pedidos alocados com sucesso!', 'Sucesso');
        } catch (err) {
            await showAlert('Erro ao alocar pedidos em massa', 'Erro');
            console.error(err);
        }
        return;
    }

    if (!selectedPedidoForAllocation) return;
    const entrega = entregasMap[selectedPedidoForAllocation.id];
    
    if (!entrega) {
      await showAlert('Não foi encontrada uma entrega vinculada a este pedido para alocar.', 'Aviso');
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
              
          await showAlert('Entregador trocado com sucesso.', 'Sucesso');
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
      await showAlert('Erro ao salvar alocação', 'Erro');
      console.error(err);
    }
  };

  const handleQuickCreate = async () => {
    if (!quickAddress) {
        await showAlert('Por favor, informe o endereço de entrega.', 'Aviso');
        return;
    }

    if (!quickDestinationCoords || !quickDestinationSelected) {
        await showAlert('Selecione o endereço de entrega a partir das sugestões da lista.', 'Aviso');
        return;
    }

    if (quickDistanceLoading) {
        await showAlert('Aguarde o cálculo do valor da entrega antes de lançar o pedido.', 'Aviso');
        return;
    }

    if (!quickDistance || quickDistance <= 0 || !quickPrice || quickPrice <= 0) {
        await showAlert(pricingUnavailable || 'Não foi possível calcular o valor da entrega para esse endereço. Verifique o endereço informado.', 'Aviso');
        return;
    }

    const fullAddress = quickAddress;

    if (!comercioAddress) {
        await showAlert('Endereço do comércio não encontrado. Verifique seu cadastro.', 'Aviso');
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

        
        const activeDemandsForQuick = dynamicRules.filter(r => r.ativa);
        const demandRulesForQuick = activeDemandsForQuick.length > 0
          ? activeDynamicRules.filter(r => r.value > 0)
          : [];

        const { error: eError } = await supabase
            .from('nova_entrega')
            .insert({
                pedido_id: pData.id,
                cliente_id: clienteId,
                status: 'criada',
                coleta_endereco_texto: comercioAddress,
                coleta_lat: (commerceDefaultCoords ?? originCoords)?.[0] ?? null,
                coleta_lng: (commerceDefaultCoords ?? originCoords)?.[1] ?? null,
                entrega_endereco_texto: fullAddress,
                entrega_lat: quickDestinationCoords?.[0] ?? null,
                entrega_lng: quickDestinationCoords?.[1] ?? null,
                entrega_contato: quickContact,
                entrega_telefone: quickPhone,
                entrega_complemento: quickComplement,
                distancia_km: quickDistance,
                valor_entrega: valorEntrega,
                valor_entregador: quickDriverPrice,
                retorno: quickRetorno,
                atribuicao_modo: 'manual',
                tipo_cobranca: 'fatura',
                cobrar_destinatario: false,
                ...(demandRulesForQuick.length > 0 ? { opcionais: { demand_rules: demandRulesForQuick } } : {}),
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

        await showAlert('Pedido criado com sucesso!', 'Sucesso');
        setQuickAddress('');


    setQuickPaymentMethod('Dinheiro');
    setQuickRetorno(false);

        
        setQuickContact('');
        setQuickPhone('');
        setQuickComplement('');
        setQuickDistance(0);
        setQuickPrice(0);
        setQuickDestinationCoords(undefined);
        setQuickDestinationSelected(false);

        fetchPedidos();

    } catch (e: any) {
        console.error('Erro ao criar pedido rápido:', e);
        await showAlert('Erro ao criar pedido: ' + e.message, 'Erro');
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
      {}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Pedidos • Acompanhamento</h2>
        </div>
      </div>

      {}
      {isComercio && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <div className="bg-sky-100 p-2 rounded-lg text-sky-600">
                    <Store size={20} />
                </div>
                Lançamento Rápido
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                {}
                <div className="md:col-span-4">
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Endereço de Entrega</label>
                    <AddressAutocomplete
                        value={quickAddress}
                        onChange={(val) => {
                          setQuickDestinationCoords(undefined);
                          setQuickDestinationSelected(false);
                          setQuickAddress(val);
                        }}
                        onSelectCoords={(coords) => {
                          setQuickDestinationCoords(coords);
                          setQuickDestinationSelected(!!coords);
                        }}
                        placeholder="Rua, Bairro..."
                        containerClassName="w-full"
                        inputClassName={
                          quickAddress && !quickDestinationSelected
                            ? 'border-red-400 bg-red-50 focus:border-red-500'
                            : 'border-slate-300'
                        }
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

                {}
                <div className="md:col-span-4">
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">
                        Valor Entrega {quickDistance > 0 ? <span className="text-sky-600 font-normal">({quickDistance} km)</span> : quickDistanceLoading ? <span className="text-slate-400 font-normal">(calculando...)</span> : null}
                    </label>
                    <div className="relative">
                        <span className={`absolute left-3 top-2.5 text-sm ${pricingUnavailable ? 'text-red-400' : 'text-slate-400'}`}>R$</span>
                        <input
                            type="text"
                            value={pricingUnavailable ? '--' : quickPrice.toFixed(2).replace('.', ',')}
                            readOnly
                            className={`w-full pl-8 pr-3 py-2 border rounded font-bold outline-none cursor-not-allowed ${pricingUnavailable ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
                        />
                    </div>
                    {pricingUnavailable && (
                        <span className="text-[10px] text-red-600 font-bold block mt-1">{pricingUnavailable}</span>
                    )}
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
                {quickRetorno && (() => {
                    const tabela = pricingTables.find((t: any) => String(t.id) === String(selectedTabelaId));
                    if (!tabela || !tabela.valor_retorno || Number(tabela.valor_retorno) <= 0) return null;
                    const tipo = (tabela.tipo_retorno || '').trim().toLowerCase();
                    let label = '';
                    if (tipo === 'percentual' || tipo === 'porcentagem') {
                        const priceWithout = quickPrice / (1 + Number(tabela.valor_retorno) / 100);
                        const retornoAmt = quickPrice - priceWithout;
                        label = `+ R$ ${retornoAmt.toFixed(2).replace('.', ',')} (${tabela.valor_retorno}%)`;
                    } else {
                        label = `+ R$ ${Number(tabela.valor_retorno).toFixed(2).replace('.', ',')}`;
                    }
                    return (
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                            {label}
                        </span>
                    );
                })()}
                
                <div className="text-xs text-slate-400 ml-auto flex items-center gap-1">
                    <MapPin size={12} />
                    Origem: {comercioAddress || 'Carregando...'}
                </div>
            </div>
        </div>
      )}

      {}
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
            additionalDestinations={additionalDestinationsCoords}
            deliveryPins={deliveryPins}
          />
        </div>
      </div>

      {}
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

      {}
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

      {}
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

      {}
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
                {hasIfoodVisible && <th className="px-4 py-3">Integração</th>}
                <th className="px-4 py-3">Taxa</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Entregador</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingList ? (
                <tr><td colSpan={tableColCount} className="px-4 py-8 text-center text-slate-500">Carregando pedidos...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={tableColCount} className="px-4 py-8 text-center text-slate-500">Nenhum pedido encontrado.</td></tr>
              ) : (
                items.map(p => {
                    const cliente = clientes.find(c => c.id === p.cliente_id);
                    const entrega = entregasMap[p.id];
                    const entregador = entrega?.entregador_id ? entregadores[entrega.entregador_id] : null;
                    const isPedidoMultiplo = Array.isArray((entrega as any)?.pontos_adicionais) && ((entrega as any).pontos_adicionais as any[]).length > 0;
                    const pricingDestinosMulti = isPedidoMultiplo
                      ? (() => {
                          const raw = (entrega as any)?.opcionais?.pricing_destinos;
                          return Array.isArray(raw) ? raw : [];
                        })()
                      : [];
                    const taxaTotal = isPedidoMultiplo && pricingDestinosMulti.length > 0
                      ? pricingDestinosMulti.reduce((sum: number, pd: any) => sum + (pd?.valor || 0), 0)
                      : (entrega?.valor_entrega ?? 0);
                    const valorMultiploStored = (entrega as any)?.opcionais?.valor_multiplo as { valorPorPonto: number; pontos: number; total: number } | undefined;

                    return (
                      <Fragment key={p.id}>
                        <tr
                          className={`hover:bg-slate-50 transition-colors group ${selectedIds.has(p.id) ? 'bg-emerald-50 hover:bg-emerald-100' : ''}`}
                          onClick={(e) => {
                            if (!isPedidoMultiplo) return;
                            const el = e.target as HTMLElement | null;
                            if (el?.closest('button, a, input, textarea, select, label')) return;
                            toggleMultiPedido(p.id);
                          }}
                        >
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
                                {p.agendar_em && (
                                  <div className="text-xs text-sky-700">Agendado: {format(new Date(p.agendar_em), 'dd/MM HH:mm')}</div>
                                )}
                                {isPedidoMultiplo && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleMultiPedido(p.id);
                                    }}
                                    className="mt-1 inline-flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full hover:bg-emerald-100"
                                  >
                                    Pedido múltiplo
                                    <span className="text-emerald-700/70">
                                      {expandedMultiPedidos[p.id] ? '▲' : '▼'}
                                    </span>
                                  </button>
                                )}
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
                            {hasIfoodVisible && (
                              <td className="px-4 py-3">
                                  {p.origem === 'online' ? (
                                    <div className="text-xs">
                                      <div className="font-medium text-slate-800">iFood</div>
                                      <div className="text-slate-500">Código: {p.numero || '-'}</div>
                                      {p.ifood_order_id && <div className="text-slate-400">ID: {p.ifood_order_id}</div>}
                                    </div>
                                  ) : (
                                    <span className="text-slate-500">-</span>
                                  )}
                              </td>
                            )}
                            <td className="px-4 py-3 font-medium text-slate-700">
                                <div>{taxaTotal ? `R$ ${taxaTotal.toFixed(2)}` : '-'}</div>
                                {isPedidoMultiplo && valorMultiploStored && valorMultiploStored.valorPorPonto > 0 && (
                                  <div className="text-xs text-emerald-600 font-medium whitespace-nowrap">
                                    + R$ {(valorMultiploStored.valorPorPonto * (1 + ((entrega as any)?.pontos_adicionais as any[]).length)).toFixed(2).replace('.', ',')} (Múltiplo)
                                  </div>
                                )}
                                {Array.isArray((entrega as any)?.opcionais?.demand_rules) && ((entrega as any).opcionais.demand_rules as any[]).length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {((entrega as any).opcionais.demand_rules as any[]).map((r: any, idx: number) => (
                                      <span key={idx} className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                                        {r.name}{r.value > 0 ? ` +R$${Number(r.value).toFixed(2)}` : ''}
                                      </span>
                                    ))}
                                  </div>
                                )}
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
                        {isPedidoMultiplo && expandedMultiPedidos[p.id] && (
                            <tr className="bg-slate-50">
                              <td colSpan={tableColCount} className="px-4 py-3">
                                {(() => {
                                  const pontos = (entrega as any)?.pontos_adicionais as any[];
                                  const pricingDestinosRaw = (entrega as any)?.opcionais?.pricing_destinos;
                                  const pricingDestinos = Array.isArray(pricingDestinosRaw) ? pricingDestinosRaw : [];

                                  const getAddr = (pt: any) => {
                                    const base = String(pt?.endereco_texto || '').trim();
                                    return pt?.numero ? `${base}, ${String(pt.numero).trim()}` : base;
                                  };

                                  const destinos = [
                                    {
                                      label: String((entrega as any)?.entrega_contato || '').trim() || 'Destino 1',
                                      endereco: String(entrega?.entrega_endereco_texto || p.endereco_texto || '').trim(),
                                      valor: pricingDestinos[0]?.valor,
                                    },
                                    ...pontos.map((pt: any, idx: number) => ({
                                      label: String(pt?.contato || '').trim() || `Destino ${idx + 2}`,
                                      endereco: getAddr(pt),
                                      valor: pricingDestinos[idx + 1]?.valor,
                                    })),
                                  ];

                                  const totalDestinos = 1 + (entrega?.pontos_adicionais?.length || 0);
                                  const timeline = (entrega as any)?.opcionais?.timeline || {};

                                  const isDestinoCompleted = (idx: number) => {
                                    return !!timeline[`destino_${idx + 1}_concluido_em`];
                                  };

                                  return (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {destinos.map((d, idx) => {
                                        const isCompleted = isDestinoCompleted(idx);
                                        return (
                                          <div key={idx} className={`bg-white border rounded-lg p-3 ${isCompleted ? 'border-green-300 bg-green-50/50' : 'border-slate-200'}`}>
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="flex items-center gap-2">
                                                <div className={`text-xs font-bold ${isCompleted ? 'text-green-700' : 'text-slate-700'}`}>{d.label}</div>
                                                {isCompleted && (
                                                  <span className="inline-flex items-center px-1.5 py-0.5 bg-green-100 text-green-700 text-[9px] font-bold uppercase rounded-full">Concluído</span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <div className={`text-xs font-semibold ${isCompleted ? 'text-green-600' : 'text-slate-700'}`}>
                                                  {typeof d.valor === 'number' && !Number.isNaN(d.valor) ? `R$ ${d.valor.toFixed(2)}` : '-'}
                                                </div>
                                                {totalDestinos > 1 && entrega?.status === 'criada' && (
                                                  <button
                                                    onClick={() => handleRemoveDestino(p.id, idx === 0 ? -1 : idx - 1, idx === 0)}
                                                    disabled={removingDestino?.pedidoId === p.id && removingDestino?.destinoIndex === (idx === 0 ? -1 : idx - 1)}
                                                    className="text-red-500 hover:text-red-700 disabled:text-red-300 disabled:cursor-not-allowed"
                                                    title="Remover destino"
                                                  >
                                                    <Trash2 size={14} />
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                            <div className={`text-sm mt-1 ${isCompleted ? 'text-green-700/70 line-through' : 'text-slate-700'}`}>{d.endereco || '-'}</div>
                                            {valorMultiploStored && valorMultiploStored.valorPorPonto > 0 && (
                                              <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                                                + R$ {valorMultiploStored.valorPorPonto.toFixed(2).replace('.', ',')} (Múltiplo)
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          )}
                      </Fragment>
                    );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {}
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
                        {p.origem === 'online' && p.status === 'criado' && (
                          <button
                            onClick={() => handleAcceptIfood(p)}
                            className="px-4 py-2 hover:bg-slate-50 text-sm text-emerald-700 flex items-center gap-2"
                          >
                            <CheckSquare size={16}/> Aceitar iFood
                          </button>
                        )}
                        <button onClick={() => handleCopyLink(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><Link size={16}/> Copiar link de rastreio</button>
                        <button onClick={() => handleHistory(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><Clock size={16}/> Logs</button>
                        {p.status === 'cancelado' && (p.cancelamento_motivo || p.cancelamento_codigo || p.cancelamento_origem) && (
                          <button onClick={() => handleViewCancelamento(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-red-600 flex items-center gap-2"><AlertCircle size={16}/> Motivo do Cancelamento</button>
                        )}
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
                                {entregasMap[p.id]?.entregador_id && p.status !== 'entregue' && p.status !== 'cancelado' && (
                                    <button onClick={() => handleSwapInProgress(p)} className="px-4 py-2 hover:bg-slate-50 text-sm text-blue-600 flex items-center gap-2"><RefreshCw size={16}/> Trocar Entregador</button>
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
                             <button onClick={() => handleDelete(p)} className="px-4 py-2 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2 border-t border-slate-100 mt-1"><Trash2 size={16}/> Cancelar</button>
                        )}
                     </>
                 );
             })()}
          </div>
      )}

      {}
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
                    
                    {}
                    {hasMultipleDestinations(entrega) && hasNextDestination(entrega) && canEditEntrega && (
                      <button
                        onClick={() => handleManualAdvanceDestination(p.id)}
                        className="px-4 py-2 hover:bg-emerald-50 text-sm text-emerald-700 flex items-center justify-between font-medium"
                      >
                        <span>AVANÇAR DESTINO</span>
                        <ArrowRight size={16} className="text-emerald-600" />
                      </button>
                    )}
                    
                    {filteredEntregaOptions.map(opt => {
                      
                      if (opt.value === 'entregue' && hasMultipleDestinations(entrega) && !isLastDestination(entrega)) {
                        return null;
                      }
                      
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

      {}
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
            {availableEntregadores
              .filter(entregador => entregador.status === 'ativo' && entregador.is_online)
              .length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <AlertCircle className="mx-auto mb-2 text-slate-400" size={32} />
                <p className="text-sm font-medium">Nenhum entregador online disponível</p>
              </div>
            ) : (
              availableEntregadores
                .filter(entregador => entregador.status === 'ativo' && entregador.is_online)
                .map(entregador => (
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
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            ONLINE
                        </div>
                      </div>
                    </div>
                    {entregador.veiculo_tipo && (
                      <span className="text-xs px-2 py-1 bg-slate-100 rounded text-slate-600 uppercase">
                          {entregador.veiculo_tipo}
                      </span>
                    )}
                  </label>
                ))
            )}
          </div>
        </div>
      </Modal>

      {}
      <Modal open={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="" hideFooter={true}>
         {selectedPedido && (
            <PedidoEditForm
                pedido={selectedPedido}
                entrega={entregasMap[selectedPedido.id]}
                onClose={() => setIsEditModalOpen(false)}
                onSave={fetchPedidos}
                onAlert={showAlert}
                pricingTables={pricingTables}
                isAdmin={isAdmin}
            />
         )}
      </Modal>

      {}
      <Modal open={isDetailsModalOpen} onClose={() => setIsDetailsModalOpen(false)} title="" cancelText="Fechar">
         {selectedPedido && (
            <PedidoDetailsView
                pedido={selectedPedido}
                entrega={entregasMap[selectedPedido.id]}
                cliente={clientes.find(c => c.id === selectedPedido.cliente_id)}
                onClose={() => setIsDetailsModalOpen(false)}
                onAlert={showAlert}
                onRefresh={fetchPedidos}
            />
         )}
      </Modal>

      {}
      <Modal open={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} title="" cancelText="Fechar">
         {selectedPedido && (
             <PedidoHistoryModal
                pedido={selectedPedido}
                entregaId={entregasMap[selectedPedido.id]?.id}
             />
         )}
      </Modal>

      {}
      <Modal open={isCancelamentoModalOpen} onClose={() => setIsCancelamentoModalOpen(false)} title="" cancelText="Fechar">
         {selectedPedido && (
             <PedidoCancelamentoModal
                pedido={selectedPedido}
                onClose={() => setIsCancelamentoModalOpen(false)}
             />
         )}
      </Modal>

      {}
      <Modal open={isIfoodCancellationReasonsModalOpen} onClose={() => setIsIfoodCancellationReasonsModalOpen(false)} title="" cancelText="Cancelar">
         <IfoodCancellationReasonsModal
            reasons={ifoodCancellationReasons}
            onSelect={(reason) => {
              setIsIfoodCancellationReasonsModalOpen(false);
              
              if (selectedPedido) {
                handleDeleteWithReason(selectedPedido, reason);
              }
            }}
            onClose={() => setIsIfoodCancellationReasonsModalOpen(false)}
         />
      </Modal>

      <Modal
        open={dialog.open}
        onClose={() => {
          setDialog((prev) => ({ ...prev, open: false }));
          if (dialog.mode === 'confirm') {
            dialogConfirmResolveRef.current?.(false);
            dialogConfirmResolveRef.current = null;
          } else if (dialog.mode === 'prompt') {
            dialogPromptResolveRef.current?.(null);
            dialogPromptResolveRef.current = null;
          } else {
            dialogAlertResolveRef.current?.();
            dialogAlertResolveRef.current = null;
          }
        }}
        onConfirm={
          dialog.mode === 'confirm'
            ? () => {
                setDialog((prev) => ({ ...prev, open: false }));
                dialogConfirmResolveRef.current?.(true);
                dialogConfirmResolveRef.current = null;
              }
            : dialog.mode === 'prompt'
              ? () => {
                  setDialog((prev) => ({ ...prev, open: false }));
                  dialogPromptResolveRef.current?.(dialogInput);
                  dialogPromptResolveRef.current = null;
                }
              : undefined
        }
        title={dialog.title}
        cancelText={dialog.mode === 'confirm' || dialog.mode === 'prompt' ? 'Cancelar' : 'OK'}
        confirmText={dialog.mode === 'prompt' ? 'Continuar' : 'Confirmar'}
      >
        <div className="space-y-3">
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{dialog.message}</div>
          {dialog.mode === 'prompt' && (
            <input
              type="text"
              value={dialogInput}
              onChange={(e) => setDialogInput(e.target.value)}
              className="w-full border rounded p-2 text-sm"
              autoFocus
            />
          )}
        </div>
      </Modal>

    </div>
  );
}
