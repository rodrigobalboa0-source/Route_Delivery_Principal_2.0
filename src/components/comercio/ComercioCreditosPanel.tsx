import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Wallet, History, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export function ComercioCreditosPanel() {
  const [history, setHistory] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saldo, setSaldo] = useState(0);
  const [clientId, setClientId] = useState<string | null>(null);
  
  
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestObs, setRequestObs] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  useEffect(() => {
    fetchData();

    // Subscribe to changes
    const subscription = supabase
      .channel('comercio_creditos_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'solicitacoes_credito'
        },
        () => {
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'creditos_clientes'
        },
        () => {
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'clientes'
        },
        (payload) => {
            // Only refresh if it's the current user's client
            if (clientId && payload.new.id === clientId) {
                fetchData();
            } else if (!clientId) {
                 // If clientId is not set yet, we might want to refresh anyway or wait
                 fetchData();
            }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [clientId]); // Add clientId dependency to filter properly, or just refresh all


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
         console.error("Cliente não encontrado");
         setLoading(false);
         return;
      }
      
      setClientId(targetClientId);

      
      const { data: cliente, error: clienteError } = await supabase
        .from('clientes')
        .select('saldo_creditos')
        .eq('id', targetClientId)
        .single();

      if (clienteError) throw clienteError;
      setSaldo(cliente.saldo_creditos || 0);

      
      const { data: historyData, error: historyError } = await supabase
        .from('creditos_clientes') 
        .select('*')
        .eq('cliente_id', targetClientId)
        .order('created_at', { ascending: false });

      if (historyError) throw historyError;
      setHistory(historyData || []);

      
      const { data: requestsData, error: requestsError } = await supabase
        .from('solicitacoes_credito')
        .select('*')
        .eq('cliente_id', targetClientId)
        .order('created_at', { ascending: false });
        
      if (requestsError) {
        
        console.warn('Erro ao buscar solicitações (pode ser falta de migração):', requestsError);
      } else {
        setRequests(requestsData || []);
      }

    } catch (error) {
      console.error('Erro ao buscar dados de créditos:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleRequestCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return;

    const amount = parseFloat(requestAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      alert('Por favor, insira um valor válido.');
      return;
    }

    setSubmittingRequest(true);
    try {
      const { error } = await supabase
        .from('solicitacoes_credito')
        .insert({
          cliente_id: clientId,
          valor: amount,
          observacao: requestObs,
          status: 'pendente'
        });

      if (error) throw error;

      alert('Solicitação enviada com sucesso! Aguarde a aprovação.');
      setShowRequestModal(false);
      setRequestAmount('');
      setRequestObs('');
      fetchData();
    } catch (error: any) {
      console.error('Erro ao solicitar crédito:', error);
      alert('Erro ao solicitar crédito: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setSubmittingRequest(false);
    }
  };

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
        
        {}
        <button 
          onClick={() => setShowRequestModal(true)}
          className="px-6 py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors font-medium shadow-sm hover:shadow flex items-center gap-2"
        >
          Solicitar Créditos
        </button>
      </div>
      
      {}
      {requests.filter(r => r.status === 'pendente').length > 0 && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
           <div className="text-yellow-600 mt-0.5">
             <History size={20} />
           </div>
           <div>
             <h3 className="font-semibold text-yellow-800 text-sm">Solicitação em análise</h3>
             <p className="text-yellow-700 text-sm mt-1">
               Você tem {requests.filter(r => r.status === 'pendente').length} solicitação(ões) de crédito pendente(s). Aguarde a aprovação do administrador.
             </p>
             <div className="mt-2 space-y-1">
               {requests.filter(r => r.status === 'pendente').map(req => (
                 <div key={req.id} className="text-xs text-yellow-800/80 flex items-center gap-2">
                    <span>• {new Date(req.created_at).toLocaleDateString()} - R$ {Number(req.valor).toFixed(2)}</span>
                 </div>
               ))}
             </div>
           </div>
        </div>
      )}

      {/* History/Other Requests */}
      {requests.filter(r => r.status !== 'pendente').length > 0 && (
        <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Histórico de Solicitações</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {requests.filter(r => r.status !== 'pendente').map(req => (
                    <div key={req.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col gap-2 opacity-75">
                        <div className="flex justify-between items-start">
                            <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
                                req.status === 'aprovado' ? 'bg-green-100 text-green-700' :
                                req.status === 'rejeitado' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-700'
                            }`}>
                                {req.status}
                            </span>
                            <span className="text-sm text-gray-500">{new Date(req.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="text-xl font-bold text-gray-800">R$ {Number(req.valor).toFixed(2)}</div>
                        {req.observacao && <div className="text-sm text-gray-600 italic">"{req.observacao}"</div>}
                    </div>
                ))}
            </div>
        </div>
      )}

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

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-gray-800">Solicitar Créditos</h2>
                    <p className="text-sm text-gray-500">Informe o valor que deseja adicionar à sua carteira.</p>
                </div>
                <form onSubmit={handleRequestCredit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-3 text-gray-500">R$</span>
                            <input
                                type="number"
                                step="0.01"
                                min="1"
                                required
                                className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                                placeholder="0.00"
                                value={requestAmount}
                                onChange={e => setRequestAmount(e.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observação (Opcional)</label>
                        <textarea
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none h-24 resize-none"
                            placeholder="Ex: Pagamento via PIX, comprovante em anexo..."
                            value={requestObs}
                            onChange={e => setRequestObs(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button 
                            type="button" 
                            onClick={() => setShowRequestModal(false)}
                            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={submittingRequest}
                            className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-medium disabled:opacity-50"
                        >
                            {submittingRequest ? 'Enviando...' : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}
