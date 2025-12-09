import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, AlertCircle } from 'lucide-react';
import { Database } from '../../lib/database.types';

type ConfigFiscal = Database['public']['Tables']['config_fiscal']['Row'];

export function ConfigFiscalPanel() {
  const [config, setConfig] = useState<ConfigFiscal | null>(null);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('config_fiscal')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Create default config if not exists
          const { data: newData, error: createError } = await supabase
            .from('config_fiscal')
            .insert({
              user_id: user.id,
              ambiente: 'homologacao',
              impostos_padrao: {}
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
      console.error('Erro ao carregar configurações fiscais:', err);
      setError('Falha ao carregar configurações fiscais');
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
        .from('config_fiscal') as any)
        .update({
          cfop_padrao: config.cfop_padrao,
          ncm_padrao: config.ncm_padrao,
          ambiente: config.ambiente,
          cert_password: config.cert_password,
          // Note: cert_pfx_base64 is handled separately usually, but here we can update it if needed
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && config) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Extract just the base64 part
        const base64Data = base64String.split(',')[1];
        setConfig({ ...config, cert_pfx_base64: base64Data });
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando configurações...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configurações Fiscais</h1>
          <p className="text-slate-500">Gerencie certificado digital, CFOP e impostos.</p>
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
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Certificado Digital (A1)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Arquivo PFX</label>
                  <input
                    type="file"
                    accept=".pfx"
                    onChange={handleFileUpload}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
                  />
                  {config.cert_pfx_base64 && (
                    <p className="text-xs text-green-600 mt-1">Certificado carregado</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Senha do Certificado</label>
                  <input
                    type="password"
                    value={config.cert_password || ''}
                    onChange={(e) => setConfig({...config, cert_password: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="Senha do arquivo PFX"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ambiente</label>
                  <select
                    value={config.ambiente || 'homologacao'}
                    onChange={(e) => setConfig({...config, ambiente: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="homologacao">Homologação (Teste)</option>
                    <option value="producao">Produção</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Padrões de Emissão</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">CFOP Padrão</label>
                  <input
                    type="text"
                    value={config.cfop_padrao || ''}
                    onChange={(e) => setConfig({...config, cfop_padrao: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="Ex: 5102"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">NCM Padrão</label>
                  <input
                    type="text"
                    value={config.ncm_padrao || ''}
                    onChange={(e) => setConfig({...config, ncm_padrao: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="Ex: 00000000"
                  />
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
