import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';
import { DollarSign, ShoppingCart, Bike, ChevronLeft, ChevronRight, Download, CheckCircle, XCircle, ListFilter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';

type Entrega = Database['public']['Tables']['nova_entrega']['Row'] & {
  clientes?: { nome_completo: string } | null;
  entregadores?: { nome_completo: string } | null;
  acertos?: { valor_pago: number }[];
  valor_mercadoria?: number | null;
};

export function FinanceiroDashboard() {
  const [loading, setLoading] = useState(true);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [filteredEntregas, setFilteredEntregas] = useState<Entrega[]>([]);
  const [statusFilter, setStatusFilter] = useState<'todos' | 'finalizados' | 'cancelados'>('todos');
  const [startDate, setStartDate] = useState(() => {
    // Abre mostrando o mês atual (1º dia), não só o dia de hoje.
    const d = new Date();
    d.setDate(1);
    return d.toLocaleDateString('en-CA');
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toLocaleDateString('en-CA');
  });
  const [activeTab, setActiveTab] = useState<'pedidos' | 'dashboard'>('pedidos');
  const [metrics, setMetrics] = useState({
    cobrado: 0,
    repasse: 0,
    comissao: 0,
    pedidos: 0,
  });
  const [page, setPage] = useState(1);
  const itemsPerPage = 30;

  const fetchData = async () => {
    try {
      setLoading(true);
      
      
      const { data, error } = await supabase
        .from('nova_entrega')
        .select(`
          *,
          clientes (nome_completo),
          entregadores (nome_completo),
          acertos:acertos_entregadores (valor_pago)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const items = (data || []) as any[]; 
      setEntregas(items);
    } catch (err) {
      console.error('Error fetching financeiro data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    
    const sub = supabase
      .channel('financeiro-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nova_entrega' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'acertos_entregadores' }, fetchData)
      .subscribe();

    return () => {
      sub.unsubscribe();
    };
  }, []);

  useEffect(() => {
    
    let items = [...entregas];

    if (statusFilter === 'finalizados') {
      items = items.filter(i => i.status === 'entregue');
    } else if (statusFilter === 'cancelados') {
      items = items.filter(i => i.status === 'cancelada');
    }

    if (startDate) {
      items = items.filter(i => (i.created_at || '').substring(0, 10) >= startDate);
    }
    if (endDate) {
      items = items.filter(i => (i.created_at || '').substring(0, 10) <= endDate);
    }

    setFilteredEntregas(items);
    setPage(1); 

    
    let totalCobrado = 0;
    let totalRepasse = 0;
    let totalComissao = 0;

    items.forEach(item => {
      const vEntrega = Number(item.valor_entrega || 0);
      const vEntregador = Number(item.valor_entregador || 0);
      
      
      totalCobrado += vEntrega;
      
      
      totalRepasse += vEntregador;
      
      
      totalComissao += (vEntrega - vEntregador);
    });

    setMetrics({
      cobrado: totalCobrado,
      repasse: totalRepasse,
      comissao: totalComissao,
      pedidos: items.length,
    });

  }, [entregas, statusFilter, startDate, endDate]);

  
  const chartData = useMemo(() => {
    const data: Record<string, { date: string; cobrado: number; repasse: number; comissao: number }> = {};
    
    
    const sortedItems = [...filteredEntregas].sort((a, b) => 
      new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()
    );

    sortedItems.forEach(item => {
      const dateObj = new Date(item.created_at || '');
      const date = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      
      if (!data[date]) {
        data[date] = { date, cobrado: 0, repasse: 0, comissao: 0 };
      }
      
      const vEntrega = Number(item.valor_entrega || 0);
      const vEntregador = Number(item.valor_entregador || 0);
      
      data[date].cobrado += vEntrega;
      data[date].repasse += vEntregador;
      data[date].comissao += (vEntrega - vEntregador);
    });

    
    return Object.values(data).slice(-30);
  }, [filteredEntregas]);

  const handleExport = () => {
    const csvContent = [
      ['ID', 'Data', 'Cliente', 'Entregador', 'Valor Cobrado', 'Repasse', 'Comissao', 'Status'],
      ...filteredEntregas.map(e => [
        e.id,
        new Date(e.created_at || '').toLocaleDateString('pt-BR'),
        e.clientes?.nome_completo || 'N/A',
        e.entregadores?.nome_completo || '-',
        (e.valor_entrega || 0).toFixed(2),
        (e.valor_entregador || 0).toFixed(2),
        ((e.valor_entrega || 0) - (e.valor_entregador || 0)).toFixed(2),
        e.status
      ])
    ].map(e => e.join(';')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'financeiro_dashboard.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  
  const totalPages = Math.ceil(filteredEntregas.length / itemsPerPage);
  const currentItems = filteredEntregas.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      <div className="p-6 overflow-y-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Financeiro Dashboard</h1>
          
          <div className="flex gap-2">
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
            />
            <span className="self-center text-slate-500">-</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          
          {}
          <div className="flex bg-white rounded-lg shadow-sm p-1 border border-slate-200">
            <button
              onClick={() => setStatusFilter('todos')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === 'todos' 
                  ? 'bg-slate-100 text-slate-800' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <ListFilter size={16} />
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('finalizados')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === 'finalizados' 
                  ? 'bg-green-100 text-green-700' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <CheckCircle size={16} />
              Finalizados
            </button>
            <button
              onClick={() => setStatusFilter('cancelados')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === 'cancelados' 
                  ? 'bg-red-100 text-red-700' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <XCircle size={16} />
              Cancelados
            </button>
          </div>
        </div>

        {}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500 flex items-start justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Valor Total Cobrado</div>
              <div className="text-2xl font-bold text-slate-800">{formatCurrency(metrics.cobrado)}</div>
              <div className="text-xs text-slate-400 mt-1">
                Valor Médio por Pedido: {metrics.pedidos > 0 ? formatCurrency(metrics.cobrado / metrics.pedidos) : 'R$ 0,00'}
              </div>
            </div>
            <div className="bg-green-100 p-2 rounded-lg text-green-600">
              <DollarSign size={24} />
            </div>
          </div>

          {}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500 flex items-start justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Valor Total Repasse</div>
              <div className="text-2xl font-bold text-slate-800">{formatCurrency(metrics.repasse)}</div>
              <div className="text-xs text-slate-400 mt-1">
                Valor Médio por Pedido: {metrics.pedidos > 0 ? formatCurrency(metrics.repasse / metrics.pedidos) : 'R$ 0,00'}
              </div>
            </div>
            <div className="bg-red-100 p-2 rounded-lg text-red-600">
              <DollarSign size={24} />
            </div>
          </div>

          {}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500 flex items-start justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Comissão do App</div>
              <div className="text-2xl font-bold text-slate-800">{formatCurrency(metrics.comissao)}</div>
              <div className="text-xs text-slate-400 mt-1">
                Margem: {metrics.cobrado > 0 ? `${((metrics.comissao / metrics.cobrado) * 100).toFixed(1)}%` : '0%'}
                {metrics.pedidos > 0 ? ` · Média/pedido: ${formatCurrency(metrics.comissao / metrics.pedidos)}` : ''}
              </div>
            </div>
            <div className="bg-orange-100 p-2 rounded-lg text-orange-600">
              <ShoppingCart size={24} />
            </div>
          </div>

          {}
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500 flex items-start justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Pedidos</div>
              <div className="text-2xl font-bold text-slate-800">{metrics.pedidos}</div>
            </div>
            <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
              <Bike size={24} />
            </div>
          </div>
        </div>

        {}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-slate-200 px-6 pt-4 flex gap-6">
            <button 
              onClick={() => setActiveTab('pedidos')}
              className={`pb-3 border-b-2 font-semibold text-sm transition-colors ${
                activeTab === 'pedidos' 
                  ? 'border-slate-800 text-slate-800' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Pedidos
            </button>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`pb-3 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-slate-800 text-slate-800'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Dashboard
            </button>
          </div>
          
          <div className="p-6">
            {activeTab === 'pedidos' ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-slate-600">
                    Mostrando {(page - 1) * itemsPerPage + 1} à {Math.min(page * itemsPerPage, metrics.pedidos)} de {metrics.pedidos} registros
                  </div>
                  <div className="flex gap-2">
                     <button 
                      onClick={handleExport}
                      className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded text-sm text-slate-600 hover:bg-slate-50"
                    >
                      <Download size={16} />
                      Exportar
                    </button>
                    <select 
                      className="px-3 py-1.5 border border-slate-300 rounded text-sm text-slate-600 outline-none focus:ring-1 focus:ring-sky-500"
                      defaultValue="30"
                    >
                      <option value="30">30 por página</option>
                      <option value="50">50 por página</option>
                      <option value="100">100 por página</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto border rounded-lg border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Data</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Cliente</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Entregador</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">V. Cobrado</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Repasse</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Comissão</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {loading ? (
                        <tr><td colSpan={8} className="px-6 py-4 text-center text-sm text-slate-500">Carregando...</td></tr>
                      ) : currentItems.length === 0 ? (
                        <tr><td colSpan={8} className="px-6 py-4 text-center text-sm text-slate-500">Nenhum registro encontrado</td></tr>
                      ) : (
                        currentItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono text-xs">{item.id.slice(0, 8)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                              {new Date(item.created_at || '').toLocaleString('pt-BR')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">
                              {item.clientes?.nome_completo || 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                              {item.entregadores?.nome_completo || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 text-green-600 font-medium">
                              {formatCurrency(item.valor_entrega || 0)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 text-red-600">
                              {formatCurrency(item.valor_entregador || 0)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 text-orange-600">
                              {formatCurrency((item.valor_entrega || 0) - (item.valor_entregador || 0))}
                            </td>
                             <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full
                                ${item.status === 'entregue' ? 'bg-green-100 text-green-800' : 
                                  item.status === 'cancelada' ? 'bg-red-100 text-red-800' : 
                                  'bg-yellow-100 text-yellow-800'}`}>
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {}
                <div className="flex items-center justify-end gap-2 mt-4">
                  <button 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-50"
                  >
                    <ChevronLeft size={20} className="text-slate-600" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p = i + 1;
                    if (totalPages > 5 && page > 3) p = page - 2 + i;
                    if (p > totalPages) return null;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded text-sm font-medium ${
                          page === p ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-50"
                  >
                    <ChevronRight size={20} className="text-slate-600" />
                  </button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {}
                <div className="bg-white p-4 rounded-lg border border-slate-100">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Evolução Financeira (Últimos 30 dias)</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCobrado" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorComissao" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R$ ${value}`} />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <Tooltip 
                          formatter={(value: number) => [`R$ ${value.toFixed(2)}`, '']}
                          contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="cobrado" name="Total Cobrado" stroke="#22c55e" fillOpacity={1} fill="url(#colorCobrado)" strokeWidth={2} />
                        <Area type="monotone" dataKey="comissao" name="Comissão" stroke="#f97316" fillOpacity={1} fill="url(#colorComissao)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {}
                <div className="bg-white p-4 rounded-lg border border-slate-100">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Repasse vs Comissão (Diário)</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R$ ${value}`} />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <Tooltip 
                          formatter={(value: number) => [`R$ ${value.toFixed(2)}`, '']}
                          cursor={{ fill: '#f1f5f9' }}
                          contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend />
                        <Bar dataKey="repasse" name="Repasse Entregador" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="comissao" name="Comissão App" fill="#f97316" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}