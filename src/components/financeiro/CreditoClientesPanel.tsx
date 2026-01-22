import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

export function CreditoClientesPanel() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Manual Credit Form
  const [form, setForm] = useState({ cliente_id: '', valor: '', motivo: '' });
  const [submittingManual, setSubmittingManual] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch Clients
      const { data: clientesData } = await supabase
        .from('clientes')
        .select('id, nome_completo, saldo_creditos')
        .order('nome_completo');
      setClientes(clientesData || []);

      // Fetch Pending Requests
      const { data: requestsData } = await supabase
        .from('solicitacoes_credito')
        .select(`
            *,
            clientes (nome_completo)
        `)
        .eq('status', 'pendente')
        .order('created_at', { ascending: false });
      
      setRequests(requestsData || []);

    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleApprove = async (req: any) => {
    if (!confirm(`Confirmar aprovação de R$ ${req.valor} para ${req.clientes?.nome_completo}?`)) return;
    
    setProcessingId(req.id);
    try {
        // Update request status to 'aprovado'
        // The database trigger 'trg_process_approved_credit_request' will handle the balance update and logging
        const { error } = await supabase
            .from('solicitacoes_credito')
            .update({ status: 'aprovado' })
            .eq('id', req.id);

        if (error) throw error;
        
        // Refresh data
        await fetchData();
        alert('Solicitação aprovada com sucesso!');

    } catch (error: any) {
        console.error('Erro ao aprovar:', error);
        alert('Erro ao aprovar: ' + error.message);
    } finally {
        setProcessingId(null);
    }
  };

  const handleReject = async (req: any) => {
    if (!confirm(`Rejeitar solicitação de R$ ${req.valor}?`)) return;

    setProcessingId(req.id);
    try {
        const { error } = await supabase
            .from('solicitacoes_credito')
            .update({ status: 'rejeitado' })
            .eq('id', req.id);

        if (error) throw error;
        
        await fetchData();

    } catch (error: any) {
        console.error('Erro ao rejeitar:', error);
        alert('Erro ao rejeitar: ' + error.message);
    } finally {
        setProcessingId(null);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cliente_id || !form.valor) return;

    setSubmittingManual(true);
    try {
        const amount = parseFloat(form.valor.replace(',', '.'));
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Valor inválido');
        }

        const cliente = clientes.find(c => c.id === form.cliente_id);
        if (!cliente) throw new Error('Cliente não encontrado');

        // Use RPC for atomic and secure update
        const { data, error } = await supabase.rpc('admin_add_credit', {
            p_cliente_id: form.cliente_id,
            p_valor: amount,
            p_motivo: form.motivo || 'Adição manual pelo admin'
        });

        if (error) throw error;

        alert('Crédito adicionado com sucesso!');
        setForm({ cliente_id: '', valor: '', motivo: '' });
        fetchData();

    } catch (error: any) {
        console.error('Erro ao adicionar crédito:', error);
        alert('Erro: ' + error.message);
    } finally {
        setSubmittingManual(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Gerenciamento de Créditos</h1>
        <p className="text-slate-500">Aprove solicitações ou adicione créditos manualmente.</p>
      </div>

      {/* Pending Requests */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h2 className="font-bold text-slate-700 flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-500" />
                Solicitações Pendentes
            </h2>
            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-bold">
                {requests.length}
            </span>
        </div>
        
        {loading ? (
            <div className="p-8 text-center text-slate-500 flex justify-center items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-500"></div>
                Carregando solicitações...
            </div>
        ) : requests.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
                Nenhuma solicitação pendente no momento.
            </div>
        ) : (
            <div className="divide-y divide-slate-100">
                {requests.map(req => (
                    <div key={req.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-slate-800">{req.clientes?.nome_completo || 'Cliente Desconhecido'}</span>
                                <span className="text-xs text-slate-400">• {new Date(req.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-lg font-bold text-sky-600">R$ {Number(req.valor).toFixed(2)}</span>
                                {req.observacao && (
                                    <span className="text-sm text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                        "{req.observacao}"
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleReject(req)}
                                disabled={processingId === req.id}
                                className="px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                Rejeitar
                            </button>
                            <button
                                onClick={() => handleApprove(req)}
                                disabled={processingId === req.id}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {processingId === req.id ? 'Processando...' : (
                                    <>
                                        <CheckCircle size={16} />
                                        Aprovar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* Manual Add */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-slate-400" />
            Adicionar Crédito Manualmente
        </h2>
        <form onSubmit={handleManualSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-600 mb-1">Cliente</label>
                <select
                    value={form.cliente_id}
                    onChange={e => setForm({...form, cliente_id: e.target.value})}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                    required
                >
                    <option value="">Selecione...</option>
                    {clientes.map(c => (
                        <option key={c.id} value={c.id}>
                            {c.nome_completo} (Saldo: R$ {c.saldo_creditos?.toFixed(2) || '0.00'})
                        </option>
                    ))}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Valor (R$)</label>
                <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.valor}
                    onChange={e => setForm({...form, valor: e.target.value})}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                    placeholder="0.00"
                    required
                />
            </div>
            <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-600 mb-1">Motivo</label>
                <input
                    type="text"
                    value={form.motivo}
                    onChange={e => setForm({...form, motivo: e.target.value})}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                    placeholder="Opcional"
                />
            </div>
            <div>
                <button
                    type="submit"
                    disabled={submittingManual}
                    className="w-full py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 font-medium disabled:opacity-50 transition-colors"
                >
                    {submittingManual ? 'Adicionando...' : 'Adicionar'}
                </button>
            </div>
        </form>
      </div>
    </div>
  );
}
