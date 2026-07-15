import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
type ContaPagar = any;

export function ContasPagarPanel() {
  const [items, setItems] = useState<ContaPagar[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ fornecedor: '', descricao: '', valor: '', vencimento: '' });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const p = supabase.from('contas_pagar').select('*').order('vencimento', { ascending: true });
      const result = await new Promise<{ data?: ContaPagar[]; error?: { message?: string } }>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), 8000);
        (p as unknown as { then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => unknown }).then(
          (v) => { clearTimeout(t); resolve(v as unknown as { data?: ContaPagar[]; error?: { message?: string } }); },
          (err) => { clearTimeout(t); reject(err); }
        );
      });
      if (result.error?.message) setError(result.error.message);
      setItems((result.data || []) as ContaPagar[]);
    } catch {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/contas_pagar?select=*&order=vencimento.asc`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
        if (r.ok) {
          setItems(await r.json());
          setError(null);
        } else {
          setError(`Falha ${r.status}`);
        }
      } catch (e2) {
        const msg = (e2 as { message?: string })?.message || 'Erro ao carregar contas a pagar';
        setError(msg);
      }
    } finally {
      setLoadingList(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.fornecedor || !form.descricao || !form.valor || !form.vencimento) return;
    setLoadingSubmit(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('contas_pagar')
      .insert({
        fornecedor: form.fornecedor,
        descricao: form.descricao,
        valor: Number(form.valor),
        vencimento: form.vencimento,
        status: 'pendente',
      });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ fornecedor: '', descricao: '', valor: '', vencimento: '' });
    await fetchAll();
    setLoadingSubmit(false);
  };

  const handleTogglePago = async (id: string, status: ContaPagar['status']) => {
    setLoadingSubmit(true);
    setError(null);
    const novoStatus = status === 'pago' ? 'pendente' : 'pago';
    const payload = novoStatus === 'pago' ? { status: novoStatus, pago_em: new Date().toISOString() } : { status: novoStatus, pago_em: null };
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> } } })
      .from('contas_pagar')
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
    const { error: delErr } = await supabase.from('contas_pagar').delete().eq('id', id);
    if (delErr) setError(delErr.message);
    await fetchAll();
    setLoadingSubmit(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Contas a pagar</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Fornecedor" value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Valor" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input type="date" placeholder="Vencimento" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loadingSubmit} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loadingSubmit ? 'Salvando...' : 'Adicionar conta'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Lista de contas</div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhuma conta</div>
        ) : (
          <div className="divide-y">
            {items.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{c.fornecedor}</div>
                  <div className="text-sm text-slate-600">{[c.descricao, c.valor != null ? `R$ ${c.valor}` : '', c.vencimento, c.status === 'pago' ? 'pago' : 'pendente'].filter(Boolean).join(' • ')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleTogglePago(c.id, c.status)} className="text-sm text-sky-700">{c.status === 'pago' ? 'Desmarcar pago' : 'Marcar pago'}</button>
                  <button onClick={() => handleDelete(c.id)} className="text-sm text-red-700">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
