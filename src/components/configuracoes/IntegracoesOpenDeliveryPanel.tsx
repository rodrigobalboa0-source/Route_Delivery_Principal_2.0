import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, AlertCircle, RefreshCw } from 'lucide-react';
import { Database } from '../../lib/database.types';

type ConfigOD = Database['public']['Tables']['integracoes_open_delivery']['Row'];

export function IntegracoesOpenDeliveryPanel() {
  const [config, setConfig] = useState<ConfigOD | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      // Fetch the first configuration found (assuming singleton)
      const { data, error } = await supabase
        .from('integracoes_open_delivery')
        .select('*')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Create default config if not exists
          const { data: newData, error: createError } = await supabase
            .from('integracoes_open_delivery')
            .insert({
              ativo: false,
              polling_interval: 30,
              status_mapping: {}
            } as any)
            .select()
            .single();
          
          if (createError) throw createError;
          setConfig(newData);
        } else {
          throw error;
        }
      } else {
        setConfig(data);
      }
    } catch (err: any) {
      console.error('Erro ao carregar configurações OD:', err);
      setError('Falha ao carregar configurações Open Delivery');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { error } = await (supabase
        .from('integracoes_open_delivery') as any)
        .update({
          merchant_id: config.merchant_id,
          client_id: config.client_id,
          client_secret: config.client_secret,
          polling_interval: config.polling_interval,
          ativo: config.ativo,
          updated_at: new Date().toISOString()
        })
        .eq('id', config.id);

      if (error) throw error;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      setError(err.message || 'Falha ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando configurações...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Integração Open Delivery</h1>
          <p className="text-slate-500">Configure a integração padrão ANR para recebimento de pedidos.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
        >
          <Save size={18} />
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 text-green-700 border border-green-200 rounded-lg">
          Configurações salvas com sucesso!
        </div>
      )}

      {config && (
        <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
          <div className="p-6 space-y-8">
            
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${config.ativo ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-500'}`}>
                  <RefreshCw size={24} />
                </div>
                <div>
                  <div className="font-medium text-slate-900">Integração Ativa</div>
                  <div className="text-xs text-slate-500">Habilitar sincronização de pedidos</div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={config.ativo || false}
                  onChange={(e) => setConfig({...config, ativo: e.target.checked})}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Merchant ID</label>
                <input
                  type="text"
                  value={config.merchant_id || ''}
                  onChange={(e) => setConfig({...config, merchant_id: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                  placeholder="UUID do estabelecimento no Open Delivery"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client ID</label>
                <input
                  type="text"
                  value={config.client_id || ''}
                  onChange={(e) => setConfig({...config, client_id: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client Secret</label>
                <input
                  type="password"
                  value={config.client_secret || ''}
                  onChange={(e) => setConfig({...config, client_secret: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Intervalo de Polling (segundos)</label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={config.polling_interval || 30}
                  onChange={(e) => setConfig({...config, polling_interval: parseInt(e.target.value) || 30})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-xs text-slate-500 mt-1">Tempo entre verificações de novos pedidos</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Status da Conexão</h3>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${config.ativo ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                <span className="text-slate-600">
                  {config.ativo ? 'Serviço rodando em background' : 'Serviço parado'}
                </span>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
