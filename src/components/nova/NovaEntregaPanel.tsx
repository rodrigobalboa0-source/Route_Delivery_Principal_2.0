import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Cliente = Database['public']['Tables']['clientes']['Row'];
type Endereco = Database['public']['Tables']['cliente_enderecos']['Row'];
type Entregador = Database['public']['Tables']['entregadores']['Row'];
type TipoServico = Database['public']['Tables']['tipo_servicos']['Row'];
type ModalRow = Database['public']['Tables']['modais']['Row'];

export function NovaEntregaPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [enderecos, setEnderecos] = useState<Endereco[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [tipos, setTipos] = useState<TipoServico[]>([]);
  const [modais, setModais] = useState<ModalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    cliente_id: '',
    endereco_id: '',
    tipo_servico_id: '',
    modal_tipo: '',
    atribuicao_modo: 'automatica' as 'manual' | 'automatica',
    entregador_id: '',
    observacoes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (form.cliente_id) fetchEnderecos(form.cliente_id);
    else setEnderecos([]);
  }, [form.cliente_id]);

  const fetchData = async () => {
    const [c, e, t, m] = await Promise.all([
      supabase.from('clientes').select('id, nome_completo').order('nome_completo'),
      supabase.from('entregadores').select('id, nome_completo, status').order('nome_completo'),
      supabase.from('tipo_servicos').select('*').eq('ativo', true).order('nome'),
      supabase.from('modais').select('*').eq('ativo', true).order('tipo'),
    ]);
    setClientes((c.data || []) as Cliente[]);
    setEntregadores((e.data || []) as Entregador[]);
    setTipos((t.data || []) as TipoServico[]);
    setModais((m.data || []) as ModalRow[]);
  };

  const fetchEnderecos = async (clienteId: string) => {
    const { data } = await supabase.from('cliente_enderecos').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false });
    setEnderecos((data || []) as Endereco[]);
  };

  const pickEntregadorAutomatico = (): string | null => {
    const ativos = entregadores.filter((e) => e.status === 'ativo');
    return ativos.length > 0 ? ativos[0].id : null;
  };

  const handleSubmit = async () => {
    if (!form.cliente_id || !form.endereco_id || !form.modal_tipo) {
      setError('Preencha cliente, endereço e modal');
      return;
    }
    setLoading(true);
    setError(null);
    const entregadorEscolhido = form.atribuicao_modo === 'automatica' ? pickEntregadorAutomatico() : (form.entregador_id || null);
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
      .from('nova_entrega')
      .insert({
        cliente_id: form.cliente_id,
        endereco_id: form.endereco_id,
        tipo_servico_id: form.tipo_servico_id || null,
        modal_tipo: (form.modal_tipo || null) as ModalRow['tipo'],
        atribuicao_modo: form.atribuicao_modo,
        entregador_id: entregadorEscolhido,
        opcionais: null,
        observacoes: form.observacoes || null,
        status: entregadorEscolhido ? 'atribuida' : 'criada',
      });
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    else {
      setForm({ cliente_id: '', endereco_id: '', tipo_servico_id: '', modal_tipo: '', atribuicao_modo: 'automatica', entregador_id: '', observacoes: '' });
    }
    setLoading(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Criar nova entrega</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value, endereco_id: '' })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome_completo || 'Cliente'}</option>
            ))}
          </select>
          <select value={form.endereco_id} onChange={(e) => setForm({ ...form, endereco_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Endereço</option>
            {enderecos.map((e) => (
              <option key={e.id} value={e.id}>{[e.rua, e.numero, e.bairro].filter(Boolean).join(', ')}</option>
            ))}
          </select>
          <select value={form.tipo_servico_id} onChange={(e) => setForm({ ...form, tipo_servico_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Tipo de serviço</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
          <select value={form.modal_tipo} onChange={(e) => setForm({ ...form, modal_tipo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Modal</option>
            {modais.map((m) => (
              <option key={m.id} value={m.tipo}>{m.tipo}</option>
            ))}
          </select>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-700">Atribuição:</label>
            <select value={form.atribuicao_modo} onChange={(e) => setForm({ ...form, atribuicao_modo: e.target.value as 'manual' | 'automatica' })} className="px-3 py-2 border border-slate-300 rounded">
              <option value="automatica">Automática</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          {form.atribuicao_modo === 'manual' && (
            <select value={form.entregador_id} onChange={(e) => setForm({ ...form, entregador_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
              <option value="">Entregador</option>
              {entregadores.map((d) => (
                <option key={d.id} value={d.id}>{d.nome_completo}</option>
              ))}
            </select>
          )}
          <input placeholder="Observações" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loading ? 'Criando...' : 'Criar entrega'}
          </button>
        </div>
      </div>
    </div>
  );
}
