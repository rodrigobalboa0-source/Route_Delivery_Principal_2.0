import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Bell } from 'lucide-react';

export function EntregadorNotificacoesPanel() {
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel: any = null;

    const setupRealtime = async () => {
      // Get current user for filtering
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      fetchNotificacoes();

      channel = supabase
        .channel('entregador_notificacoes_panel')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'entregador_notificacoes',
            filter: `entregador_id=eq.${user.id}`
          },
          (payload) => {
            setNotificacoes(prev => [payload.new, ...prev]);
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  async function fetchNotificacoes() {
    try {
      const { data, error } = await supabase
        .from('entregador_notificacoes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotificacoes(data || []);
    } catch (error) {
      console.error('Erro ao buscar notificações:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Bell className="w-6 h-6" />
        Notificações
      </h1>
      
      {loading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : notificacoes.length === 0 ? (
        <div className="bg-white p-6 rounded-lg shadow-sm text-center text-gray-500">
          Nenhuma notificação encontrada.
        </div>
      ) : (
        <div className="space-y-4">
          {notificacoes.map((notificacao) => (
            <div key={notificacao.id} className={`bg-white p-4 rounded-lg shadow-sm border-l-4 ${notificacao.lida ? 'border-gray-300' : 'border-blue-500'}`}>
              <h3 className="font-semibold text-lg">{notificacao.titulo}</h3>
              <p className="text-gray-600 mt-1">{notificacao.mensagem}</p>
              <div className="text-xs text-gray-400 mt-2">
                {new Date(notificacao.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
