import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import type { Database } from '../../lib/database.types';

type Cliente = Database['public']['Tables']['clientes']['Row'];
type EnderecoInsert = Database['public']['Tables']['cliente_enderecos']['Insert'];
type EnderecoEdit = {
  id?: string;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  referencia_entrega?: string | null;
};

export function ClientesPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [editForm, setEditForm] = useState({
    nome_completo: '',
    cpf: '',
    data_nascimento: '',
    telefone: '',
    email: '',
    metodo_pagamento_preferido: '',
    observacoes: '',
  });
  const [editEnderecos, setEditEnderecos] = useState<EnderecoEdit[]>([]);
  const [editEnderecoNovo, setEditEnderecoNovo] = useState<EnderecoEdit>({ cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', referencia_entrega: '' });
  const [editEnderecosRemovidos, setEditEnderecosRemovidos] = useState<string[]>([]);

  const [form, setForm] = useState({
    nome_completo: '',
    cpf: '',
    data_nascimento: '',
    telefone: '',
    email: '',
    metodo_pagamento_preferido: '',
    observacoes: '',
  });
  const [enderecos, setEnderecos] = useState<EnderecoInsert[]>([]);
  const [enderecoAtual, setEnderecoAtual] = useState<EnderecoInsert>({
    cliente_id: '',
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    referencia_entrega: '',
  });

  useEffect(() => {
    fetchClientes();
  }, []);

  const fetchClientes = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('clientes').select('*').order('nome_completo');
    if (error) setError(error.message);
    setClientes(data || []);
    setLoading(false);
  };

  const addEndereco = () => {
    setEnderecos((prev) => [...prev, { ...enderecoAtual }]);
    setEnderecoAtual({ cliente_id: '', cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', referencia_entrega: '' });
  };

  const removeEndereco = (idx: number) => {
    setEnderecos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    const res = await sbInsert('clientes', {
      nome_completo: form.nome_completo,
      cpf: form.cpf || null,
      data_nascimento: form.data_nascimento || null,
      telefone: form.telefone || null,
      email: form.email || null,
      metodo_pagamento_preferido: form.metodo_pagamento_preferido || null,
      observacoes: form.observacoes || null,
    });
    const r = res as unknown as { data?: { id?: string }; error?: { message?: string } };
    if (r.error?.message) {
      setError(r.error.message);
      setLoading(false);
      return;
    }
    const cid = (r.data?.id || '') as string;
    for (const e of enderecos) {
      await sbInsert('cliente_enderecos', {
        cliente_id: cid,
        cep: e.cep || null,
        rua: e.rua || null,
        numero: e.numero || null,
        complemento: e.complemento || null,
        bairro: e.bairro || null,
        cidade: e.cidade || null,
        referencia_entrega: e.referencia_entrega || null,
      });
    }
    setForm({ nome_completo: '', cpf: '', data_nascimento: '', telefone: '', email: '', metodo_pagamento_preferido: '', observacoes: '' });
    setEnderecos([]);
    await fetchClientes();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('clientes').delete().eq('id', id);
    await fetchClientes();
  };

  const openEdit = async (c: Cliente) => {
    setEditing(c);
    setEditForm({
      nome_completo: c.nome_completo,
      cpf: c.cpf || '',
      data_nascimento: c.data_nascimento || '',
      telefone: c.telefone || '',
      email: c.email || '',
      metodo_pagamento_preferido: c.metodo_pagamento_preferido || '',
      observacoes: c.observacoes || '',
    });
    const { data } = await supabase.from('cliente_enderecos').select('*').eq('cliente_id', c.id).order('created_at');
    const lista = (data || []).map((e: any) => ({
      id: e.id as string,
      cep: e.cep ?? null,
      rua: e.rua ?? null,
      numero: e.numero ?? null,
      complemento: e.complemento ?? null,
      bairro: e.bairro ?? null,
      cidade: e.cidade ?? null,
      referencia_entrega: e.referencia_entrega ?? null,
    }));
    setEditEnderecos(lista);
    setEditEnderecoNovo({ cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', referencia_entrega: '' });
    setEditEnderecosRemovidos([]);
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setLoading(true);
    setError(null);
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> } } })
      .from('clientes')
      .update({
        nome_completo: editForm.nome_completo,
        cpf: editForm.cpf || null,
        data_nascimento: editForm.data_nascimento || null,
        telefone: editForm.telefone || null,
        email: editForm.email || null,
        metodo_pagamento_preferido: editForm.metodo_pagamento_preferido || null,
        observacoes: editForm.observacoes || null,
      })
      .eq('id', editing.id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    if (!r.error?.message) {
      const updates = editEnderecos.filter((e) => e.id).map((e) =>
        (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> } } })
          .from('cliente_enderecos')
          .update({
            cep: e.cep ?? null,
            rua: e.rua ?? null,
            numero: e.numero ?? null,
            complemento: e.complemento ?? null,
            bairro: e.bairro ?? null,
            cidade: e.cidade ?? null,
            referencia_entrega: e.referencia_entrega ?? null,
          })
          .eq('id', e.id as string)
      );
      const inserts = editEnderecos.filter((e) => !e.id).map((e) =>
        sbInsert('cliente_enderecos', {
          cliente_id: editing.id as string,
          cep: e.cep ?? null,
          rua: e.rua ?? null,
          numero: e.numero ?? null,
          complemento: e.complemento ?? null,
          bairro: e.bairro ?? null,
          cidade: e.cidade ?? null,
          referencia_entrega: e.referencia_entrega ?? null,
        })
      );
      const deletes = editEnderecosRemovidos.map((id) => supabase.from('cliente_enderecos').delete().eq('id', id));
      await Promise.all([...updates, ...inserts, ...deletes]);
    }
    setEditing(null);
    setLoading(false);
    await fetchClientes();
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Clientes</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-700">Nome completo</label>
            <input value={form.nome_completo} onChange={(e) => setForm({ ...form, nome_completo: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">CNPJ ou CPF</label>
            <input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <div className="text-[11px] text-slate-500 mt-1">Informe o CNPJ ou CPF do comércio ou pessoa</div>
          </div>
          <div>
            <label className="text-xs text-slate-700">Data de nascimento</label>
            <input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Telefone / WhatsApp</label>
            <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">E-mail</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Método de pagamento preferido</label>
            <input value={form.metodo_pagamento_preferido} onChange={(e) => setForm({ ...form, metodo_pagamento_preferido: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-700">Observações</label>
            <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
        </div>
        <div className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input placeholder="CEP" value={enderecoAtual.cep || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, cep: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Rua" value={enderecoAtual.rua || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, rua: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Número" value={enderecoAtual.numero || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, numero: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Complemento" value={enderecoAtual.complemento || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, complemento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Bairro" value={enderecoAtual.bairro || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, bairro: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Cidade" value={enderecoAtual.cidade || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, cidade: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Referência de entrega" value={enderecoAtual.referencia_entrega || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, referencia_entrega: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-3" />
          </div>
          <button onClick={addEndereco} className="mt-3 px-3 py-2 rounded bg-slate-200 text-slate-800 text-sm">Adicionar endereço</button>
          {enderecos.length > 0 && (
            <div className="mt-3 space-y-2">
              {enderecos.map((e, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 border border-slate-200 rounded">
                  <div className="text-sm text-slate-700">{[e.rua, e.numero, e.bairro, e.cidade].filter(Boolean).join(', ')}</div>
                  <button onClick={() => removeEndereco(i)} className="text-xs text-red-700">Remover</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar cliente'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Lista de clientes</div>
        {loading ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : clientes.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhum cliente cadastrado</div>
        ) : (
          <div className="divide-y">
            {clientes.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{c.nome_completo}</div>
                  <div className="text-sm text-slate-600">{[c.telefone, c.email].filter(Boolean).join(' • ')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => openEdit(c)} className="text-sm text-sky-700">Editar</button>
                  <button onClick={() => handleDelete(c.id)} className="text-sm text-red-700">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Modal
        open={Boolean(editing)}
        title="Editar cliente"
        onClose={() => setEditing(null)}
        onConfirm={handleUpdate}
        confirmDisabled={loading}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-700">Nome completo</label>
            <input value={editForm.nome_completo} onChange={(e) => setEditForm({ ...editForm, nome_completo: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">CNPJ ou CPF</label>
            <input value={editForm.cpf} onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <div className="text-[11px] text-slate-500 mt-1">Informe o CNPJ ou CPF do comércio ou pessoa</div>
          </div>
          <div>
            <label className="text-xs text-slate-700">Data de nascimento</label>
            <input type="date" value={editForm.data_nascimento} onChange={(e) => setEditForm({ ...editForm, data_nascimento: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Telefone / WhatsApp</label>
            <input value={editForm.telefone} onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">E-mail</label>
            <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Método de pagamento preferido</label>
            <input value={editForm.metodo_pagamento_preferido} onChange={(e) => setEditForm({ ...editForm, metodo_pagamento_preferido: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-700">Observações</label>
            <textarea value={editForm.observacoes} onChange={(e) => setEditForm({ ...editForm, observacoes: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
        </div>
        <div className="mt-4">
          <div className="text-sm font-medium text-slate-900 mb-2">Endereços</div>
          {editEnderecos.length === 0 ? (
            <div className="text-sm text-slate-600 mb-2">Nenhum endereço cadastrado</div>
          ) : (
            <div className="space-y-3">
              {editEnderecos.map((e, i) => (
                <div key={e.id || `novo-${i}`} className="grid grid-cols-1 md:grid-cols-3 gap-3 border border-slate-200 rounded p-3">
                  <input placeholder="CEP" value={e.cep || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, cep: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded" />
                  <input placeholder="Rua" value={e.rua || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, rua: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded" />
                  <input placeholder="Número" value={e.numero || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, numero: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded" />
                  <input placeholder="Complemento" value={e.complemento || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, complemento: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded" />
                  <input placeholder="Bairro" value={e.bairro || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, bairro: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded" />
                  <input placeholder="Cidade" value={e.cidade || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, cidade: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded" />
                  <input placeholder="Referência de entrega" value={e.referencia_entrega || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, referencia_entrega: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded md:col-span-3" />
                  <div className="md:col-span-3 flex justify-end">
                    <button
                      onClick={() => {
                        setEditEnderecos((prev) => prev.filter((_, idx) => idx !== i));
                        if (e.id) setEditEnderecosRemovidos((prev) => [...prev, e.id as string]);
                      }}
                      className="text-sm text-red-700"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <input placeholder="CEP" value={editEnderecoNovo.cep || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, cep: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Rua" value={editEnderecoNovo.rua || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, rua: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Número" value={editEnderecoNovo.numero || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, numero: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Complemento" value={editEnderecoNovo.complemento || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, complemento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Bairro" value={editEnderecoNovo.bairro || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, bairro: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Cidade" value={editEnderecoNovo.cidade || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, cidade: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Referência de entrega" value={editEnderecoNovo.referencia_entrega || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, referencia_entrega: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-3" />
          </div>
          <button
            onClick={() => {
              setEditEnderecos((prev) => [...prev, { ...editEnderecoNovo }]);
              setEditEnderecoNovo({ cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', referencia_entrega: '' });
            }}
            className="mt-3 px-3 py-2 rounded bg-slate-200 text-slate-800 text-sm"
          >
            Adicionar endereço
          </button>
        </div>
      </Modal>
    </div>
  );
}
  const sbInsert = (table: string, values: unknown) => (supabase as unknown as { from: (rel: string) => { insert: (vals: unknown) => Promise<unknown> } }).from(table).insert(values);
