
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit, Trash2, AlertCircle, Store } from 'lucide-react';
import { Database } from '../../lib/database.types';
import { Modal } from '../Modal';

type Integracao = Database['public']['Tables']['integracoes_ifood']['Row'] & {
  clientes?: { nome_completo: string } | null;
};

type Cliente = {
  id: string;
  nome_completo: string;
};

export function IntegracaoPanel() {
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIntegracao, setEditingIntegracao] = useState<Integracao | null>(null);
  
  const [formData, setFormData] = useState<Partial<Database['public']['Tables']['integracoes_ifood']['Insert']>>({
    status: 'inativo'
  });

  
  
  const IFOOD_APP_CLIENT_ID = 'afc43a76-ba7f-49c6-973c-a6fb83b0f8c8';

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: intData, error: intError } = await supabase
        .from('integracoes_ifood')
        .select('*, clientes(nome_completo)')
        .order('created_at', { ascending: false });

      if (intError) throw intError;

      const { data: cliData, error: cliError } = await supabase
        .from('clientes')
        .select('id, nome_completo')
        .order('nome_completo');

      if (cliError) throw cliError;

      setIntegracoes(intData || []);
      setClientes(cliData || []);

    } catch (err: any) {
      console.error('Erro ao buscar dados:', err);
      setError(err.message || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = (clienteId: string) => {
    const connect = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase.functions.invoke('ifood-auth', {
          body: {
            action: 'userCode',
            cliente_id: clienteId
          }
        });

        if (error) {
          console.error('Erro ifood-auth (userCode):', error, data);
          const message =
            (data as any)?.error ||
            (data as any)?.message ||
            (error as any).message ||
            'Erro ao gerar código de ativação no iFood.';
          throw new Error(message);
        }

        if ((data as any)?.error) {
          throw new Error((data as any).error);
        }

        const userCode = (data as any).userCode || (data as any).user_code;
        const verificationUrl = (data as any).verificationUrlComplete || (data as any).verification_url_complete;

        if (!userCode) {
          throw new Error('Não foi possível obter o código de ativação do iFood.');
        }

        let mensagem = `1) Acesse o Portal do Parceiro iFood e clique em "Ativar aplicativo por código".\n\n2) Informe este código: ${userCode}.\n\n3) Após autorizar o aplicativo, o portal exibirá um "código de autorização".\n\n4) Copie esse código e cole na próxima caixa.`;

        if (verificationUrl) {
          mensagem = `Você pode acessar diretamente este endereço:\n${verificationUrl}\n\n` + mensagem;
        }

        alert(mensagem);

        const authCode = window.prompt('Cole aqui o código de autorização exibido no Portal do iFood:');
        if (!authCode) {
          return;
        }

        const redirectUri = window.location.origin + window.location.pathname;

        const { data: exchangeData, error: exchangeError } = await supabase.functions.invoke('ifood-auth', {
          body: {
            action: 'exchange',
            code: authCode.trim(),
            cliente_id: clienteId,
            redirect_uri: redirectUri
          }
        });

        if (exchangeError) {
          console.error('Erro ifood-auth (exchange):', exchangeError, exchangeData);
          const message =
            (exchangeData as any)?.error ||
            (exchangeData as any)?.message ||
            (exchangeError as any).message ||
            'Erro ao finalizar autenticação com iFood.';
          throw new Error(message);
        }

        if ((exchangeData as any)?.error) {
          throw new Error((exchangeData as any).error);
        }

        alert('Integração conectada com sucesso!');
        fetchData();
      } catch (err: any) {
        console.error('Erro na conexão iFood:', err);
        alert(err.message || 'Erro ao conectar com iFood');
        setError(err.message || 'Erro ao conectar com iFood');
      } finally {
        setLoading(false);
      }
    };

    void connect();
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openModal = (integracao?: Integracao) => {
    if (integracao) {
      setEditingIntegracao(integracao);
      setFormData({
        cliente_id: integracao.cliente_id,
        status: integracao.status
      });
    } else {
      setEditingIntegracao(null);
      setFormData({
        status: 'inativo',
        cliente_id: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formData.cliente_id) {
        alert('Selecione um comércio');
        return;
      }

      if (editingIntegracao) {
        const { error } = await supabase
          .from('integracoes_ifood')
          .update({
            status: formData.status
          })
          .eq('id', editingIntegracao.id);
        
        if (error) throw error;
        
        setIsModalOpen(false);
        fetchData();
        alert('Status atualizado com sucesso.');
      } else {
        const { error } = await supabase
          .from('integracoes_ifood')
          .insert({
            cliente_id: formData.cliente_id,
            status: 'inativo'
          });

        if (error) throw error;

        setIsModalOpen(false);
        fetchData();
        alert('Solicitação de integração registrada. O comércio verá a notificação em Notificações.');
      }
      
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      alert(err.message || 'Erro ao salvar integração');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta integração?')) return;
    try {
      const { error } = await supabase
        .from('integracoes_ifood')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      console.error('Erro ao excluir:', err);
      alert(err.message || 'Erro ao excluir integração');
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando integrações...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Integração iFood (App Distribuído)</h2>
          <p className="text-sm text-slate-500">Conecte os comércios ao seu aplicativo RouteDelivery via OAuth.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openModal()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus size={20} />
            Nova Integração
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integracoes.map((int) => (
          <div key={int.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-50 p-2 rounded-lg">
                  <Store className="text-red-600" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{int.clientes?.nome_completo || 'Comércio Desconhecido'}</h3>
                  <div className="flex items-center gap-1 text-xs">
                    <span className={`w-2 h-2 rounded-full ${int.status === 'ativo' ? 'bg-green-500' : int.status === 'erro' ? 'bg-red-500' : 'bg-slate-400'}`} />
                    <span className="text-slate-500 capitalize">{int.status}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => openModal(int)}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Editar"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => handleDelete(int.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Excluir"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-600 bg-slate-50 p-3 rounded border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500">Merchant ID:</span>
                <span className="font-mono">{int.merchant_id || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Última Sync:</span>
                <span>{int.last_synced_at ? new Date(int.last_synced_at).toLocaleString() : 'Nunca'}</span>
              </div>
            </div>
          </div>
        ))}

        {integracoes.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
            <Store size={48} className="mx-auto mb-4 opacity-50" />
            <p>Nenhuma integração configurada.</p>
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingIntegracao ? 'Editar Integração' : 'Conectar com iFood'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Comércio</label>
            <select
              required
              value={formData.cliente_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, cliente_id: e.target.value }))}
              className="w-full border rounded-lg p-2 bg-white"
              disabled={!!editingIntegracao}
            >
              <option value="">Selecione um comércio...</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nome_completo}</option>
              ))}
            </select>
          </div>

          {!editingIntegracao && (
            <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-700 border border-blue-100">
                <p className="font-semibold mb-1">Solicitação de integração</p>
                <p>Ao salvar, será registrada uma solicitação de integração para este comércio. O responsável do comércio verá um aviso no menu <strong>Notificações</strong> do painel dele e deverá acessar o Portal do Parceiro iFood para autorizar o aplicativo <strong>RouteDelivery</strong>.</p>
                <p className="mt-2 text-xs text-blue-600">Certifique-se de que o comércio já possui acesso ao Portal do iFood com conta profissional (CNPJ).</p>
            </div>
          )}

          {editingIntegracao && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={formData.status || 'inativo'}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
                className="w-full border rounded-lg p-2 bg-white"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="erro">Erro</option>
              </select>
            </div>
          )}

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              {editingIntegracao ? 'Salvar Alterações' : 'Conectar com iFood'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
