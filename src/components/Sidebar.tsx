import { Map, Users, Wallet, Truck, Layers, MessageSquare, PlusSquare, FileText, LifeBuoy, PlayCircle, BarChart3, Settings, LayoutDashboard, Bell, Trophy, History, MapPin, Home } from 'lucide-react';
import { useEffect, useState } from 'react';
import { APP_VERSION } from '../config';

interface SidebarProps {
  activeMenu: string;
  onMenuChange: (menu: string) => void;
  isOpen: boolean;
  onClose: () => void;
  userRole: 'operador' | 'cliente' | 'entregador';
  onStartTraining?: () => void;
  trainingActive?: boolean;
  forceOpenGroups?: { 
    cadastro?: boolean; 
    mensagens?: boolean; 
    financeiro?: boolean; 
    configuracoes?: boolean;
    entregas?: boolean;
    carteira?: boolean;
    conta?: boolean;
  };
  onStartSupport?: () => void;
}

export function Sidebar({ activeMenu, onMenuChange, isOpen, onClose, userRole, onStartTraining, trainingActive, forceOpenGroups, onStartSupport }: SidebarProps) {
  const menuItems = [
    { id: 'home_entregador', label: 'Home', icon: Home },
    { id: 'operations', label: 'Menu de Operações', icon: Map },
    { id: 'pedidos', label: 'Pedidos', icon: FileText },
    { id: 'cadastro', label: 'Cadastro', icon: Layers },
    { id: 'entregas', label: 'Entregas', icon: Truck },
    { id: 'mensagens', label: 'Mensagens', icon: MessageSquare },
    { id: 'financeiro', label: 'Financeiro', icon: Wallet },
    { id: 'nova', label: 'Nova entrega', icon: PlusSquare },
    { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
    { id: 'configuracoes', label: 'Configurações', icon: Settings },
    { id: 'carteira', label: 'Carteira', icon: Wallet },
    { id: 'conta', label: 'Conta', icon: Users },
    { id: 'comercio_creditos', label: 'Créditos', icon: Wallet },
    { id: 'comercio_faturamento', label: 'Faturamento', icon: FileText },
  ];

  const cadastroItems = [
    { id: 'cadastro_clientes', label: 'Comericio', icon: Users },
    { id: 'cadastro_contas', label: 'Contas gerenciais', icon: Wallet },
    { id: 'cadastro_entregadores', label: 'Entregadores', icon: Truck },
    { id: 'cadastro_grupos', label: 'Grupos operacionais', icon: Layers },
    { id: 'cadastro_modais', label: 'Modais', icon: Truck },
    { id: 'cadastro_precificacao', label: 'Precificação padrão', icon: Wallet },
    { id: 'cadastro_tabela_precos', label: 'Tabela de preço por KM', icon: Wallet },
    { id: 'cadastro_tabela_comissoes', label: 'Tabela de comissões', icon: Wallet },
    { id: 'cadastro_preco_espera', label: 'Preço por espera', icon: Wallet },
    { id: 'cadastro_preco_dinamico_demanda', label: 'Preço dinâmico (demanda)', icon: Wallet },
    { id: 'cadastro_preco_dinamico_entregador', label: 'Preço dinâmico entregador', icon: Wallet },
    { id: 'cadastro_servicos_opcionais', label: 'Serviços opcionais', icon: Layers },
  ];

  const configuracoesItems = [
    { id: 'config_comercio', label: 'Configurações de Comercio', icon: Layers },
    { id: 'config_customizacao', label: 'Customização', icon: Layers },
    { id: 'config_acesso', label: 'Dados de acesso', icon: Users },
    { id: 'config_fiscal', label: 'Configurações fiscais', icon: FileText },
    { id: 'config_integracoes_externas', label: 'Integrações externas', icon: Layers },
    { id: 'config_integracoes_open_delivery', label: 'Integrações Open Delivery', icon: Layers },
    { id: 'config_integracao_ifood', label: 'Integração iFood', icon: Layers },
    { id: 'config_operacao', label: 'Configurações de operação', icon: Settings },
  ];

  const mensagensItems = [
    { id: 'mensagens_entregadores', label: 'Entregadores', icon: MessageSquare },
    { id: 'mensagens_clientes', label: 'Comércio', icon: MessageSquare },
    { id: 'mensagens_historico', label: 'Histórico', icon: MessageSquare },
  ];

  const financeiroItems = [
    { id: 'financeiro_dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'financeiro_contas_receber', label: 'Contas a receber', icon: Wallet },
    { id: 'financeiro_contas_pagar', label: 'Contas a pagar', icon: Wallet },
    { id: 'financeiro_emissao_notas', label: 'Emissão de notas', icon: Wallet },
    { id: 'financeiro_emissao_recibos', label: 'Emissão de recibos', icon: Wallet },
    { id: 'financeiro_credito_clientes', label: 'Créditos de clientes', icon: Wallet },
    { id: 'financeiro_comissao_entregadores', label: 'Comissão de entregadores', icon: Wallet },
    { id: 'financeiro_acertos_entregadores', label: 'Acertos de entregadores', icon: Wallet },
    { id: 'financeiro_faturamento_mensal', label: 'Faturamento mensal', icon: Wallet },
    { id: 'financeiro_revisao_agendamentos', label: 'Revisão de agendamentos', icon: Wallet },
  ];

  const relatoriosItems = [
    { id: 'relatorios_clientes_analitico', label: 'Analítico de clientes', icon: BarChart3 },
    { id: 'relatorios_entregadores_analitico', label: 'Analítico de entregadores', icon: BarChart3 },
    { id: 'relatorios_roteirizacao', label: 'Roteirização de entregas', icon: BarChart3 },
    { id: 'relatorios_operacao_analitico', label: 'Analítico da operação', icon: BarChart3 },
    { id: 'relatorios_entregas', label: 'Relatório de entregas', icon: BarChart3 },
    { id: 'relatorios_notas_fiscais', label: 'Notas fiscais emitidas', icon: BarChart3 },
    { id: 'relatorios_recorrencia', label: 'Recorrência de entregas', icon: BarChart3 },
    { id: 'relatorios_trajeto_entregadores', label: 'Trajeto dos entregadores', icon: BarChart3 },
    { id: 'relatorios_entregadores_periodo', label: 'Entregadores por período', icon: BarChart3 },
    { id: 'relatorios_diagnostico_entregadores', label: 'Diagnóstico de entregadores', icon: BarChart3 },
    { id: 'relatorios_log_atividades', label: 'Alteração de status (Log)', icon: BarChart3 },
    { id: 'relatorios_historico_vagas', label: 'Histórico de vagas', icon: BarChart3 },
  ];

  const entregasItems = [
    { id: 'entregas_disponiveis', label: 'Disponíveis', icon: MapPin },
    { id: 'entregas_andamento', label: 'Em andamento', icon: Truck },
  ];

  const carteiraItems = [
    { id: 'carteira_extrato', label: 'Extrato', icon: FileText },
  ];

  const contaItems = [
    { id: 'conta_minha_conta', label: 'Minha conta', icon: Users },
    { id: 'conta_ranking', label: 'Ranking', icon: Trophy },
    { id: 'conta_historico', label: 'Histórico', icon: History },
    { id: 'conta_notificacoes', label: 'Notificações', icon: Bell },
  ];

  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [mensagensOpen, setMensagensOpen] = useState(false);
  const [financeiroOpen, setFinanceiroOpen] = useState(false);
  const [relatoriosOpen, setRelatoriosOpen] = useState(false);
  const [configuracoesOpen, setConfiguracoesOpen] = useState(false);
  const [entregasOpen, setEntregasOpen] = useState(false);
  const [carteiraOpen, setCarteiraOpen] = useState(false);
  const [contaOpen, setContaOpen] = useState(false);

  useEffect(() => {
    if (forceOpenGroups) {
      if (typeof forceOpenGroups.cadastro !== 'undefined') setCadastroOpen(!!forceOpenGroups.cadastro);
      if (typeof forceOpenGroups.mensagens !== 'undefined') setMensagensOpen(!!forceOpenGroups.mensagens);
      if (typeof forceOpenGroups.financeiro !== 'undefined') setFinanceiroOpen(!!forceOpenGroups.financeiro);
      if (typeof forceOpenGroups.configuracoes !== 'undefined') setConfiguracoesOpen(!!forceOpenGroups.configuracoes);
      if (typeof forceOpenGroups.entregas !== 'undefined') setEntregasOpen(!!forceOpenGroups.entregas);
      if (typeof forceOpenGroups.carteira !== 'undefined') setCarteiraOpen(!!forceOpenGroups.carteira);
      if (typeof forceOpenGroups.conta !== 'undefined') setContaOpen(!!forceOpenGroups.conta);
    }
  }, [forceOpenGroups]);

  const visibleMenuItems = ((): { id: string; label: string; icon: any }[] => {
    if (userRole === 'cliente') return menuItems.filter((m) => ['mensagens', 'pedidos', 'comercio_creditos', 'comercio_faturamento'].includes(m.id));
    if (userRole === 'entregador') return menuItems.filter((m) => ['home_entregador', 'entregas', 'mensagens', 'carteira', 'conta'].includes(m.id));

    return menuItems.filter((m) => !['home_entregador', 'entregas', 'carteira', 'conta', 'comercio_creditos', 'comercio_faturamento'].includes(m.id));
  })();

  const handleMenuClick = (id: string) => {

    const closeAll = () => {
        setCadastroOpen(false);
        setMensagensOpen(false);
        setFinanceiroOpen(false);
        setRelatoriosOpen(false);
        setConfiguracoesOpen(false);
        setEntregasOpen(false);
        setCarteiraOpen(false);
        setContaOpen(false);
    };

    if (id === 'cadastro') { setCadastroOpen((v) => !v); setMensagensOpen(false); setFinanceiroOpen(false); setRelatoriosOpen(false); setConfiguracoesOpen(false); setEntregasOpen(false); setCarteiraOpen(false); setContaOpen(false); return; }
    if (id === 'mensagens') { setMensagensOpen((v) => !v); setCadastroOpen(false); setFinanceiroOpen(false); setRelatoriosOpen(false); setConfiguracoesOpen(false); setEntregasOpen(false); setCarteiraOpen(false); setContaOpen(false); return; }
    if (id === 'financeiro') { setFinanceiroOpen(true); setCadastroOpen(false); setMensagensOpen(false); setRelatoriosOpen(false); setConfiguracoesOpen(false); setEntregasOpen(false); setCarteiraOpen(false); setContaOpen(false); onMenuChange('financeiro_dashboard'); return; }
    if (id === 'relatorios') { setRelatoriosOpen((v) => !v); setCadastroOpen(false); setMensagensOpen(false); setFinanceiroOpen(false); setConfiguracoesOpen(false); setEntregasOpen(false); setCarteiraOpen(false); setContaOpen(false); return; }
    if (id === 'configuracoes') { setConfiguracoesOpen((v) => !v); setCadastroOpen(false); setMensagensOpen(false); setFinanceiroOpen(false); setRelatoriosOpen(false); setEntregasOpen(false); setCarteiraOpen(false); setContaOpen(false); return; }
    if (id === 'entregas') { setEntregasOpen((v) => !v); setCadastroOpen(false); setMensagensOpen(false); setFinanceiroOpen(false); setRelatoriosOpen(false); setConfiguracoesOpen(false); setCarteiraOpen(false); setContaOpen(false); return; }
    if (id === 'carteira') { setCarteiraOpen((v) => !v); setCadastroOpen(false); setMensagensOpen(false); setFinanceiroOpen(false); setRelatoriosOpen(false); setConfiguracoesOpen(false); setEntregasOpen(false); setContaOpen(false); return; }
    if (id === 'conta') { setContaOpen((v) => !v); setCadastroOpen(false); setMensagensOpen(false); setFinanceiroOpen(false); setRelatoriosOpen(false); setConfiguracoesOpen(false); setEntregasOpen(false); setCarteiraOpen(false); return; }
    
    if (id === 'nova') { closeAll(); onMenuChange('nova_criar'); return; }
    
    closeAll();
    onMenuChange(id);
  };

  const renderSubMenu = (items: typeof cadastroItems, parentId: string) => {
    return (
      <ul className="mt-1 space-y-1">
        {items.map((sub) => {
          const SubIcon = sub.icon;
          const active = activeMenu === sub.id;
          return (
            <li key={sub.id}>
              <button
                data-menu-id={sub.id}
                onClick={() => onMenuChange(sub.id)}
                className={`w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg transition-all text-xs ml-2 pl-3 border-l border-slate-800 ${
                  active ? 'bg-sky-600/80 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <SubIcon size={16} />
                <span className="flex-1 truncate text-left">{sub.label}</span>
                {trainingActive && active && (
                  <span className="ml-auto w-0 h-0 border-y-5 border-y-transparent border-l-5 border-l-white" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <aside
      className={`fixed top-0 left-0 h-[100dvh] w-56 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-slate-900 text-white flex flex-col border-r border-slate-800 transition-transform duration-200 z-[60] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between">
        <div className="font-semibold">Menu</div>
        <button onClick={onClose} className="p-2 rounded hover:bg-slate-800" aria-label="Fechar menu">
          <span className="block w-4 h-0.5 bg-white rotate-45 translate-y-0.5" />
          <span className="block w-4 h-0.5 bg-white -rotate-45 -translate-y-0.5" />
        </button>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto overflow-x-hidden scrollbar-modern">
        <ul className="space-y-2">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === 'cadastro'
              ? cadastroOpen || activeMenu.startsWith('cadastro')
              : item.id === 'mensagens'
                ? mensagensOpen || activeMenu.startsWith('mensagens')
              : item.id === 'financeiro'
                  ? financeiroOpen || activeMenu.startsWith('financeiro')
                : item.id === 'relatorios'
                  ? relatoriosOpen || activeMenu.startsWith('relatorios')
                : item.id === 'configuracoes'
                  ? configuracoesOpen || activeMenu.startsWith('config')
                : item.id === 'carteira'
                  ? carteiraOpen || activeMenu.startsWith('carteira')
                : item.id === 'conta'
                  ? contaOpen || activeMenu.startsWith('conta')
                : item.id === 'nova'
                  ? activeMenu.startsWith('nova')
                : activeMenu === item.id;

            return (
              <li key={item.id}>
                <button
                  data-menu-id={item.id}
                  onClick={() => handleMenuClick(item.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${
                    isActive
                      ? 'bg-sky-500 text-white shadow-lg'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                  {trainingActive && isActive && (
                    <span className="ml-auto w-0 h-0 border-y-6 border-y-transparent border-l-6 border-l-white" />
                  )}
                </button>

                {item.id === 'cadastro' && cadastroOpen && renderSubMenu(cadastroItems, 'cadastro')}
                
                {item.id === 'mensagens' && mensagensOpen && (
                  <ul className="mt-1 space-y-1">
                    {(userRole === 'cliente'
                      ? mensagensItems.filter((s) => ['mensagens_entregadores', 'mensagens_historico'].includes(s.id))
                      : userRole === 'entregador'
                        ? mensagensItems.filter((s) => ['mensagens_clientes', 'mensagens_historico'].includes(s.id))
                        : mensagensItems
                    ).map((sub) => {
                      const SubIcon = sub.icon;
                      const active = activeMenu === sub.id;
                      return (
                        <li key={sub.id}>
                          <button
                            data-menu-id={sub.id}
                            onClick={() => onMenuChange(sub.id)}
                            className={`w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg transition-all text-xs ml-2 pl-3 border-l border-slate-800 ${
                              active ? 'bg-sky-600/80 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            <SubIcon size={16} />
                            <span className="flex-1 truncate text-left">{sub.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {item.id === 'financeiro' && financeiroOpen && renderSubMenu(financeiroItems, 'financeiro')}
                {item.id === 'relatorios' && relatoriosOpen && renderSubMenu(relatoriosItems, 'relatorios')}
                {item.id === 'configuracoes' && configuracoesOpen && renderSubMenu(configuracoesItems, 'configuracoes')}
                {item.id === 'entregas' && entregasOpen && renderSubMenu(entregasItems, 'entregas')}
                {item.id === 'carteira' && carteiraOpen && renderSubMenu(carteiraItems, 'carteira')}
                {item.id === 'conta' && contaOpen && renderSubMenu(contaItems, 'conta')}
                
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto p-4 border-t border-slate-800">
        <div className="text-xs text-slate-300 mb-2">Ajuda</div>
        <div className="grid grid-cols-1 gap-2">
          <button
            onClick={() => { if (onStartSupport) onStartSupport(); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-white"
          >
            <LifeBuoy size={16} />
            <span>Suporte</span>
          </button>
          <button
            onClick={() => {
              if (onStartTraining) onStartTraining();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-white"
          >
            <PlayCircle size={16} />
            <span>Treinamento</span>
          </button>
        </div>
      </div>
      <div className="p-4 border-t border-slate-800">
        <div className="text-slate-400 text-xs text-center">v{APP_VERSION}</div>
      </div>
    </aside>
  );
}
