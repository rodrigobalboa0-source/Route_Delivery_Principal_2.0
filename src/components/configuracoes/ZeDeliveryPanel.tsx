import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit, Trash2, AlertCircle, Store, RefreshCw } from 'lucide-react';
import { Database } from '../../lib/database.types';
import { Modal } from '../Modal';

type Integracao = Database['public']['Tables']['integracoes_ze']['Row'] & {
  clientes?: { nome_completo: string } | null;
};

type Cliente = { id: string; nome_completo: string };

export function ZeDeliveryPanel() {
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIntegracao, setEditingIntegracao] = useState<Integracao | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<Database['public']['Tables']['integracoes_ze']['Insert']>>({
    status: 'ativo'
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: intData, error: intError } = await supabase
        .from('integracoes_ze')
        .select('*, clientes(nome_completo)')
        .order('created_at', { ascending: false });
      if (intError) throw intError;

      const { data: cliData, error: cliError } = await supabase
        .from('clientes')
        .select('id, nome_completo')
        .order('nome_completo');
      if (cliError) throw cliError;

      setIntegracoes(intData || []);
      setClientes(cliData || []);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingIntegracao) {
        const { error } = await supabase
          .from('integracoes_ze')
          .update({
            merchant_id: formData.merchant_id,
            api_key: formData.api_key,
            status: formData.status
          })
          .eq('id', editingIntegracao.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integracoes_ze')
          .insert({
            cliente_id: formData.cliente_id!,
            merchant_id: formData.merchant_id!,
            api_key: formData.api_key || null,
            status: 'ativo'
          });
        if (error) throw error;
      }
      setIsModalOpen(false);
      fetchData();
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar integração');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta integração do Zé Delivery?')) return;
    const { error } = await supabase.from('integracoes_ze').delete().eq('id', id);
    if (error) {
      alert(error.message);
    } else {
      fetchData();
    }
  };

  const handleManualSync = async (id: string) => {
    setSyncingId(id);
    try {
      const { error } = await supabase.functions.invoke('ze-sync');
      if (error) throw error;
      await fetchData();
      alert('Sincronização solicitada.');
    } catch (e: any) {
      alert(e.message || 'Falha ao sincronizar');
    } finally {
      setSyncingId(null);
    }
  };

  const openModal = (integracao?: Integracao) => {
    if (integracao) {
      setEditingIntegracao(integracao);
      setFormData({
        cliente_id: integracao.cliente_id,
        merchant_id: integracao.merchant_id,
        api_key: integracao.api_key,
        status: integracao.status
      });
    } else {
      setEditingIntegracao(null);
      setFormData({
        status: 'ativo',
        cliente_id: '',
        merchant_id: '',
        api_key: ''
      });
    }
    setIsModalOpen(true);
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando integrações...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Integração Zé Delivery</h2>
          <p className="text-sm text-slate-500">Conecte com a Seller API do Zé Delivery.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openModal()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus size={20} />
            Nova Integração
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integracoes.map((int) => (
          <div key={int.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-amber-50 p-2 rounded-lg">
                  <Store className="text-amber-600" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{int.clientes?.nome_completo || 'Comércio'}</h3>
                  <div className="flex items-center gap-1 text-xs">
                    <span className={`w-2 h-2 rounded-full ${int.status === 'ativo' ? 'bg-green-500' : int.status === 'erro' ? 'bg-red-500' : 'bg-slate-400'}`} />
                    <span className="text-slate-500 capitalize">{int.status}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => openModal(int)}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Editar"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => handleDelete(int.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Excluir"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-600 bg-slate-50 p-3 rounded border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500">Merchant ID:</span>
                <span className="font-mono text-xs">{int.merchant_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500">Última Sync: {int.last_synced_at ? new Date(int.last_synced_at).toLocaleString() : 'Nunca'}</div>
                <button
                  onClick={() => handleManualSync(int.id)}
                  disabled={syncingId === int.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-amber-600 text-white text-xs hover:bg-amber-700 disabled:opacity-60"
                >
                  <RefreshCw size={14} className={syncingId === int.id ? 'animate-spin' : ''} />
                  Sincronizar agora
                </button>
              </div>
            </div>
          </div>
        ))}

        {integracoes.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
            <Store size={48} className="mx-auto mb-4 opacity-50" />
            <p>Nenhuma integração configurada.</p>
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingIntegracao ? 'Editar Integração Zé Delivery' : 'Nova Integração Zé Delivery'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Comércio</label>
            <select
              required
              value={formData.cliente_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, cliente_id: e.target.value }))}
              className="w-full border rounded-lg p-2 bg-white"
              disabled={!!editingIntegracao}
            >
              <option value="">Selecione um comércio...</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nome_completo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Merchant ID</label>
            <input
              type="text"
              required
              value={formData.merchant_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, merchant_id: e.target.value }))}
              className="w-full border rounded-lg p-2 bg-white font-mono text-sm"
              placeholder="Ex: 123456"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">API Key / Token</label>
            <input
              type="password"
              value={formData.api_key || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
              className="w-full border rounded-lg p-2 bg-white font-mono text-sm"
              placeholder="Opcional para testes via webhook"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              value={formData.status || 'ativo'}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
              className="w-full border rounded-lg p-2 bg-white"
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
              <option value="erro">Erro</option>
            </select>
          </div>
          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
            >
              Salvar Integração
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
