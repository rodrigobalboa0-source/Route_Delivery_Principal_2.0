import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, AlertCircle } from 'lucide-react';
import { Database } from '../../lib/database.types';

type ConfigComercio = Database['public']['Tables']['configuracoes_comercio']['Row'];

export function ConfiguracoesComercioPanel() {
  const [config, setConfig] = useState<ConfigComercio | null>(null);
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
      
      const { data, error } = await supabase
        .from('configuracoes_comercio')
        .select('*')
        .order('updated_at', { ascending: false }); 

      if (error) throw error;

      if (!data || data.length === 0) {
            
            const { data: newData, error: createError } = await supabase
            .from('configuracoes_comercio')
            .insert({
              permitir_cadastro_entregador: true,
              exigir_aprovacao_entregador: true,
              limite_entregas_simultaneas: 1
            } as any)
            .select()
            .single();
          
          if (createError) throw createError;
          setConfig(newData);
          return;
      }

      
      if (data.length > 1) {
          const [keep, ...duplicates] = data;
          console.log(`Found ${duplicates.length} duplicate configurations. Cleaning up...`);
          
          const { error: deleteError } = await supabase
              .from('configuracoes_comercio')
              .delete()
              .in('id', duplicates.map(d => d.id));
              
          if (deleteError) {
              console.error('Error deleting duplicates:', deleteError);
          }
          
          setConfig(keep);
      } else {
          setConfig(data[0]);
      }

    } catch (err: any) {
      console.error('Erro ao carregar configurações:', err);
      setError(err.message || 'Falha ao carregar configurações');
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
        .from('configuracoes_comercio') as any)
        .update({
          permitir_cadastro_entregador: config.permitir_cadastro_entregador,
          exigir_aprovacao_entregador: config.exigir_aprovacao_entregador,
          limite_entregas_simultaneas: config.limite_entregas_simultaneas,
          raio_busca_entregador: config.raio_busca_entregador,
          tempo_aceite_pedido: config.tempo_aceite_pedido,
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
          <h1 className="text-2xl font-bold text-slate-900">Configurações de Comércio</h1>
          <p className="text-slate-500">Defina as regras de acesso e operação para comércios e entregadores.</p>
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
          <div className="p-6 space-y-6">
            
            <div className="border-b border-slate-100 pb-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Entregadores</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <div>
                    <div className="font-medium text-slate-900">Permitir cadastro autônomo</div>
                    <div className="text-xs text-slate-500">Entregadores podem se cadastrar pelo app</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={config.permitir_cadastro_entregador}
                      onChange={(e) => setConfig({...config, permitir_cadastro_entregador: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <div>
                    <div className="font-medium text-slate-900">Exigir aprovação</div>
                    <div className="text-xs text-slate-500">Cadastros precisam ser aprovados manualmente</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={config.exigir_aprovacao_entregador}
                      onChange={(e) => setConfig({...config, exigir_aprovacao_entregador: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Regras de Operação</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Limite de entregas simultâneas</label>
                  <input
                    type="number"
                    value={config.limite_entregas_simultaneas}
                    onChange={(e) => setConfig({...config, limite_entregas_simultaneas: parseInt(e.target.value) || 1})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Máximo de pedidos por entregador</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Raio de busca (km)</label>
                  <input
                    type="number"
                    value={config.raio_busca_entregador}
                    onChange={(e) => setConfig({...config, raio_busca_entregador: parseInt(e.target.value) || 10})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Distância para notificar entregadores</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tempo de aceite (segundos)</label>
                  <input
                    type="number"
                    value={config.tempo_aceite_pedido}
                    onChange={(e) => setConfig({...config, tempo_aceite_pedido: parseInt(e.target.value) || 30})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Tempo para entregador aceitar pedido</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
