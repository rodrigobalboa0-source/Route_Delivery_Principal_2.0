import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { AuthPage } from './components/AuthPage';
import { AccountUnderAnalysis } from './components/AccountUnderAnalysis';
import { supabase } from './lib/supabase';
import { Geolocation } from '@capacitor/geolocation';
import { TopBar } from './components/TopBar';
import { ClientesPanel } from './components/cadastro/ClientesPanel';
import { ContasPanel } from './components/cadastro/ContasPanel';
import { EntregadoresPanel } from './components/cadastro/EntregadoresPanel';
import { GruposPanel } from './components/cadastro/GruposPanel';
import { ModaisPanel } from './components/cadastro/ModaisPanel';
import { TabelasPrecosPanel } from './components/cadastro/TabelasPrecosPanel';
import { TabelasComissoesPanel } from './components/cadastro/TabelasComissoesPanel';
import { PrecificacaoPanel } from './components/cadastro/PrecificacaoPanel';
import { PrecoEsperaPanel } from './components/cadastro/PrecoEsperaPanel';
import { PrecoDinamicoDemandaPanel } from './components/cadastro/PrecoDinamicoDemandaPanel';
import { PrecoDinamicoEntregadorPanel } from './components/cadastro/PrecoDinamicoEntregadorPanel';
import { ServicosOpcionaisPanel } from './components/cadastro/ServicosOpcionaisPanel';
import { PromocoesPanel } from './components/cadastro/PromocoesPanel';
import { MensagensEntregadoresPanel } from './components/mensagens/MensagensEntregadoresPanel';
import { MensagensClientesPanel } from './components/mensagens/MensagensClientesPanel';
import { HistoricoMensagensPanel } from './components/mensagens/HistoricoMensagensPanel';
import { NovaEntregaPanel } from './components/nova/NovaEntregaPanel';
import { PedidosPanel } from './components/pedidos/PedidosPanel';
import { TrainingOverlay } from './components/help/TrainingOverlay';
import { SupportChatOverlay } from './components/help/SupportChatOverlay';
import { ContasReceberPanel } from './components/financeiro/ContasReceberPanel';
import { ContasPagarPanel } from './components/financeiro/ContasPagarPanel';
import { EmissaoNotasPanel } from './components/financeiro/EmissaoNotasPanel';
import { EmissaoRecibosPanel } from './components/financeiro/EmissaoRecibosPanel';
import { CreditoClientesPanel } from './components/financeiro/CreditoClientesPanel';
import { ComissaoEntregadoresPanel } from './components/financeiro/ComissaoEntregadoresPanel';
import { AcertosEntregadoresPanel } from './components/financeiro/AcertosEntregadoresPanel';
import { FaturamentoMensalPanel } from './components/financeiro/FaturamentoMensalPanel';
import { RevisaoAgendamentosPanel } from './components/financeiro/RevisaoAgendamentosPanel';
import { PendingWithdrawalsModal } from './components/financeiro/PendingWithdrawalsModal';
import { ClientesAnaliticoReport } from './components/relatorios/ClientesAnaliticoReport';
import { EntregadoresAnaliticoReport } from './components/relatorios/EntregadoresAnaliticoReport';
import { RoteirizacaoReport } from './components/relatorios/RoteirizacaoReport';
import { OperacaoAnaliticoReport } from './components/relatorios/OperacaoAnaliticoReport';
import { RelatorioEntregasReport } from './components/relatorios/RelatorioEntregasReport';
import { NotasFiscaisReport } from './components/relatorios/NotasFiscaisReport';
import { RecorrenciaReport } from './components/relatorios/RecorrenciaReport';
import { TrajetoEntregadoresReport } from './components/relatorios/TrajetoEntregadoresReport';
import { EntregadoresPeriodoReport } from './components/relatorios/EntregadoresPeriodoReport';
import { DiagnosticoEntregadoresReport } from './components/relatorios/DiagnosticoEntregadoresReport';
import { LogAtividadesReport } from './components/relatorios/LogAtividadesReport';
import { HistoricoVagasReport } from './components/relatorios/HistoricoVagasReport';
import { ConfiguracoesComercioPanel } from './components/configuracoes/ConfiguracoesComercioPanel';
import { CustomizacaoPanel } from './components/configuracoes/CustomizacaoPanel';
import { DadosAcessoPanel } from './components/configuracoes/DadosAcessoPanel';
import { ConfigFiscalPanel } from './components/configuracoes/ConfigFiscalPanel';
import { IntegracoesExternasPanel } from './components/configuracoes/IntegracoesExternasPanel';
import { IntegracoesOpenDeliveryPanel } from './components/configuracoes/IntegracoesOpenDeliveryPanel';
import { IntegracaoPanel } from './components/configuracoes/IntegracaoPanel';
import { CardapioWebPanel } from './components/configuracoes/CardapioWebPanel';
import { ZeDeliveryPanel } from './components/configuracoes/ZeDeliveryPanel';
import { ConfiguracoesOperacaoPanel } from './components/configuracoes/ConfiguracoesOperacaoPanel';
import { FinanceiroDashboard } from './components/FinanceiroDashboard';
import { NotificationManager } from './components/NotificationManager';

