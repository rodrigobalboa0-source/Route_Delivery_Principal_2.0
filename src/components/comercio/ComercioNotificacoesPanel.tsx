import { useEffect, useState } from 'react';
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '../../lib/supabase';
import { Bell, AlertCircle, ExternalLink } from 'lucide-react';
import { Modal } from '../Modal';

type IntegracaoIfood = {
  id: string;
  status: string | null;
  created_at: string;
  last_synced_at: string | null;
};

export function ComercioNotificacoesPanel() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [integracoes, setIntegracoes] = useState<IntegracaoIfood[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ifoodModalOpen, setIfoodModalOpen] = useState(false);
  const [ifoodLoading, setIfoodLoading] = useState(false);
  const [ifoodUserCode, setIfoodUserCode] = useState<string | null>(null);
  const [ifoodVerificationUrl, setIfoodVerificationUrl] = useState<string | null>(null);
  const [ifoodAuthorizationCodeVerifier, setIfoodAuthorizationCodeVerifier] = useState<string | null>(null);
  const [ifoodError, setIfoodError] = useState<string | null>(null);
  const [ifoodAuthCode, setIfoodAuthCode] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('cliente_id, role, email')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      let targetClientId = userData?.cliente_id as string | null;

      if (!targetClientId && userData?.role === 'cliente' && userData.email) {
        const { data: clienteData, error: clienteError } = await supabase
          .from('clientes')
          .select('id')
          .eq('email', userData.email)
          .maybeSingle();

        if (clienteError) throw clienteError;
        targetClientId = clienteData?.id || null;
      }

      if (!targetClientId) {
        setClientId(null);
        setIntegracoes([]);
        setLoading(false);
        return;
      }

      setClientId(targetClientId);

      const { data: integData, error: integError } = await supabase
        .from('integracoes_ifood')
        .select('id, status, created_at, last_synced_at')
        .eq('cliente_id', targetClientId)
        .order('created_at', { ascending: false });

      if (integError) throw integError;

      setIntegracoes(integData || []);
    } catch (err: any) {
      console.error('Erro ao carregar notificações:', err);
      setError(err.message || 'Erro ao carregar notificações');
    } finally {
      setLoading(false);
    }
  }

  const hasIntegracao = integracoes.length > 0;
  const ultimaIntegracao = integracoes[0] || null;

  async function iniciarAutorizacaoIfood() {
    if (!clientId) return;
    try {
      setIfoodLoading(true);
      setIfoodError(null);
      setIfoodUserCode(null);
      setIfoodVerificationUrl(null);
      setIfoodAuthorizationCodeVerifier(null);

      const { data, error: fnError } = await supabase.functions.invoke('ifood-auth', {
        body: {
          action: 'userCode',
          cliente_id: clientId
        }
      });

      if (fnError) {
        const message =
          (data as any)?.error ||
          (data as any)?.message ||
          (fnError as any).message ||
          'Erro ao gerar código de ativação no iFood.';
      setIfoodError(message);
        return;
      }

      if ((data as any)?.error) {
        setIfoodError((data as any).error);
        return;
      }

      const userCode = (data as any).userCode || (data as any).user_code || null;
      const verificationUrl =
        (data as any).verificationUrlComplete ||
        (data as any).verification_url_complete ||
        null;
      const authorizationCodeVerifier =
        (data as any).authorizationCodeVerifier ||
        (data as any).authorization_code_verifier ||
        (data as any).codeVerifier ||
        (data as any).code_verifier ||
        null;

      if (!userCode) {
        setIfoodError('Não foi possível obter o código de ativação do iFood.');
        return;
      }

      setIfoodUserCode(userCode);
      setIfoodVerificationUrl(verificationUrl);
      setIfoodAuthorizationCodeVerifier(authorizationCodeVerifier);
      setIfoodModalOpen(true);
    } catch (e: any) {
      setIfoodError(e.message || 'Erro ao gerar código de ativação no iFood.');
    } finally {
      setIfoodLoading(false);
    }
  }

  async function concluirAutorizacaoIfood() {
    if (!clientId) return;
    if (!ifoodAuthCode.trim()) {
      setIfoodError('Informe o código de autorização exibido no Portal do iFood.');
      return;
    }
    if (!ifoodAuthorizationCodeVerifier) {
      setIfoodError('Reinicie a autorização do iFood para gerar o code verifier.');
      return;
    }
    try {
      setIfoodLoading(true);
      setIfoodError(null);
      const payload = {
        action: 'exchange',
        code: ifoodAuthCode.trim(),
        cliente_id: clientId,
        authorization_code_verifier: ifoodAuthorizationCodeVerifier,
      };

      const { data, error: fnError } = await supabase.functions.invoke('ifood-auth', {
        body: payload
      });

      if (fnError) {
        let message =
          (data as any)?.error ||
          (data as any)?.message ||
          (fnError as any).message ||
          'Erro ao finalizar autenticação com iFood.';

        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token || SUPABASE_ANON_KEY;

          const resp = await fetch(`${SUPABASE_URL}/functions/v1/ifood-auth`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
          });

          const raw = await resp.text();
          const parsed = raw ? JSON.parse(raw) : null;
          message = (parsed as any)?.error || (parsed as any)?.message || message;
        } catch {
        }

        setIfoodError(message);
        return;
      }

      if ((data as any)?.error) {
        setIfoodError((data as any).error);
        return;
      }

      setIfoodModalOpen(false);
      setIfoodAuthCode('');
      await fetchData();
    } catch (e: any) {
      setIfoodError(e.message || 'Erro ao finalizar autenticação com iFood.');
    } finally {
      setIfoodLoading(false);
    }
  }

  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel('comercio_notificacoes_ifood')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'integracoes_ifood'
        },
        (payload: any) => {
          const novo = payload.new;
          const antigo = payload.old;
          if (
            (novo && novo.cliente_id === clientId) ||
            (antigo && antigo.cliente_id === clientId)
          ) {
            fetchData();
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [clientId]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
            <Bell className="w-7 h-7 text-sky-600" />
            Notificações do Comércio
          </h1>
          <p className="text-gray-500 mt-1">
            Acompanhe solicitações importantes relacionadas à sua conta e integrações.
          </p>
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center text-gray-500">
          Carregando notificações...
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Erro ao carregar notificações</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && !clientId && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Nenhum comércio vinculado ao seu acesso</p>
            <p className="text-xs mt-1">
              Entre em contato com o administrador para vincular seu usuário ao cadastro do comércio.
            </p>
          </div>
        </div>
      )}

      {!loading && !error && clientId && !hasIntegracao && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center text-gray-500">
          <p className="font-medium text-gray-700 mb-1">Nenhuma notificação pendente</p>
          <p className="text-sm">
            Quando o administrador solicitar novas integrações ou ações, elas aparecerão aqui.
          </p>
        </div>
      )}

      {!loading && !error && clientId && hasIntegracao && (
        <div className="space-y-4">
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-5 flex items-start gap-3">
            <div className="mt-0.5">
              <Bell className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="font-semibold text-sky-900 text-sm">
                Solicitação de integração com iFood
              </p>
              <p className="text-sm text-sky-900 mt-1">
                Seu administrador solicitou a integração deste comércio com o iFood. Para concluir,
                acesse o Portal do Parceiro iFood e autorize o aplicativo RouteDelivery na área de
                aplicativos e integrações.
              </p>
              <p className="text-xs text-sky-800 mt-2">
                Após autorizar no portal, a sincronização de pedidos poderá ser ativada pelo
                administrador.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href="https://portal.ifood.com.br/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
                >
                  Abrir Portal do iFood
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={iniciarAutorizacaoIfood}
                  disabled={ifoodLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {ifoodLoading ? 'Gerando código...' : 'Autorizar app iFood'}
                </button>
              </div>
              {ultimaIntegracao && (
                <div className="mt-3 text-xs text-sky-900/90">
                  Status atual da integração: <span className="font-semibold">{ultimaIntegracao.status || 'indefinido'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <Modal
        open={ifoodModalOpen}
        onClose={() => setIfoodModalOpen(false)}
        title="Autorizar aplicativo iFood"
      >
        <div className="space-y-4">
          {ifoodError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
              {ifoodError}
            </div>
          )}

          <div className="text-sm text-slate-800 space-y-2">
            <p>
              Use o código abaixo no Portal do Parceiro iFood em{' '}
              <span className="font-semibold">Aplicativos → Ativar aplicativo por código</span>.
            </p>
            {ifoodUserCode && (
              <div className="px-3 py-2 rounded-lg bg-slate-900 text-slate-50 font-mono text-lg tracking-widest text-center">
                {ifoodUserCode}
              </div>
            )}
            {ifoodVerificationUrl && (
              <a
                href={ifoodVerificationUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700 transition-colors"
              >
                Abrir passo a passo no Portal do iFood
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <p className="text-xs text-slate-600 pt-1">
              Após autorizar o aplicativo, o portal exibirá um{' '}
              <span className="font-semibold">código de autorização</span>. Cole esse código
              abaixo para concluir a integração.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              Código de autorização do Portal do iFood
            </label>
            <input
              type="text"
              value={ifoodAuthCode}
              onChange={(e) => setIfoodAuthCode(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="Ex: ABCD-EFGH"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIfoodModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={concluirAutorizacaoIfood}
              disabled={ifoodLoading}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {ifoodLoading ? 'Concluindo...' : 'Concluir autorização'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

