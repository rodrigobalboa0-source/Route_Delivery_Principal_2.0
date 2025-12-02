import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Entrega = Database['public']['Tables']['nova_entrega']['Row'];
type Revisao = any;

export function RevisaoAgendamentosPanel() {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [items, setItems] = useState<Revisao[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ entrega_id: '', motivo: '', valor_original: '', valor_corrigido: '' });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const p = Promise.all([
        supabase.from('nova_entrega').select('id, cliente_id, status, created_at').order('created_at', { ascending: false }),
        supabase.from('revisoes_agendamentos').select('*').order('created_at', { ascending: false }),
      ]);
      const result = await new Promise<[
        { data?: Entrega[]; error?: { message?: string } },
        { data?: Revisao[]; error?: { message?: string } }
      ]>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), 8000);
        p.then(
          (v) => { clearTimeout(t); resolve(v as unknown as [
            { data?: Entrega[]; error?: { message?: string } },
            { data?: Revisao[]; error?: { message?: string } }
          ]); },
          (err) => { clearTimeout(t); reject(err); }
        );
      });
      const [eRes, rRes] = result;
      if (eRes.error?.message) setError(eRes.error.message);
      if (rRes.error?.message) setError(rRes.error.message);
      setEntregas((eRes.data || []) as Entrega[]);
      setItems((rRes.data || []) as Revisao[]);
    } catch {
      try {
        const [eR, rR] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/nova_entrega?select=id,cliente_id,status,created_at&order=created_at.desc`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
          fetch(`${SUPABASE_URL}/rest/v1/revisoes_agendamentos?select=*&order=created_at.desc`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
        ]);
        if (eR.ok) setEntregas(await eR.json());
        if (rR.ok) setItems(await rR.json());
        if (!eR.ok || !rR.ok) {
          const msg = `Falha ${(eR.ok ? '' : eR.status)} ${(rR.ok ? '' : rR.status)}`.trim();
          if (msg) setError(msg);
        } else {
          setError(null);
        }
      } catch (e2) {
        const msg = (e2 as { message?: string })?.message || 'Erro ao carregar revisões';
        setError(msg);
      }
    } finally {
      setLoadingList(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.entrega_id || !form.valor_original || !form.valor_corrigido) return;
    setLoadingSubmit(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('revisoes_agendamentos')
      .insert({
        entrega_id: form.entrega_id,
        motivo: form.motivo || null,
        valor_original: Number(form.valor_original),
        valor_corrigido: Number(form.valor_corrigido),
        status: 'pendente',
      });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ entrega_id: '', motivo: '', valor_original: '', valor_corrigido: '' });
    await fetchAll();
    setLoadingSubmit(false);
  };

  const handleToggleStatus = async (id: string, status: Revisao['status']) => {
    setLoadingSubmit(true);
    setError(null);
    const novoStatus = status === 'corrigido' ? 'pendente' : 'corrigido';
    const payload = novoStatus === 'corrigido' ? { status: novoStatus, revisado_em: new Date().toISOString() } : { status: novoStatus, revisado_em: null };
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> } } })
      .from('revisoes_agendamentos')
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
    await supabase.from('revisoes_agendamentos').delete().eq('id', id);
    await fetchAll();
    setLoadingSubmit(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Revisão de agendamentos (erros de cobrança)</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.entrega_id} onChange={(e) => setForm({ ...form, entrega_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Entrega</option>
            {entregas.map((n) => (
              <option key={n.id} value={n.id}>{n.id} • {n.status}</option>
            ))}
          </select>
          <input placeholder="Motivo" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Valor original" value={form.valor_original} onChange={(e) => setForm({ ...form, valor_original: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Valor corrigido" value={form.valor_corrigido} onChange={(e) => setForm({ ...form, valor_corrigido: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loadingSubmit} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loadingSubmit ? 'Salvando...' : 'Registrar revisão'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Revisões registradas</div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhuma revisão</div>
        ) : (
          <div className="divide-y">
            {items.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{a.entrega_id}</div>
                  <div className="text-sm text-slate-600">{[
                    a.motivo || '',
                    a.valor_original != null ? `R$ ${a.valor_original}` : '',
                    a.valor_corrigido != null ? `corrigido: R$ ${a.valor_corrigido}` : '',
                    a.status || '',
                  ].filter(Boolean).join(' • ')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleToggleStatus(a.id, a.status)} className="text-sm text-sky-700">{a.status === 'corrigido' ? 'Desmarcar corrigido' : 'Marcar corrigido'}</button>
                  <button onClick={() => handleDelete(a.id)} className="text-sm text-red-700">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
