import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { OperationsDashboard } from './components/OperationsDashboard';
import { AuthPage } from './components/AuthPage';
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

function App() {
  const [activeMenu, setActiveMenu] = useState('operations');
  const [authenticated, setAuthenticated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState<string | undefined>(undefined);
  const [userRole, setUserRole] = useState<'operador' | 'cliente' | 'entregador'>('operador');
  const roleResolvedRef = useRef(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  const resolveRole = async (uid: string, emailRaw: string) => {
    if (roleResolvedRef.current) return;
    const email = (emailRaw || '').trim().toLowerCase();
    const { data: uData } = await supabase.from('users').select('role, full_name, email').eq('id', uid).maybeSingle();
    const role = ((uData as { role?: string } | null)?.role || '').trim();
    if (role === 'operador') {
      setUserRole('operador');
      roleResolvedRef.current = true;
      try { localStorage.removeItem('cliente_context'); localStorage.removeItem('entregador_context'); } catch (e) { void e; }
      return;
    }
    if (role === 'cliente') {
      const { data: c } = await supabase.from('clientes').select('id, nome_completo').ilike('email', email).maybeSingle();
      if ((c as { id?: string } | null)?.id) {
        setUserRole('cliente');
        roleResolvedRef.current = true;
      try {
        const cid = ((c as { id?: string } | null)?.id) || '';
        const cnome = ((c as { nome_completo?: string } | null)?.nome_completo) || '';
        localStorage.setItem('cliente_context', JSON.stringify({ id: cid, nome: cnome }));
      } catch (e) { void e; }
        return;
      }
    }
    if (role === 'entregador') {
      const { data: eData } = await supabase.from('entregadores').select('id, nome_completo').ilike('email', email).maybeSingle();
      if ((eData as { id?: string } | null)?.id) {
        setUserRole('entregador');
        roleResolvedRef.current = true;
        try {
          const eid = ((eData as { id?: string } | null)?.id) || '';
          const enome = ((eData as { nome_completo?: string } | null)?.nome_completo) || '';
          localStorage.setItem('entregador_context', JSON.stringify({ id: eid, nome: enome }));
        } catch (e) { void e; }
        return;
      }
    }
    const { data: admin } = await supabase.from('contas_gerenciais').select('id').ilike('email_acesso', email).maybeSingle();
    if ((admin as { id?: string } | null)?.id) {
      const nome = userName || email;
      await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown, o?: unknown) => Promise<unknown> } }).from('users').upsert({ id: uid, full_name: nome, email, role: 'operador' });
      setUserRole('operador');
      roleResolvedRef.current = true;
      try { localStorage.removeItem('cliente_context'); localStorage.removeItem('entregador_context'); } catch (e) { void e; }
      return;
    }
    const { data: c2 } = await supabase.from('clientes').select('id, nome_completo').ilike('email', email).maybeSingle();
    if ((c2 as { id?: string } | null)?.id) {
      const nome = userName || email;
      await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown, o?: unknown) => Promise<unknown> } }).from('users').upsert({ id: uid, full_name: nome, email, role: 'cliente' });
      setUserRole('cliente');
      roleResolvedRef.current = true;
      try {
        const cid2 = ((c2 as { id?: string } | null)?.id) || '';
        const cnome2 = ((c2 as { nome_completo?: string } | null)?.nome_completo) || '';
        localStorage.setItem('cliente_context', JSON.stringify({ id: cid2, nome: cnome2 }));
      } catch (e) { void e; }
      return;
    }
    const { data: e2 } = await supabase.from('entregadores').select('id, nome_completo').ilike('email', email).maybeSingle();
    if ((e2 as { id?: string } | null)?.id) {
      const nome = userName || email;
      await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown, o?: unknown) => Promise<unknown> } }).from('users').upsert({ id: uid, full_name: nome, email, role: 'entregador' });
      setUserRole('entregador');
      roleResolvedRef.current = true;
      try {
        const eid2 = ((e2 as { id?: string } | null)?.id) || '';
        const enome2 = ((e2 as { nome_completo?: string } | null)?.nome_completo) || '';
        localStorage.setItem('entregador_context', JSON.stringify({ id: eid2, nome: enome2 }));
      } catch (e) { void e; }
      return;
    }
    const nomeFallback = userName || email;
    const up = await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown, o?: { onConflict?: string }) => { select: (s: string) => { maybeSingle: () => Promise<{ data: unknown }> } } } }).from('entregadores').upsert({ nome_completo: nomeFallback, email, status: 'ativo' }, { onConflict: 'email' }).select('id, nome_completo').maybeSingle();
    const created = (up.data || null) as { id?: string; nome_completo?: string } | null;
    if (created?.id) {
      await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown, o?: unknown) => Promise<unknown> } }).from('users').upsert({ id: uid, full_name: nomeFallback, email, role: 'entregador' });
      setUserRole('entregador');
      roleResolvedRef.current = true;
      try { localStorage.setItem('entregador_context', JSON.stringify({ id: created.id, nome: created.nome_completo || '' })); } catch (e) { void e; }
    } else {
      setUserRole('operador');
      roleResolvedRef.current = true;
      try { localStorage.removeItem('cliente_context'); localStorage.removeItem('entregador_context'); } catch (e) { void e; }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session));
      const uid = data.session?.user?.id;
      if (uid) {
        supabase
          .from('users')
          .select('full_name')
          .eq('id', uid)
          .single()
          .then(({ data }) => {
            setUserName((data as { full_name: string | null } | null)?.full_name || undefined);
          });
        const email = (data.session?.user?.email || '').trim().toLowerCase();
        if (email) resolveRole(uid, email);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session));
      const uid = session?.user?.id;
      if (uid) {
        supabase
          .from('users')
          .select('full_name')
          .eq('id', uid)
          .single()
          .then(({ data }) => {
            setUserName((data as { full_name: string | null } | null)?.full_name || undefined);
          });
        const email = (session?.user?.email || '').trim().toLowerCase();
        if (email) resolveRole(uid, email);
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!authenticated) {
    return <AuthPage />;
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      <TopBar
        onMenuToggle={() => setSidebarOpen((v) => !v)}
        onLogout={async () => {
          await supabase.auth.signOut();
          setAuthenticated(false);
          setUserName(undefined);
          setUserRole('operador');
          setActiveMenu('operations');
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i) || '';
              if (k.startsWith('sb-') && k.includes('-auth-token')) {
                localStorage.removeItem(k);
              }
            }
          } catch (e) { void e; }
          window.location.href = '/';
        }}
        activeMenu={activeMenu}
        userRole={userRole}
        userName={userName}
      />
      <Sidebar
        activeMenu={activeMenu}
        onMenuChange={(menu) => {
          setActiveMenu(menu);
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
          
        } : undefined}
        onStartSupport={() => setSupportOpen(true)}
      />
      <main className={`flex-1 transition-all duration-200 ${sidebarOpen ? 'pl-56' : 'pl-0'}`}>
        <div className="h-[calc(100vh-56px)] overflow-y-auto overflow-x-hidden scrollbar-modern">
          {activeMenu === 'operations' && <OperationsDashboard />}
          {}
          {activeMenu === 'cadastro_clientes' && <ClientesPanel />}
          {activeMenu === 'cadastro_contas' && <ContasPanel />}
          {activeMenu === 'cadastro_entregadores' && <EntregadoresPanel />}
          {activeMenu === 'cadastro_grupos' && <GruposPanel />}
          {activeMenu === 'cadastro_modais' && <ModaisPanel />}
          {activeMenu === 'cadastro_precificacao' && <PrecificacaoPanel />}
          {activeMenu === 'cadastro_tabela_precos' && <TabelasPrecosPanel />}
          {activeMenu === 'cadastro_tabela_comissoes' && <TabelasComissoesPanel />}
          {activeMenu === 'cadastro_preco_espera' && <PrecoEsperaPanel />}
          {activeMenu === 'cadastro_preco_dinamico_demanda' && <PrecoDinamicoDemandaPanel />}
          {activeMenu === 'cadastro_preco_dinamico_entregador' && <PrecoDinamicoEntregadorPanel />}
          {activeMenu === 'cadastro_servicos_opcionais' && <ServicosOpcionaisPanel />}
          {activeMenu === 'mensagens_entregadores' && <MensagensEntregadoresPanel />}
          {activeMenu === 'mensagens_clientes' && <MensagensClientesPanel />}
          {activeMenu === 'mensagens_historico' && <HistoricoMensagensPanel />}
          {activeMenu === 'nova_criar' && <NovaEntregaPanel />}
          {activeMenu === 'pedidos' && <PedidosPanel />}
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
          {activeMenu === 'relatorios_entregas' && <RelatorioEntregasReport />}
          {activeMenu === 'relatorios_notas_fiscais' && <NotasFiscaisReport />}
          {activeMenu === 'relatorios_recorrencia' && <RecorrenciaReport />}
          {activeMenu === 'relatorios_trajeto_entregadores' && <TrajetoEntregadoresReport />}
          {activeMenu === 'relatorios_entregadores_periodo' && <EntregadoresPeriodoReport />}
          {activeMenu === 'relatorios_diagnostico_entregadores' && <DiagnosticoEntregadoresReport />}
          {activeMenu === 'relatorios_log_atividades' && <LogAtividadesReport />}
          {activeMenu === 'relatorios_historico_vagas' && <HistoricoVagasReport />}
        </div>
      </main>
      <TrainingOverlay open={trainingOpen} onClose={() => setTrainingOpen(false)} goToMenu={(m) => setActiveMenu(m)} />
      <SupportChatOverlay open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}

export default App;
