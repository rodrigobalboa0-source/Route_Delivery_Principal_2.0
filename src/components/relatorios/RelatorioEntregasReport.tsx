import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Database } from '../../lib/database.types';
import { toUtcRange, todayYmd, firstOfMonthYmd } from '../../lib/dateRange';
import { Modal } from '../Modal';
import { MoreVertical, Store, UserCog, Ban, RotateCcw, RefreshCw, MessageSquare, Clock, FileText, CheckCircle, Search, X, Download } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Entrega = Database['public']['Tables']['nova_entrega']['Row'] & {
  clientes?: { nome_completo: string } | null;
  entregadores?: { nome_completo: string } | null;
};

type DeliveryLog = Database['public']['Tables']['delivery_logs']['Row'] & { created_by_user?: { email: string } };
type Entregador = Database['public']['Tables']['entregadores']['Row'];

function PedidoHistoryModal({ entregaId }: { entregaId: string }) {
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

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Histórico de Alterações</h3>
      <div className="space-y-4 max-h-[400px] overflow-y-auto">
        
        {loading && <p className="text-sm text-slate-500">Carregando logs...</p>}

        {!loading && logs.length === 0 && <p className="text-sm text-slate-500">Nenhum registro encontrado.</p>}

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
      </div>
    </div>
  );
}

interface RelatorioEntregasReportProps {
    onNavigate?: (menu: string, params?: any) => void;
    userRole?: 'operador' | 'cliente' | 'entregador' | 'loading';
}

