
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Wallet, History, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export function ComercioCreditosPanel() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saldo, setSaldo] = useState(0);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      // First try to find client by email directly or linked user
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('cliente_id, role')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      let targetClientId = userData.cliente_id;

      // If not linked in users, try looking up in clientes table by email (legacy/fallback)
      if (!targetClientId && userData.role === 'cliente') {
         const { data: clienteData } = await supabase
            .from('clientes')
            .select('id')
            .eq('email', user.email)
            .single();
         if (clienteData) targetClientId = clienteData.id;
      }

      if (!targetClientId) {
         console.error("Cliente não encontrado");
         setLoading(false);
         return;
      }
      
      setClientId(targetClientId);

      // Fetch Client Data (Saldo)
      const { data: cliente, error: clienteError } = await supabase
        .from('clientes')
        .select('saldo_creditos')
        .eq('id', targetClientId)
        .single();

      if (clienteError) throw clienteError;
      setSaldo(cliente.saldo_creditos || 0);

      // Fetch History
      const { data: historyData, error: historyError } = await supabase
        .from('creditos_clientes') 
        .select('*')
        .eq('cliente_id', targetClientId)
        .order('created_at', { ascending: false });

      if (historyError) throw historyError;
      setHistory(historyData || []);

    } catch (error) {
      console.error('Erro ao buscar dados de créditos:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
            <Wallet className="w-8 h-8 text-sky-600" />
            Meus Créditos
            </h1>
            <p className="text-gray-500 mt-1">Gerencie seu saldo e visualize seu histórico de uso.</p>
        </div>
        
        {/* Placeholder for future "Buy Credits" button */}
        <button 
          onClick={() => alert('Funcionalidade de compra online em breve! Por favor, contate o suporte.')}
          className="px-6 py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors font-medium shadow-sm hover:shadow"
        >
          Adicionar Créditos
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-sky-500 to-sky-600 p-6 rounded-xl shadow-lg text-white">
            <h2 className="text-sky-100 text-sm font-medium uppercase tracking-wider mb-2">Saldo Disponível</h2>
            <div className="text-4xl font-bold">R$ {saldo.toFixed(2)}</div>
            <p className="mt-4 text-sky-100 text-sm bg-white/20 inline-block px-3 py-1 rounded-full">
                Atualizado agora
            </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 rounded-lg text-green-600">
                    <ArrowUpRight size={20} />
                </div>
                <span className="text-gray-500 font-medium">Total Comprado</span>
            </div>
            <div className="text-2xl font-bold text-gray-800">
                R$ {history.filter(h => h.tipo === 'compra' || h.tipo === 'ajuste').reduce((acc, curr) => acc + Number(curr.valor), 0).toFixed(2)}
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                    <ArrowDownLeft size={20} />
                </div>
                <span className="text-gray-500 font-medium">Total Utilizado</span>
            </div>
            <div className="text-2xl font-bold text-gray-800">
                R$ {Math.abs(history.filter(h => h.tipo === 'uso').reduce((acc, curr) => acc + Number(curr.valor), 0)).toFixed(2)}
            </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <History className="w-5 h-5 text-gray-500" />
                Histórico de Movimentações
            </h2>
        </div>

        {loading ? (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto mb-4"></div>
                <span className="text-gray-500">Carregando histórico...</span>
            </div>
        ) : history.length === 0 ? (
            <div className="text-center text-gray-500 py-12 bg-gray-50/50">
                Nenhuma movimentação encontrada.
            </div>
        ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider font-semibold">
                <tr>
                    <th className="p-4">Data</th>
                    <th className="p-4">Tipo</th>
                    <th className="p-4">Descrição</th>
                    <th className="p-4 text-right">Valor</th>
                    <th className="p-4 text-right">Saldo</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {history.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-sm text-gray-600">
                        {new Date(item.created_at).toLocaleDateString()} <span className="text-gray-400 text-xs ml-1">{new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </td>
                    <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                            ${item.tipo === 'compra' ? 'bg-green-100 text-green-800' : 
                              item.tipo === 'uso' ? 'bg-orange-100 text-orange-800' :
                              item.tipo === 'estorno' ? 'bg-purple-100 text-purple-800' :
                              'bg-gray-100 text-gray-800'}`}>
                            {item.tipo}
                        </span>
                    </td>
                    <td className="p-4 text-sm text-gray-700">{item.descricao || '-'}</td>
                    <td className={`p-4 text-right font-bold text-sm ${(item.valor) >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                        {(item.valor) >= 0 ? '+' : ''} R$ {Number(item.valor).toFixed(2)}
                    </td>
                    <td className="p-4 text-right text-sm font-medium text-gray-600">
                        R$ {Number(item.saldo_novo).toFixed(2)}
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
