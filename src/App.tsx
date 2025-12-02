import { useEffect, useState } from 'react';
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
import { PrecificacaoPanel } from './components/cadastro/PrecificacaoPanel';
import { PrecoEsperaPanel } from './components/cadastro/PrecoEsperaPanel';
import { PrecoDinamicoDemandaPanel } from './components/cadastro/PrecoDinamicoDemandaPanel';
import { PrecoDinamicoEntregadorPanel } from './components/cadastro/PrecoDinamicoEntregadorPanel';
import { ServicosOpcionaisPanel } from './components/cadastro/ServicosOpcionaisPanel';
import { MensagensEntregadoresPanel } from './components/mensagens/MensagensEntregadoresPanel';
import { MensagensClientesPanel } from './components/mensagens/MensagensClientesPanel';
import { HistoricoMensagensPanel } from './components/mensagens/HistoricoMensagensPanel';
import { NovaEntregaPanel } from './components/nova/NovaEntregaPanel';
import { ContasReceberPanel } from './components/financeiro/ContasReceberPanel';
import { ContasPagarPanel } from './components/financeiro/ContasPagarPanel';
import { EmissaoNotasPanel } from './components/financeiro/EmissaoNotasPanel';
import { EmissaoRecibosPanel } from './components/financeiro/EmissaoRecibosPanel';
import { CreditoClientesPanel } from './components/financeiro/CreditoClientesPanel';
import { ComissaoEntregadoresPanel } from './components/financeiro/ComissaoEntregadoresPanel';
import { AcertosEntregadoresPanel } from './components/financeiro/AcertosEntregadoresPanel';
import { FaturamentoMensalPanel } from './components/financeiro/FaturamentoMensalPanel';
import { RevisaoAgendamentosPanel } from './components/financeiro/RevisaoAgendamentosPanel';

function App() {
  const [activeMenu, setActiveMenu] = useState('operations');
  const [authenticated, setAuthenticated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState<string | undefined>(undefined);
  const [userRole, setUserRole] = useState<'operador' | 'cliente' | 'entregador'>('operador');

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
      />
      <main className={`flex-1 transition-all duration-200 ${sidebarOpen ? 'pl-56' : 'pl-0'}`}>
        <div className="h-[calc(100vh-56px)] overflow-y-auto overflow-x-hidden scrollbar-modern">
          {activeMenu === 'operations' && <OperationsDashboard />}
          {/* Removido painel ao clicar em cadastro; apenas submenus visíveis */}
          {activeMenu === 'cadastro_clientes' && <ClientesPanel />}
          {activeMenu === 'cadastro_contas' && <ContasPanel />}
          {activeMenu === 'cadastro_entregadores' && <EntregadoresPanel />}
          {activeMenu === 'cadastro_grupos' && <GruposPanel />}
          {activeMenu === 'cadastro_modais' && <ModaisPanel />}
          {activeMenu === 'cadastro_precificacao' && <PrecificacaoPanel />}
          {activeMenu === 'cadastro_preco_espera' && <PrecoEsperaPanel />}
          {activeMenu === 'cadastro_preco_dinamico_demanda' && <PrecoDinamicoDemandaPanel />}
          {activeMenu === 'cadastro_preco_dinamico_entregador' && <PrecoDinamicoEntregadorPanel />}
          {activeMenu === 'cadastro_servicos_opcionais' && <ServicosOpcionaisPanel />}
          {activeMenu === 'mensagens_entregadores' && <MensagensEntregadoresPanel />}
          {activeMenu === 'mensagens_clientes' && <MensagensClientesPanel />}
          {activeMenu === 'mensagens_historico' && <HistoricoMensagensPanel />}
          {activeMenu === 'nova_criar' && <NovaEntregaPanel />}
          {activeMenu === 'financeiro_contas_receber' && <ContasReceberPanel />}
          {activeMenu === 'financeiro_contas_pagar' && <ContasPagarPanel />}
          {activeMenu === 'financeiro_emissao_notas' && <EmissaoNotasPanel />}
          {activeMenu === 'financeiro_emissao_recibos' && <EmissaoRecibosPanel />}
          {activeMenu === 'financeiro_credito_clientes' && <CreditoClientesPanel />}
          {activeMenu === 'financeiro_comissao_entregadores' && <ComissaoEntregadoresPanel />}
          {activeMenu === 'financeiro_acertos_entregadores' && <AcertosEntregadoresPanel />}
          {activeMenu === 'financeiro_faturamento_mensal' && <FaturamentoMensalPanel />}
          {activeMenu === 'financeiro_revisao_agendamentos' && <RevisaoAgendamentosPanel />}
        </div>
      </main>
    </div>
  );
}

export default App;
