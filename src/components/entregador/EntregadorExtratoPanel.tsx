import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Wallet, ArrowDownUp, X, AlertCircle, CheckCircle, Zap } from 'lucide-react';

interface EntregadorExtratoPanelProps {
  userId?: string;
}

export function EntregadorExtratoPanel({ userId }: EntregadorExtratoPanelProps) {
  const [extrato, setExtrato] = useState<any[]>([]);
  const [acertos, setAcertos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saldo, setSaldo] = useState(0);
  
  
  const [showBankModal, setShowBankModal] = useState(false);
  const [currentEntregadorId, setCurrentEntregadorId] = useState<string | null>(null);
  const [savingBankData, setSavingBankData] = useState(false);
  
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawType, setWithdrawType] = useState<'normal' | 'rapido'>('normal');
  const [quickWithdrawFee, setQuickWithdrawFee] = useState(0);
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);

  const [bankData, setBankData] = useState({
    nome_titular: '',
    cpf_cnpj: '',
    banco: '',
    agencia: '',
    tipo_conta: 'corrente',
    conta: '',
    digito: '',
    chave_pix: ''
  });

  const bancos = [
    'Banco do Brasil',
    'Bradesco',
    'Caixa Econômica Federal',
    'Itaú',
    'Santander',
    'Nubank',
    'Inter',
    'Original',
    'C6 Bank',
    'Outro'
  ];

  useEffect(() => {
    fetchExtrato();
    fetchConfig();
  }, [userId]);

  const fetchConfig = async () => {
    try {
      const { data } = await supabase.from('configuracoes_operacao').select('taxa_saque_rapido').single();
      if (data) {
        setQuickWithdrawFee(data.taxa_saque_rapido || 0);
      }
    } catch (e) {
      console.error('Erro ao buscar config:', e);
    }
  };

  useEffect(() => {
    if (!currentEntregadorId) return;

    const channel = supabase
      .channel('acertos_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'acertos_entregadores',
          filter: `entregador_id=eq.${currentEntregadorId}`
        },
        () => {
          fetchExtrato();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentEntregadorId]);

  async function fetchExtrato() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: entregadorData, error: entError } = await supabase
        .from('entregadores')
        .select('id, dados_bancarios')
        .eq('email', user.email)
        .single();

      if (entError || !entregadorData) {
         console.error("Entregador não encontrado");
         setLoading(false);
         return;
      }
      
      const entregadorId = entregadorData.id;
      setCurrentEntregadorId(entregadorId);

      // Pre-fill bank data if exists
      if (entregadorData.dados_bancarios) {
        const savedData = entregadorData.dados_bancarios as any;
        setBankData({
          nome_titular: savedData.nome_titular || '',
          cpf_cnpj: savedData.cpf_cnpj || '',
          banco: savedData.banco || '',
          agencia: savedData.agencia || '',
          tipo_conta: savedData.tipo_conta || 'corrente',
          conta: savedData.conta || '',
          digito: savedData.digito || '',
          chave_pix: savedData.chave_pix || ''
        });
      }
      
      // Fetch deliveries (earnings)
      const { data: entregas, error: entregasError } = await supabase
        .from('nova_entrega') 
        .select('*')
        .eq('entregador_id', entregadorId)
        .eq('status', 'entregue')
        .order('created_at', { ascending: false });

      if (entregasError) throw entregasError;

      // Fetch acertos (withdrawals/payments)
      const { data: acertosData, error: acertosError } = await supabase
        .from('acertos_entregadores')
        .select('*')
        .eq('entregador_id', entregadorId)
        .order('created_at', { ascending: false });
        
      if (acertosError) throw acertosError;

      setExtrato(entregas || []);
      setAcertos(acertosData || []);
      
      const totalGanhos = (entregas || []).reduce((acc, curr) => acc + (curr.valor_entregador || curr.valor_entrega || 0), 0);
      
      const totalSaques = (acertosData || [])
        .filter((a: any) => a.status === 'pago' || a.status === 'pendente')
        .reduce((acc: number, curr: any) => acc + (Number(curr.valor_pago) || 0) + (Number(curr.taxa_aplicada) || 0), 0);
        
      setSaldo(totalGanhos - totalSaques);

    } catch (error) {
      console.error('Erro ao buscar extrato:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSaveBankData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEntregadorId) return;

    setSavingBankData(true);
    try {
      const { error } = await supabase
        .from('entregadores')
        .update({ dados_bancarios: bankData })
        .eq('id', currentEntregadorId);

      if (error) throw error;

      alert('Dados bancários salvos com sucesso!');
      setShowBankModal(false);
      
    } catch (error) {
      console.error('Erro ao salvar dados bancários:', error);
      alert('Erro ao salvar dados bancários. Tente novamente.');
    } finally {
      setSavingBankData(false);
    }
  };

  const handleWithdrawClick = () => {
    
    const hasData = bankData.banco && bankData.conta && bankData.nome_titular;
    
    if (hasData) {
      setShowConfirmModal(true);
    } else {
      
      setShowBankModal(true);
    }
  };

  const handleConfirmData = () => {
    setShowConfirmModal(false);
    setShowWithdrawModal(true);
  };

  const handleEditData = () => {
    setShowConfirmModal(false);
    setShowBankModal(true);
  };

  const handleSubmitWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEntregadorId) return;

    const amount = Number(withdrawAmount);
    if (amount <= 0) {
      alert('Valor inválido');
      return;
    }

    // Calcular taxa se for saque rápido
    let feeValue = 0;
    let finalAmount = amount;
    
    if (withdrawType === 'rapido' && quickWithdrawFee > 0) {
      feeValue = amount * (quickWithdrawFee / 100);
      finalAmount = amount - feeValue;
    }

    const saldoDisponivel = saldo;

    if (amount > saldoDisponivel) {
      alert(`Saldo insuficiente. Seu saldo disponível é R$ ${saldoDisponivel.toFixed(2)}.`);
      return;
    }

    setSubmittingWithdraw(true);
    try {
      // Insert into acertos_entregadores
      // Note: entrega_id is explicitly null for withdrawals
      const { error } = await supabase
        .from('acertos_entregadores')
        .insert({
          entregador_id: currentEntregadorId,
          entrega_id: null, 
          valor_pago: finalAmount,
          status: 'pendente',
          tipo_saque: withdrawType,
          taxa_aplicada: feeValue
        } as any);

      if (error) throw error;

      // Reset and refresh
      setWithdrawAmount('');
      setShowWithdrawModal(false);
      await fetchExtrato();
      alert('Solicitação de saque enviada com sucesso! Aguarde a confirmação.');
      
    } catch (error: any) {
      console.error('Erro ao solicitar saque:', error);
      alert('Erro ao solicitar saque: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setSubmittingWithdraw(false);
    }
  };

  // Pending withdrawals to show message
  const pendingWithdrawals = acertos.filter(a => a.status === 'pendente');

  return (
    <div className="p-6 max-w-4xl mx-auto relative">
      
      {/* 1. Bank Data Edit Modal */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-800">Preencha os dados da sua conta</h3>
              <button onClick={() => setShowBankModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveBankData} className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
              <p className="text-sm text-gray-500 mb-2">Preencha os dados com atenção</p>
              <div>
                <input type="text" placeholder="Nome Completo do Titular" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" value={bankData.nome_titular} onChange={e => setBankData({...bankData, nome_titular: e.target.value})} required />
              </div>
              <div>
                <input type="text" placeholder="CPF ou CNPJ" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" value={bankData.cpf_cnpj} onChange={e => setBankData({...bankData, cpf_cnpj: e.target.value})} required />
              </div>
              <div>
                <select className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none bg-white" value={bankData.banco} onChange={e => setBankData({...bankData, banco: e.target.value})} required>
                  <option value="">Escolha um banco</option>
                  {bancos.map(b => (<option key={b} value={b}>{b}</option>))}
                </select>
              </div>
              <div>
                <input type="text" placeholder="Agência" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" value={bankData.agencia} onChange={e => setBankData({...bankData, agencia: e.target.value})} required />
              </div>
              <div>
            <select className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none bg-white" value={bankData.tipo_conta} onChange={e => setBankData({...bankData, tipo_conta: e.target.value})} required>
              <option value="corrente">Conta Corrente</option>
              <option value="poupanca">Conta Poupança</option>
            </select>
          </div>
          <div>
            <input type="text" placeholder="Chave PIX (Opcional)" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" value={bankData.chave_pix} onChange={e => setBankData({...bankData, chave_pix: e.target.value})} />
          </div>
              <div className="flex gap-3">
                <input type="text" placeholder="Conta" className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none" value={bankData.conta} onChange={e => setBankData({...bankData, conta: e.target.value})} required />
                <input type="text" placeholder="Digito" className="w-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 outline-none text-center" value={bankData.digito} onChange={e => setBankData({...bankData, digito: e.target.value})} required />
              </div>
              <button type="submit" disabled={savingBankData} className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold py-3 rounded-lg transition-colors mt-4 disabled:opacity-50">
                {savingBankData ? 'Salvando...' : 'Continuar'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. Confirmation Modal (Read-Only) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-800">Confirmar Dados Bancários</h3>
              <button onClick={() => setShowConfirmModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg space-y-2 text-sm text-slate-700">
                <p><span className="font-semibold">Titular:</span> {bankData.nome_titular}</p>
                <p><span className="font-semibold">CPF/CNPJ:</span> {bankData.cpf_cnpj}</p>
                <p><span className="font-semibold">Banco:</span> {bankData.banco}</p>
                <p><span className="font-semibold">Agência:</span> {bankData.agencia}</p>
                <p><span className="font-semibold">Conta:</span> {bankData.conta}-{bankData.digito}</p>
                <p><span className="font-semibold">Tipo:</span> {bankData.tipo_conta === 'poupanca' ? 'Poupança' : 'Corrente'}</p>
                <p><span className="font-semibold">Chave PIX:</span> {bankData.chave_pix || 'Não informada'}</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleEditData} className="flex-1 py-3 border border-slate-300 rounded-lg text-slate-600 font-medium hover:bg-slate-50 transition-colors">
                  Alterar
                </button>
                <button onClick={handleConfirmData} className="flex-1 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold transition-colors">
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Amount Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-800">Valor do Saque</h3>
              <button onClick={() => setShowWithdrawModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmitWithdrawal} className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Saldo disponível: <span className="font-bold text-emerald-600">R$ {saldo.toFixed(2)}</span>
              </p>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quanto deseja retirar?</label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-gray-500">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={saldo}
                    placeholder="0.00"
                    className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-400 outline-none"
                    value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                   <button type="button" onClick={() => setWithdrawAmount(saldo.toFixed(2))} className="text-xs text-sky-600 hover:underline">
                      Retirar tudo
                   </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Tipo de Saque</label>
                
                <div 
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${withdrawType === 'normal' ? 'border-sky-500 bg-sky-50' : 'border-gray-200 hover:border-sky-200'}`}
                  onClick={() => setWithdrawType('normal')}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${withdrawType === 'normal' ? 'border-sky-500' : 'border-gray-400'}`}>
                    {withdrawType === 'normal' && <div className="w-2 h-2 rounded-full bg-sky-500" />}
                  </div>
                  <div>
                    <span className="font-medium text-gray-900">Normal</span>
                    <p className="text-xs text-gray-500">Semanal (cai toda segunda-feira)</p>
                  </div>
                </div>

                <div 
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${withdrawType === 'rapido' ? 'border-yellow-500 bg-yellow-50' : 'border-gray-200 hover:border-yellow-200'}`}
                  onClick={() => setWithdrawType('rapido')}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${withdrawType === 'rapido' ? 'border-yellow-500' : 'border-gray-400'}`}>
                    {withdrawType === 'rapido' && <div className="w-2 h-2 rounded-full bg-yellow-500" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">Rápido</span>
                      <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Zap size={10} fill="currentColor" /> FLASH
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">Receba em instantes via PIX.</p>
                    {withdrawType === 'rapido' && quickWithdrawFee > 0 && (
                      <div className="mt-2 text-xs text-yellow-700 bg-yellow-100/50 p-2 rounded">
                        Taxa de <strong>{quickWithdrawFee}%</strong> sobre o valor do saque.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {withdrawType === 'rapido' && withdrawAmount && Number(withdrawAmount) > 0 && quickWithdrawFee > 0 && (
                <div className="bg-gray-50 p-3 rounded-lg space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Valor do Saque:</span>
                    <span>R$ {Number(withdrawAmount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-red-500">
                    <span>Taxa ({quickWithdrawFee}%):</span>
                    <span>- R$ {(Number(withdrawAmount) * (quickWithdrawFee / 100)).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-1 mt-1 flex justify-between font-bold text-gray-900">
                    <span>Você recebe:</span>
                    <span>R$ {(Number(withdrawAmount) * (1 - quickWithdrawFee / 100)).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <button type="submit" disabled={submittingWithdraw || Number(withdrawAmount) > saldo || Number(withdrawAmount) <= 0} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg transition-colors mt-2 disabled:opacity-50">
                {submittingWithdraw ? 'Solicitando...' : 'Confirmar Saque'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="w-6 h-6" />
          Carteira / Extrato
        </h1>
        <button 
          onClick={handleWithdrawClick}
          className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors text-sm font-medium shadow-sm flex items-center gap-2"
        >
          <ArrowDownUp size={16} />
          Retirar saldo
        </button>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm mb-6 border border-slate-100">
         <h2 className="text-sm text-gray-500 uppercase font-semibold tracking-wide">Saldo Atual</h2>
         <p className="text-4xl font-bold text-gray-800 mt-2">R$ {saldo.toFixed(2)}</p>
      </div>

      {pendingWithdrawals.length > 0 && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
           <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
           <div>
             <h3 className="font-semibold text-yellow-800 text-sm">Solicitação em análise</h3>
             <p className="text-yellow-700 text-sm mt-1">
               Você tem {pendingWithdrawals.length} solicitação(ões) de saque pendente(s). O valor será depositado em sua conta em instantes.
             </p>
             <div className="mt-2 space-y-1">
               {pendingWithdrawals.map(p => (
                 <div key={p.id} className="text-xs text-yellow-800/80 flex items-center gap-2">
                    <span>• {new Date(p.created_at).toLocaleDateString()} - R$ {(Number(p.valor_pago) + (Number(p.taxa_aplicada) || 0)).toFixed(2)}</span>
                 </div>
               ))}
             </div>
           </div>
        </div>
      )}

      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
         <ArrowDownUp size={20} />
         Histórico de Transações
      </h2>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Carregando...</div>
      ) : extrato.length === 0 && acertos.length === 0 ? (
        <div className="text-center text-gray-500 py-8 bg-white rounded-lg border border-slate-100">Nenhuma movimentação encontrada.</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-slate-100">
           <table className="w-full text-left">
             <thead className="bg-gray-50 text-gray-600 text-sm">
               <tr>
                 <th className="p-4 font-semibold">Data</th>
                 <th className="p-4 font-semibold">Descrição</th>
                 <th className="p-4 text-right font-semibold">Valor</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-100">
               {/* Show Withdrawals (Acertos) first or mixed? Let's just append them or sort? 
                   Ideally sort by date. 
               */}
               {[...extrato, ...acertos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((item) => {
                 // Identify type
                 const isAcerto = 'valor_pago' in item;
                 const valor = isAcerto ? -((Number(item.valor_pago) || 0) + (Number(item.taxa_aplicada) || 0)) : (item.valor_entregador || item.valor_entrega || 0);
                 const descricao = isAcerto ? 
                    (item.status === 'pendente' ? (item.tipo_saque === 'rapido' ? 'Saque Rápido (Pendente)' : 'Saque (Pendente)') : (item.tipo_saque === 'rapido' ? 'Saque Rápido Realizado' : 'Saque Realizado')) : 
                    (item.descricao || 'Comissão de Entrega');
                 
                 return (
                   <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                     <td className="p-4 text-sm text-gray-600">{new Date(item.created_at).toLocaleDateString()} <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleTimeString().slice(0,5)}</span></td>
                     <td className="p-4 text-sm font-medium text-gray-800">
                        {descricao}
                        {isAcerto && item.status === 'pendente' && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Pendente</span>}
                     </td>
                     <td className={`p-4 text-right font-medium text-sm ${valor >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {valor >= 0 ? '+' : '-'} R$ {Math.abs(valor).toFixed(2)}
                    </td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
        </div>
      )}
    </div>
  );
}
