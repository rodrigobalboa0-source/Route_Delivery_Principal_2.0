import { useState, useEffect } from 'react';
import { supabase, SUPABASE_URL } from '../../lib/supabase';
import { Plus, Edit, Trash2, AlertCircle, Store, Copy, Check } from 'lucide-react';
import { Database } from '../../lib/database.types';
import { Modal } from '../Modal';

type Integracao = Database['public']['Tables']['integracoes_cardapioweb']['Row'] & {
  clientes?: { nome_completo: string } | null;
};

type Cliente = {
  id: string;
  nome_completo: string;
};

// Usa a URL do Supabase do ambiente (self-hosted) — antes estava fixo no ref
// do projeto antigo do Supabase Cloud, que não recebe mais nada.
const WEBHOOK_URL = `${String(SUPABASE_URL || '').replace(/\/+$/, '')}/functions/v1/cardapioweb-webhook`;

export function CardapioWebPanel() {
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIntegracao, setEditingIntegracao] = useState<Integracao | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [formData, setFormData] = useState<Partial<Database['public']['Tables']['integracoes_cardapioweb']['Insert']>>({
    status: 'ativo'
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: intData, error: intError } = await supabase
        .from('integracoes_cardapioweb')
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

    } catch (err: any) {
      console.error('Erro ao buscar dados:', err);
      setError(err.message || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingIntegracao) {
        const { error } = await supabase
          .from('integracoes_cardapioweb')
          .update({
            merchant_id: formData.merchant_id,
            merchant_secret: formData.merchant_secret,
            status: formData.status
          })
          .eq('id', editingIntegracao.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integracoes_cardapioweb')
          .insert({
            cliente_id: formData.cliente_id!,
            merchant_id: formData.merchant_id!,
            merchant_secret: formData.merchant_secret,
            status: 'ativo'
          });

        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      alert(err.message || 'Erro ao salvar integração');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta integração?')) return;
    try {
      const { error } = await supabase
        .from('integracoes_cardapioweb')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      console.error('Erro ao excluir:', err);
      alert(err.message || 'Erro ao excluir integração');
    }
  };

  const openModal = (integracao?: Integracao) => {
    if (integracao) {
      setEditingIntegracao(integracao);
      setFormData({
        cliente_id: integracao.cliente_id,
        merchant_id: integracao.merchant_id,
        merchant_secret: integracao.merchant_secret,
        status: integracao.status
      });
    } else {
      setEditingIntegracao(null);
      setFormData({
        status: 'ativo',
        cliente_id: '',
        merchant_id: '',
        merchant_secret: ''
      });
    }
    setIsModalOpen(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando integrações...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Integração Cardápio Web</h2>
          <p className="text-sm text-slate-500">Conecte os comércios via API Open Delivery / Webhook.</p>
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

      <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h3 className="font-semibold text-blue-800 text-sm">Webhook URL</h3>
          <p className="text-xs text-blue-600 mt-1">Copie esta URL e configure no painel do Cardápio Web (Configurações &gt; Integrações &gt; API Open Delivery &gt; Webhook).</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded border border-blue-200 w-full md:w-auto">
          <code className="text-xs text-slate-600 truncate max-w-[250px]">{WEBHOOK_URL}</code>
          <button 
            onClick={copyToClipboard}
            className="text-slate-400 hover:text-blue-600 transition-colors"
            title="Copiar URL"
          >
            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
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
                <div className="bg-orange-50 p-2 rounded-lg">
                  <Store className="text-orange-600" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{int.clientes?.nome_completo || 'Comércio Desconhecido'}</h3>
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
                <span className="font-mono text-xs">{int.merchant_id || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Última Sync:</span>
                <span className="text-xs">{int.last_synced_at ? new Date(int.last_synced_at).toLocaleString() : 'Nunca'}</span>
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
        title={editingIntegracao ? 'Editar Integração' : 'Nova Integração Cardápio Web'}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">ID do Estabelecimento (Merchant ID)</label>
            <input
              type="text"
              required
              value={formData.merchant_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, merchant_id: e.target.value }))}
              className="w-full border rounded-lg p-2 bg-white font-mono text-sm"
              placeholder="Ex: 123456"
            />
            <p className="text-xs text-slate-500 mt-1">Obtenha este ID no painel do Cardápio Web.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Webhook Token (X-Webhook-Token)</label>
            <input
              type="password"
              value={formData.merchant_secret || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, merchant_secret: e.target.value }))}
              className="w-full border rounded-lg p-2 bg-white font-mono text-sm"
              placeholder="Cole o mesmo token configurado no Cardápio Web"
            />
            <p className="text-xs text-slate-500 mt-1">
              O Cardápio Web envia este token no header <code>X-Webhook-Token</code> de
              cada chamada. Defina o mesmo valor aqui e no portal do Cardápio Web
              (Configurações &gt; Integrações &gt; Webhook). Enquanto ficar em branco, o
              webhook aceita qualquer requisição — <strong>recomendado preencher</strong>.
            </p>
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
              className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium"
            >
              Salvar Integração
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
