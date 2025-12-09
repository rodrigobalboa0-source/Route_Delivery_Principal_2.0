import { Map, Users, Wallet, Truck, Layers, MessageSquare, PlusSquare, FileText, LifeBuoy, PlayCircle, BarChart3 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SidebarProps {
  activeMenu: string;
  onMenuChange: (menu: string) => void;
  isOpen: boolean;
  onClose: () => void;
  userRole: 'operador' | 'cliente' | 'entregador';
  onStartTraining?: () => void;
  trainingActive?: boolean;
  forceOpenGroups?: { cadastro?: boolean; mensagens?: boolean; financeiro?: boolean };
  onStartSupport?: () => void;
}

export function Sidebar({ activeMenu, onMenuChange, isOpen, onClose, userRole, onStartTraining, trainingActive, forceOpenGroups, onStartSupport }: SidebarProps) {
  const menuItems = [
    { id: 'operations', label: 'Menu de Operações', icon: Map },
    { id: 'pedidos', label: 'Pedidos', icon: FileText },
    { id: 'cadastro', label: 'Cadastro', icon: Layers },
    { id: 'mensagens', label: 'Mensagens', icon: MessageSquare },
    { id: 'financeiro', label: 'Financeiro', icon: Wallet },
    { id: 'nova', label: 'Nova entrega', icon: PlusSquare },
    { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
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
  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [mensagensOpen, setMensagensOpen] = useState(false);
  const [financeiroOpen, setFinanceiroOpen] = useState(false);
  const [relatoriosOpen, setRelatoriosOpen] = useState(false);
  useEffect(() => {
    if (forceOpenGroups) {
      if (typeof forceOpenGroups.cadastro !== 'undefined') setCadastroOpen(!!forceOpenGroups.cadastro);
      if (typeof forceOpenGroups.mensagens !== 'undefined') setMensagensOpen(!!forceOpenGroups.mensagens);
      if (typeof forceOpenGroups.financeiro !== 'undefined') setFinanceiroOpen(!!forceOpenGroups.financeiro);
    }
  }, [forceOpenGroups]);
  const visibleMenuItems = ((): { id: string; label: string; icon: any }[] => {
    if (userRole === 'cliente') return menuItems.filter((m) => ['operations', 'mensagens', 'pedidos'].includes(m.id));
    if (userRole === 'entregador') return menuItems.filter((m) => ['mensagens'].includes(m.id));
    return menuItems;
  })();
  const mensagensItems = [
    { id: 'mensagens_entregadores', label: 'Entregadores', icon: MessageSquare },
    { id: 'mensagens_clientes', label: 'Clientes', icon: MessageSquare },
    { id: 'mensagens_historico', label: 'Histórico', icon: MessageSquare },
  ];
  const financeiroItems = [
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
  

  return (
    <aside
      className={`fixed top-0 left-0 h-screen w-56 bg-slate-900 text-white flex flex-col border-r border-slate-800 transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
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
                : item.id === 'nova'
                  ? activeMenu.startsWith('nova')
                : activeMenu === item.id;

            return (
              <li key={item.id}>
                <button
                  data-menu-id={item.id}
                  onClick={() => {
                    if (item.id === 'cadastro') { setCadastroOpen((v) => !v); setMensagensOpen(false); setFinanceiroOpen(false); setRelatoriosOpen(false); return; }
                    if (item.id === 'mensagens') { setMensagensOpen((v) => !v); setCadastroOpen(false); setFinanceiroOpen(false); setRelatoriosOpen(false); return; }
                    if (item.id === 'financeiro') { setFinanceiroOpen((v) => !v); setCadastroOpen(false); setMensagensOpen(false); setRelatoriosOpen(false); return; }
                    if (item.id === 'relatorios') { setRelatoriosOpen((v) => !v); setCadastroOpen(false); setMensagensOpen(false); setFinanceiroOpen(false); return; }
                    if (item.id === 'nova') { setCadastroOpen(false); setMensagensOpen(false); setFinanceiroOpen(false); onMenuChange('nova_criar'); return; }
                    setCadastroOpen(false);
                    setMensagensOpen(false);
                    setFinanceiroOpen(false);
                    setRelatoriosOpen(false);
                    onMenuChange(item.id);
                  }}
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

                {item.id === 'cadastro' && cadastroOpen && (
                  <ul className="mt-1 space-y-1">
                    {cadastroItems.map((sub) => {
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
                )}

                {item.id === 'mensagens' && mensagensOpen && (
                  <ul className="mt-1 space-y-1">
                    {(userRole === 'cliente'
                      ? mensagensItems.filter((s) => ['mensagens_clientes', 'mensagens_historico'].includes(s.id))
                      : userRole === 'entregador'
                        ? mensagensItems.filter((s) => ['mensagens_entregadores', 'mensagens_historico'].includes(s.id))
                        : mensagensItems).map((sub) => {
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

                {item.id === 'financeiro' && financeiroOpen && (
                  <ul className="mt-1 space-y-1">
                    {financeiroItems.map((sub) => {
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

                {item.id === 'relatorios' && relatoriosOpen && (
                  <ul className="mt-1 space-y-1">
                    {relatoriosItems.map((sub) => {
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
        <div className="text-slate-400 text-xs text-center">v1.9.9</div>
      </div>
    </aside>
  );
}
