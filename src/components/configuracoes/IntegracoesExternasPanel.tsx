import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit, Trash2, AlertCircle } from 'lucide-react';
import { Database } from '../../lib/database.types';
import { Modal } from '../Modal';

type Integracao = Database['public']['Tables']['integracoes_externas']['Row'];

export function IntegracoesExternasPanel() {
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIntegracao, setEditingIntegracao] = useState<Integracao | null>(null);
  const [formData, setFormData] = useState<Partial<Integracao>>({
    tipo: 'api',
    ativo: true,
    config: {}
  });

  useEffect(() => {
    fetchIntegracoes();
  }, []);

  const fetchIntegracoes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('integracoes_externas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIntegracoes(data || []);
    } catch (error) {
      console.error('Erro ao buscar integrações:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingIntegracao) {
        const { error } = await (supabase
          .from('integracoes_externas') as any)
          .update(formData as any)
          .eq('id', editingIntegracao.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integracoes_externas')
          .insert(formData as any);
        if (error) throw error;
      }
      
      setIsModalOpen(false);
      fetchIntegracoes();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar integração');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta integração?')) return;
    try {
      const { error } = await supabase
        .from('integracoes_externas')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchIntegracoes();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir integração');
    }
  };

  const openModal = (integracao?: Integracao) => {
    if (integracao) {
      setEditingIntegracao(integracao);
      setFormData(integracao);
    } else {
      setEditingIntegracao(null);
      setFormData({
        tipo: 'api',
        ativo: true,
        config: {}
      });
    }
    setIsModalOpen(true);
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando integrações...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Integrações Externas</h1>
          <p className="text-slate-500">Gerencie integrações com sistemas externos (ERPs, Pagamentos, APIs).</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
        >
          <Plus size={20} />
          Nova Integração
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integracoes.map((int) => (
          <div key={int.id} className="bg-white rounded-xl shadow border border-slate-200 p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  int.tipo === 'pagamento' ? 'bg-green-100 text-green-600' :
                  int.tipo === 'erp' ? 'bg-blue-100 text-blue-600' :
                  'bg-purple-100 text-purple-600'
                }`}>
                  {int.tipo === 'pagamento' ? '$$' : int.tipo === 'erp' ? 'ERP' : 'API'}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{int.nome}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    int.ativo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {int.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => openModal(int)}
                  className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => handleDelete(int.id)}
                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            
            <div className="space-y-2 text-sm text-slate-600">
              {int.webhook_url && (
                <div className="flex items-center gap-2 truncate">
                  <span className="font-medium">Webhook:</span>
                  <span className="truncate">{int.webhook_url}</span>
                </div>
              )}
              <div className="text-xs text-slate-400 mt-4">
                ID: {int.id}
              </div>
            </div>
          </div>
        ))}
        
        {integracoes.length === 0 && (
          <div className="col-span-full text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
            <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
              <AlertCircle className="text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900">Nenhuma integração configurada</h3>
            <p className="text-slate-500">Clique em "Nova Integração" para começar.</p>
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingIntegracao ? 'Editar Integração' : 'Nova Integração'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nome</label>
            <input
              type="text"
              required
              value={formData.nome || ''}
              onChange={e => setFormData({ ...formData, nome: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Ex: Mercado Pago, Bling"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
              <select
                value={formData.tipo || 'api'}
                onChange={e => setFormData({ ...formData, tipo: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="api">API Genérica</option>
                <option value="pagamento">Pagamento</option>
                <option value="erp">ERP</option>
              </select>
            </div>

            <div className="flex items-center pt-6">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={formData.ativo || false}
                  onChange={(e) => setFormData({...formData, ativo: e.target.checked})}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                <span className="ml-3 text-sm font-medium text-slate-700">Ativo</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
            <input
              type="text"
              value={formData.api_key || ''}
              onChange={e => setFormData({ ...formData, api_key: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">API Secret</label>
            <input
              type="password"
              value={formData.api_secret || ''}
              onChange={e => setFormData({ ...formData, api_secret: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Webhook URL</label>
            <input
              type="url"
              value={formData.webhook_url || ''}
              onChange={e => setFormData({ ...formData, webhook_url: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="https://"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t mt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
            >
              {editingIntegracao ? 'Salvar Alterações' : 'Criar Integração'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