export function RelatorioEntregasReport({ onNavigate, userRole }: RelatorioEntregasReportProps) {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataInicio, setDataInicio] = useState(firstOfMonthYmd);
  const [dataFim, setDataFim] = useState(todayYmd);
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  
  
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<{id: string, nome_completo: string} | null>(null);
  const [foundClients, setFoundClients] = useState<{id: string, nome_completo: string}[]>([]);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedEntrega, setSelectedEntrega] = useState<Entrega | null>(null);
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
  const [entregadoresList, setEntregadoresList] = useState<Entregador[]>([]);
  const [selectedEntregadorId, setSelectedEntregadorId] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isObservationModalOpen, setIsObservationModalOpen] = useState(false);
  const [observationText, setObservationText] = useState('');

  useEffect(() => {
    if (userRole === 'operador') {
        setIsAdmin(true);
    }
  }, [userRole]);

  
  useEffect(() => {
    if (clientSearchTerm.length < 3) {
        setFoundClients([]);
        setShowClientDropdown(false);
        return;
    }
    const timer = setTimeout(async () => {
        const { data } = await supabase
            .from('clientes')
            .select('id, nome_completo')
            .ilike('nome_completo', `%${clientSearchTerm}%`)
            .limit(5);
        setFoundClients(data || []);
        setShowClientDropdown(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearchTerm]);

  useEffect(() => {
    fetchEntregas();
  }, [dataInicio, dataFim, statusFilter, selectedClient]);

  useEffect(() => {
      if (isAllocationModalOpen) {
          fetchEntregadores();
      }
  }, [isAllocationModalOpen]);

  async function fetchEntregadores() {
      const { data } = await supabase.from('entregadores').select('id, nome_completo').eq('status', 'ativo').order('nome_completo');
      setEntregadoresList((data || []) as Entregador[]);
  }

  async function fetchEntregas() {
    setLoading(true);
    try {
      const { gte, lt } = toUtcRange(dataInicio, dataFim);
      let query = supabase
        .from('nova_entrega')
        .select(`
          *,
          clientes:cliente_id(nome_completo),
          entregadores:entregador_id(nome_completo)
        `)
        .gte('created_at', gte)
        .lt('created_at', lt)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'todos') {
        query = query.eq('status', statusFilter);
      }

      if (selectedClient) {
          query = query.eq('cliente_id', selectedClient.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEntregas(data || []);
    } catch (error) {
      console.error('Erro ao buscar entregas:', error);
    } finally {
      setLoading(false);
    }
  }

  async function logAction(deliveryId: string, action: string, description: string, oldData?: any, newData?: any) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('delivery_logs').insert({
        delivery_id: deliveryId,
        action,
        description,
        old_data: oldData,
        new_data: newData,
        created_by: user?.id
      });
    } catch (e) {
      console.error('Erro ao registrar log:', e);
    }
  }

  const handleEditCommerce = (e: Entrega) => {
    if (onNavigate && e.cliente_id) {
        onNavigate('cadastro_clientes', { editId: e.cliente_id });
    }
    setOpenMenuId(null);
  };

  const handleEditDeliverer = (e: Entrega) => {
    if (onNavigate && e.entregador_id) {
        onNavigate('cadastro_entregadores', { editId: e.entregador_id });
    }
    setOpenMenuId(null);
  };

  const handleBlockDeliverer = async (e: Entrega) => {
      if (!e.entregador_id || !e.cliente_id) return;
      if (!confirm('Deseja realmente bloquear este entregador para este comércio?')) return;

      try {
          const { error } = await supabase.from('entregador_bloqueios').insert({
              entregador_id: e.entregador_id,
              cliente_id: e.cliente_id,
              motivo: 'Bloqueio via Relatório de Entregas'
          });

          if (error) throw error;

          await logAction(e.id, 'BLOQUEAR_ENTREGADOR', `Entregador ${e.entregador_id} bloqueado para cliente ${e.cliente_id}`);
          alert('Entregador bloqueado com sucesso.');
          setOpenMenuId(null);
      } catch (err) {
          console.error(err);
          alert('Erro ao bloquear entregador.');
      }
  };

  const handleRevertFinalized = async (e: Entrega) => {
      if (!e.pedido_id) return;
      if (!confirm('Deseja realmente cancelar esta entrega finalizada? O valor será estornado para o comércio.')) return;
      
      try {
        const { data: pedidoForIfood } = await supabase
            .from('pedidos')
            .select('origem, ifood_order_id')
            .eq('id', e.pedido_id)
            .maybeSingle();

        await supabase.from('pedidos').update({ status: 'cancelado' }).eq('id', e.pedido_id);
        await supabase.from('nova_entrega').update({ status: 'cancelada' }).eq('id', e.id);

        if ((pedidoForIfood as any)?.origem === 'online' || !!(pedidoForIfood as any)?.ifood_order_id) {
            supabase.functions.invoke('ifood-update-status', {
                body: { action: 'requestCancellation', pedidoId: e.pedido_id }
            }).then(({ data, error }) => {
                if (error || data?.success === false) console.warn('iFood update failed', error || data);
            });
        }
        
        if (e.cliente_id && e.valor_entrega && e.valor_entrega > 0) {
            const { data: cliente } = await supabase
                .from('clientes')
                .select('saldo_creditos')
                .eq('id', e.cliente_id)
                .single();
            
            if (cliente) {
                const currentSaldo = cliente.saldo_creditos || 0;
                const newSaldo = currentSaldo + e.valor_entrega;
                
                await supabase.from('clientes')
                    .update({ saldo_creditos: newSaldo })
                    .eq('id', e.cliente_id);
                    
                await supabase.from('creditos_clientes').insert({
                    cliente_id: e.cliente_id,
                    valor: e.valor_entrega,
                    tipo: 'estorno',
                    descricao: `Estorno de entrega cancelada #${e.id.slice(0, 8)}`,
                    saldo_anterior: currentSaldo,
                    saldo_novo: newSaldo
                });
            }
        }

        await logAction(e.id, 'CANCELAR_FINALIZADA', 'Entrega finalizada cancelada e estornada', 
            { pedido_status: 'entregue', entrega_status: e.status }, 
            { pedido_status: 'cancelado', entrega_status: 'cancelada' }
        );
        
        fetchEntregas();
        setOpenMenuId(null);
        alert('Entrega cancelada e valor estornado com sucesso!');
      } catch (err) {
          console.error('Erro ao cancelar entrega:', err);
          alert('Erro ao cancelar entrega');
      }
  };

  const handleSwapFinalized = (e: Entrega) => {
      setSelectedEntrega(e);
      setSelectedEntregadorId(e.entregador_id || '');
      setIsAllocationModalOpen(true);
      setOpenMenuId(null);
  };

  const handleSaveSwap = async () => {
      if (!selectedEntrega) return;
      
      try {
          const oldEntregador = selectedEntrega.entregador_id;
          await supabase.from('nova_entrega').update({
            entregador_id: selectedEntregadorId || null,
          }).eq('id', selectedEntrega.id);

          await logAction(selectedEntrega.id, 'TROCAR_ENTREGADOR_FINALIZADA', 
              `Troca de entregador em entrega finalizada: de ${oldEntregador} para ${selectedEntregadorId}`, 
              { entregador_id: oldEntregador }, { entregador_id: selectedEntregadorId });
              
          alert('Entregador trocado com sucesso.');
          setIsAllocationModalOpen(false);
          fetchEntregas();
      } catch (err) {
          console.error(err);
          alert('Erro ao trocar entregador.');
      }
  };

  const handleAddObservation = async (e: Entrega) => {
      if (!e.pedido_id) return;
      setSelectedEntrega(e);
      setObservationText(e.observacoes || '');
      setIsObservationModalOpen(true);
      setOpenMenuId(null);
  };

  const handleSaveObservation = async () => {
      if (!selectedEntrega || !selectedEntrega.pedido_id) return;

      const currentObs = selectedEntrega.observacoes || '';
      const newObs = observationText;

      if (newObs === currentObs) {
          setIsObservationModalOpen(false);
          return;
      }
      
      try {
        await supabase.from('pedidos').update({ observacoes: newObs }).eq('id', selectedEntrega.pedido_id);
        
        await logAction(selectedEntrega.id, 'ALTERAR_OBSERVACAO', `Observação alterada: ${newObs}`, { observacoes: currentObs }, { observacoes: newObs });
        fetchEntregas();
        setIsObservationModalOpen(false);
      } catch (err) {
          console.error('Erro ao adicionar observação:', err);
          alert('Erro ao salvar observação');
      }
  };

  const handleLogs = (e: Entrega) => {
      setSelectedEntrega(e);
      setIsHistoryModalOpen(true);
      setOpenMenuId(null);
  };

  const generatePDF = async () => {
    const doc = new jsPDF();

    let startY = 30;

    // Dark blue gradient background for logo area
    const logoAreaHeight = 28;
    const gradientSteps = 24;
    const colorStart = [10, 18, 50];
    const colorEnd = [30, 64, 140];
    for (let i = 0; i < gradientSteps; i++) {
        const ratio = i / gradientSteps;
        const r = Math.round(colorStart[0] + (colorEnd[0] - colorStart[0]) * ratio);
        const g = Math.round(colorStart[1] + (colorEnd[1] - colorStart[1]) * ratio);
        const b = Math.round(colorStart[2] + (colorEnd[2] - colorStart[2]) * ratio);
        doc.setFillColor(r, g, b);
        doc.rect(0, i * (logoAreaHeight / gradientSteps), 210, (logoAreaHeight / gradientSteps) + 0.5, 'F');
    }

    try {
        const logoUrl = '/Screenshot_20251113_103247-Photoroom.png';
        const response = await fetch(logoUrl);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => resolve(reader.result as string);
        });

        doc.addImage(base64, 'PNG', 14, 6, 42, 16);
        startY = 38;
    } catch (error) {
        console.error('Erro ao carregar logo:', error);
    }

    const formatDateStr = (d: string) => d.split('-').reverse().join('/');

    doc.setFontSize(16);
    doc.text('Relatório de Entregas', 14, startY);

    doc.setFontSize(10);
    doc.text(`Período: ${formatDateStr(dataInicio)} a ${formatDateStr(dataFim)}`, 14, startY + 7);

    if (selectedClient) {
        doc.text(`Comércio: ${selectedClient.nome_completo}`, 14, startY + 14);
        startY += 25;
    } else {
        startY += 15;
    }

    const totalValue = entregas.reduce((sum, e) => sum + (e.valor_entrega || 0), 0);

    const tableData = entregas.map(entrega => [
        format(new Date(entrega.created_at), 'dd/MM/yyyy HH:mm'),
        entrega.clientes?.nome_completo || 'N/A',
        entrega.entrega_contato || '-',
        entrega.entregadores?.nome_completo || '-',
        entrega.entrega_endereco_texto || entrega.entrega_cep || '-',
        entrega.valor_entrega ? `R$ ${entrega.valor_entrega.toFixed(2)}` : '-',
        entrega.status?.toUpperCase() || ''
    ]);

    autoTable(doc, {
        head: [['Data/Hora', 'Comércio', 'Cliente', 'Entregador', 'Endereço', 'Valor', 'Status']],
        body: tableData,
        startY: startY,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [22, 163, 74] }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    const totalText = `R$ ${totalValue.toFixed(2)}`;
    doc.setFillColor(15, 23, 42);
    doc.rect(14, finalY - 5, 182, 10, 'F');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL GERAL', 16, finalY + 1.5);
    doc.text(totalText, 196 - doc.getTextWidth(totalText), finalY + 1.5);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    doc.save(`relatorio_entregas_${dataInicio}_${dataFim}.pdf`);
  };

  return (
    <div className="p-6 relative min-h-screen" onClick={() => setOpenMenuId(null)}>
      <h2 className="text-2xl font-bold mb-6">Relatório de Entregas</h2>

      <div className="flex flex-wrap gap-4 mb-6 bg-white p-4 rounded-lg shadow-sm" onClick={e => e.stopPropagation()}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="border rounded p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="border rounded p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded p-2 min-w-[150px]"
          >
            <option value="todos">Todos</option>
            <option value="criada">Criada</option>
            <option value="atribuida">Atribuída</option>
            <option value="em_rota">Em Rota</option>
            <option value="entregue">Entregue</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>

        <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Comércio</label>
            <div className="relative">
                <input
                    type="text"
                    placeholder="Buscar comércio..."
                    value={selectedClient ? selectedClient.nome_completo : clientSearchTerm}
                    onChange={(e) => {
                        setClientSearchTerm(e.target.value);
                        if (selectedClient) {
                            setSelectedClient(null);
                            setClientSearchTerm(e.target.value);
                        }
                    }}
                    className="border rounded p-2 min-w-[200px] pr-8"
                />
                {(selectedClient || clientSearchTerm) && (
                    <button 
                        onClick={() => {
                            setSelectedClient(null);
                            setClientSearchTerm('');
                            setFoundClients([]);
                        }}
                        className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
            
            {showClientDropdown && foundClients.length > 0 && !selectedClient && (
                <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
                    {foundClients.map((client) => (
                        <div
                            key={client.id}
                            className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-sky-50 text-gray-900"
                            onClick={() => {
                                setSelectedClient(client);
                                setClientSearchTerm(''); 
                                setShowClientDropdown(false);
                            }}
                        >
                            <span className="block truncate">{client.nome_completo}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
        
        <div className="flex items-end ml-auto">
            <button 
                onClick={generatePDF}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors"
                title="Baixar PDF"
            >
                <Download size={18} />
                PDF
            </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto pb-80"> 
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comércio</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entregador</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Endereço</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              {isAdmin && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-6 py-4 text-center">Carregando...</td>
              </tr>
            ) : entregas.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-6 py-4 text-center">Nenhuma entrega encontrada.</td>
              </tr>
            ) : (
              entregas.map((entrega) => (
                <tr key={entrega.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(entrega.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entrega.clientes?.nome_completo || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entrega.entrega_contato || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entrega.entregadores?.nome_completo || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                    {entrega.entrega_endereco_texto || entrega.entrega_cep || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {entrega.valor_entrega ? `R$ ${entrega.valor_entrega.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                      ${entrega.status === 'entregue' ? 'bg-green-100 text-green-800' : 
                        entrega.status === 'cancelada' ? 'bg-red-100 text-red-800' : 
                        'bg-yellow-100 text-yellow-800'}`}>
                      {entrega.status}
                    </span>
                  </td>
                  {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium relative">
                          <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(openMenuId === entrega.id ? null : entrega.id);
                            }}
                            className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100"
                          >
                              <MoreVertical size={16} />
                          </button>
                          
                          {openMenuId === entrega.id && (
                              <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50 flex flex-col py-1 text-left" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => handleAddObservation(entrega)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><MessageSquare size={16}/> Escrever Observação</button>
                                  <button onClick={() => handleEditCommerce(entrega)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><Store size={16}/> Editar Comércio</button>
                                  {entrega.entregador_id && (
                                      <>
                                        <button onClick={() => handleEditDeliverer(entrega)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2"><UserCog size={16}/> Editar Entregador</button>
                                        <button onClick={() => handleBlockDeliverer(entrega)} className="px-4 py-2 hover:bg-slate-50 text-sm text-red-600 flex items-center gap-2 border-t border-slate-100 mt-1"><Ban size={16}/> Bloquear Entregador</button>
                                      </>
                                  )}
                                  {entrega.status === 'entregue' && (
                                      <>
                                          <button onClick={() => handleRevertFinalized(entrega)} className="px-4 py-2 hover:bg-slate-50 text-sm text-orange-600 flex items-center gap-2 border-t border-slate-100 mt-1"><RotateCcw size={16}/> Cancelar entrega Finalizada</button>
                                          <button onClick={() => handleSwapFinalized(entrega)} className="px-4 py-2 hover:bg-slate-50 text-sm text-blue-600 flex items-center gap-2"><RefreshCw size={16}/> Trocar finalizada</button>
                                      </>
                                  )}
                                  <button onClick={() => handleLogs(entrega)} className="px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 flex items-center gap-2 border-t border-slate-100 mt-1"><Clock size={16}/> Logs</button>
                              </div>
                          )}
                      </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* History Modal */}
      <Modal open={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} title="" cancelText="Fechar">
         {selectedEntrega && (
             <PedidoHistoryModal
                entregaId={selectedEntrega.id}
             />
         )}
      </Modal>

      {/* Allocation/Swap Modal */}
      <Modal open={isAllocationModalOpen} onClose={() => setIsAllocationModalOpen(false)} title="Trocar Entregador (Finalizada)" cancelText="Cancelar">
         <div className="space-y-4">
            <p className="text-sm text-slate-600">Selecione o novo entregador para esta entrega finalizada. O valor da entrega será atribuído a ele.</p>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Entregador</label>
                <select 
                    className="w-full border rounded p-2"
                    value={selectedEntregadorId}
                    onChange={e => setSelectedEntregadorId(e.target.value)}
                >
                    <option value="">Selecione um entregador...</option>
                    {entregadoresList.map(e => (
                        <option key={e.id} value={e.id}>{e.nome_completo}</option>
                    ))}
                </select>
            </div>
            <div className="flex justify-end pt-4">
                <button onClick={handleSaveSwap} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Salvar Troca</button>
            </div>
         </div>
      </Modal>

      {/* Observation Modal */}
      <Modal open={isObservationModalOpen} onClose={() => setIsObservationModalOpen(false)} title="Escrever Observação" cancelText="Cancelar">
          <div className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Observação</label>
                  <textarea
                      className="w-full border rounded p-2 h-32"
                      value={observationText}
                      onChange={e => setObservationText(e.target.value)}
                      placeholder="Digite a observação..."
                  />
              </div>
              <div className="flex justify-end pt-4">
                  <button onClick={handleSaveObservation} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Salvar Observação</button>
              </div>
          </div>
      </Modal>
    </div>
  );
}
