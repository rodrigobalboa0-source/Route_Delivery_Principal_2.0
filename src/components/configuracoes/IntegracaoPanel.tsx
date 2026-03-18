
import { useState, useEffect } from 'react';
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '../../lib/supabase';
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
  const [merchantClienteId, setMerchantClienteId] = useState<string>('');
  const [merchantId, setMerchantId] = useState<string>('');
  const [merchantIdDirty, setMerchantIdDirty] = useState<boolean>(false);
  const [interruptionId, setInterruptionId] = useState<string>('');
  const [merchantLoading, setMerchantLoading] = useState(false);
  const [merchantOutput, setMerchantOutput] = useState<string>('');
  const [openingHoursPayload, setOpeningHoursPayload] = useState<string>('');
  const [pollMerchantStatus, setPollMerchantStatus] = useState<boolean>(true);
  
  const [formData, setFormData] = useState<Partial<Database['public']['Tables']['integracoes_ifood']['Insert']>>({
    status: 'inativo'
  });

  const activeIntegracoes = integracoes.filter(i => i.status === 'ativo');

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
        const authorizationCodeVerifier =
          (data as any).authorizationCodeVerifier ||
          (data as any).authorization_code_verifier ||
          (data as any).codeVerifier ||
          (data as any).code_verifier ||
          null;

        if (!userCode) {
          throw new Error('Não foi possível obter o código de ativação do iFood.');
        }
        if (!authorizationCodeVerifier) {
          throw new Error('Não foi possível obter o code verifier do iFood.');
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

        const { data: exchangeData, error: exchangeError } = await supabase.functions.invoke('ifood-auth', {
          body: {
            action: 'exchange',
            code: authCode.trim(),
            cliente_id: clienteId,
            authorization_code_verifier: authorizationCodeVerifier
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

  useEffect(() => {
    if (merchantClienteId) return;
    if (activeIntegracoes.length > 0) {
      setMerchantClienteId(activeIntegracoes[0].cliente_id);
    }
  }, [activeIntegracoes, merchantClienteId]);

  useEffect(() => {
    const int = activeIntegracoes.find(i => i.cliente_id === merchantClienteId);
    const nextMerchantId = int?.merchant_id || '';
    if (!merchantIdDirty) {
      setMerchantId(nextMerchantId);
    }
  }, [activeIntegracoes, merchantClienteId, merchantIdDirty]);

  useEffect(() => {
    if (!pollMerchantStatus) return;
    if (!merchantClienteId) return;
    if (!merchantId) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        await supabase.functions.invoke('ifood-merchant', {
          body: { action: 'getStatus', cliente_id: merchantClienteId, merchantId }
        });
      } catch {
      }
    };

    void tick();
    const interval = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [merchantClienteId, merchantId, pollMerchantStatus]);

  const runMerchantAction = async (action: string, extra?: Record<string, unknown>) => {
    if (!merchantClienteId) {
      alert('Selecione um comércio com integração ativa');
      return;
    }

    setMerchantLoading(true);
    setMerchantOutput('');
    try {
      const payload = { action, cliente_id: merchantClienteId, merchantId, ...(extra || {}) };

      const { data, error } = await supabase.functions.invoke('ifood-merchant', { body: payload });

      if (error) {
        let status: number | null = null;
        let raw: string | null = null;
        let parsed: unknown = null;

        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token || SUPABASE_ANON_KEY;

          const resp = await fetch(`${SUPABASE_URL}/functions/v1/ifood-merchant`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
          });

          status = resp.status;
          raw = await resp.text();
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = null;
          }
        } catch {
        }

        setMerchantOutput(
          JSON.stringify(
            {
              success: false,
              error: error.message || 'Edge Function retornou erro',
              status,
              response: (data ?? parsed) || null,
              raw,
            },
            null,
            2
          )
        );
        return;
      }

      setMerchantOutput(JSON.stringify(data, null, 2));
      if (action === 'getOpeningHours') {
        const openingHours = (data as any)?.openingHours;
        if (openingHours) setOpeningHoursPayload(JSON.stringify(openingHours, null, 2));
      }
      if (action === 'selfTest') {
        const mId = (data as any)?.merchantId;
        if (mId) {
          setMerchantId(String(mId));
          setMerchantIdDirty(true);
        }
      }
      if (action === 'listMerchants') {
        const merchants = (data as any)?.merchants as any[] | undefined;
        const mId = merchants?.[0]?.id;
        if (mId) {
          setMerchantId(String(mId));
          setMerchantIdDirty(true);
        }
      }
    } catch (err: any) {
      setMerchantOutput(JSON.stringify({ success: false, error: err.message || 'Erro ao chamar iFood' }, null, 2));
    } finally {
      setMerchantLoading(false);
    }
  };

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

            {int.status !== 'ativo' && (
              <button
                onClick={() => handleConnect(int.cliente_id)}
                className="mt-3 w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                Conectar no iFood
              </button>
            )}
          </div>
        ))}

        {integracoes.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
            <Store size={48} className="mx-auto mb-4 opacity-50" />
            <p>Nenhuma integração configurada.</p>
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-800">Homologação iFood - Merchant</h3>
            <p className="text-sm text-slate-500">Ferramentas para validar endpoints do módulo Merchant.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={pollMerchantStatus}
              onChange={(e) => setPollMerchantStatus(e.target.checked)}
            />
            Polling de status (30s)
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Comércio (integração ativa)</label>
            <select
              value={merchantClienteId}
              onChange={(e) => {
                setMerchantClienteId(e.target.value);
                setMerchantIdDirty(false);
              }}
              className="w-full border rounded-lg p-2 bg-white"
            >
              <option value="">Selecione...</option>
              {activeIntegracoes.map((i) => (
                <option key={i.id} value={i.cliente_id}>
                  {i.clientes?.nome_completo || i.cliente_id}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Merchant ID</label>
            <input
              value={merchantId}
              onChange={(e) => {
                setMerchantId(e.target.value);
                setMerchantIdDirty(true);
              }}
              className="w-full border rounded-lg p-2 font-mono"
              placeholder="UUID da loja"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runMerchantAction('selfTest')}
            disabled={merchantLoading}
            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
          >
            Checklist
          </button>
          <button
            onClick={() => handleConnect(merchantClienteId)}
            disabled={merchantLoading || !merchantClienteId}
            className="px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-60"
          >
            Reautenticar iFood
          </button>
          <button
            onClick={() => runMerchantAction('listMerchants')}
            disabled={merchantLoading}
            className="px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60"
          >
            GET /merchants
          </button>
          <button
            onClick={() => runMerchantAction('getMerchant')}
            disabled={merchantLoading}
            className="px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60"
          >
            GET /merchants/{'{id}'}
          </button>
          <button
            onClick={() => runMerchantAction('getStatus')}
            disabled={merchantLoading}
            className="px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60"
          >
            GET /status
          </button>
          <button
            onClick={() => runMerchantAction('listInterruptions')}
            disabled={merchantLoading}
            className="px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60"
          >
            GET /interruptions
          </button>
          <button
            onClick={() => runMerchantAction('getOpeningHours')}
            disabled={merchantLoading}
            className="px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60"
          >
            GET /opening-hours
          </button>
          <button
            onClick={() => {
              try {
                const payload = openingHoursPayload ? JSON.parse(openingHoursPayload) : null;
                runMerchantAction('putOpeningHours', { payload });
              } catch {
                alert('Payload de opening-hours inválido. Corrija o JSON e tente novamente.');
              }
            }}
            disabled={merchantLoading}
            className="px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60"
          >
            PUT /opening-hours
          </button>
          <button
            onClick={() =>
              runMerchantAction('createInterruption', {
                payload: {
                  description: 'Homologação RouteDelivery',
                  start: new Date().toISOString(),
                  end: new Date(Date.now() + 30 * 60 * 1000).toISOString()
                }
              })
            }
            disabled={merchantLoading}
            className="px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60"
          >
            POST /interruptions (30m)
          </button>
          <div className="flex items-center gap-2">
            <input
              value={interruptionId}
              onChange={(e) => setInterruptionId(e.target.value)}
              className="border rounded-lg p-2 font-mono text-xs w-64"
              placeholder="interruptionId"
            />
            <button
              onClick={() => runMerchantAction('deleteInterruption', { interruptionId })}
              disabled={merchantLoading || !interruptionId}
              className="px-3 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60"
            >
              DELETE /interruptions
            </button>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <pre className="text-xs text-slate-700 overflow-auto max-h-80 whitespace-pre-wrap">
            {merchantOutput || (merchantLoading ? 'Carregando...' : 'Resultado aparecerá aqui.')}
          </pre>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-slate-600">Payload (PUT /opening-hours)</label>
            <button
              type="button"
              onClick={() => setOpeningHoursPayload('')}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Limpar
            </button>
          </div>
          <textarea
            value={openingHoursPayload}
            onChange={(e) => setOpeningHoursPayload(e.target.value)}
            className="w-full border rounded-lg p-2 font-mono text-xs min-h-32"
            placeholder="Clique em GET /opening-hours para preencher automaticamente, edite se necessário e depois clique em PUT /opening-hours."
          />
        </div>
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
