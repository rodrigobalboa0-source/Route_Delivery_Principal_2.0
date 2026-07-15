import { useEffect, useState } from 'react';
import { AlertCircle, X, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PendingWithdrawalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: () => void;
}

export function PendingWithdrawalsModal({ isOpen, onClose, onNavigate }: PendingWithdrawalsModalProps) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      checkPendingWithdrawals();
    }
  }, [isOpen]);

  const checkPendingWithdrawals = async () => {
    try {
      const { count, error } = await supabase
        .from('acertos_entregadores')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pendente');

      if (error) throw error;
      setCount(count || 0);
    } catch (error) {
      console.error('Erro ao verificar saques pendentes:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || loading || count === 0) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-orange-50 p-4 border-b border-orange-100 flex justify-between items-center">
          <div className="flex items-center gap-2 text-orange-800 font-semibold">
            <AlertCircle size={24} />
            <span>Atenção Necessária</span>
          </div>
          <button 
            onClick={onClose}
            className="text-orange-400 hover:text-orange-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6">
          <h3 className="text-lg font-medium text-slate-800 mb-2">
            Solicitações de Saque Pendentes
          </h3>
          <p className="text-slate-600 mb-6">
            Existem <span className="font-bold text-orange-600">{count}</span> solicitações de retirada de saldo aguardando aprovação financeira.
          </p>
          
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors font-medium"
            >
              Depois
            </button>
            <button
              onClick={() => {
                onNavigate();
                onClose();
              }}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
            >
              Ver Solicitações
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
