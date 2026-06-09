import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { format, addDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Cliente = Database['public']['Tables']['clientes']['Row'];
type NovaEntrega = Database['public']['Tables']['nova_entrega']['Row'];

interface ClientBillingStats {
  clientId: string;
  count: number;
  total: number;
  minDate: string | null;
  maxDate: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  deliveries: NovaEntrega[];
}


const getBillingPeriod = (periodicidade: string | null, today: Date): { start: Date; end: Date } => {
  const year = today.getFullYear();
  const month = today.getMonth(); 
  const day = today.getDate();

  if (periodicidade === 'quinzenal') {
    if (day <= 15) {
      
      return {
        start: new Date(year, month, 1, 0, 0, 0),
        end: new Date(year, month, 15, 23, 59, 59, 999),
      };
    } else {
      
      const lastDay = new Date(year, month + 1, 0).getDate();
      return {
        start: new Date(year, month, 16, 0, 0, 0),
        end: new Date(year, month, lastDay, 23, 59, 59, 999),
      };
    }
  }

  if (periodicidade === 'semanal') {
    
    const dayOfWeek = today.getDay(); 
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }

  
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    start: new Date(year, month, 1, 0, 0, 0),
    end: new Date(year, month, lastDay, 23, 59, 59, 999),
  };
};

interface FaturamentoMensalPanelProps {
  onNavigate?: (menu: string) => void;
}

