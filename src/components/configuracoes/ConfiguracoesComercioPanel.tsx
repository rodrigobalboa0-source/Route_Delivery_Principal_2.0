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
              limite_entregas_simultaneas: 1,
              permitir_pedido_pronto: true
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
      const { error } = await supabase
        .from('configuracoes_comercio')
        .upsert({
          ...config,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      console.error(e);
      setError('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando configurações...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800">Configurações Gerais do Comércio</h2>
        <button 
          onClick={handleSave} 
          disabled={saving}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 text-emerald-600 p-4 rounded-lg flex items-center gap-2">
          <AlertCircle size={20} />
          Configurações salvas com sucesso!
        </div>
      )}

      {config && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-semibold text-slate-700 border-b pb-2 mb-4">Entregadores</h3>
            
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-slate-700">Permitir auto-cadastro</span>
              <div className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={config.permitir_cadastro_entregador}
                  onChange={e => setConfig({...config, permitir_cadastro_entregador: e.target.checked})}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </div>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-slate-700">Exigir aprovação de cadastro</span>
              <div className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={config.exigir_aprovacao_entregador}
                  onChange={e => setConfig({...config, exigir_aprovacao_entregador: e.target.checked})}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </div>
            </label>
            
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-slate-700">Permitir Comerciante Alocar Entregador</span>
              <div className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={config.permitir_alocar_entregador || false}
                  onChange={e => setConfig({...config, permitir_alocar_entregador: e.target.checked})}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </div>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-slate-700">Permitir Comerciante Marcar Pedido Pronto</span>
              <div className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={config.permitir_pedido_pronto || false}
                  onChange={e => setConfig({...config, permitir_pedido_pronto: e.target.checked})}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </div>
            </label>

            <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Limite de Entregas Simultâneas</label>
               <input 
                 type="number" 
                 min="1" 
                 max="10"
                 className="w-full border rounded p-2"
                 value={config.limite_entregas_simultaneas}
                 onChange={e => setConfig({...config, limite_entregas_simultaneas: parseInt(e.target.value)})}
               />
               <p className="text-xs text-slate-500 mt-1">Quantas entregas um entregador pode pegar ao mesmo tempo.</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-semibold text-slate-700 border-b pb-2 mb-4">Operação</h3>

            <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Raio de Busca (km)</label>
               <input 
                 type="number" 
                 min="1" 
                 max="50"
                 className="w-full border rounded p-2"
                 value={config.raio_busca_entregador}
                 onChange={e => setConfig({...config, raio_busca_entregador: parseInt(e.target.value)})}
               />
               <p className="text-xs text-slate-500 mt-1">Raio para notificar entregadores de novos pedidos.</p>
            </div>

            <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Tempo para Aceite (segundos)</label>
               <input 
                 type="number" 
                 min="10" 
                 max="300"
                 className="w-full border rounded p-2"
                 value={config.tempo_aceite_pedido}
                 onChange={e => setConfig({...config, tempo_aceite_pedido: parseInt(e.target.value)})}
               />
               <p className="text-xs text-slate-500 mt-1">Tempo que o pedido fica disponível para aceite antes de mudar de status ou notificar outros.</p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
