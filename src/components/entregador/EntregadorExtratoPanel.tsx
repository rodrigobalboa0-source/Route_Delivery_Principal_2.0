import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Wallet, ArrowDownUp, X } from 'lucide-react';

interface EntregadorExtratoPanelProps {
  userId?: string;
}

export function EntregadorExtratoPanel({ userId }: EntregadorExtratoPanelProps) {
  const [extrato, setExtrato] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saldo, setSaldo] = useState(0);
  
  // Bank Data Modal State
  const [showBankModal, setShowBankModal] = useState(false);
  const [currentEntregadorId, setCurrentEntregadorId] = useState<string | null>(null);
  const [savingBankData, setSavingBankData] = useState(false);
  const [bankData, setBankData] = useState({
    nome_titular: '',
    cpf_cnpj: '',
    banco: '',
    agencia: '',
    tipo_conta: 'corrente',
    conta: '',
    digito: ''
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
  }, [userId]);

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
          digito: savedData.digito || ''
        });
      }
      
      const { data, error } = await supabase
        .from('nova_entrega') 
        .select('*')
        .eq('entregador_id', entregadorId)
        .eq('status', 'entregue')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExtrato(data || []);
      
      const total = (data || []).reduce((acc, curr) => acc + (curr.valor_entregador || curr.valor_entrega || 0), 0);
      setSaldo(total);

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

  return (
    <div className="p-6 max-w-4xl mx-auto relative">
      {/* Modal de Dados Bancários */}
      {showBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-800">Preencha os dados da sua conta</h3>
              <button 
                onClick={() => setShowBankModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSaveBankData} className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
              <p className="text-sm text-gray-500 mb-2">Preencha os dados com atenção</p>
              
              <div>
                <input
                  type="text"
                  placeholder="Nome Completo do Titular"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all"
                  value={bankData.nome_titular}
                  onChange={e => setBankData({...bankData, nome_titular: e.target.value})}
                  required
                />
              </div>

              <div>
                <input
                  type="text"
                  placeholder="CPF ou CNPJ"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all"
                  value={bankData.cpf_cnpj}
                  onChange={e => setBankData({...bankData, cpf_cnpj: e.target.value})}
                  required
                />
              </div>

              <div>
                <select
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all bg-white"
                  value={bankData.banco}
                  onChange={e => setBankData({...bankData, banco: e.target.value})}
                  required
                >
                  <option value="">Escolha um banco</option>
                  {bancos.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Agência"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all"
                  value={bankData.agencia}
                  onChange={e => setBankData({...bankData, agencia: e.target.value})}
                  required
                />
              </div>

              <div>
                <select
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all bg-white"
                  value={bankData.tipo_conta}
                  onChange={e => setBankData({...bankData, tipo_conta: e.target.value})}
                  required
                >
                  <option value="corrente">Conta Corrente</option>
                  <option value="poupanca">Conta Poupança</option>
                </select>
              </div>

              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Conta"
                  className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all"
                  value={bankData.conta}
                  onChange={e => setBankData({...bankData, conta: e.target.value})}
                  required
                />
                <input
                  type="text"
                  placeholder="Digito"
                  className="w-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none transition-all text-center"
                  value={bankData.digito}
                  onChange={e => setBankData({...bankData, digito: e.target.value})}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={savingBankData}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold py-3 rounded-lg transition-colors mt-4 disabled:opacity-50"
              >
                {savingBankData ? 'Salvando...' : 'Continuar'}
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
          onClick={() => setShowBankModal(true)}
          className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors text-sm font-medium"
        >
          Retirar saldo
        </button>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
         <h2 className="text-sm text-gray-500 uppercase font-semibold">Saldo Atual</h2>
         <p className="text-4xl font-bold text-gray-800 mt-2">R$ {saldo.toFixed(2)}</p>
      </div>

      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
         <ArrowDownUp size={20} />
         Histórico de Transações
      </h2>

      {loading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : extrato.length === 0 ? (
        <div className="text-center text-gray-500 py-8 bg-white rounded-lg">Nenhuma movimentação encontrada.</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
           <table className="w-full text-left">
             <thead className="bg-gray-50 text-gray-600 text-sm">
               <tr>
                 <th className="p-4">Data</th>
                 <th className="p-4">Descrição</th>
                 <th className="p-4 text-right">Valor</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-100">
               {extrato.map((item) => (
                 <tr key={item.id} className="hover:bg-gray-50">
                   <td className="p-4">{new Date(item.created_at).toLocaleDateString()}</td>
                   <td className="p-4">{item.descricao || 'Comissão'}</td>
                   <td className={`p-4 text-right font-medium ${(item.valor_entregador || item.valor_entrega || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(item.valor_entregador || item.valor_entrega || 0) >= 0 ? '+' : ''} R$ {Number(item.valor_entregador || item.valor_entrega || 0).toFixed(2)}
                  </td>
                 </tr>
               ))}
             </tbody>
           </table>
        </div>
      )}
    </div>
  );
}
