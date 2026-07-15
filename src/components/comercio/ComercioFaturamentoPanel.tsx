
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, Download, Calendar, CheckCircle, AlertCircle, Clock } from 'lucide-react';

export function ComercioFaturamentoPanel() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dailyOrders, setDailyOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const toLocalDateInputValue = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (clientId && selectedDate) {
        fetchDailyOrders();
    }
  }, [clientId, selectedDate]);

  async function fetchDailyOrders() {
      setLoadingOrders(true);
      try {
          const startDateIso = new Date(`${selectedDate}T00:00:00`).toISOString();
          const endDateIso = new Date(`${selectedDate}T23:59:59.999`).toISOString();

          const { data, error } = await supabase
              .from('nova_entrega')
              .select(
                `
                  id,
                  pedido_id,
                  created_at,
                  updated_at,
                  status,
                  valor_entrega,
                  entrega_contato,
                  entrega_telefone,
                  entrega_endereco_texto,
                  pedidos ( id, numero, status ),
                  entregadores ( id, nome_completo )
                `
              )
              .eq('cliente_id', clientId)
              .gte('created_at', startDateIso)
              .lte('created_at', endDateIso)
              .order('created_at', { ascending: false });
            
          if (error) throw error;
          setDailyOrders(data || []);
      } catch (err) {
          console.error('Erro ao buscar pedidos do dia:', err);
      } finally {
          setLoadingOrders(false);
      }
  }

  async function fetchData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('cliente_id, role')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      let targetClientId = userData.cliente_id;

      if (!targetClientId && userData.role === 'cliente') {
         const { data: clienteData } = await supabase
            .from('clientes')
            .select('id')
            .eq('email', user.email)
            .single();
         if (clienteData) targetClientId = clienteData.id;
      }

      if (!targetClientId) {
         setLoading(false);
         return;
      }
      
      setClientId(targetClientId);
      setSelectedDate((prev) => (prev ? prev : toLocalDateInputValue(new Date())));

      // Fetch Invoices
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('faturamento_clientes') 
        .select('*')
        .eq('cliente_id', targetClientId)
        .order('created_at', { ascending: false });

      if (invoicesError) throw invoicesError;
      setInvoices(invoicesData || []);

    } catch (error) {
      console.error('Erro ao buscar faturas:', error);
    } finally {
      setLoading(false);
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
        case 'pago':
            return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle size={12} /> Pago</span>;
        case 'pendente':
            return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><Clock size={12} /> Pendente</span>;
        case 'vencido':
            return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><AlertCircle size={12} /> Vencido</span>;
        case 'cancelado':
            return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Cancelado</span>;
        default:
            return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
            <FileText className="w-8 h-8 text-sky-600" />
            Faturamento e Notas Fiscais
            </h1>
            <p className="text-gray-500 mt-1">Acesse suas faturas, boletos e histórico de pagamentos.</p>
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto mb-4"></div>
                <span className="text-gray-500">Carregando faturas...</span>
            </div>
        ) : invoices.length === 0 ? (
            <div className="text-center text-gray-500 py-16 bg-gray-50/50 flex flex-col items-center">
                <FileText size={48} className="text-gray-300 mb-4" />
                <p className="font-medium text-gray-600">Nenhuma fatura encontrada.</p>
                <p className="text-sm text-gray-400 mt-1">Suas faturas fechadas aparecerão aqui.</p>
            </div>
        ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider font-semibold">
                <tr>
                    <th className="p-4">Período</th>
                    <th className="p-4">Descrição</th>
                    <th className="p-4">Vencimento</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Valor Total</th>
                    <th className="p-4 text-center">Ações</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm text-gray-700 font-medium">
                        <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-gray-400" />
                            {invoice.periodo_inicio ? (
                                <>
                                    {new Date(invoice.periodo_inicio).toLocaleDateString()} 
                                    <span className="text-gray-400 mx-1">até</span> 
                                    {new Date(invoice.periodo_fim).toLocaleDateString()}
                                </>
                            ) : (
                                new Date(invoice.created_at).toLocaleDateString()
                            )}
                        </div>
                    </td>
                    <td className="p-4 text-sm text-gray-600">{invoice.descricao || 'Fatura Mensal'}</td>
                    <td className="p-4 text-sm text-gray-600">
                        {invoice.vencimento ? new Date(invoice.vencimento).toLocaleDateString() : '-'}
                    </td>
                    <td className="p-4">
                        {getStatusBadge(invoice.status)}
                    </td>
                    <td className="p-4 text-right font-bold text-gray-800">
                        R$ {Number(invoice.valor_total).toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                        {invoice.link_boleto ? (
                            <a 
                                href={invoice.link_boleto} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 text-sm font-medium hover:underline"
                            >
                                <Download size={16} />
                                Boleto/NF
                            </a>
                        ) : (
                            <span className="text-gray-400 text-sm">-</span>
                        )}
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        )}
      </div>

      <div className="mt-12 border-t pt-8">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="text-sky-600" />
            Pedidos por Data
        </h2>
        <p className="text-gray-500 mb-6">Selecione uma data para visualizar os pedidos detalhados.</p>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Selecione a Data</label>
            <input 
                type="date" 
                className="border rounded-lg p-2 w-full md:w-64 focus:ring-2 focus:ring-sky-500 outline-none text-gray-700"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
            />
        </div>

        {selectedDate && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {loadingOrders ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto mb-4"></div>
                        <span className="text-gray-500">Carregando pedidos...</span>
                    </div>
                ) : dailyOrders.length === 0 ? (
                    <div className="p-12 text-center text-gray-500 bg-gray-50/50">
                        <p>Nenhum pedido encontrado nesta data.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider font-semibold">
                                <tr>
                                    <th className="p-4">Hora</th>
                                    <th className="p-4">Pedido</th>
                                    <th className="p-4">Cliente</th>
                                    <th className="p-4">Endereço</th>
                                    <th className="p-4">Motoboy</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Lançado</th>
                                    <th className="p-4">Finalizado</th>
                                    <th className="p-4 text-right">Valor Entrega</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {dailyOrders.map(order => (
                                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4 text-sm text-gray-600 font-medium">
                                            {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="p-4 text-sm text-gray-500 font-mono text-xs">
                                            <span title={order?.pedidos?.numero || order?.pedido_id || ''}>
                                              {order?.pedidos?.numero || (order.pedido_id ? `${order.pedido_id.slice(0, 8)}...` : '-')}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-gray-700">
                                          <div className="max-w-[220px] truncate" title={order.entrega_contato}>
                                            {order.entrega_contato || '-'}
                                          </div>
                                        </td>
                                        <td className="p-4 text-sm text-gray-700">
                                            <div className="max-w-md truncate" title={order.entrega_endereco_texto}>
                                                {order.entrega_endereco_texto || '-'}
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm text-gray-600">
                                          <div className="max-w-[200px] truncate" title={order?.entregadores?.nome_completo}>
                                            {order?.entregadores?.nome_completo || '-'}
                                          </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border
                                                ${order.status === 'entregue' ? 'bg-green-50 text-green-700 border-green-200' : 
                                                  order.status === 'cancelada' ? 'bg-red-50 text-red-700 border-red-200' : 
                                                  'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                                {order.status === 'cancelada' ? 'Cancelado' : order.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                                          {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                                          {['entregue', 'finalizada'].includes(String(order.status || '').toLowerCase())
                                            ? new Date(order.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                            : '-'}
                                        </td>
                                        <td className="p-4 text-right font-bold text-gray-800">
                                            R$ {Number(order.valor_entrega || 0).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50 font-semibold text-gray-700">
                                <tr>
                                    <td colSpan={9} className="p-4 text-right">Total do Dia:</td>
                                    <td className="p-4 text-right text-sky-700">
                                        R$ {dailyOrders.reduce((acc, curr) => acc + (Number(curr.valor_entrega) || 0), 0).toFixed(2)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
}
