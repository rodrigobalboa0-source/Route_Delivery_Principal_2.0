
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, Download, Calendar, CheckCircle, AlertCircle, Clock, FileSpreadsheet } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toUtcRange, todayYmd, firstOfMonthYmd } from '../../lib/dateRange';

export function ComercioFaturamentoPanel() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clienteNome, setClienteNome] = useState<string>('');

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dailyOrders, setDailyOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<'todos' | 'entregue' | 'cancelada'>('todos');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (clientId && startDate && endDate) {
        fetchDailyOrders();
    }
  }, [clientId, startDate, endDate]);

  async function fetchDailyOrders() {
      setLoadingOrders(true);
      try {
          const { gte, lt } = toUtcRange(startDate, endDate);

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
              .gte('created_at', gte)
              .lt('created_at', lt)
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

      const { data: clienteInfo } = await supabase
        .from('clientes')
        .select('nome_completo')
        .eq('id', targetClientId)
        .maybeSingle();
      if (clienteInfo?.nome_completo) setClienteNome(clienteInfo.nome_completo);

      setStartDate((prev) => (prev ? prev : firstOfMonthYmd()));
      setEndDate((prev) => (prev ? prev : todayYmd()));

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

  const filteredOrders = dailyOrders.filter((order) => {
    if (orderStatusFilter === 'todos') return true;
    return order.status === orderStatusFilter;
  });

  const buildReportRows = () =>
    filteredOrders.map((order) => [
      new Date(order.created_at).toLocaleDateString('pt-BR'),
      new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      order?.pedidos?.numero || (order.pedido_id ? `${order.pedido_id.slice(0, 8)}...` : '-'),
      order.entrega_contato || '-',
      order.entrega_endereco_texto || '-',
      order?.entregadores?.nome_completo || '-',
      order.status === 'cancelada' ? 'Cancelado' : order.status === 'entregue' ? 'Entregue' : order.status,
      `R$ ${Number(order.valor_entrega || 0).toFixed(2)}`,
    ]);

  const formatDateBr = (ymd: string) => ymd.split('-').reverse().join('/');

  const generatePDF = async () => {
    const doc = new jsPDF();
    let startY = 20;

    doc.setFontSize(16);
    doc.text('Relatório de Pedidos', 14, startY);
    startY += 8;

    doc.setFontSize(10);
    doc.text(`Comércio: ${clienteNome || '-'}`, 14, startY);
    startY += 6;
    doc.text(`Período: ${formatDateBr(startDate)} a ${formatDateBr(endDate)}`, 14, startY);
    startY += 6;
    const statusLabel = orderStatusFilter === 'todos' ? 'Todos' : orderStatusFilter === 'entregue' ? 'Entregue' : 'Cancelado';
    doc.text(`Status: ${statusLabel}`, 14, startY);
    startY += 8;

    const totalValue = filteredOrders.reduce((sum, o) => sum + (Number(o.valor_entrega) || 0), 0);

    autoTable(doc, {
      head: [['Data', 'Hora', 'Pedido', 'Cliente', 'Endereço', 'Motoboy', 'Status', 'Valor']],
      body: buildReportRows(),
      startY,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [3, 105, 161] },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    const totalText = `R$ ${totalValue.toFixed(2)}`;
    doc.setFillColor(15, 23, 42);
    doc.rect(14, finalY - 5, 182, 10, 'F');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', 16, finalY + 1.5);
    doc.text(totalText, 196 - doc.getTextWidth(totalText), finalY + 1.5);

    doc.save(`relatorio_pedidos_${startDate}_${endDate}.pdf`);
  };

  const generateExcel = () => {
    const rows = filteredOrders.map((order) => ({
      Data: new Date(order.created_at).toLocaleDateString('pt-BR'),
      Hora: new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      Pedido: order?.pedidos?.numero || order.pedido_id || '-',
      Cliente: order.entrega_contato || '-',
      Endereço: order.entrega_endereco_texto || '-',
      Motoboy: order?.entregadores?.nome_completo || '-',
      Status: order.status === 'cancelada' ? 'Cancelado' : order.status === 'entregue' ? 'Entregue' : order.status,
      Valor: Number(order.valor_entrega || 0),
    }));

    const totalValue = filteredOrders.reduce((sum, o) => sum + (Number(o.valor_entrega) || 0), 0);
    rows.push({ Data: '', Hora: '', Pedido: '', Cliente: '', Endereço: '', Motoboy: '', Status: 'TOTAL', Valor: totalValue });

    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Pedidos');
    XLSX.writeFile(workbook, `relatorio_pedidos_${startDate}_${endDate}.xlsx`);
  };

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
            Pedidos por Período
        </h2>
        <p className="text-gray-500 mb-6">Selecione o período (ex: um mês inteiro) para visualizar os pedidos detalhados.</p>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Início</label>
                <input
                    type="date"
                    className="border rounded-lg p-2 w-full focus:ring-2 focus:ring-sky-500 outline-none text-gray-700"
                    value={startDate}
                    max={endDate || undefined}
                    onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fim</label>
                <input
                    type="date"
                    className="border rounded-lg p-2 w-full focus:ring-2 focus:ring-sky-500 outline-none text-gray-700"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                    className="border rounded-lg p-2 w-full focus:ring-2 focus:ring-sky-500 outline-none text-gray-700"
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value as 'todos' | 'entregue' | 'cancelada')}
                >
                    <option value="todos">Todos</option>
                    <option value="entregue">Entregue</option>
                    <option value="cancelada">Cancelado</option>
                </select>
              </div>
            </div>

            {startDate && endDate && dailyOrders.length > 0 && (
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={generatePDF}
                        disabled={filteredOrders.length === 0}
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                    >
                        <FileText size={16} />
                        Baixar PDF
                    </button>
                    <button
                        onClick={generateExcel}
                        disabled={filteredOrders.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                    >
                        <FileSpreadsheet size={16} />
                        Baixar Excel
                    </button>
                </div>
            )}
        </div>

        {startDate && endDate && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {loadingOrders ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto mb-4"></div>
                        <span className="text-gray-500">Carregando pedidos...</span>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="p-12 text-center text-gray-500 bg-gray-50/50">
                        <p>Nenhum pedido encontrado neste período{orderStatusFilter !== 'todos' ? ' para o status selecionado' : ''}.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider font-semibold">
                                <tr>
                                    <th className="p-4">Data</th>
                                    <th className="p-4">Hora</th>
                                    <th className="p-4">Pedido</th>
                                    <th className="p-4">Cliente</th>
                                    <th className="p-4">Endereço</th>
                                    <th className="p-4">Motoboy</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Finalizado</th>
                                    <th className="p-4 text-right">Valor Entrega</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredOrders.map(order => (
                                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                                            {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                        </td>
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
                                    <td colSpan={9} className="p-4 text-right">Total do Período:</td>
                                    <td className="p-4 text-right text-sky-700">
                                        R$ {filteredOrders.reduce((acc, curr) => acc + (Number(curr.valor_entrega) || 0), 0).toFixed(2)}
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