export function FaturamentoMensalPanel({ onNavigate }: FaturamentoMensalPanelProps) {
  const [clients, setClients] = useState<Cliente[]>([]);
  const [stats, setStats] = useState<Record<string, ClientBillingStats>>({});
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  
  const [selectedClient, setSelectedClient] = useState<Cliente | null>(null);
  const [modalStep, setModalStep] = useState<'none' | 'preview' | 'invoice'>('none');
  
  
  const [invoiceForm, setInvoiceForm] = useState({
    vencimento: '',
    observacoes: '',
    gerarNota: false,
    enviarEmail: false,
    instrucoes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      
      const { data: clientsData, error: clientsError } = await supabase
        .from('clientes')
        .select('*')
        .eq('modo_faturamento', 'faturamento')
        .order('nome_completo');

      if (clientsError) throw clientsError;

      
      
      const clientIds = clientsData.map(c => c.id);
      
      if (clientIds.length === 0) {
        setClients([]);
        setStats({});
        setLoading(false);
        return;
      }

      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from('nova_entrega')
        .select('*')
        .in('cliente_id', clientIds)
        .eq('status', 'entregue')
        .is('fatura_cliente_id', null);

      if (deliveriesError) throw deliveriesError;

      
      const today = new Date();
      const newStats: Record<string, ClientBillingStats> = {};

      clientsData.forEach(c => {
        const { start, end } = getBillingPeriod(c.faturamento_periodo, today);
        newStats[c.id] = {
          clientId: c.id,
          count: 0,
          total: 0,
          minDate: null,
          maxDate: null,
          periodStart: start,
          periodEnd: end,
          deliveries: []
        };
      });

      deliveriesData?.forEach(d => {
        const s = newStats[d.cliente_id];
        if (!s) return;
        const deliveryDate = new Date(d.updated_at ?? d.created_at);
        
        if (deliveryDate < s.periodStart! || deliveryDate > s.periodEnd!) return;
        s.count++;
        s.total += Number(d.valor_entrega || 0);
        s.deliveries.push(d);
        if (!s.minDate || deliveryDate < new Date(s.minDate)) s.minDate = d.created_at;
        if (!s.maxDate || deliveryDate > new Date(s.maxDate)) s.maxDate = d.created_at;
      });

      setClients(clientsData);
      setStats(newStats);

    } catch (error) {
      console.error('Erro ao carregar dados de faturamento:', error);
      alert('Erro ao carregar dados de faturamento');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPreview = (client: Cliente) => {
    setSelectedClient(client);
    setModalStep('preview');
  };

  const handleOpenInvoice = () => {
    if (!selectedClient) return;
    
    
    const days = selectedClient.faturamento_vencimento_dias || 3;
    const dueDate = addDays(new Date(), days);
    
    setInvoiceForm({
      vencimento: format(dueDate, 'yyyy-MM-dd'),
      observacoes: selectedClient.faturamento_observacoes || '',
      gerarNota: false,
      enviarEmail: false,
      instrucoes: selectedClient.faturamento_instrucoes || ''
    });
    
    setModalStep('invoice');
  };

  const handleConfirmInvoice = async () => {
    if (!selectedClient || !invoiceForm.vencimento) return;
    
    setProcessing(true);
    try {
      
      const clientStats = stats[selectedClient.id] || {
        clientId: selectedClient.id,
        count: 0,
        total: 0,
        minDate: null,
        maxDate: null,
        deliveries: []
      };

      const periodoInicio = clientStats.periodStart ? clientStats.periodStart.toISOString() : (clientStats.minDate || new Date().toISOString());
      const periodoFim = clientStats.periodEnd ? clientStats.periodEnd.toISOString() : (clientStats.maxDate || new Date().toISOString());

      
      const { data: invoice, error: invoiceError } = await supabase
        .from('faturamento_clientes')
        .insert({
          cliente_id: selectedClient.id,
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
          valor_total: clientStats.total,
          status: 'pendente',
          vencimento: invoiceForm.vencimento,
          descricao: `Fatura - ${selectedClient.nome_completo} - ${format(new Date(), 'dd/MM/yyyy')}`,
          observacoes: invoiceForm.observacoes,
          instrucoes: invoiceForm.instrucoes
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      
      if (clientStats.deliveries && clientStats.deliveries.length > 0) {
        const deliveryIds = clientStats.deliveries.map(d => d.id);
        const { error: updateError } = await supabase
          .from('nova_entrega')
          .update({ fatura_cliente_id: invoice.id })
          .in('id', deliveryIds);

        if (updateError) throw updateError;
      }

      
      const { error: contasError } = await supabase
        .from('contas_receber')
        .insert({
          cliente_id: selectedClient.id,
          descricao: `Fatura #${invoice.id.slice(0, 8)}`,
          valor: clientStats.total,
          vencimento: invoiceForm.vencimento,
          status: 'pendente',
          fatura_id: invoice.id
        });

      if (contasError) throw contasError;

      
      if (invoiceForm.enviarEmail) {
        
      }

      alert('Faturamento realizado com sucesso!');
      setModalStep('none');
      setSelectedClient(null);
      fetchData(); 

      
      if (onNavigate) {
        onNavigate('financeiro_contas_receber');
      }
      
    } catch (error: any) {
      console.error('Erro ao faturar:', error);
      alert(`Erro ao realizar faturamento: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const closeModal = () => {
    setModalStep('none');
    setSelectedClient(null);
  };

  if (loading) return <div className="p-6">Carregando faturamento...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Faturamento</h2>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-slate-800 text-white px-6 py-3 grid grid-cols-12 gap-4 text-sm font-medium">
          <div className="col-span-5">Cliente</div>
          <div className="col-span-3 text-center">Periodicidade</div>
          <div className="col-span-4 text-center">Visualizar</div>
        </div>

        <div className="divide-y divide-slate-100">
          {clients.length === 0 ? (
            <div className="p-6 text-center text-slate-500">Nenhum cliente em modo faturamento encontrado.</div>
          ) : (
            clients.map(client => {
              const clientStats = stats[client.id];
              const hasDeliveries = clientStats && clientStats.count > 0;
              
              return (
                <div key={client.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-50 transition-colors">
                  <div className="col-span-5 font-medium text-slate-700">
                    {client.nome_completo}
                  </div>
                  <div className="col-span-3 flex justify-center">
                    <span className={`px-3 py-1 rounded text-white text-xs font-medium uppercase ${
                      client.faturamento_periodo === 'semanal' ? 'bg-green-600' : 
                      client.faturamento_periodo === 'quinzenal' ? 'bg-emerald-600' : 'bg-blue-600'
                    }`}>
                      {client.faturamento_periodo || 'Mensal'}
                    </span>
                  </div>
                  <div className="col-span-4 flex justify-center gap-2">
                    <button 
                      onClick={() => handleOpenPreview(client)}
                      className="px-4 py-2 rounded text-white text-sm font-medium transition-colors flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                    >
                      Ver Serviços a Faturar
                      {hasDeliveries && <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs">{clientStats.count}</span>}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal 1: Preview */}
      {modalStep === 'preview' && selectedClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">Serviços a Faturar</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">Comércio</label>
                  <div className="text-lg font-medium text-slate-800">{selectedClient.nome_completo}</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">Período</label>
                  <div className="text-base text-slate-800">
                    {stats[selectedClient.id]?.periodStart ? format(stats[selectedClient.id].periodStart!, 'dd/MM/yyyy') : '-'} até {stats[selectedClient.id]?.periodEnd ? format(stats[selectedClient.id].periodEnd!, 'dd/MM/yyyy') : '-'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">Quantidade Entregas</label>
                  <div className="text-lg font-medium text-slate-800">{stats[selectedClient.id]?.count || 0}</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">Vencimento (Previsto)</label>
                  <div className="text-lg font-medium text-slate-800">
                    {format(addDays(new Date(), selectedClient.faturamento_vencimento_dias || 3), 'dd/MM/yyyy')}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">Valor Total</label>
                  <div className="text-2xl font-bold text-blue-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats[selectedClient.id]?.total || 0)}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
               <button 
                onClick={() => {
                  
                  alert('Ir para relatório de pedidos filtrado por este cliente');
                }}
                className="px-4 py-2 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-50 font-medium"
              >
                Relatório
              </button>
              <button 
                onClick={handleOpenInvoice}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium shadow-sm"
              >
                Faturar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Invoice Confirmation */}
      {modalStep === 'invoice' && selectedClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">Confirmar Faturamento</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <h4 className="text-sm font-bold text-blue-800 mb-3 uppercase tracking-wider">Informações de Faturamento</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-600">Cliente:</span>
                    <span className="font-medium text-blue-900">{selectedClient.nome_completo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">Período:</span>
                    <span className="font-medium text-blue-900">
                      {stats[selectedClient.id]?.periodStart ? format(stats[selectedClient.id].periodStart!, 'dd/MM/yyyy') : '-'} até {stats[selectedClient.id]?.periodEnd ? format(stats[selectedClient.id].periodEnd!, 'dd/MM/yyyy') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 mt-2 border-t border-blue-200">
                    <span className="text-blue-800 font-semibold">Valor Total:</span>
                    <span className="text-lg font-bold text-blue-900">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats[selectedClient.id]?.total || 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Vencimento</label>
                  <input 
                    type="date" 
                    value={invoiceForm.vencimento}
                    onChange={e => setInvoiceForm({...invoiceForm, vencimento: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Observações Faturamento</label>
                <textarea 
                  value={invoiceForm.observacoes}
                  onChange={e => setInvoiceForm({...invoiceForm, observacoes: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={2}
                  placeholder="Ex: Loja fechada quinzenalmente..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Instruções Pagamento</label>
                <textarea 
                  value={invoiceForm.instrucoes}
                  onChange={e => setInvoiceForm({...invoiceForm, instrucoes: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                  rows={2}
                />
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Gerar nota</span>
                  <button 
                    onClick={() => setInvoiceForm({...invoiceForm, gerarNota: !invoiceForm.gerarNota})}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${invoiceForm.gerarNota ? 'bg-blue-600' : 'bg-slate-300'}`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${invoiceForm.gerarNota ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Enviar documentos por e-mail</span>
                  <button 
                    onClick={() => setInvoiceForm({...invoiceForm, enviarEmail: !invoiceForm.enviarEmail})}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${invoiceForm.enviarEmail ? 'bg-blue-600' : 'bg-slate-300'}`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${invoiceForm.enviarEmail ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={closeModal}
                className="px-4 py-2 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-50 font-medium"
                disabled={processing}
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmInvoice}
                disabled={processing || !invoiceForm.vencimento}
                className="px-6 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 font-medium shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                {processing ? 'Processando...' : 'Confirmar'}
                {!processing && <span className="text-lg">✓</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}