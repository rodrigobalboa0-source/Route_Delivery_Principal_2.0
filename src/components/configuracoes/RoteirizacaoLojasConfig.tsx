import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, Route, Search, AlertCircle } from 'lucide-react';

interface LojaRoteirizacao {
  id: string;
  nome: string;
  roteirizacao_automatica: boolean;
  roteirizacao_qtd_pedidos: number;
  roteirizacao_tempo_segundos: number;
}

// Seção da aba Operação: por loja, escolher Roteirização Automática (o sistema
// agrupa/despacha os pedidos em lotes) ou Manual, e definir a quantidade de
// pedidos por rota quando a automática está ligada.
export function RoteirizacaoLojasConfig() {
  const [lojas, setLojas] = useState<LojaRoteirizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busca, setBusca] = useState('');
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome_fantasia, nome_completo, roteirizacao_automatica, roteirizacao_qtd_pedidos, roteirizacao_tempo_segundos')
        .order('nome_fantasia', { ascending: true });
      if (error) throw error;
      const lista: LojaRoteirizacao[] = (data || []).map((c: any) => ({
        id: String(c.id),
        nome: c.nome_fantasia || c.nome_completo || 'Loja sem nome',
        roteirizacao_automatica: Boolean(c.roteirizacao_automatica),
        roteirizacao_qtd_pedidos: Number(c.roteirizacao_qtd_pedidos) > 0 ? Number(c.roteirizacao_qtd_pedidos) : 1,
        roteirizacao_tempo_segundos: Number(c.roteirizacao_tempo_segundos) > 0 ? Number(c.roteirizacao_tempo_segundos) : 30,
      }));
      setLojas(lista);
      setDirty(new Set());
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar as lojas');
    } finally {
      setLoading(false);
    }
  }

  function alterar(id: string, patch: Partial<LojaRoteirizacao>) {
    setLojas((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setDirty((prev) => new Set(prev).add(id));
    setSuccess(false);
  }

  function marcarTodas(ativa: boolean) {
    setLojas((prev) => prev.map((l) => ({ ...l, roteirizacao_automatica: ativa })));
    setDirty((prev) => {
      const n = new Set(prev);
      lojas.forEach((l) => n.add(l.id));
      return n;
    });
    setSuccess(false);
  }

  async function salvar() {
    if (dirty.size === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const alvo = lojas.filter((l) => dirty.has(l.id));
      for (const l of alvo) {
        const qtd = l.roteirizacao_automatica ? Math.max(1, Math.floor(l.roteirizacao_qtd_pedidos || 1)) : (l.roteirizacao_qtd_pedidos || 1);
        const tempo = Math.max(5, Math.floor(l.roteirizacao_tempo_segundos || 30));
        const { error } = await (supabase.from('clientes') as any)
          .update({ roteirizacao_automatica: l.roteirizacao_automatica, roteirizacao_qtd_pedidos: qtd, roteirizacao_tempo_segundos: tempo })
          .eq('id', l.id);
        if (error) throw error;
      }
      setDirty(new Set());
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar a roteirização');
    } finally {
      setSaving(false);
    }
  }

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return lojas;
    return lojas.filter((l) => l.nome.toLowerCase().includes(q));
  }, [lojas, busca]);

  const totalAuto = lojas.filter((l) => l.roteirizacao_automatica).length;

  return (
    <div className="border-t border-slate-100 pt-6">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-100 text-sky-600">
            <Route size={22} />
          </div>
          <div>
            <div className="font-semibold text-slate-900">Roteirização automática por loja</div>
            <div className="text-xs text-slate-500 max-w-xl">
              Escolha, por loja, se a roteirização é <strong>Automática</strong> (o sistema agrupa e despacha os pedidos em lotes) ou <strong>Manual</strong>.
              Na automática, defina quantos pedidos entram em cada rota.
            </div>
          </div>
        </div>
        <button
          onClick={salvar}
          disabled={saving || dirty.size === 0}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? 'Salvando...' : dirty.size > 0 ? `Salvar (${dirty.size})` : 'Salvo'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle size={18} /> {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm">
          Roteirização salva com sucesso!
        </div>
      )}

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar loja..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div className="text-xs text-slate-500">{totalAuto} de {lojas.length} com automática</div>
        <button onClick={() => marcarTodas(true)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Ativar todas</button>
        <button onClick={() => marcarTodas(false)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Desativar todas</button>
      </div>

      {loading ? (
        <div className="p-6 text-center text-slate-500 text-sm">Carregando lojas...</div>
      ) : filtradas.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-sm">Nenhuma loja encontrada.</div>
      ) : (
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
          {filtradas.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{l.nome}</div>
                <div className="text-xs text-slate-500">{l.roteirizacao_automatica ? 'Automática' : 'Manual'}</div>
              </div>

              {l.roteirizacao_automatica && (
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Pedidos por rota</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={l.roteirizacao_qtd_pedidos}
                      onChange={(e) => alterar(l.id, { roteirizacao_qtd_pedidos: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500" title="O sistema espera esse tempo juntando pedidos antes de montar a rota automática.">Tempo p/ roteirizar (seg)</span>
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={l.roteirizacao_tempo_segundos}
                      onChange={(e) => alterar(l.id, { roteirizacao_tempo_segundos: Math.max(5, parseInt(e.target.value, 10) || 30) })}
                      className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>
              )}

              <label className="relative inline-flex items-center cursor-pointer" title={l.roteirizacao_automatica ? 'Automática ligada' : 'Manual'}>
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={l.roteirizacao_automatica}
                  onChange={(e) => alterar(l.id, { roteirizacao_automatica: e.target.checked })}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-sky-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-slate-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600" />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
