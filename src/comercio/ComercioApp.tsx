import { useEffect, useRef, useState } from 'react';
import './LojaV1.css';
import MapaEntregadoresV1 from '../components/MapaEntregadoresV1';
import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { getLojaAtual, getEntregasAbertas, getEntregadoresOnline, marcarPronto, moeda, statusBadge, FILTROS_STATUS, getRelatorioEntregas, getAgendamentos, cancelarPedido, type LojaAtual, type EntregaAberta, type EntregadorMapa, type RelatorioResultado, type Agendamento } from './comercioData';
import { calcularPreco, criarEntregaComercio, type ResultadoPreco } from './comercioPricing';

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

const PAGAMENTOS = ['Pago (online)', 'Pix', 'Cartão na entrega', 'Dinheiro'];

// Criação rápida de entrega (uma linha) — porte fiel do CriarRapido do V1, preço no Supabase.
function CriarRapido({ loja, onCriado }: { loja: LojaAtual; onCriado: () => void }) {
  const VAZIO = { clienteNome: '', clienteTelefone: '', endereco: '', complemento: '', formaPagamento: '', observacao: '', agendadoPara: '' };
  const [v, setV] = useState(VAZIO);
  const [retorno, setRetorno] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [mais, setMais] = useState(false);
  const [preco, setPreco] = useState<ResultadoPreco | null>(null);
  const [destino, setDestino] = useState<[number, number] | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const calcIdRef = useRef(0);
  const set = (k: keyof typeof VAZIO) => (val: string) => setV(x => ({ ...x, [k]: val }));

  // Recalcula o preço quando o endereço (≥5 chars) ou o retorno mudam (debounce 700ms).
  useEffect(() => {
    const endereco = v.endereco.trim();
    if (endereco.length < 5) { setPreco(null); return; }
    const id = ++calcIdRef.current;
    setCalculando(true);
    const t = setTimeout(async () => {
      try {
        const r = await calcularPreco(loja, { destino, enderecoTexto: endereco, retorno });
        if (id === calcIdRef.current) setPreco(r);
      } catch {
        if (id === calcIdRef.current) setPreco({ valor: null, km: null, dinamico: false, erro: 'Erro ao calcular o preço.' });
      } finally {
        if (id === calcIdRef.current) setCalculando(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [v.endereco, destino, retorno, loja]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!v.clienteNome.trim()) { setErro('Informe o nome do cliente.'); return; }
    if (v.endereco.trim().length < 5) { setErro('Informe o endereço de entrega.'); return; }
    setEnviando(true);
    try {
      let p = preco;
      if (!p || p.valor == null) p = await calcularPreco(loja, { destino, enderecoTexto: v.endereco.trim(), retorno });
      await criarEntregaComercio(loja, {
        clienteNome: v.clienteNome.trim(),
        clienteTelefone: v.clienteTelefone.trim(),
        enderecoTexto: v.endereco.trim(),
        complemento: v.complemento.trim(),
        observacao: v.observacao.trim(),
        formaPagamento: v.formaPagamento,
        agendadoPara: v.agendadoPara ? new Date(v.agendadoPara).toISOString() : null,
        retorno,
        pronto,
        valor: p?.valor ?? null,
        km: p?.km ?? null,
      });
      setV(VAZIO); setRetorno(false); setPronto(false); setMais(false); setPreco(null); setDestino(null);
      onCriado();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao criar a entrega.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="criar-rapido" onSubmit={criar} aria-label="Criar entrega">
      <div className="criar-linha">
        <input className="cr-nome" value={v.clienteNome} onChange={e => set('clienteNome')(e.target.value)} placeholder="Nome do cliente" aria-label="Nome do cliente" required />
        <input className="cr-tel" value={v.clienteTelefone} onChange={e => set('clienteTelefone')(e.target.value)} placeholder="Telefone" aria-label="Telefone" inputMode="tel" />
        <AddressAutocomplete value={v.endereco} onChange={(val) => { set('endereco')(val); setDestino(null); }} onSelectCoords={(coords) => setDestino(coords ?? null)} placeholder="Endereço de entrega (rua, número, bairro)" containerClassName="cr-end" />
        <input className="cr-comp" value={v.complemento} onChange={e => set('complemento')(e.target.value)} placeholder="Complemento" aria-label="Complemento" />
        <label className="chave-rapida" title={`O entregador volta à loja depois de entregar. Acréscimo de ${loja.retornoPercentual ?? 20}% na taxa.`}>
          <input type="checkbox" checked={retorno} onChange={e => setRetorno(e.target.checked)} />
          <span className="interruptor" aria-hidden="true" /><span>Retorno?</span>
        </label>
        <label className="chave-rapida" title="Ligado: chama o entregador assim que criar. Desligado: fica Criado até você clicar em Pedido pronto.">
          <input type="checkbox" checked={pronto} onChange={e => setPronto(e.target.checked)} />
          <span className="interruptor" aria-hidden="true" /><span>Pronto?</span>
        </label>
        <button type="button" className={`botao-icone ${mais ? 'ativo' : ''}`} onClick={() => setMais(m => !m)} aria-expanded={mais} aria-label="Mais opções" title="Mais opções (pagamento, observação, agendamento)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={mais ? 'm6 15 6-6 6 6' : 'M12 5v14M5 12h14'} /></svg>
        </button>
      </div>
      {mais && (
        <div className="criar-linha criar-mais">
          <select value={v.formaPagamento} onChange={e => set('formaPagamento')(e.target.value)} aria-label="Forma de pagamento">
            <option value="">Pagamento do cliente…</option>
            {PAGAMENTOS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className="cr-obs" value={v.observacao} onChange={e => set('observacao')(e.target.value)} placeholder="Observação para o entregador (troco, apto, interfone…)" aria-label="Observação" />
          <label className="cr-agenda"><span>Agendar para</span>
            <input type="datetime-local" value={v.agendadoPara} onChange={e => set('agendadoPara')(e.target.value)} aria-label="Agendar para" />
          </label>
        </div>
      )}
      <div className="criar-rodape">
        <span className="criar-calculo" aria-live="polite">
          {erro && <span style={{ color: 'var(--critico)' }}>{erro}</span>}
          {calculando ? <span className="apagado">Calculando valor…</span>
            : preco?.erro ? <span className="apagado">{preco.erro}</span>
            : preco && preco.valor != null ? (
              <span className="criar-valor">
                ✓ Taxa: <strong>{moeda(preco.valor)}</strong>
                {preco.km != null && <span className="apagado"> · {preco.km.toFixed(1)} km</span>}
                {preco.dinamico && <span className="selo-dinamico" title="Preço dinâmico ativo agora">⚡ Preço dinâmico</span>}
              </span>
            ) : null}
        </span>
        <button type="submit" className="btn btn-laranja" disabled={enviando}>{enviando ? 'Criando…' : v.agendadoPara ? 'Agendar Entrega' : 'Criar Entrega'}</button>
      </div>
    </form>
  );
}

// Painel de Controle — criação rápida + mapa ao vivo + entregas em aberto.
function PainelView({ loja }: { loja: LojaAtual }) {
  const [entregas, setEntregas] = useState<EntregaAberta[] | null>(null);
  const [entregadores, setEntregadores] = useState<EntregadorMapa[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useState<string[]>([]);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [mostrarMapa, setMostrarMapa] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const filtroRef = useRef<HTMLDivElement>(null);
  useFora(filtroRef, filtroAberto, () => setFiltroAberto(false));

  async function carregar(silencioso = false) {
    setErro(null);
    try {
      const [es, ents] = await Promise.all([getEntregasAbertas(loja.id), getEntregadoresOnline()]);
      setEntregas(es); setEntregadores(ents);
    } catch (e: any) {
      if (!silencioso) setErro(e?.message || 'Erro ao carregar entregas');
      setEntregas(prev => prev ?? []);
    }
  }
  useEffect(() => { carregar(); const t = setInterval(() => carregar(true), 20000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [loja.id]);

  async function pronto(p: EntregaAberta) {
    setOcupado(true);
    try { await marcarPronto(p.id); await carregar(true); }
    catch (e: any) { setErro(e?.message || 'Erro ao marcar como pronto'); }
    finally { setOcupado(false); }
  }

  const q = busca.trim().toLowerCase();
  const lista = (entregas || []).filter(p => {
    const b = statusBadge(p.status);
    const passaFiltro = !filtros.length || filtros.includes(b.filtro);
    const passaBusca = !q || [p.numero, p.clienteNome, p.clienteTelefone, p.endereco, p.entregadorNome].some(x => x && x.toLowerCase().includes(q));
    return passaFiltro && passaBusca;
  });

  const marcados = lista.filter(p => selecionados.has(p.id));
  const todosMarcados = lista.length > 0 && marcados.length === lista.length;
  const prontosParaMarcar = marcados.filter(p => statusBadge(p.status).filtro === 'CRIADO');
  const alternar = (id: string) => setSelecionados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function marcarProntos() { setOcupado(true); try { for (const p of prontosParaMarcar) await marcarPronto(p.id); await carregar(true); setSelecionados(new Set()); } finally { setOcupado(false); } }

  // Pedidos no mapa: posicionados ao redor da loja (o mapa espalha por `loja`).
  const lojaPonto = loja.lat != null && loja.lng != null ? { id: loja.id, lat: loja.lat, lng: loja.lng, nome: loja.nomeFantasia, endereco: loja.endereco } : null;
  const pedidosMapa = lojaPonto ? (entregas || []).map(p => ({ id: p.id, codigo: p.numero, status: p.status, createdAt: p.createdAt, loja: lojaPonto })) : [];
  const entregadoresMapa = entregadores.map(e => ({ id: e.id, nomeCompleto: e.nome, fotoUrl: e.fotoUrl, lat: e.lat, lng: e.lng, status: e.status }));

  return (
    <div className="painel">
      <h1 className="sr-only">Painel de Controle — {loja.nomeFantasia}</h1>
      <CriarRapido loja={loja} onCriado={() => carregar(true)} />
      {erro && <div className="erro-caixa" role="alert"><span>{erro}</span><button className="link" onClick={() => carregar()}>Tentar de novo</button></div>}

      <div className="painel-grade">
        <div className="painel-principal">
          <div className="mapa-barra" role="toolbar" aria-label="Mapa">
            <button type="button" className={`mb mb-verde ${mostrarMapa ? '' : 'desligado'}`} onClick={() => setMostrarMapa(m => !m)} aria-pressed={mostrarMapa} title={mostrarMapa ? 'Ocultar mapa' : 'Mostrar mapa'} aria-label={mostrarMapa ? 'Ocultar mapa' : 'Mostrar mapa'}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
          </div>
          {mostrarMapa && (
            <div className="painel-mapa">
              {!lojaPonto ? (
                <div className="carregando" style={{ height: 320 }}>A loja ainda não tem localização no mapa. Informe o endereço no cadastro.</div>
              ) : (
                <MapaEntregadoresV1 pedidos={pedidosMapa} entregadores={entregadoresMapa} altura="clamp(360px, 58vh, 720px)" carregado />
              )}
            </div>
          )}

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
              <div className="topo-grupo" ref={filtroRef}>
                <button type="button" className="botao-icone sem-borda" onClick={() => setFiltroAberto(a => !a)} aria-expanded={filtroAberto} aria-label="Filtrar por status" title="Filtrar por status">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18l-7 9v6l-4 2v-8z" /></svg>
                  {filtros.length > 0 && <span className="contador">{filtros.length}</span>}
                </button>
                {filtroAberto && (
                  <div className="topo-suspenso topo-suspenso-direita filtro-suspenso">
                    {FILTROS_STATUS.map(f => (
                      <label key={f.valor} className="campo-check">
                        <input type="checkbox" checked={filtros.includes(f.valor)} onChange={e => setFiltros(l => e.target.checked ? [...l, f.valor] : l.filter(x => x !== f.valor))} />
                        <span>{f.rotulo}</span>
                      </label>
                    ))}
                    {filtros.length > 0 && <button type="button" className="link" onClick={() => setFiltros([])}>Limpar filtro</button>}
                  </div>
                )}
              </div>
              {marcados.length > 0 && (
                <span className="lote-acoes">
                  <span className="apagado">{marcados.length} selecionado(s)</span>
                  {prontosParaMarcar.length > 0 && <button className="btn btn-sm btn-primario" disabled={ocupado} onClick={marcarProntos}>Marcar {prontosParaMarcar.length} como pronto</button>}
                  <button className="btn btn-sm btn-fantasma" onClick={() => setSelecionados(new Set())}>Limpar</button>
                </span>
              )}
            </div>

            {entregas === null ? (
              <div className="carregando"><span className="spinner" /> Carregando…</div>
            ) : lista.length === 0 ? (
              <div className="sem-registros"><span aria-hidden="true">×</span><strong>Sem registros</strong></div>
            ) : (
              <div className="tabela-rolagem">
                <table className="tabela tabela-aberto">
                  <thead>
                    <tr>
                      <th className="col-check"><input type="checkbox" checked={todosMarcados} aria-label="Selecionar todos" onChange={() => setSelecionados(todosMarcados ? new Set() : new Set(lista.map(p => p.id)))} /></th>
                      <th>Nº Pedido</th><th>Cliente</th><th>Entrega</th><th className="num">Taxa</th><th>Status</th><th>Pedido pronto</th><th>Entregador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map(p => {
                      const b = statusBadge(p.status);
                      return (
                        <tr key={p.id} className={selecionados.has(p.id) ? 'linha-selecionada' : ''}>
                          <td className="col-check"><input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Selecionar ${p.numero}`} /></td>
                          <td><strong>{p.numero}</strong></td>
                          <td>
                            {p.clienteNome}
                            {p.retorno && <span className="selo-retorno" title="Com retorno à loja">↩ retorno</span>}
                            {p.clienteTelefone && <div className="celula-sub">{p.clienteTelefone}</div>}
                          </td>
                          <td className="col-endereco">{p.endereco || <span className="apagado">—</span>}</td>
                          <td className="num">{moeda(p.valor)}</td>
                          <td><span className={`badge ${b.classe}`}>{b.rotulo}</span></td>
                          <td>
                            {b.filtro === 'CRIADO'
                              ? <button className="btn btn-sm btn-primario" disabled={ocupado} onClick={() => pronto(p)}>Pedido pronto</button>
                              : <span className="apagado">✓ Pronto</span>}
                          </td>
                          <td>{p.entregadorNome ? `🏍 ${p.entregadorNome}` : <span className="apagado">{b.filtro === 'PRONTO' ? 'Procurando…' : '—'}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
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

function fmtDataHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Aba "Solicitar Entrega": o mesmo fluxo de criação do painel, em página própria.
function SolicitarEntrega({ loja }: { loja: LojaAtual }) {
  const [feitos, setFeitos] = useState(0);
  return (
    <div className="painel">
      <section className="painel-bloco">
        <h2 style={{ marginBottom: 12 }}>Solicitar Entrega</h2>
        <CriarRapido loja={loja} onCriado={() => setFeitos(f => f + 1)} />
        {feitos > 0 && (
          <p className="apagado" style={{ marginTop: 12 }}>
            {feitos === 1 ? 'Entrega criada' : `${feitos} entregas criadas`} nesta sessão. Acompanhe no Painel de Controle.
          </p>
        )}
      </section>
    </div>
  );
}

// Aba "Relatórios": entregas de um período, com totais.
function RelatoriosComercio({ loja }: { loja: LojaAtual }) {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const hoje = new Date();
  const [desde, setDesde] = useState(fmt(new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000)));
  const [ate, setAte] = useState(fmt(hoje));
  const [res, setRes] = useState<RelatorioResultado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true); setErro(null);
    try {
      const desdeISO = new Date(desde + 'T00:00:00').toISOString();
      const ateISO = new Date(ate + 'T23:59:59').toISOString();
      setRes(await getRelatorioEntregas(loja.id, desdeISO, ateISO));
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar o relatório.');
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="painel">
      <section className="painel-bloco">
        <h2 style={{ marginBottom: 12 }}>Relatórios · Entregas</h2>
        <div className="criar-linha" style={{ marginBottom: 12 }}>
          <label className="cr-agenda">De <input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label>
          <label className="cr-agenda">Até <input type="date" value={ate} onChange={e => setAte(e.target.value)} /></label>
          <button type="button" className="btn" onClick={carregar} disabled={carregando}>{carregando ? 'Gerando…' : 'Gerar'}</button>
        </div>

        {erro && <div className="erro-caixa" role="alert"><span>{erro}</span></div>}

        {res && (
          <>
            <div className="criar-linha" style={{ gap: 18, marginBottom: 12 }}>
              <div className="criar-calculo"><strong>{res.quantidade}</strong> entregas</div>
              <div className="criar-calculo"><strong>{res.entregues}</strong> entregues</div>
              <div className="criar-calculo">Total: <strong>{moeda(res.total)}</strong></div>
            </div>
            {res.linhas.length === 0 ? (
              <div className="sem-registros"><span>∅</span> Nenhuma entrega no período.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="tabela">
                  <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Endereço</th><th>Entregador</th><th>Status</th><th>Valor</th></tr></thead>
                  <tbody>
                    {res.linhas.map(l => {
                      const b = statusBadge(l.status);
                      return (
                        <tr key={l.id}>
                          <td>{l.numero}</td>
                          <td>{fmtDataHora(l.data)}</td>
                          <td>{l.cliente}</td>
                          <td className="col-endereco">{l.endereco || <span className="apagado">—</span>}</td>
                          <td>{l.entregadorNome || <span className="apagado">—</span>}</td>
                          <td><span className={`badge ${b.classe}`}>{b.rotulo}</span></td>
                          <td>{moeda(l.valor)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// Aba "Agendamentos": pedidos agendados para o futuro, com opção de cancelar.
function AgendamentosComercio({ loja }: { loja: LojaAtual }) {
  const [lista, setLista] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true); setErro(null);
    try {
      setLista(await getAgendamentos(loja.id));
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar os agendamentos.');
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function cancelar(id: string) {
    if (!window.confirm('Cancelar este agendamento?')) return;
    try {
      await cancelarPedido(id);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao cancelar.');
    }
  }

  return (
    <div className="painel">
      <section className="painel-bloco">
        <h2 style={{ marginBottom: 12 }}>Agendamentos</h2>
        {erro && <div className="erro-caixa" role="alert"><span>{erro}</span></div>}
        {carregando ? (
          <div className="carregando"><span className="spinner" /> Carregando…</div>
        ) : lista.length === 0 ? (
          <div className="sem-registros"><span>∅</span> Nenhum pedido agendado para frente.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabela">
              <thead><tr><th>Nº</th><th>Agendado para</th><th>Cliente</th><th>Endereço</th><th>Status</th><th>Valor</th><th></th></tr></thead>
              <tbody>
                {lista.map(a => {
                  const b = statusBadge(a.status);
                  return (
                    <tr key={a.id}>
                      <td>{a.numero}</td>
                      <td>{fmtDataHora(a.agendarEm)}</td>
                      <td>{a.cliente}</td>
                      <td className="col-endereco">{a.endereco || <span className="apagado">—</span>}</td>
                      <td><span className={`badge ${b.classe}`}>{b.rotulo}</span></td>
                      <td>{moeda(a.valor)}</td>
                      <td><button type="button" className="btn btn-fantasma" onClick={() => cancelar(a.id)}>Cancelar</button></td>
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
          <SolicitarEntrega loja={loja} />
        ) : view === 'relatorios' ? (
          <RelatoriosComercio loja={loja} />
        ) : view === 'agendamentos' ? (
          <AgendamentosComercio loja={loja} />
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
