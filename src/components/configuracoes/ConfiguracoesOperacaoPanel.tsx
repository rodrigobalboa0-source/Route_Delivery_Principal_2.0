import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, AlertCircle, Clock, DollarSign, Settings, Zap } from 'lucide-react';
import { Database } from '../../lib/database.types';

type ConfigOperacao = Database['public']['Tables']['configuracoes_operacao']['Row'];

export function ConfiguracoesOperacaoPanel() {
  const [config, setConfig] = useState<ConfigOperacao | null>(null);
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
        .from('configuracoes_operacao')
        .select('*')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          const { data: newData, error: createError } = await supabase
            .from('configuracoes_operacao')
            .insert({
              taxa_servico: 0,
              pedido_minimo: 0,
              tempo_preparo_padrao: 30,
              modo_automatico: false,
              taxa_saque_rapido: 0
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
      console.error('Erro ao carregar configurações:', err);
      setError(err.message || 'Falha ao carregar configurações de operação');
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
        .from('configuracoes_operacao') as any)
        .update({
          taxa_servico: config.taxa_servico,
          pedido_minimo: config.pedido_minimo,
          tempo_preparo_padrao: config.tempo_preparo_padrao,
          modo_automatico: config.modo_automatico,
          taxa_saque_rapido: config.taxa_saque_rapido,
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
          <h1 className="text-2xl font-bold text-slate-900">Configurações de Operação</h1>
          <p className="text-slate-500">Defina regras gerais de funcionamento e automação.</p>
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
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2 mb-2 text-slate-900 font-medium">
                  <DollarSign size={18} className="text-sky-600" />
                  Taxa de Serviço (%)
                </div>
                <input
                  type="number"
                  value={config.taxa_servico || 0}
                  onChange={(e) => setConfig({...config, taxa_servico: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2 mb-2 text-slate-900 font-medium">
                  <DollarSign size={18} className="text-sky-600" />
                  Pedido Mínimo (R$)
                </div>
                <input
                  type="number"
                  value={config.pedido_minimo || 0}
                  onChange={(e) => setConfig({...config, pedido_minimo: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2 mb-2 text-slate-900 font-medium">
                  <Clock size={18} className="text-sky-600" />
                  Tempo Preparo (min)
                </div>
                <input
                  type="number"
                  value={config.tempo_preparo_padrao || 30}
                  onChange={(e) => setConfig({...config, tempo_preparo_padrao: parseInt(e.target.value) || 30})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2 mb-2 text-slate-900 font-medium">
                  <Zap size={18} className="text-sky-600" />
                  Taxa Saque Rápido (%)
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={config.taxa_saque_rapido || 0}
                  onChange={(e) => setConfig({...config, taxa_saque_rapido: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="0.00"
                />
                <p className="text-xs text-slate-500 mt-1">Porcentagem descontada no saque rápido.</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.modo_automatico ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>
                    <Settings size={24} />
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">Modo Automático</div>
                    <div className="text-xs text-slate-500">O sistema gerencia status e atribuições automaticamente</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={config.modo_automatico || false}
                    onChange={(e) => setConfig({...config, modo_automatico: e.target.checked})}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                </label>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
