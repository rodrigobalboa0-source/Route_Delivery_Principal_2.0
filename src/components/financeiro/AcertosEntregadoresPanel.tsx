import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { CreditCard, X, Check, Copy } from 'lucide-react';

type Acerto = any;
type Entregador = Database['public']['Tables']['entregadores']['Row'];
type Entrega = Database['public']['Tables']['nova_entrega']['Row'];

const fmtMoeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

// Mesma regra do app do entregador (EntregadorExtratoPanel) para o ganho de uma
// entrega: multi-destino usa opcionais.comissao_destinos + comissao_retorno.
function safeParseArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}
function calcGanhoEntrega(entrega: any): number {
  const extraPoints = safeParseArray(entrega?.pontos_adicionais);
  const comissaoDestinos = safeParseArray(entrega?.opcionais?.comissao_destinos);
  const comissaoRetorno = typeof entrega?.opcionais?.comissao_retorno === 'number' ? Number(entrega.opcionais.comissao_retorno) : 0;
  const numDestinos = 1 + extraPoints.length;
  if (numDestinos <= 1) return Number(entrega.valor_entregador || 0);
  if (comissaoDestinos.length > 0) {
    const totalDestinos = comissaoDestinos.reduce((sum: number, dd: any) => sum + (typeof dd?.valor === 'number' ? dd.valor : 0), 0);
    return totalDestinos + comissaoRetorno;
  }
  return Number(entrega.valor_entregador || 0);
}

interface ResumoEntregador {
  id: string;
  nome: string;
  hoje: number;
  semana: number;
  mes: number;
  totalGanhos: number;
  totalSacado: number;
  saldo: number;
  ultimoSaqueTipo: string | null;
  ultimoSaqueTaxa: number | null;
}