import { EntregadorExtratoPanel } from './components/entregador/EntregadorExtratoPanel';
import { EntregadorMinhaContaPanel } from './components/entregador/EntregadorMinhaContaPanel';
import { EntregadorRankingPanel } from './components/entregador/EntregadorRankingPanel';
import { EntregadorHistoricoPanel } from './components/entregador/EntregadorHistoricoPanel';
import { EntregadorNotificacoesPanel } from './components/entregador/EntregadorNotificacoesPanel';
import { EntregadorEntregasDisponiveisPanel } from './components/entregador/EntregadorEntregasDisponiveisPanel';
import { EntregadorPedidosEmAndamentoPanel } from './components/entregador/EntregadorPedidosEmAndamentoPanel';
import { PromocoesEntregadorPanel } from './components/entregador/PromocoesEntregadorPanel';
import { EntregadorHomePanel } from './components/entregador/EntregadorHomePanel';
import { ComercioNotificacoesPanel } from './components/comercio/ComercioNotificacoesPanel';
import { ComercioCreditosPanel } from './components/comercio/ComercioCreditosPanel';
import { ComercioFaturamentoPanel } from './components/comercio/ComercioFaturamentoPanel';
import { EntregadorBottomBar } from './components/entregador/EntregadorBottomBar';

function App() {
  const [activeMenu, setActiveMenu] = useState(() => localStorage.getItem('last_active_menu') || 'pedidos');
  const [authenticated, setAuthenticated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [userRole, setUserRole] = useState<'operador' | 'cliente' | 'entregador' | 'loading'>('loading');
  const [roleResolveError, setRoleResolveError] = useState<string | null>(null);
  const [menuParams, setMenuParams] = useState<any>(null);
  const roleResolvedRef = useRef(false);
  const resolvedUidRef = useRef<string | null>(null);
  const roleResolveInFlightRef = useRef<{ uid: string; startedAt: number } | null>(null);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [accountPending, setAccountPending] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [showPendingWithdrawalsModal, setShowPendingWithdrawalsModal] = useState(false);
  const isMenuRestored = useRef(false);
  const entregadorHeartbeatOnlineRef = useRef(false);
  const entregadorHeartbeatInFlightRef = useRef(false);
  const entregadorLastHeartbeatRef = useRef(0);
  const entregadorLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const clearSupabaseAuthStorage = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (k === 'sb-comercio-token' || k === 'sb-admin-token') keysToRemove.push(k);
        if (k.startsWith('sb-') && k.includes('-auth-token')) keysToRemove.push(k);
      }
      for (const k of keysToRemove) localStorage.removeItem(k);
    } catch (e) {
      void e;
    }
  };

  const isInvalidAuthSessionError = (err: unknown) => {
    const msg =
      (err && typeof err === 'object' && 'message' in err && (err as any).message
        ? String((err as any).message)
        : String(err || '')).toLowerCase();
    return msg.includes('invalid refresh token') || msg.includes('refresh token') || msg.includes('no api key found');
  };

  useEffect(() => {
    if (userRole === 'operador') {
      setShowPendingWithdrawalsModal(true);
    }
  }, [userRole]);

  useEffect(() => {
    if (!authenticated || userRole !== 'entregador') return;

    let watchId: string | null = null;
    let intervalId: number | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let canceled = false;

    const start = async () => {
      let entregadorIdFromContext: string | null = null;
      try {
        const raw = localStorage.getItem('entregador_context');
        const parsed = raw ? (JSON.parse(raw) as { id?: string } | null) : null;
        entregadorIdFromContext = parsed?.id || null;
      } catch (e) {
        void e;
      }

      if (!entregadorIdFromContext) return;

      try {
        const { data } = await supabase
          .from('entregadores')
          .select('is_online')
          .eq('id', entregadorIdFromContext)
          .maybeSingle();
        if (!canceled) entregadorHeartbeatOnlineRef.current = Boolean((data as { is_online?: boolean } | null)?.is_online);
      } catch (e) {
        void e;
      }

      channel = supabase
        .channel('entregador_heartbeat_online_status')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'entregadores',
            filter: `id=eq.${entregadorIdFromContext}`,
          },
          (payload) => {
            if (payload.new) {
              entregadorHeartbeatOnlineRef.current = Boolean((payload.new as { is_online?: boolean }).is_online);
            }
          }
        )
        .subscribe();

      try {
        let perm = await Geolocation.checkPermissions();
        if (perm.location !== 'granted') perm = await Geolocation.requestPermissions();
        if (perm.location === 'granted') {
          watchId = await Geolocation.watchPosition(
            {
              enableHighAccuracy: true,
              timeout: 10000,
            },
            (position) => {
              if (!position) return;
              entregadorLocationRef.current = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              };
            }
          );
        }
      } catch (e) {
        void e;
      }

      intervalId = window.setInterval(async () => {
        if (canceled) return;
        if (!entregadorHeartbeatOnlineRef.current) return;
        if (entregadorHeartbeatInFlightRef.current) return;

        const now = Date.now();
        if (now - entregadorLastHeartbeatRef.current < 9000) return;

        entregadorHeartbeatInFlightRef.current = true;
        try {
          const payload: Record<string, unknown> = {
            last_location_update: new Date().toISOString(),
            is_online: true,
          };

          const loc = entregadorLocationRef.current;
          if (loc) {
            payload.current_latitude = loc.lat;
            payload.current_longitude = loc.lng;
          }

          await supabase.from('entregadores').update(payload).eq('id', entregadorIdFromContext);
          entregadorLastHeartbeatRef.current = now;
        } catch (e) {
          void e;
        } finally {
          entregadorHeartbeatInFlightRef.current = false;
        }
      }, 2000);
    };

    start();

    return () => {
      canceled = true;
      if (intervalId) window.clearInterval(intervalId);
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
      if (channel) supabase.removeChannel(channel);
    };
  }, [authenticated, userRole]);

  useEffect(() => {
    if (activeMenu && isMenuRestored.current) {
      localStorage.setItem('last_active_menu', activeMenu);
    }
    if (menuParams && isMenuRestored.current) {
      localStorage.setItem('last_menu_params', JSON.stringify(menuParams));
    } else if (isMenuRestored.current) {
      localStorage.removeItem('last_menu_params');
    }
  }, [activeMenu, menuParams]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthenticated(false);
    setUserName(undefined);
    setUserRole('loading');
    setActiveMenu('pedidos');
    setAccountPending(false);
    setIsRecoveryMode(false);
    try {
      clearSupabaseAuthStorage();
      localStorage.removeItem('last_active_menu');
      localStorage.removeItem('last_menu_params');
    } catch (e) { void e; }
    window.location.href = '/';
  };

  const resolveRole = async (uid: string, emailRaw: string) => {
    setUserId(uid);
    setRoleResolveError(null);

    const setInitialMenu = (resolvedRole: string, defaultMenu: string) => {
      const persisted = localStorage.getItem('last_active_menu');
      console.log('Resolving Initial Menu. Role:', resolvedRole, 'Default:', defaultMenu, 'Persisted:', persisted);
      
      if (persisted) {
        const isValidForRole = (role: string, menu: string) => {
          if (role === 'operador' || role === 'admin') return menu !== 'operations';
          
          if (role === 'cliente') {
             
             const allowed = [
               'pedidos', 'financeiro_dashboard', 'financeiro_contas_receber', 
               'financeiro_contas_pagar', 'financeiro_emissao_notas', 
               'financeiro_emissao_recibos', 'financeiro_credito_clientes', 
               'relatorios_entregas', 'relatorios_notas_fiscais', 
               'config_comercio', 'config_customizacao', 'config_acesso', 
               'config_fiscal', 'config_integracoes_externas', 
               'config_integracoes_open_delivery', 'config_integracao_ifood', 
               'config_integracao_cardapioweb', 'config_integracao_ze_delivery', 
               'config_operacao', 'comercio_notificacoes', 'comercio_creditos', 
               'comercio_faturamento'
             ];
             return allowed.includes(menu) || menu.startsWith('mensagens');
          }
          
          if (role === 'entregador') {
             const allowed = [
               'home_entregador', 'entregas_disponiveis', 'entregas_andamento', 
               'entregas_promocoes', 'carteira_extrato', 'conta_minha_conta', 
               'conta_ranking', 'conta_historico', 'conta_notificacoes'
             ];
             return allowed.includes(menu) || menu.startsWith('mensagens');
          }
          return false;
        };

        if (persisted && isValidForRole(resolvedRole, persisted)) {
           console.log('Restoring menu:', persisted);
           setActiveMenu(persisted);
           const params = localStorage.getItem('last_menu_params');
           if (params) {
             try { setMenuParams(JSON.parse(params)); } catch (e) {}
           }
        } else {
           console.log('Falling back to default:', defaultMenu);
           setActiveMenu(defaultMenu);
        }
      } else {
        console.log('No persisted menu. Using default:', defaultMenu);
        setActiveMenu(defaultMenu);
      }
      isMenuRestored.current = true;
    };

    if (roleResolvedRef.current && resolvedUidRef.current === uid) return;
    if (roleResolveInFlightRef.current?.uid === uid) return;
    roleResolveInFlightRef.current = { uid, startedAt: Date.now() };

    try {
      const email = (emailRaw || '').trim().toLowerCase();

      const normalizeEmail = (v: unknown) => {
        const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
        return e || null;
      };

      const setRoleCache = (roleToCache: 'operador' | 'cliente' | 'entregador') => {
        try {
          localStorage.setItem('user_role_cache', JSON.stringify({ uid, role: roleToCache, ts: Date.now() }));
        } catch (e) {
          void e;
        }
      };

      const tryApplyCachedRole = () => {
        try {
          const raw = localStorage.getItem('user_role_cache');
          if (!raw) return false;
          const parsed = JSON.parse(raw) as { uid?: string; role?: string; ts?: number };
          if (!parsed || parsed.uid !== uid) return false;
          const ts = typeof parsed.ts === 'number' ? parsed.ts : 0;
          if (Date.now() - ts > 1000 * 60 * 60 * 24 * 7) return false;
          if (parsed.role === 'operador' || parsed.role === 'cliente' || parsed.role === 'entregador') {
            if (userRole === 'loading') {
              setUserRole(parsed.role);
              setInitialMenu(parsed.role, parsed.role === 'cliente' ? 'pedidos' : parsed.role === 'entregador' ? 'home_entregador' : 'pedidos');
            }
            return true;
          }
        } catch (e) {
          void e;
        }
        return false;
      };

      const withTimeout = async <T,>(p: PromiseLike<T>, timeoutMs: number): Promise<T> => {
        let timer: number | undefined;
        try {
          return await Promise.race<T>([
            Promise.resolve(p as unknown as T),
            new Promise<T>((_, reject) => {
              timer = window.setTimeout(() => reject(new Error('ROLE_RESOLVE_TIMEOUT')), timeoutMs);
            }),
          ]);
        } finally {
          if (timer) window.clearTimeout(timer);
        }
      };

      tryApplyCachedRole();

      try {
        const { data: uData } = await withTimeout(
          supabase.from('users').select('role, full_name, email, cliente_id, entregador_id').eq('id', uid).maybeSingle(),
          6000
        );
        const role = String((uData as any)?.role || '').trim();
        const userEmail = normalizeEmail((uData as any)?.email) ?? email;
        const clienteId = String((uData as any)?.cliente_id || '').trim() || null;
        const entregadorId = String((uData as any)?.entregador_id || '').trim() || null;

        if (role === 'admin' || role === 'operador') {
          setUserRole('operador');
          setInitialMenu('operador', 'pedidos');
          setRoleCache('operador');
          roleResolvedRef.current = true;
          resolvedUidRef.current = uid;
          try { localStorage.removeItem('cliente_context'); localStorage.removeItem('entregador_context'); } catch (e) { void e; }
          return;
        }

        if (role === 'cliente') {
          setUserRole('cliente');
          setInitialMenu('cliente', 'pedidos');
          setRoleCache('cliente');
          roleResolvedRef.current = true;
          resolvedUidRef.current = uid;

          void (async () => {
            try {
              if (clienteId) {
                const { data: c } = await withTimeout(
                  supabase.from('clientes').select('id, nome_completo').eq('id', clienteId).maybeSingle(),
                  5000
                );
                if ((c as any)?.id) {
                  localStorage.setItem('cliente_context', JSON.stringify({ id: String((c as any).id || ''), nome: String((c as any).nome_completo || '') }));
                  return;
                }
              }

              if (userEmail) {
                const [byEmail, byBilling] = await Promise.allSettled([
                  withTimeout(supabase.from('clientes').select('id, nome_completo').ilike('email', userEmail).maybeSingle(), 5000),
                  withTimeout(supabase.from('clientes').select('id, nome_completo').contains('faturamento_emails', [userEmail]).limit(1), 5000),
                ]);

                const c1 = byEmail.status === 'fulfilled' ? (byEmail.value as any).data : null;
                const c2 = byBilling.status === 'fulfilled' ? (byBilling.value as any).data : null;
                const row = (c1 as any)?.id
                  ? c1
                  : Array.isArray(c2) && c2.length > 0
                    ? c2[0]
                    : null;

                if (row?.id) {
                  localStorage.setItem('cliente_context', JSON.stringify({ id: String(row.id || ''), nome: String(row.nome_completo || '') }));
                }
              }
            } catch (e) {
              void e;
            }
          })();

          return;
        }

        if (role === 'entregador') {
          setUserRole('entregador');
          setInitialMenu('entregador', 'home_entregador');
          setRoleCache('entregador');
          roleResolvedRef.current = true;
          resolvedUidRef.current = uid;

          void (async () => {
            try {
              if (entregadorId) {
                const { data: eData } = await withTimeout(
                  supabase.from('entregadores').select('id, nome_completo, status').eq('id', entregadorId).maybeSingle(),
                  5000
                );
                if ((eData as any)?.id) {
                  const eStatus = (eData as any)?.status;
                  setAccountPending(eStatus !== 'ativo');
                  localStorage.setItem('entregador_context', JSON.stringify({ id: String((eData as any).id || ''), nome: String((eData as any).nome_completo || '') }));
                }
                return;
              }

              if (userEmail) {
                const { data: eData } = await withTimeout(
                  supabase.from('entregadores').select('id, nome_completo, status').ilike('email', userEmail).maybeSingle(),
                  5000
                );
                if ((eData as any)?.id) {
                  const eStatus = (eData as any)?.status;
                  setAccountPending(eStatus !== 'ativo');
                  localStorage.setItem('entregador_context', JSON.stringify({ id: String((eData as any).id || ''), nome: String((eData as any).nome_completo || '') }));
                }
              }
            } catch (e) {
              void e;
            }
          })();

          return;
        }
      } catch (e) {
        void e;
      }

      const [c2, cBilling, e2] = await Promise.allSettled([
        withTimeout(supabase.from('clientes').select('id, nome_completo').ilike('email', email).maybeSingle(), 6000),
        email ? withTimeout(supabase.from('clientes').select('id, nome_completo').contains('faturamento_emails', [email]).limit(1), 6000) : Promise.resolve(null as any),
        withTimeout(supabase.from('entregadores').select('id, nome_completo, status').ilike('email', email).maybeSingle(), 6000),
      ]);

      const clienteByEmail = c2.status === 'fulfilled' ? (c2.value as any).data : null;
      const clienteByBilling = cBilling.status === 'fulfilled' ? (cBilling.value as any).data : null;
      const entregadorByEmail = e2.status === 'fulfilled' ? (e2.value as any).data : null;

      const resolvedCliente =
        (clienteByEmail as any)?.id
          ? clienteByEmail
          : Array.isArray(clienteByBilling) && clienteByBilling.length > 0
            ? clienteByBilling[0]
            : null;

      let finalResolvedCliente = resolvedCliente as any;

      if (!finalResolvedCliente?.id) {
        try {
          const { data: resolvedId } = await withTimeout(supabase.rpc('resolve_my_cliente_id'), 6000);
          if (resolvedId) {
            const { data: byId } = await withTimeout(
              supabase.from('clientes').select('id, nome_completo').eq('id', resolvedId).maybeSingle(),
              6000
            );
            if ((byId as any)?.id) finalResolvedCliente = byId;
          }
        } catch (e) {
          void e;
        }
      }

      if (finalResolvedCliente?.id) {
        const nome = String(finalResolvedCliente?.nome_completo || userName || email);
        void (supabase as unknown as { from: (t: string) => { upsert: (v: unknown, o?: unknown) => Promise<unknown> } })
          .from('users')
          .upsert({ id: uid, full_name: nome, email, role: 'cliente', cliente_id: String(finalResolvedCliente.id) });
        setUserRole('cliente');
        setInitialMenu('cliente', 'pedidos');
        setRoleCache('cliente');
        roleResolvedRef.current = true;
        resolvedUidRef.current = uid;
        try {
          localStorage.setItem('cliente_context', JSON.stringify({ id: String(finalResolvedCliente.id || ''), nome: String(finalResolvedCliente.nome_completo || '') }));
        } catch (e) { void e; }
        return;
      }

      if ((entregadorByEmail as any)?.id) {
        const nome = String((entregadorByEmail as any)?.nome_completo || userName || email);
        const eStatus = (entregadorByEmail as any)?.status;
        setAccountPending(eStatus !== 'ativo');

        void (supabase as unknown as { from: (t: string) => { upsert: (v: unknown, o?: unknown) => Promise<unknown> } })
          .from('users')
          .upsert({ id: uid, full_name: nome, email, role: 'entregador', entregador_id: String((entregadorByEmail as any).id) });
        setUserRole('entregador');
        setInitialMenu('entregador', 'home_entregador');
        setRoleCache('entregador');
        roleResolvedRef.current = true;
        resolvedUidRef.current = uid;
        try {
          localStorage.setItem('entregador_context', JSON.stringify({ id: String((entregadorByEmail as any).id || ''), nome: String((entregadorByEmail as any).nome_completo || '') }));
        } catch (e) { void e; }
        return;
      }

      const isComercioRouteNow = typeof window !== 'undefined' && window.location.pathname === '/comercio';
      if (isComercioRouteNow) {
        setRoleResolveError('Não foi possível identificar seu perfil de Comércio. Tente novamente.');
        setUserRole('loading');
        return;
      }

      console.warn('Falha ao identificar perfil. Atribuindo papel de entregador por segurança.');
      setUserRole('entregador');
      setInitialMenu('entregador', 'carteira_extrato');
      setAccountPending(true);
      setRoleCache('entregador');
      roleResolvedRef.current = true;
      resolvedUidRef.current = uid;
      try { localStorage.removeItem('entregador_context'); } catch (e) { void e; }
    } catch (e) {
      void e;
      if (userRole === 'loading') {
        setRoleResolveError('Falha ao verificar permissões. Tente novamente.');
      }
    } finally {
      roleResolveInFlightRef.current = null;
    }
  };

  useEffect(() => {
    
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      setIsRecoveryMode(true);
    }
    
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error && isInvalidAuthSessionError(error)) {
          clearSupabaseAuthStorage();
          setAuthenticated(false);
          setUserRole('loading');
          setAccountPending(false);
          setIsRecoveryMode(false);
          return;
        }

        if (session?.user) {
          setAuthenticated(true);
          resolveRole(session.user.id, session.user.email || '');
        } else {
          setAuthenticated(false);
          setUserRole('loading');
        }
      })
      .catch((err) => {
        if (isInvalidAuthSessionError(err)) {
          clearSupabaseAuthStorage();
          setAuthenticated(false);
          setUserRole('loading');
          setAccountPending(false);
          setIsRecoveryMode(false);
          return;
        }
        setAuthenticated(false);
        setUserRole('loading');
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      } else if (event === 'SIGNED_IN' && session?.user) {
        setAuthenticated(true);
        resolveRole(session.user.id, session.user.email || '');
      } else if (event === 'SIGNED_OUT') {
        setAuthenticated(false);
        setUserName(undefined);
        setUserRole('loading');
        setAccountPending(false);
        setIsRecoveryMode(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        
        setAuthenticated(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (isRecoveryMode) {
    return <AuthPage forceResetMode={true} onResetComplete={() => setIsRecoveryMode(false)} />;
  }

  if (!authenticated) {
    return <AuthPage />;
  }

  if (userRole === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 text-slate-600">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          <p>{roleResolveError || 'Verificando permissões...'}</p>
          {roleResolveError && (
            <button
              onClick={async () => {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) resolveRole(session.user.id, session.user.email || '');
              }}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium"
            >
              Tentar novamente
            </button>
          )}
        </div>
      </div>
    );
  }

  const isComercioRoute = typeof window !== 'undefined' && window.location.pathname === '/comercio';
  
  if (isComercioRoute && userRole !== 'cliente') {
    // Se estiver logado como admin ou entregador, bloqueia
    if (userRole === 'operador' || userRole === 'entregador') {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-100 p-4 text-center">
          <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
            <h1 className="text-xl font-bold text-slate-900 mb-2">Acesso Restrito</h1>
            <p className="text-slate-600 mb-6">
              Esta área é exclusiva para Comércios. <br/>
              Você está logado como {userRole === 'entregador' ? 'Entregador' : 'Administrador'}.
            </p>
            <div className="space-y-3">
              <button 
                onClick={() => window.location.href = '/'}
                className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium"
              >
                Ir para Painel Principal
              </button>
              <button 
                onClick={handleLogout}
                className="w-full py-2 px-4 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
              >
                Sair da conta
              </button>
            </div>
          </div>
        </div>
      );
    }
    // Se não estiver logado, mostra login
    return <AuthPage />;
  }

  if (!isComercioRoute && userRole === 'cliente') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-100 p-4 text-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Acesso Restrito</h1>
          <p className="text-slate-600 mb-6">
            Esta área é exclusiva para Administradores. <br/>
            Para acessar o painel do comércio, utilize o link correto.
          </p>
          <div className="space-y-3">
            <button 
              onClick={() => window.location.href = '/comercio'}
              className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium"
            >
              Ir para Acesso Comércio
            </button>
            <button 
              onClick={handleLogout}
              className="w-full py-2 px-4 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
            >
              Sair da conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (accountPending) {
    return <AccountUnderAnalysis onBack={handleLogout} isLoginAttempt={true} />;
  }

  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-slate-100">
      <PendingWithdrawalsModal 
        isOpen={showPendingWithdrawalsModal} 
        onClose={() => setShowPendingWithdrawalsModal(false)}
        onNavigate={() => {
          setActiveMenu('financeiro_acertos_entregadores');
          setSidebarOpen(true);
          setShowPendingWithdrawalsModal(false);
        }}
      />
      <NotificationManager userId={userId || ''} userRole={userRole} onNavigate={(menu: string, params?: any) => { setActiveMenu(menu); setMenuParams(params || null); }} />
      <TopBar
        onMenuToggle={() => setSidebarOpen((v) => !v)}
        onLogout={handleLogout}
        onNavigate={(menu) => {
          setActiveMenu(menu);
          setMenuParams(null);
        }}
        userRole={userRole as 'operador' | 'cliente' | 'entregador'}
        userName={userName}
      />
      <Sidebar
        activeMenu={activeMenu}
        onMenuChange={(menu: string, params?: any) => {
          setActiveMenu(menu);
          setMenuParams(params || null);
          setSidebarOpen(true);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userRole={userRole}
        onStartTraining={() => setTrainingOpen(true)}
        trainingActive={trainingOpen}
        forceOpenGroups={trainingOpen ? {
          cadastro: activeMenu.startsWith('cadastro'),
          mensagens: activeMenu.startsWith('mensagens'),
          financeiro: activeMenu.startsWith('financeiro'),
          carteira: activeMenu.startsWith('carteira'),
          conta: activeMenu.startsWith('conta'),
        } : undefined}
        onStartSupport={() => setSupportOpen(true)}
      />
      <main className={`flex-1 overflow-hidden relative z-0 transition-all duration-200 ${sidebarOpen ? 'pl-56' : 'pl-0'}`}>
        <div className={`h-full overflow-y-auto overflow-x-hidden scrollbar-modern ${userRole === 'entregador' && activeMenu !== 'home_entregador' ? 'pb-32' : 'pb-[env(safe-area-inset-bottom)]'}`}>
          {activeMenu === 'cadastro_clientes' && <ClientesPanel initialEditId={menuParams?.editId} />}
          {activeMenu === 'cadastro_contas' && <ContasPanel />}
          {activeMenu === 'cadastro_entregadores' && <EntregadoresPanel initialEditId={menuParams?.editId} />}
          {activeMenu === 'cadastro_grupos' && <GruposPanel />}
          {activeMenu === 'cadastro_modais' && <ModaisPanel />}
          {activeMenu === 'cadastro_precificacao' && <PrecificacaoPanel />}
          {activeMenu === 'cadastro_tabela_precos' && <TabelasPrecosPanel />}
          {activeMenu === 'cadastro_tabela_comissoes' && <TabelasComissoesPanel />}
          {activeMenu === 'cadastro_preco_espera' && <PrecoEsperaPanel />}
          {activeMenu === 'cadastro_preco_dinamico_demanda' && <PrecoDinamicoDemandaPanel />}
          {activeMenu === 'cadastro_preco_dinamico_entregador' && <PrecoDinamicoEntregadorPanel />}
          {activeMenu === 'cadastro_servicos_opcionais' && <ServicosOpcionaisPanel />}
          {activeMenu === 'cadastro_promocoes' && <PromocoesPanel />}
          {activeMenu === 'mensagens_entregadores' && <MensagensEntregadoresPanel />}
          {activeMenu === 'mensagens_clientes' && <MensagensClientesPanel />}
          {activeMenu === 'mensagens_historico' && <HistoricoMensagensPanel userRole={userRole} onNavigate={setActiveMenu} />}
          {activeMenu === 'nova_criar' && <NovaEntregaPanel />}
          {activeMenu === 'pedidos' && <PedidosPanel onNavigate={(menu, params) => { setActiveMenu(menu); setMenuParams(params || null); }} userRole={userRole} userId={userId} />}
          {activeMenu === 'financeiro_dashboard' && <FinanceiroDashboard />}
          {activeMenu === 'financeiro_contas_receber' && <ContasReceberPanel />}
          {activeMenu === 'financeiro_contas_pagar' && <ContasPagarPanel />}
          {activeMenu === 'financeiro_emissao_notas' && <EmissaoNotasPanel />}
          {activeMenu === 'financeiro_emissao_recibos' && <EmissaoRecibosPanel />}
          {activeMenu === 'financeiro_credito_clientes' && <CreditoClientesPanel />}
          {activeMenu === 'financeiro_comissao_entregadores' && <ComissaoEntregadoresPanel />}
          {activeMenu === 'financeiro_acertos_entregadores' && <AcertosEntregadoresPanel />}
           {activeMenu === 'financeiro_faturamento_mensal' && <FaturamentoMensalPanel onNavigate={(menu) => setActiveMenu(menu)} />}
           {activeMenu === 'financeiro_revisao_agendamentos' && <RevisaoAgendamentosPanel />}
          {activeMenu === 'relatorios_clientes_analitico' && <ClientesAnaliticoReport />}
          {activeMenu === 'relatorios_entregadores_analitico' && <EntregadoresAnaliticoReport />}
          {activeMenu === 'relatorios_roteirizacao' && <RoteirizacaoReport />}
          {activeMenu === 'relatorios_operacao_analitico' && <OperacaoAnaliticoReport />}
          {activeMenu === 'relatorios_entregas' && <RelatorioEntregasReport onNavigate={(menu, params) => { setActiveMenu(menu); setMenuParams(params || null); }} userRole={userRole} />}
          {activeMenu === 'relatorios_notas_fiscais' && <NotasFiscaisReport />}
          {activeMenu === 'relatorios_recorrencia' && <RecorrenciaReport />}
          {activeMenu === 'relatorios_trajeto_entregadores' && <TrajetoEntregadoresReport />}
          {activeMenu === 'relatorios_entregadores_periodo' && <EntregadoresPeriodoReport />}
          {activeMenu === 'relatorios_diagnostico_entregadores' && <DiagnosticoEntregadoresReport />}
          {activeMenu === 'relatorios_log_atividades' && <LogAtividadesReport />}
          {activeMenu === 'relatorios_historico_vagas' && <HistoricoVagasReport />}
          {activeMenu === 'config_comercio' && <ConfiguracoesComercioPanel />}
          {activeMenu === 'config_customizacao' && <CustomizacaoPanel />}
          {activeMenu === 'config_acesso' && <DadosAcessoPanel />}
          {activeMenu === 'config_fiscal' && <ConfigFiscalPanel />}
          {activeMenu === 'config_integracoes_externas' && <IntegracoesExternasPanel />}
          {activeMenu === 'config_integracoes_open_delivery' && <IntegracoesOpenDeliveryPanel />}
          {activeMenu === 'config_integracao_ifood' && <IntegracaoPanel />}
          {activeMenu === 'config_integracao_cardapioweb' && <CardapioWebPanel />}
          {activeMenu === 'config_integracao_ze_delivery' && <ZeDeliveryPanel />}
          {activeMenu === 'config_operacao' && <ConfiguracoesOperacaoPanel />}
          
          {activeMenu === 'comercio_notificacoes' && <ComercioNotificacoesPanel />}
          {activeMenu === 'comercio_creditos' && <ComercioCreditosPanel />}
          {activeMenu === 'comercio_faturamento' && <ComercioFaturamentoPanel />}

          {/* Entregador specific routes */}
          {activeMenu === 'home_entregador' && <EntregadorHomePanel onNavigate={setActiveMenu} />}
          {activeMenu === 'entregas_disponiveis' && <EntregadorEntregasDisponiveisPanel />}
          {activeMenu === 'entregas_andamento' && <EntregadorPedidosEmAndamentoPanel />}
          {activeMenu === 'entregas_promocoes' && <PromocoesEntregadorPanel />}
          {activeMenu === 'carteira_extrato' && <EntregadorExtratoPanel userId={userId} />}
          {activeMenu === 'conta_minha_conta' && <EntregadorMinhaContaPanel />}
          {activeMenu === 'conta_ranking' && <EntregadorRankingPanel />}
          {activeMenu === 'conta_historico' && <EntregadorHistoricoPanel />}
          {activeMenu === 'conta_notificacoes' && <EntregadorNotificacoesPanel />}
        </div>
      </main>
      <TrainingOverlay open={trainingOpen} onClose={() => setTrainingOpen(false)} goToMenu={(m) => setActiveMenu(m)} userRole={userRole} />
      <SupportChatOverlay open={supportOpen} onClose={() => setSupportOpen(false)} userRole={userRole} />
      {userRole === 'entregador' && (
        <EntregadorBottomBar onNavigate={setActiveMenu} activeMenu={activeMenu} />
      )}
    </div>
  );
}

export default App;
