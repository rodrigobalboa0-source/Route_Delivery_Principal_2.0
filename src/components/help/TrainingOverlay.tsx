import { useEffect, useState, useRef } from 'react';

interface TrainingOverlayProps {
  open: boolean;
  onClose: () => void;
  goToMenu: (menu: string) => void;
  userRole: 'operador' | 'cliente' | 'entregador' | 'loading';
}

export function TrainingOverlay({ open, onClose, goToMenu, userRole }: TrainingOverlayProps) {
  type Step = { id: string; title: string; desc: string; menu: string; submenu?: string; preview?: string[]; anchorId?: string };
  const allSteps: Step[] = [
    
    { id: 'pedidos', title: 'Pedidos • Acompanhamento', desc: 'Acompanhe pedidos e entregadores com filtros e mapa. Selecione um pedido e um entregador para ver a rota e o status.', menu: 'Pedidos', preview: ['Filtrar por status, origem, cliente e período', 'Selecionar pedido e entregador', 'Acompanhar rota e destino no mapa'] },
    { id: 'cadastro_clientes', title: 'Cadastro • Comércio', desc: 'Cadastre e edite informações do comércio e endereços.', menu: 'Cadastro', submenu: 'Comércio', preview: ['Cadastrar comércio', 'Editar dados', 'Gerenciar endereços'] },
    { id: 'cadastro_entregadores', title: 'Cadastro • Entregadores', desc: 'Inclua e edite entregadores para operações.', menu: 'Cadastro', submenu: 'Entregadores', preview: ['Cadastrar entregador', 'Editar perfil', 'Ativar/Inativar'] },
    { id: 'cadastro_contas', title: 'Cadastro • Contas gerenciais', desc: 'Cadastre contas para organização financeira.', menu: 'Cadastro', submenu: 'Contas gerenciais', preview: ['Criar conta', 'Renomear conta', 'Arquivar conta'] },
    { id: 'cadastro_grupos', title: 'Cadastro • Grupos operacionais', desc: 'Organize comércios e entregadores em grupos.', menu: 'Cadastro', submenu: 'Grupos operacionais', preview: ['Criar grupo', 'Adicionar membros', 'Editar regras'] },
    { id: 'cadastro_modais', title: 'Cadastro • Modais', desc: 'Configure tipos de transporte utilizados.', menu: 'Cadastro', submenu: 'Modais', preview: ['Adicionar modal', 'Editar capacidade', 'Ativar/Inativar'] },
    { id: 'cadastro_precificacao', title: 'Cadastro • Precificação padrão', desc: 'Defina a tabela de preços padrão.', menu: 'Cadastro', submenu: 'Precificação padrão', preview: ['Editar valores', 'Definir faixas', 'Salvar versão'] },
    { id: 'cadastro_tabela_precos', title: 'Cadastro • Tabela de preço por KM', desc: 'Crie tabelas de preço por quilometragem.', menu: 'Cadastro', submenu: 'Tabela de preço por KM', preview: ['Criar tabela de preço', 'Definir faixas de KM', 'Precificar'] },
    { id: 'cadastro_tabela_comissoes', title: 'Cadastro • Tabela de comissões', desc: 'Defina comissões para clientes e entregadores.', menu: 'Cadastro', submenu: 'Tabela de comissões', preview: ['Criar tabela de comissão', 'Vincular clientes', 'Definir faixas de comissão'] },
    { id: 'cadastro_preco_espera', title: 'Cadastro • Preço por espera', desc: 'Ajuste valores de espera por tempo.', menu: 'Cadastro', submenu: 'Preço por espera', preview: ['Definir por minuto', 'Aplicar regra', 'Salvar'] },
    { id: 'cadastro_preco_dinamico_demanda', title: 'Cadastro • Preço dinâmico (demanda)', desc: 'Configure variações de preço por demanda.', menu: 'Cadastro', submenu: 'Preço dinâmico (demanda)', preview: ['Criar regra', 'Ajustar limites', 'Ativar'] },
    { id: 'cadastro_preco_dinamico_entregador', title: 'Cadastro • Preço dinâmico entregador', desc: 'Defina bônus e ajustes por entregador.', menu: 'Cadastro', submenu: 'Preço dinâmico entregador', preview: ['Criar regra por entregador', 'Editar valores', 'Ativar'] },
    { id: 'cadastro_servicos_opcionais', title: 'Cadastro • Serviços opcionais', desc: 'Liste serviços adicionais oferecidos.', menu: 'Cadastro', submenu: 'Serviços opcionais', preview: ['Adicionar serviço', 'Definir preço', 'Ativar/Inativar'] },
    { id: 'mensagens_clientes', title: 'Mensagens • Clientes', desc: 'Envie mensagens para clientes e veja o histórico.', menu: 'Mensagens', submenu: 'Clientes', preview: ['Enviar mensagem', 'Filtrar conversas', 'Ver histórico'] },
    { id: 'mensagens_entregadores', title: 'Mensagens • Entregadores', desc: 'Comunique-se com entregadores e acompanhe conversas.', menu: 'Mensagens', submenu: 'Entregadores', preview: ['Enviar aviso', 'Ver últimas interações'] },
    { id: 'mensagens_historico', title: 'Mensagens • Histórico', desc: 'Histórico completo de mensagens trocadas.', menu: 'Mensagens', submenu: 'Histórico' },
    { id: 'financeiro_contas_receber', title: 'Financeiro • Contas a receber', desc: 'Acompanhe recebimentos e atualize pagamentos.', menu: 'Financeiro', submenu: 'Contas a receber', preview: ['Registrar recebimento', 'Filtrar por período'] },
    { id: 'financeiro_contas_pagar', title: 'Financeiro • Contas a pagar', desc: 'Gerencie pagamentos pendentes e baixas.', menu: 'Financeiro', submenu: 'Contas a pagar', preview: ['Cadastrar conta', 'Baixar pagamento', 'Filtrar por vencimento'] },
    { id: 'financeiro_emissao_notas', title: 'Financeiro • Emissão de notas', desc: 'Emita notas fiscais para seus clientes.', menu: 'Financeiro', submenu: 'Emissão de notas', preview: ['Gerar nota', 'Exportar PDF', 'Enviar por e-mail'] },
    { id: 'financeiro_emissao_recibos', title: 'Financeiro • Emissão de recibos', desc: 'Crie recibos de pagamento rapidamente.', menu: 'Financeiro', submenu: 'Emissão de recibos', preview: ['Gerar recibo', 'Imprimir', 'Compartilhar'] },
    { id: 'financeiro_credito_clientes', title: 'Financeiro • Créditos de clientes', desc: 'Controle créditos e ajustes dos clientes.', menu: 'Financeiro', submenu: 'Créditos de clientes', preview: ['Adicionar crédito', 'Usar crédito', 'Histórico de ajustes'] },
    { id: 'financeiro_comissao_entregadores', title: 'Financeiro • Comissão de entregadores', desc: 'Calcule e revise comissões por entregador.', menu: 'Financeiro', submenu: 'Comissão de entregadores', preview: ['Aplicar percentuais', 'Revisar valores', 'Exportar'] },
    { id: 'financeiro_acertos_entregadores', title: 'Financeiro • Acertos de entregadores', desc: 'Faça acertos e pagamentos aos entregadores.', menu: 'Financeiro', submenu: 'Acertos de entregadores', preview: ['Criar acerto', 'Registrar pagamento', 'Gerar recibo'] },
    { id: 'financeiro_faturamento_mensal', title: 'Financeiro • Faturamento mensal', desc: 'Veja o resumo de faturamento por mês.', menu: 'Financeiro', submenu: 'Faturamento mensal', preview: ['Selecionar período', 'Ver gráficos', 'Exportar planilha'] },
    { id: 'financeiro_revisao_agendamentos', title: 'Financeiro • Revisão de agendamentos', desc: 'Revise agendamentos e acertos rapidamente.', menu: 'Financeiro', submenu: 'Revisão de agendamentos', preview: ['Revisar agendamento', 'Exportar'] },
    { id: 'nova_criar', title: 'Nova entrega', desc: 'Cadastre coleta e entrega, agende, defina cobrança e comprovante. Adicione pontos/retorno e gere pedido com código.', menu: 'Nova entrega', anchorId: 'nova', preview: ['Selecionar cliente, modal e atribuição', 'Usar endereço de cadastro para preenchimento automático', 'Preencher coleta e entrega', 'Agendar, valor e tipo de cobrança', 'Adicionar pontos e retorno'] },
    
    
    { id: 'home_entregador', title: 'Home', desc: 'Visão geral dos seus ganhos, status online/offline e mapa.', menu: 'Home' },
    { id: 'entregas_disponiveis', title: 'Entregas Disponíveis', desc: 'Visualize no mapa e aceite novas entregas próximas a você.', menu: 'Entregas', submenu: 'Disponíveis', preview: ['Ver mapa de calor', 'Aceitar entrega', 'Ver detalhes da rota'] },
    { id: 'entregas_andamento', title: 'Em Andamento', desc: 'Gerencie a entrega atual, colete assinaturas e finalize pedidos.', menu: 'Entregas', submenu: 'Em andamento', preview: ['Navegar para destino', 'Atualizar status', 'Anexar comprovante'] },
    { id: 'carteira_extrato', title: 'Extrato Financeiro', desc: 'Acompanhe seus ganhos detalhados e saldo atual.', menu: 'Carteira', submenu: 'Extrato' },
    { id: 'conta_minha_conta', title: 'Minha Conta', desc: 'Gerencie seus dados pessoais, documentos e veículo.', menu: 'Conta', submenu: 'Minha conta' },
    { id: 'conta_ranking', title: 'Ranking', desc: 'Veja sua posição e pontuação no ranking de entregadores.', menu: 'Conta', submenu: 'Ranking' },
    { id: 'conta_historico', title: 'Histórico de Entregas', desc: 'Consulte todas as entregas realizadas anteriormente.', menu: 'Conta', submenu: 'Histórico' },
    { id: 'conta_notificacoes', title: 'Notificações', desc: 'Veja avisos e mensagens importantes do sistema.', menu: 'Conta', submenu: 'Notificações' },

    
    { id: 'comercio_creditos', title: 'Meus Créditos', desc: 'Gerencie seu saldo pré-pago e histórico de movimentações.', menu: 'Créditos' },
    { id: 'comercio_faturamento', title: 'Faturamento', desc: 'Acompanhe suas faturas, notas fiscais e boletos.', menu: 'Faturamento' },
  ];

  const steps = allSteps.filter(step => {
    if (userRole === 'cliente') {
      return ['pedidos', 'mensagens_entregadores', 'mensagens_historico', 'comercio_creditos', 'comercio_faturamento'].includes(step.id);
    }
    if (userRole === 'entregador') {
      return ['home_entregador', 'entregas_disponiveis', 'entregas_andamento', 'mensagens_clientes', 'mensagens_historico', 'carteira_extrato', 'conta_minha_conta', 'conta_ranking', 'conta_historico', 'conta_notificacoes'].includes(step.id);
    }
    
    return !['home_entregador', 'entregas_disponiveis', 'entregas_andamento', 'carteira_extrato', 'conta_minha_conta', 'conta_ranking', 'conta_historico', 'conta_notificacoes', 'comercio_creditos', 'comercio_faturamento'].includes(step.id);
  });

  const [idx, setIdx] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  const [boxTop, setBoxTop] = useState<number | undefined>(undefined);
  const [arrowTop, setArrowTop] = useState<number | undefined>(undefined);
  const [arrowLeft, setArrowLeft] = useState<number | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    goToMenu(steps[idx].id);
    if (isMobile) return; 

    try {
      const anchor = steps[idx].anchorId || steps[idx].id;
      const el = document.querySelector(`[data-menu-id="${anchor}"]`);
      const r = el ? (el as HTMLElement).getBoundingClientRect() : null;
      const h = boxRef.current?.offsetHeight ?? 360;
      const t = r ? Math.min(Math.max(80, r.top - 20), window.innerHeight - h - 24) : undefined;
      setBoxTop(t);
      if (r) {
        setArrowTop(r.top + r.height / 2 - 8);
        setArrowLeft(r.right + 4);
      } else {
        setArrowTop(undefined);
        setArrowLeft(undefined);
      }
    } catch { setBoxTop(undefined); }
  }, [open, idx, isMobile]);

  useEffect(() => {
    if (!open || isMobile) return;
    const recalc = () => {
      try {
        const anchor = steps[idx].anchorId || steps[idx].id;
        const el = document.querySelector(`[data-menu-id="${anchor}"]`);
        const r = el ? (el as HTMLElement).getBoundingClientRect() : null;
        const h = boxRef.current?.offsetHeight ?? 360;
        const t = r ? Math.min(Math.max(80, r.top - 20), window.innerHeight - h - 24) : undefined;
        setBoxTop(t);
        if (r) {
          setArrowTop(r.top + r.height / 2 - 8);
          setArrowLeft(r.right + 4);
        }
      } catch {}
    };
    window.addEventListener('scroll', recalc, true);
    window.addEventListener('resize', recalc);
    const id = setInterval(recalc, 200);
    return () => { window.removeEventListener('scroll', recalc, true); window.removeEventListener('resize', recalc); clearInterval(id); };
  }, [open, idx, isMobile]);

  if (!open) return null;

  if (steps.length === 0) return null; 
  const current = steps[idx];

  
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="p-6">
            <div className="flex justify-between items-start mb-4">
               <div>
                 <div className="text-xs font-bold text-sky-600 uppercase tracking-wider mb-1">Passo {idx + 1} de {steps.length}</div>
                 <h2 className="text-xl font-bold text-slate-900">{current.title}</h2>
               </div>
               <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                 <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
               </button>
            </div>
            
            <p className="text-slate-600 mb-4 text-sm leading-relaxed">{current.desc}</p>
            
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-2 py-1 text-xs font-medium rounded bg-slate-100 text-slate-700">Menu: {current.menu}</span>
              {current.submenu && (
                <span className="px-2 py-1 text-xs font-medium rounded bg-slate-100 text-slate-700">Submenu: {current.submenu}</span>
              )}
            </div>

            {current.preview && (
              <div className="mb-6 bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="text-xs font-bold text-slate-500 uppercase mb-2">Funcionalidades</div>
                <ul className="space-y-2">
                  {current.preview.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                onClick={() => { if (idx > 0) { const next = idx - 1; setIdx(next); goToMenu(steps[next].id); } }}
                disabled={idx === 0}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => { const next = idx + 1; if (next < steps.length) { setIdx(next); goToMenu(steps[next].id); } else { onClose(); } }}
                className="px-6 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-700 text-white shadow-lg shadow-sky-200 transition-all active:scale-95"
              >
                {idx + 1 < steps.length ? 'Próximo' : 'Concluir'}
              </button>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="absolute top-0 left-0 w-full h-1 bg-slate-100">
            <div 
              className="h-full bg-sky-500 transition-all duration-300" 
              style={{ width: `${((idx + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="fixed inset-0 z-[1000] pointer-events-none">
      <div className="absolute top-0 right-0 bottom-0 left-56 bg-black/70 backdrop-blur-sm" />
      {typeof arrowTop !== 'undefined' && typeof arrowLeft !== 'undefined' && (
        <span
          className="absolute w-0 h-0 border-y-8 border-y-transparent border-l-8 border-l-white drop-shadow"
          style={{ top: arrowTop, left: arrowLeft }}
        />
      )}
      <div className="absolute right-6 pointer-events-auto" style={{ top: boxTop ?? undefined, left: 'calc(14rem + 24px)' }}>
        <div ref={boxRef} className="relative max-w-xl w-[32rem] bg-white rounded-2xl shadow-xl border border-slate-200">
          <div className="p-6">
            <div className="text-xs text-slate-500">Passo {idx + 1} de {steps.length}</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{current.title}</div>
            <div className="text-slate-700 mt-2">{current.desc}</div>
            <div className="mt-3 flex items-center gap-2">
              <span className="px-2 py-1 text-xs rounded bg-slate-100 text-slate-700">Menu: {current.menu}</span>
              {current.submenu && (
                <span className="px-2 py-1 text-xs rounded bg-slate-100 text-slate-700">Submenu: {current.submenu}</span>
              )}
            </div>
            {current.preview && (
              <div className="mt-3 border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div className="text-xs font-semibold text-slate-700 mb-1">O que você pode fazer aqui</div>
                <ul className="text-sm text-slate-700 list-disc ml-5">
                  {current.preview.map((p) => (<li key={p}>{p}</li>))}
                </ul>
              </div>
            )}
            <div className="text-slate-600 text-sm mt-3">
              Use os botões abaixo para navegar. A área principal do sistema muda conforme o módulo para facilitar a apresentação.
            </div>
            <div className="flex items-center justify-between mt-6">
              <button
                onClick={() => { if (idx > 0) { const next = idx - 1; setIdx(next); goToMenu(steps[next].id); } }}
                className="px-3 py-2 rounded bg-slate-200 text-slate-800 text-sm disabled:opacity-50"
                disabled={idx === 0}
              >Anterior</button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { const next = idx + 1; if (next < steps.length) { setIdx(next); goToMenu(steps[next].id); } else { onClose(); } }}
                  className="px-3 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm"
                >{idx + 1 < steps.length ? 'Próximo' : 'Concluir'}</button>
                <button onClick={onClose} className="px-3 py-2 rounded bg-slate-200 text-slate-800 text-sm">Fechar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
