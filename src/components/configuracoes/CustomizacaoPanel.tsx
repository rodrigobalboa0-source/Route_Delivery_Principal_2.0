import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { Database } from '../../lib/database.types';

type CustomizacaoApp = Database['public']['Tables']['customizacao_app']['Row'];

export function CustomizacaoPanel() {
  const [config, setConfig] = useState<CustomizacaoApp | null>(null);
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
        .from('customizacao_app')
        .select('*')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows, create default
          const { data: newData, error: createError } = await (supabase
            .from('customizacao_app') as any)
            .insert({})
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
      console.error('Erro ao carregar customização:', err);
      setError('Falha ao carregar customização');
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
        .from('customizacao_app') as any)
        .update({
          nome_app: config.nome_app,
          cor_primaria: config.cor_primaria,
          cor_secundaria: config.cor_secundaria,
          logotipo_url: config.logotipo_url,
          texto_boas_vindas: config.texto_boas_vindas,
          texto_rodape: config.texto_rodape,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', config.id);

      if (error) throw error;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      setError(err.message || 'Falha ao salvar customização');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando customização...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customização do Sistema</h1>
          <p className="text-slate-500">Personalize a aparência e identidade visual da aplicação.</p>
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
          Customização salva com sucesso!
        </div>
      )}

      {config && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Identidade Visual</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Aplicação</label>
                  <input
                    type="text"
                    value={config.nome_app || ''}
                    onChange={(e) => setConfig({...config, nome_app: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Logotipo (URL)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={config.logotipo_url || ''}
                      onChange={(e) => setConfig({...config, logotipo_url: e.target.value})}
                      placeholder="https://..."
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Insira a URL direta da imagem do logo</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Cores do Tema</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cor Primária</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={config.cor_primaria || '#0284c7'}
                      onChange={(e) => setConfig({...config, cor_primaria: e.target.value})}
                      className="h-10 w-10 p-0 border-0 rounded overflow-hidden cursor-pointer"
                    />
                    <input
                      type="text"
                      value={config.cor_primaria || ''}
                      onChange={(e) => setConfig({...config, cor_primaria: e.target.value})}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cor Secundária</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={config.cor_secundaria || '#0f172a'}
                      onChange={(e) => setConfig({...config, cor_secundaria: e.target.value})}
                      className="h-10 w-10 p-0 border-0 rounded overflow-hidden cursor-pointer"
                    />
                    <input
                      type="text"
                      value={config.cor_secundaria || ''}
                      onChange={(e) => setConfig({...config, cor_secundaria: e.target.value})}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Textos</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Título de Boas-vindas (Login)</label>
                  <input
                    type="text"
                    value={config.texto_boas_vindas || ''}
                    onChange={(e) => setConfig({...config, texto_boas_vindas: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Texto do Rodapé</label>
                  <input
                    type="text"
                    value={config.texto_rodape || ''}
                    onChange={(e) => setConfig({...config, texto_rodape: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Visualização</h3>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 p-4 border-b border-slate-200 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                </div>
                <div className="grid grid-cols-[200px_1fr] h-48">
                  <div style={{ backgroundColor: config.cor_secundaria || '#0f172a' }} className="p-4 text-white">
                    <div className="font-bold mb-4">{config.nome_app}</div>
                    <div className="space-y-2 opacity-70 text-xs">
                      <div className="h-2 w-20 bg-white/20 rounded"></div>
                      <div className="h-2 w-16 bg-white/20 rounded"></div>
                      <div className="h-2 w-24 bg-white/20 rounded"></div>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 relative">
                    <div className="absolute top-4 right-4 flex gap-2">
                      <div style={{ backgroundColor: config.cor_primaria || '#0284c7' }} className="h-8 w-24 rounded"></div>
                    </div>
                    <div className="mt-12 flex justify-center">
                      <div className="text-center">
                        {config.logotipo_url ? (
                          <img src={config.logotipo_url} alt="Logo" className="h-12 mx-auto mb-2 object-contain" />
                        ) : (
                          <div className="h-12 w-12 bg-slate-200 rounded-full mx-auto mb-2 flex items-center justify-center">
                            <ImageIcon size={20} className="text-slate-400" />
                          </div>
                        )}
                        <h4 className="font-bold text-slate-900">{config.texto_boas_vindas}</h4>
                      </div>
                    </div>
                    <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-slate-400">
                      {config.texto_rodape}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2 text-center">Pré-visualização aproximada do layout</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