// Resumo financeiro por entregador: ganhos no dia/semana/mês, total sacado do app,
// saldo que ficou no app, e o tipo/percentual do último saque.
function ResumoFinanceiroEntregadores() {
  const [rows, setRows] = useState<ResumoEntregador[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => { void carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [ents, entregas, saques] = await Promise.all([
        supabase.from('entregadores').select('id, nome_completo').order('nome_completo'),
        supabase.from('nova_entrega').select('entregador_id, valor_entregador, pontos_adicionais, opcionais, status, created_at, updated_at').not('entregador_id', 'is', null).limit(10000),
        supabase.from('acertos_entregadores').select('entregador_id, valor_pago, tipo_saque, taxa_aplicada, status, created_at').is('entrega_id', null).limit(5000),
      ]);
      const agora = new Date();
      const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
      const inicioSemana = inicioHoje - 6 * 24 * 60 * 60 * 1000;
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();

      const porEnt = new Map<string, ResumoEntregador>();
      ((ents.data || []) as any[]).forEach((e) => porEnt.set(e.id, {
        id: e.id, nome: e.nome_completo || '—', hoje: 0, semana: 0, mes: 0,
        totalGanhos: 0, totalSacado: 0, saldo: 0, ultimoSaqueTipo: null, ultimoSaqueTaxa: null,
      }));

      ((entregas.data || []) as any[]).forEach((d) => {
        const r = porEnt.get(d.entregador_id); if (!r) return;
        if (String(d.status || '').toLowerCase() !== 'entregue') return;
        const v = calcGanhoEntrega(d);
        r.totalGanhos += v;
        // Mesma data que o app usa (updated_at = quando foi entregue; cai no created_at).
        const t = new Date(d.updated_at || d.created_at || '').getTime();
        if (Number.isFinite(t)) {
          if (t >= inicioHoje) r.hoje += v;
          if (t >= inicioSemana) r.semana += v;
          if (t >= inicioMes) r.mes += v;
        }
      });

      const ultimoSaqueData = new Map<string, number>();
      ((saques.data || []) as any[]).forEach((s) => {
        const r = porEnt.get(s.entregador_id); if (!r) return;
        // Igual ao app: desconta (valor_pago + taxa) dos saques pago/pendente.
        const st = String(s.status || '').toLowerCase();
        if (st === 'pago' || st === 'pendente') {
          r.totalSacado += Number(s.valor_pago || 0) + Number(s.taxa_aplicada || 0);
        }
        const t = new Date(s.created_at || '').getTime();
        if (!ultimoSaqueData.has(s.entregador_id) || t > (ultimoSaqueData.get(s.entregador_id) || 0)) {
          ultimoSaqueData.set(s.entregador_id, t);
          r.ultimoSaqueTipo = s.tipo_saque || null;
          r.ultimoSaqueTaxa = s.taxa_aplicada != null ? Number(s.taxa_aplicada) : null;
        }
      });

      const lista = [...porEnt.values()].map((r) => ({ ...r, saldo: r.totalGanhos - r.totalSacado }));
      // Mostra primeiro quem tem movimento.
      lista.sort((a, b) => (b.totalGanhos + b.totalSacado) - (a.totalGanhos + a.totalSacado) || a.nome.localeCompare(b.nome));
      setRows(lista);
    } catch (e) {
      console.error('Erro ao carregar resumo de entregadores:', e);
    } finally {
      setLoading(false);
    }
  }

  const q = busca.trim().toLowerCase();
  const filtradas = q ? rows.filter((r) => r.nome.toLowerCase().includes(q)) : rows;

  return (
    <div className="bg-white border border-slate-200 rounded-lg mb-6 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-base font-semibold text-slate-900">Resumo financeiro por entregador</h3>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar entregador..."
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>
      {loading ? (
        <div className="p-6 text-center text-slate-500 text-sm">Carregando resumo...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Entregador</th>
                <th className="px-4 py-2 text-right">Hoje</th>
                <th className="px-4 py-2 text-right">Semana</th>
                <th className="px-4 py-2 text-right">Mês</th>
                <th className="px-4 py-2 text-right">Total sacado</th>
                <th className="px-4 py-2 text-right">Saldo no app</th>
                <th className="px-4 py-2 text-center">Último saque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtradas.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-4 text-center text-slate-500">Nenhum entregador.</td></tr>
              ) : filtradas.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-800">{r.nome}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{fmtMoeda(r.hoje)}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{fmtMoeda(r.semana)}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{fmtMoeda(r.mes)}</td>
                  <td className="px-4 py-2 text-right text-orange-600">{fmtMoeda(r.totalSacado)}</td>
                  <td className="px-4 py-2 text-right font-semibold text-green-600">{fmtMoeda(r.saldo)}</td>
                  <td className="px-4 py-2 text-center">
                    {r.ultimoSaqueTipo ? (
                      <span className="inline-flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${/rap/i.test(r.ultimoSaqueTipo) ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                          {/rap/i.test(r.ultimoSaqueTipo) ? 'Rápido' : 'Normal'}
                        </span>
                        {r.ultimoSaqueTaxa != null && <span className="text-xs text-slate-500">{r.ultimoSaqueTaxa.toFixed(1)}%</span>}
                      </span>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AcertosEntregadoresPanel() {
  const [items, setItems] = useState<Acerto[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ entregador_id: '', entrega_id: '', valor_pago: '' });
  const [selectedBankData, setSelectedBankData] = useState<any>(null);
  const [showBankModal, setShowBankModal] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pendente' | 'pago'>('pendente');

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR');
  };

  const copyToClipboard = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const p = Promise.all([
        supabase.from('acertos_entregadores').select('*').order('created_at', { ascending: false }),
        supabase.from('entregadores').select('id, nome_completo, dados_bancarios').order('nome_completo'),
        supabase.from('nova_entrega').select('id, status').order('created_at', { ascending: false }).limit(200),
      ]);
      const result = await new Promise<[
        { data?: Acerto[]; error?: { message?: string } },
        { data?: Entregador[]; error?: { message?: string } },
        { data?: Entrega[]; error?: { message?: string } }
      ]>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), 8000);
        p.then(
          (v) => { clearTimeout(t); resolve(v as unknown as [
            { data?: Acerto[]; error?: { message?: string } },
            { data?: Entregador[]; error?: { message?: string } },
            { data?: Entrega[]; error?: { message?: string } }
          ]); },
          (err) => { clearTimeout(t); reject(err); }
        );
      });
      const [aRes, eRes, nRes] = result;
      if (aRes.error?.message) setError(aRes.error.message);
      if (eRes.error?.message) setError(eRes.error.message);
      if (nRes.error?.message) setError(nRes.error.message);
      setItems((aRes.data || []) as Acerto[]);
      setEntregadores((eRes.data || []) as Entregador[]);
      setEntregas((nRes.data || []) as Entrega[]);
    } catch {
      try {
        const [aR, eR, nR] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/acertos_entregadores?select=*&order=created_at.desc`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
          fetch(`${SUPABASE_URL}/rest/v1/entregadores?select=id,nome_completo,dados_bancarios&order=nome_completo`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
          fetch(`${SUPABASE_URL}/rest/v1/nova_entrega?select=id,status&order=created_at.desc&limit=200`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
        ]);
        if (aR.ok) setItems(await aR.json());
        if (eR.ok) setEntregadores(await eR.json());
        if (nR.ok) setEntregas(await nR.json());
        if (!aR.ok || !eR.ok || !nR.ok) {
          const msg = `Falha ${(aR.ok ? '' : aR.status)} ${(eR.ok ? '' : eR.status)} ${(nR.ok ? '' : nR.status)}`.trim();
          if (msg) setError(msg);
        } else {
          setError(null);
        }
      } catch (e2) {
        const msg = (e2 as { message?: string })?.message || 'Erro ao carregar acertos';
        setError(msg);
      }
    } finally {
      setLoadingList(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.entregador_id || !form.entrega_id || !form.valor_pago) return;
    setLoadingSubmit(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('acertos_entregadores')
      .insert({
        entregador_id: form.entregador_id,
        entrega_id: form.entrega_id,
        valor_pago: Number(form.valor_pago),
        status: 'pendente',
      });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ entregador_id: '', entrega_id: '', valor_pago: '' });
    await fetchAll();
    setLoadingSubmit(false);
  };

  const handleTogglePago = async (id: string, status: Acerto['status']) => {
    setLoadingSubmit(true);
    setError(null);
    const novoStatus = status === 'pago' ? 'pendente' : 'pago';
    const payload = novoStatus === 'pago' ? { status: novoStatus, pago_em: new Date().toISOString() } : { status: novoStatus, pago_em: null };
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> } } })
      .from('acertos_entregadores')
      .update(payload)
      .eq('id', id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    await fetchAll();
    setLoadingSubmit(false);
  };

  const handleDelete = async (id: string) => {
    setLoadingSubmit(true);
    setError(null);
    const { error: delErr } = await supabase.from('acertos_entregadores').delete().eq('id', id);
    if (delErr) setError(delErr.message);
    await fetchAll();
    setLoadingSubmit(false);
  };

  const handleViewBankData = (entregadorId: string) => {
    const entregador = entregadores.find(e => e.id === entregadorId);
    if (entregador && entregador.dados_bancarios) {
      setSelectedBankData(entregador.dados_bancarios);
      setShowBankModal(true);
    } else {
      alert('Dados bancários não encontrados para este entregador.');
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Acerto de entregadores</h2>

      <ResumoFinanceiroEntregadores />

      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.entregador_id} onChange={(e) => setForm({ ...form, entregador_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Entregador</option>
            {entregadores.map((d) => (<option key={d.id} value={d.id}>{d.nome_completo}</option>))}
          </select>
          <select value={form.entrega_id} onChange={(e) => setForm({ ...form, entrega_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Entrega</option>
            {entregas.map((n) => (<option key={n.id} value={n.id}>{n.id}</option>))}
          </select>
          <input placeholder="Valor pago" value={form.valor_pago} onChange={(e) => setForm({ ...form, valor_pago: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loadingSubmit} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loadingSubmit ? 'Salvando...' : 'Registrar acerto'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 pt-3 border-b border-slate-200 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('pendente')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'pendente'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Pendentes ({items.filter((a) => a.status !== 'pago').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pago')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'pago'
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Pagos ({items.filter((a) => a.status === 'pago').length})
          </button>
        </div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.filter((a) => (activeTab === 'pago' ? a.status === 'pago' : a.status !== 'pago')).length === 0 ? (
          <div className="p-4 text-slate-600">{activeTab === 'pago' ? 'Nenhum acerto pago' : 'Nenhum acerto pendente'}</div>
        ) : (
          <div className="divide-y">
            {items.filter((a) => (activeTab === 'pago' ? a.status === 'pago' : a.status !== 'pago')).map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-slate-900">
                      {entregadores.find(e => e.id === a.entregador_id)?.nome_completo || a.entregador_id}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleViewBankData(a.entregador_id)}
                      className="text-gray-400 hover:text-sky-600 transition-colors"
                      title="Ver dados bancários"
                    >
                      <CreditCard size={16} />
                    </button>
                  </div>
                  <div className="text-sm text-slate-600">
                    {[a.entrega_id || 'Solicitação de Saque', a.valor_pago != null ? `R$ ${Number(a.valor_pago).toFixed(2)}` : '', a.status === 'pago' ? 'pago' : 'pendente'].filter(Boolean).join(' • ')}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {(a.entrega_id ? 'Registrado em' : 'Solicitado em')}: {formatDateTime(a.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleTogglePago(a.id, a.status)} className="text-sm text-sky-700">{a.status === 'pago' ? 'Desmarcar pago' : 'Marcar pago'}</button>
                  <button onClick={() => handleDelete(a.id)} className="text-sm text-red-700">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {showBankModal && selectedBankData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-100">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800">Dados Bancários</h3>
                  <p className="text-xs text-slate-500">Informações financeiras do entregador</p>
                </div>
              </div>
              <button onClick={() => setShowBankModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-all">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 bg-slate-50/30 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Nome do Titular */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 relative group hover:border-sky-300 transition-colors md:col-span-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Nome do Titular</span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8">{selectedBankData.nome_titular || '-'}</span>
                    <button 
                      onClick={() => copyToClipboard(selectedBankData.nome_titular, 'titular')}
                      className="text-slate-400 hover:text-sky-600 p-1.5 rounded-md hover:bg-sky-50 transition-all absolute right-2 top-1/2 -translate-y-1/2"
                      title="Copiar Titular"
                    >
                      {copiedField === 'titular' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* CPF/CNPJ */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 relative group hover:border-sky-300 transition-colors">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">CPF/CNPJ</span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8">{selectedBankData.cpf_cnpj || '-'}</span>
                    <button 
                      onClick={() => copyToClipboard(selectedBankData.cpf_cnpj, 'cpf')}
                      className="text-slate-400 hover:text-sky-600 p-1.5 rounded-md hover:bg-sky-50 transition-all absolute right-2 top-1/2 -translate-y-1/2"
                      title="Copiar CPF/CNPJ"
                    >
                      {copiedField === 'cpf' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Banco */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 relative group hover:border-sky-300 transition-colors">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Banco</span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8">{selectedBankData.banco || '-'}</span>
                    <button 
                      onClick={() => copyToClipboard(selectedBankData.banco, 'banco')}
                      className="text-slate-400 hover:text-sky-600 p-1.5 rounded-md hover:bg-sky-50 transition-all absolute right-2 top-1/2 -translate-y-1/2"
                      title="Copiar Banco"
                    >
                      {copiedField === 'banco' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Agência */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 relative group hover:border-sky-300 transition-colors">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Agência</span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8">{selectedBankData.agencia || '-'}</span>
                    <button 
                      onClick={() => copyToClipboard(selectedBankData.agencia, 'agencia')}
                      className="text-slate-400 hover:text-sky-600 p-1.5 rounded-md hover:bg-sky-50 transition-all absolute right-2 top-1/2 -translate-y-1/2"
                      title="Copiar Agência"
                    >
                      {copiedField === 'agencia' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Conta */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 relative group hover:border-sky-300 transition-colors">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Conta</span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8">
                      {selectedBankData.conta}{selectedBankData.digito ? '-' + selectedBankData.digito : ''}
                    </span>
                    <button 
                      onClick={() => copyToClipboard(`${selectedBankData.conta}${selectedBankData.digito ? '-' + selectedBankData.digito : ''}`, 'conta')}
                      className="text-slate-400 hover:text-sky-600 p-1.5 rounded-md hover:bg-sky-50 transition-all absolute right-2 top-1/2 -translate-y-1/2"
                      title="Copiar Conta"
                    >
                      {copiedField === 'conta' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Tipo de Conta */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 relative group hover:border-sky-300 transition-colors">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Tipo de Conta</span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8">
                      {selectedBankData.tipo_conta === 'poupanca' ? 'Poupança' : 'Corrente'}
                    </span>
                  </div>
                </div>

                {/* Chave PIX */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 relative group hover:border-emerald-400 transition-colors md:col-span-2">
                  <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Chave PIX
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8 text-lg">{selectedBankData.chave_pix || 'Não informada'}</span>
                    <button 
                      onClick={() => copyToClipboard(selectedBankData.chave_pix, 'pix')}
                      className="text-emerald-400 hover:text-emerald-700 p-1.5 rounded-md hover:bg-emerald-100 transition-all absolute right-2 top-1/2 -translate-y-1/2"
                      title="Copiar PIX"
                    >
                      {copiedField === 'pix' ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

              </div>
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button 
                onClick={() => setShowBankModal(false)} 
                className="px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors shadow-sm text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
