import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { OperationsDashboard } from './components/OperationsDashboard';
import { AuthPage } from './components/AuthPage';
import { AccountUnderAnalysis } from './components/AccountUnderAnalysis';
import { supabase } from './lib/supabase';
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
  const [activeMenu, setActiveMenu] = useState('operations');
  const [authenticated, setAuthenticated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [userRole, setUserRole] = useState<'operador' | 'cliente' | 'entregador' | 'loading'>('loading');
  const [menuParams, setMenuParams] = useState<any>(null);
  const roleResolvedRef = useRef(false);
  const resolvedUidRef = useRef<string | null>(null);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [accountPending, setAccountPending] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [showPendingWithdrawalsModal, setShowPendingWithdrawalsModal] = useState(false);

  useEffect(() => {
    if (userRole === 'operador') {
      setShowPendingWithdrawalsModal(true);
    }
  }, [userRole]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthenticated(false);
    setUserName(undefined);
    setUserRole('loading');
    setActiveMenu('operations');
    setAccountPending(false);
    setIsRecoveryMode(false);
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (k.startsWith('sb-') && k.includes('-auth-token')) {
          localStorage.removeItem(k);
        }
      }
    } catch (e) { void e; }
    window.location.href = '/';
  };

  const resolveRole = async (uid: string, emailRaw: string) => {
    setUserId(uid);
    if (roleResolvedRef.current && resolvedUidRef.current === uid) return;
    const email = (emailRaw || '').trim().toLowerCase();

    const { data: uData } = await supabase.from('users').select('role, full_name, email').eq('id', uid).maybeSingle();
    const role = ((uData as { role?: string } | null)?.role || '').trim();

    if (role === 'admin' || role === 'operador') {
      setUserRole('operador');
      roleResolvedRef.current = true;
      resolvedUidRef.current = uid;
      try { localStorage.removeItem('cliente_context'); localStorage.removeItem('entregador_context'); } catch (e) { void e; }
      return;
    }

    if (role === 'cliente') {
      const { data: c } = await supabase.from('clientes').select('id, nome_completo').ilike('email', email).maybeSingle();
      if ((c as { id?: string } | null)?.id) {
        setUserRole('cliente');
        setActiveMenu('pedidos');
        roleResolvedRef.current = true;
        resolvedUidRef.current = uid;
        try {
          const cid = ((c as { id?: string } | null)?.id) || '';
          const cnome = ((c as { nome_completo?: string } | null)?.nome_completo) || '';
          localStorage.setItem('cliente_context', JSON.stringify({ id: cid, nome: cnome }));
        } catch (e) { void e; }
        return;
      }
    }

    if (role === 'entregador') {
      const { data: eData } = await supabase.from('entregadores').select('id, nome_completo, status').ilike('email', email).maybeSingle();
      if ((eData as { id?: string } | null)?.id) {
        const eStatus = (eData as { status?: string } | null)?.status;
        setAccountPending(eStatus !== 'ativo');
        
        setUserRole('entregador');
        setActiveMenu('home_entregador');
        roleResolvedRef.current = true;
        resolvedUidRef.current = uid;
        try {
          const eid = ((eData as { id?: string } | null)?.id) || '';
          const enome = ((eData as { nome_completo?: string } | null)?.nome_completo) || '';
          localStorage.setItem('entregador_context', JSON.stringify({ id: eid, nome: enome }));
        } catch (e) { void e; }
        return;
      }
    }

    const { data: c2 } = await supabase.from('clientes').select('id, nome_completo').ilike('email', email).maybeSingle();
    if ((c2 as { id?: string } | null)?.id) {
      const nome = userName || email;
      await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown, o?: unknown) => Promise<unknown> } }).from('users').upsert({ id: uid, full_name: nome, email, role: 'cliente' });
      setUserRole('cliente');
      setActiveMenu('pedidos');
      roleResolvedRef.current = true;
      resolvedUidRef.current = uid;
      try {
        const cid2 = ((c2 as { id?: string } | null)?.id) || '';
        const cnome2 = ((c2 as { nome_completo?: string } | null)?.nome_completo) || '';
        localStorage.setItem('cliente_context', JSON.stringify({ id: cid2, nome: cnome2 }));
      } catch (e) { void e; }
      return;
    }

    const { data: e2 } = await supabase.from('entregadores').select('id, nome_completo, status').ilike('email', email).maybeSingle();
    if ((e2 as { id?: string } | null)?.id) {
      const nome = userName || email;
      const eStatus = (e2 as { status?: string } | null)?.status;
      setAccountPending(eStatus !== 'ativo');

      await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown, o?: unknown) => Promise<unknown> } }).from('users').upsert({ id: uid, full_name: nome, email, role: 'entregador' });
      setUserRole('entregador');
      setActiveMenu('home_entregador'); 
      roleResolvedRef.current = true;
      resolvedUidRef.current = uid;
      try {
        const eid2 = ((e2 as { id?: string } | null)?.id) || '';
        const enome2 = ((e2 as { nome_completo?: string } | null)?.nome_completo) || '';
        localStorage.setItem('entregador_context', JSON.stringify({ id: eid2, nome: enome2 }));
      } catch (e) { void e; }
      return;
    }

    console.warn('Falha ao identificar perfil. Atribuindo papel de entregador por segurança.');
    setUserRole('entregador');
    setActiveMenu('carteira_extrato');
    setAccountPending(true);
    roleResolvedRef.current = true;
    resolvedUidRef.current = uid;
    try { localStorage.removeItem('entregador_context'); } catch (e) { void e; }
  };

  useEffect(() => {
    
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      setIsRecoveryMode(true);
    }
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthenticated(true);
        resolveRole(session.user.id, session.user.email || '');
      } else {
        setAuthenticated(false);
        setUserRole('loading');
      }
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
          <p>Verificando permissões...</p>
        </div>
      </div>
    );
  }

  const isComercioRoute = typeof window !== 'undefined' && window.location.pathname === '/comercio';
  
  if (isComercioRoute && userRole !== 'cliente') {
    // Se estiver logado como admin ou entregador, bloqueia
    if (userRole === 'operador' || userRole === 'admin' || userRole === 'entregador') {
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
      <NotificationManager userId={userId || ''} userRole={userRole} onNavigate={(menu, params) => { setActiveMenu(menu); setMenuParams(params || null); }} />
      <TopBar
        onMenuToggle={() => setSidebarOpen((v) => !v)}
        onLogout={handleLogout}
        activeMenu={activeMenu}
        userRole={userRole}
        userName={userName}
      />
      <Sidebar
        activeMenu={activeMenu}
        onMenuChange={(menu, params) => {
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
          {activeMenu === 'operations' && <OperationsDashboard />}
          
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
          {activeMenu === 'financeiro_faturamento_mensal' && <FaturamentoMensalPanel />}
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