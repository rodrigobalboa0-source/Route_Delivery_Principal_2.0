import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';

type Cliente = { id: string; nome_completo: string };
type Endereco = { id: string; rua: string | null; numero: string | null; bairro: string | null; cidade: string | null };
type Pedido = { id: string; cliente_id: string; endereco_id: string | null; numero: string | null; item_descricao: string | null; endereco_texto: string | null; origem: 'manual' | 'online'; valor_total: number | null; status: 'criado' | 'confirmado' | 'em_preparo' | 'pronto' | 'cancelado' | 'entregue'; observacoes: string | null; created_at: string };

export function PedidosPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [items, setItems] = useState<Pedido[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ cliente_id: '', endereco_id: '', numero: '', item_descricao: '', endereco_texto: '', valor_total: '', status: 'criado' as Pedido['status'], observacoes: '' });

  useEffect(() => {
    fetchClientes();
    fetchPedidos();
  }, []);

  useEffect(() => {
    if (!form.cliente_id) { setEnderecos([]); setForm((p) => ({ ...p, endereco_id: '', endereco_texto: '' })); return; }
    fetchEnderecos(form.cliente_id);
  }, [form.cliente_id]);

  const fetchClientes = async () => {
    const { data, error } = await supabase.from('clientes').select('id, nome_completo').order('nome_completo');
    if (error) setError(error.message);
    setClientes(((data || []) as { id: string; nome_completo: string }[]).map((c) => ({ id: c.id, nome_completo: c.nome_completo })));
  };

  const fetchEnderecos = async (clienteId: string) => {
    const { data, error } = await supabase.from('cliente_enderecos').select('id, rua, numero, bairro, cidade').eq('cliente_id', clienteId).order('created_at');
    if (error) setError(error.message);
    setEnderecos(((data || []) as any[]).map((e) => ({ id: String(e.id), rua: e.rua ?? null, numero: e.numero ?? null, bairro: e.bairro ?? null, cidade: e.cidade ?? null })));
  };

  const fetchPedidos = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const p = supabase.from('pedidos').select('id, cliente_id, endereco_id, numero, item_descricao, endereco_texto, origem, valor_total, status, observacoes, created_at').order('created_at', { ascending: false });
      const result = await new Promise<{ data?: Pedido[]; error?: { message?: string } }>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), 8000);
        p.then((v) => { clearTimeout(t); resolve(v as unknown as { data?: Pedido[]; error?: { message?: string } }); }, (err) => { clearTimeout(t); reject(err); });
      });
      if (result.error?.message) setError(result.error.message);
      setItems((result.data || []) as Pedido[]);
    } catch {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?select=id,cliente_id,endereco_id,numero,item_descricao,endereco_texto,origem,valor_total,status,observacoes,created_at&order=created_at.desc`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
        if (r.ok) setItems((await r.json()) as Pedido[]);
      } catch (e) { void e; }
    } finally {
      setLoadingList(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.cliente_id || !form.numero) { setError('Informe cliente e número do pedido'); return; }
    setLoadingSubmit(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('pedidos').insert({
      cliente_id: form.cliente_id,
      endereco_id: form.endereco_id || null,
      numero: form.numero || null,
      item_descricao: form.item_descricao || null,
      endereco_texto: form.endereco_texto || null,
      origem: 'manual',
      itens: null,
      valor_total: form.valor_total ? Number(form.valor_total) : null,
      status: form.status,
      observacoes: form.observacoes || null,
    });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setForm({ cliente_id: '', endereco_id: '', numero: '', item_descricao: '', endereco_texto: '', valor_total: '', status: 'criado', observacoes: '' });
    await fetchPedidos();
    setLoadingSubmit(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('pedidos').delete().eq('id', id);
    await fetchPedidos();
  };

  const handleToggleStatus = async (id: string, status: Pedido['status']) => {
    const next: Pedido['status'] = status === 'criado' ? 'confirmado' : status === 'confirmado' ? 'em_preparo' : status === 'em_preparo' ? 'pronto' : status === 'pronto' ? 'entregue' : 'criado';
    await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> } } }).from('pedidos').update({ status: next }).eq('id', id);
    await fetchPedidos();
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Pedidos</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Comércio</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome_completo}</option>
            ))}
          </select>
          <select value={form.endereco_id} onChange={(e) => {
            const val = e.target.value;
            const found = enderecos.find((x) => x.id === val);
            const txt = found ? [found.rua || '', found.numero || '', found.bairro || '', found.cidade || ''].filter(Boolean).join(', ') : '';
            setForm({ ...form, endereco_id: val, endereco_texto: txt });
          }} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Endereço</option>
            {enderecos.map((e) => (
              <option key={e.id} value={e.id}>{[e.rua || '', e.numero || '', e.bairro || '', e.cidade || ''].filter(Boolean).join(', ')}</option>
            ))}
          </select>
          <input placeholder="Endereço completo" value={form.endereco_texto} onChange={(e) => setForm({ ...form, endereco_texto: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <input placeholder="Descrição do item para entrega" value={form.item_descricao} onChange={(e) => setForm({ ...form, item_descricao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
          <input placeholder="Número do pedido" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Valor total" value={form.valor_total} onChange={(e) => setForm({ ...form, valor_total: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Pedido['status'] })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="criado">Criado</option>
            <option value="confirmado">Confirmado</option>
            <option value="em_preparo">Em preparo</option>
            <option value="pronto">Pronto</option>
            <option value="cancelado">Cancelado</option>
            <option value="entregue">Entregue</option>
          </select>
          <input placeholder="Observações" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loadingSubmit} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loadingSubmit ? 'Salvando...' : 'Registrar pedido'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Pedidos</div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhum pedido</div>
        ) : (
          <div className="divide-y">
            {items.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{p.numero || p.id}</div>
                  <div className="text-sm text-slate-600">{[p.status || '', p.valor_total != null ? `R$ ${p.valor_total}` : '', p.origem || ''].filter(Boolean).join(' • ')}</div>
                  <div className="text-xs text-slate-700">{p.item_descricao || ''}</div>
                  <div className="text-xs text-slate-700">{p.endereco_texto || ''}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleToggleStatus(p.id, p.status)} className="text-sm text-sky-700">Avançar status</button>
                  <button onClick={() => handleDelete(p.id)} className="text-sm text-red-700">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
