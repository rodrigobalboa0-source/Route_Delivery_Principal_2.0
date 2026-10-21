import { useEffect, useRef, useState } from 'react';
import './LojaV1.css';
import { getLojaAtual, getEntregasAbertas, moeda, statusBadge, type LojaAtual, type EntregaAberta } from './comercioData';

// Ícones em traço (herdam a cor do texto) — iguais ao V1.
const ICONES: Record<string, JSX.Element> = {
  painel: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  solicitar: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M12 12v6M9 15h6" /></>,
  relatorios: <><path d="M3 3v18h18" /><path d="M8 17v-5M13 17V8M18 17v-9" /></>,
  agenda: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  credito: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M16 12h5v4h-5a2 2 0 0 1 0-4zM3 9h14" /></>,
  mensagens: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
  conta: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  sair: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
};
function Icone({ nome, className = '' }: { nome: string; className?: string }) {
  return <svg className={`icone ${className}`} viewBox="0 0 24 24" aria-hidden="true">{ICONES[nome]}</svg>;
}

type View = 'painel' | 'solicitar' | 'relatorios' | 'agendamentos' | 'creditos' | 'mensagens' | 'conta';

const MENU: { view: View; rotulo: string; icone: string; soCredito?: boolean }[] = [
  { view: 'painel', rotulo: 'Painel de Controle', icone: 'painel' },
  { view: 'solicitar', rotulo: 'Solicitar Entrega', icone: 'solicitar' },
  { view: 'relatorios', rotulo: 'Relatórios', icone: 'relatorios' },
  { view: 'agendamentos', rotulo: 'Agendamentos', icone: 'agenda' },
  { view: 'creditos', rotulo: 'Créditos', icone: 'credito', soCredito: true },
];

function iniciais(nome = '') {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : p[0]?.[1] || '')).toUpperCase();
}

