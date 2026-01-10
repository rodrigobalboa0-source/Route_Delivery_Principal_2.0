
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, Download, Calendar, CheckCircle, AlertCircle, Clock } from 'lucide-react';

export function ComercioFaturamentoPanel() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

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
    </div>
  );
}
