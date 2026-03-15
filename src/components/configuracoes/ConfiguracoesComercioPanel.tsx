import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, AlertCircle } from 'lucide-react';
import { Database } from '../../lib/database.types';

type ConfigComercio = Database['public']['Tables']['configuracoes_comercio']['Row'];
type Cliente = Database['public']['Tables']['clientes']['Row'];

export function ConfiguracoesComercioPanel() {
  const [config, setConfig] = useState<ConfigComercio | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [clientes, setClientes] = useState<Pick<Cliente, 'id' | 'nome_completo'>[]>([]);
  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [bloquearFinalizarPedido, setBloquearFinalizarPedido] = useState(false);
  const [loadingCliente, setLoadingCliente] = useState(false);
  const [savingCliente, setSavingCliente] = useState(false);
  const [clienteError, setClienteError] = useState<string | null>(null);
  const [clienteSuccess, setClienteSuccess] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    fetchClientes();
  }, []);

  useEffect(() => {
    if (!selectedClienteId) return;
    loadClienteConfig(selectedClienteId);
  }, [selectedClienteId]);

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

  const fetchClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome_completo')
        .order('nome_completo', { ascending: true });
      if (error) throw error;
      setClientes((data || []) as any);
    } catch (e: any) {
      console.error('Erro ao carregar comércios:', e);
    }
  };

  const parseClienteObservacoes = (raw: unknown) => {
    const text = String(raw ?? '').trim();
    if (!text) return { parsed: null as any, extras: {} as any, observacoesText: '' };
    if (!text.startsWith('{')) return { parsed: null as any, extras: {} as any, observacoesText: text };
    try {
      const parsed = JSON.parse(text);
      const extras = (parsed && typeof parsed === 'object' ? (parsed as any).extras : null) || {};
      const observacoesText = (parsed && typeof parsed === 'object' ? (parsed as any).observacoes : null) || '';
      return { parsed, extras, observacoesText };
    } catch (e) {
      void e;
      return { parsed: null as any, extras: {} as any, observacoesText: text };
    }
  };

  const loadClienteConfig = async (clienteId: string) => {
    setLoadingCliente(true);
    setClienteError(null);
    setClienteSuccess(false);
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('observacoes')
        .eq('id', clienteId)
        .maybeSingle();
      if (error) throw error;
      const { extras } = parseClienteObservacoes((data as any)?.observacoes);
      setBloquearFinalizarPedido(!!extras?.bloquear_finalizar_pedido);
    } catch (e: any) {
      console.error('Erro ao carregar config do comércio:', e);
      setClienteError(e?.message || 'Falha ao carregar configurações do comércio');
    } finally {
      setLoadingCliente(false);
    }
  };

  const handleSaveClienteConfig = async () => {
    if (!selectedClienteId) return;
    setSavingCliente(true);
    setClienteError(null);
    setClienteSuccess(false);

    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('observacoes')
        .eq('id', selectedClienteId)
        .maybeSingle();
      if (error) throw error;

      const { parsed, extras, observacoesText } = parseClienteObservacoes((data as any)?.observacoes);
      const nextExtras = { ...(extras || {}), bloquear_finalizar_pedido: bloquearFinalizarPedido };
      const nextPayload =
        parsed && typeof parsed === 'object'
          ? { ...(parsed as any), extras: nextExtras, observacoes: observacoesText }
          : { extras: nextExtras, observacoes: observacoesText };

      const mergedObs = JSON.stringify(nextPayload);

      const { error: updateError } = await supabase
        .from('clientes')
        .update({ observacoes: mergedObs, updated_at: new Date().toISOString() } as any)
        .eq('id', selectedClienteId);
      if (updateError) throw updateError;

      setClienteSuccess(true);
      setTimeout(() => setClienteSuccess(false), 3000);
    } catch (e: any) {
      console.error('Erro ao salvar config do comércio:', e);
      setClienteError(e?.message || 'Falha ao salvar configurações do comércio');
    } finally {
      setSavingCliente(false);
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

      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold text-slate-700">Permissões por Comércio</h3>
          <button
            onClick={handleSaveClienteConfig}
            disabled={!selectedClienteId || savingCliente || loadingCliente}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-sky-700 disabled:opacity-50"
          >
            <Save size={20} />
            {savingCliente ? 'Salvando...' : 'Salvar'}
          </button>
        </div>

        {clienteError && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2">
            <AlertCircle size={20} />
            {clienteError}
          </div>
        )}

        {clienteSuccess && (
          <div className="bg-emerald-50 text-emerald-600 p-4 rounded-lg flex items-center gap-2">
            <AlertCircle size={20} />
            Configurações do comércio salvas com sucesso!
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Selecionar comércio</label>
            <select
              value={selectedClienteId}
              onChange={(e) => setSelectedClienteId(e.target.value)}
              className="w-full border rounded p-2 bg-white"
            >
              <option value="">Selecione...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome_completo}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center justify-between cursor-pointer w-full">
              <span className="text-slate-700">Bloquear finalizar pedido no menu de pedidos</span>
              <div className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={bloquearFinalizarPedido}
                  disabled={!selectedClienteId || loadingCliente}
                  onChange={(e) => setBloquearFinalizarPedido(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
              </div>
            </label>
          </div>
        </div>
      </div>

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