function useFora(ref: React.RefObject<HTMLElement>, aberto: boolean, fechar: () => void) {
  useEffect(() => {
    if (!aberto) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fechar(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', esc); };
  }, [aberto, fechar, ref]);
}

function MenuConta({ loja, onNavegar, onSair }: { loja: LojaAtual | null; onNavegar: (v: View) => void; onSair: () => void }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFora(ref, aberto, () => setAberto(false));
  return (
    <div className="topo-grupo topo-conta" ref={ref}>
      <button type="button" className="topo-avatar" aria-label={`Conta de ${loja?.nomeFantasia}`} aria-expanded={aberto} onClick={() => setAberto(a => !a)}>
        {loja?.fotoUrl ? <img src={loja.fotoUrl} alt="" /> : iniciais(loja?.nomeFantasia)}
      </button>
      {aberto && (
        <div className="topo-suspenso topo-suspenso-direita" onClick={() => setAberto(false)}>
          <div className="topo-suspenso-cabeca">
            <strong>{loja?.nomeFantasia}</strong>
            <small>{loja?.email}</small>
          </div>
          <button type="button" className="topo-suspenso-item" onClick={() => onNavegar('mensagens')}><Icone nome="mensagens" /> Mensagens</button>
          <button type="button" className="topo-suspenso-item" onClick={() => onNavegar('conta')}><Icone nome="conta" /> Minha conta</button>
          <button type="button" className="topo-suspenso-item" onClick={onSair}><Icone nome="sair" /> Sair</button>
        </div>
      )}
    </div>
  );
}

// Painel de Controle — por enquanto a lista de entregas em aberto (criação rápida e mapa vêm na próxima etapa).
function PainelView({ loja }: { loja: LojaAtual }) {
  const [entregas, setEntregas] = useState<EntregaAberta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  async function carregar() {
    setErro(null);
    try { setEntregas(await getEntregasAbertas(loja.id)); }
    catch (e: any) { setErro(e?.message || 'Erro ao carregar entregas'); setEntregas([]); }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [loja.id]);

  const q = busca.trim().toLowerCase();
  const lista = (entregas || []).filter(p =>
    !q || [p.numero, p.clienteNome, p.clienteTelefone, p.endereco, p.entregadorNome].some(x => x && x.toLowerCase().includes(q))
  );

  return (
    <div className="painel">
      <h1 className="sr-only">Painel de Controle — {loja.nomeFantasia}</h1>
      {erro && <div className="erro-caixa" role="alert"><span>{erro}</span><button className="link" onClick={carregar}>Tentar de novo</button></div>}

      <section className="painel-bloco em-aberto">
        <div className="em-aberto-topo">
          <span className="em-aberto-contagem">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>
            Entregas em aberto: <strong>{entregas?.length ?? 0}</strong>
          </span>
        </div>
        <div className="em-aberto-ferramentas">
          <div className="busca-icone">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar" aria-label="Pesquisar entregas em aberto" />
          </div>
        </div>

        {entregas === null ? (
          <div className="carregando"><span className="spinner" /> Carregando…</div>
        ) : lista.length === 0 ? (
          <div className="sem-registros"><span aria-hidden="true">×</span><strong>Sem registros</strong></div>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela tabela-aberto">
              <thead>
                <tr><th>Nº Pedido</th><th>Cliente</th><th>Entrega</th><th className="num">Taxa</th><th>Status</th><th>Entregador</th></tr>
              </thead>
              <tbody>
                {lista.map(p => {
                  const b = statusBadge(p.status);
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.numero}</strong></td>
                      <td>
                        {p.clienteNome}
                        {p.retorno && <span className="selo-retorno" title="Com retorno à loja">↩ retorno</span>}
                        {p.clienteTelefone && <div className="celula-sub">{p.clienteTelefone}</div>}
                      </td>
                      <td className="col-endereco">{p.endereco || <span className="apagado">—</span>}</td>
                      <td className="num">{moeda(p.valor)}</td>
                      <td><span className={`badge ${b.classe}`}>{b.rotulo}</span></td>
                      <td>{p.entregadorNome ? `🏍 ${p.entregadorNome}` : <span className="apagado">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function EmBreve({ titulo }: { titulo: string }) {
  return (
    <div className="painel">
      <section className="painel-bloco">
        <h2 style={{ marginBottom: 8 }}>{titulo}</h2>
        <p className="apagado" style={{ margin: 0 }}>Esta tela está sendo migrada do V1 para o Supabase. Em breve, idêntica à original.</p>
      </section>
    </div>
  );
}

export function ComercioApp({ onLogout }: { onLogout: () => void }) {
  const [loja, setLoja] = useState<LojaAtual | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [view, setView] = useState<View>('painel');
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    getLojaAtual().then(l => { if (vivo) { setLoja(l); setCarregando(false); } }).catch(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  const menu = MENU.filter(i => !i.soCredito || loja?.modalidadeCobranca === 'CREDITO');

  function navegar(v: View) { setView(v); setMenuAberto(false); }

  return (
    <div className="loja-app">
      <header className="loja-topo">
        <div className="loja-marca">
          <button type="button" className="logo-atualizar" onClick={() => window.location.reload()} title="Atualizar a página" aria-label="Atualizar a página">
            <img src="/logo-route-delivery.png" alt="Route Delivery" />
          </button>
        </div>
        <button type="button" className="botao-icone sem-borda loja-hamburguer" onClick={() => setMenuAberto(a => !a)} aria-label="Abrir menu" aria-expanded={menuAberto}>☰</button>
        <nav className={`loja-nav ${menuAberto ? 'aberto' : ''}`}>
          {menu.map(i => (
            <button key={i.view} type="button" className={`topo-link ${view === i.view ? 'ativo' : ''}`} onClick={() => navegar(i.view)}>
              <Icone nome={i.icone} /> {i.rotulo}
            </button>
          ))}
        </nav>
        <MenuConta loja={loja} onNavegar={navegar} onSair={onLogout} />
      </header>

      <main className="loja-conteudo">
        {carregando ? (
          <div className="carregando"><span className="spinner" /> Carregando sua loja…</div>
        ) : !loja ? (
          <div className="erro-caixa" role="alert"><span>Não encontramos a loja ligada a este acesso. Fale com a equipe Route Delivery.</span></div>
        ) : view === 'painel' ? (
          <PainelView loja={loja} />
        ) : view === 'solicitar' ? (
          <EmBreve titulo="Solicitar Entrega" />
        ) : view === 'relatorios' ? (
          <EmBreve titulo="Relatórios · Entregas" />
        ) : view === 'agendamentos' ? (
          <EmBreve titulo="Agendamentos" />
        ) : view === 'creditos' ? (
          <EmBreve titulo="Créditos" />
        ) : view === 'mensagens' ? (
          <EmBreve titulo="Mensagens" />
        ) : (
          <EmBreve titulo="Minha conta" />
        )}
      </main>
    </div>
  );
}
