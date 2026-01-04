import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Wallet, ArrowDownUp } from 'lucide-react';

interface EntregadorExtratoPanelProps {
  userId?: string;
}

export function EntregadorExtratoPanel({ userId }: EntregadorExtratoPanelProps) {
  const [extrato, setExtrato] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saldo, setSaldo] = useState(0);

  useEffect(() => {
    fetchExtrato();
  }, [userId]);

  async function fetchExtrato() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: entregadorData, error: entError } = await supabase
        .from('entregadores')
        .select('id')
        .eq('email', user.email)
        .single();

      if (entError || !entregadorData) {
         console.error("Entregador não encontrado");
         setLoading(false);
         return;
      }
      
      const entregadorId = entregadorData.id;

      
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Wallet className="w-6 h-6" />
        Carteira / Extrato
      </h1>
      
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
