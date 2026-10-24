import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { clearMapaConfigCache } from '../../lib/mapaConfig';
import { Map as MapIcon, Loader2, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';

/**
 * Configuração de Mapa / Geolocalização (aba Configurações).
 * - Escolhe o provedor da GEOLOCALIZAÇÃO: OpenStreetMap (padrão, sem chave) ou
 *   Google (Geocoding API para endereço + Routes API para rota/distância).
 * - Define/testa/remove a chave do Google.
 * O MAPA (tiles) é sempre OpenStreetMap. Salva em `configuracoes_mapa` e limpa
 * o cache para valer na hora.
 */
export function MapaGeolocalizacaoPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [id, setId] = useState<string | null>(null);
  const [provider, setProvider] = useState<'google' | 'openstreetmap'>('openstreetmap');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    void fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('configuracoes_mapa')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const d = data as any;
        setId(d.id ?? null);
        setProvider((d.provider as 'google' | 'openstreetmap') || 'openstreetmap');
        setApiKey(String(d.google_maps_api_key || ''));
      }
    } catch {
      setError('Não foi possível carregar. (A tabela pode ainda não existir — aplique a migration configuracoes_mapa.)');
    } finally {
      setLoading(false);
    }
  };

  const save = async (next?: Partial<{ provider: 'google' | 'openstreetmap'; apiKey: string }>) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const payload = {
      provider: next?.provider ?? provider,
      google_maps_api_key: (next?.apiKey ?? apiKey).trim() || null,
      updated_at: new Date().toISOString(),
    };
    try {
      if (id) {
        const { error } = await (supabase.from('configuracoes_mapa') as any).update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase.from('configuracoes_mapa') as any).insert(payload).select().single();
        if (error) throw error;
        setId((data as any)?.id ?? null);
      }
      clearMapaConfigCache();
      setSuccess('Configuração salva.');
    } catch {
      setError('Não foi possível salvar. (Aplique a migration configuracoes_mapa no seu Supabase.)');
    } finally {
      setSaving(false);
    }
  };

  const removerChave = async () => {
    setApiKey('');
    setProvider('openstreetmap');
    await save({ provider: 'openstreetmap', apiKey: '' });
    setSuccess('Chave removida — a geolocalização volta para o OpenStreetMap.');
  };

  const testarChave = async () => {
    setTesting(true);
    setTestResult(null);
    const key = apiKey.trim();
    if (!key) {
      setTestResult('Sem chave: a geolocalização usa o OpenStreetMap.');
      setTesting(false);
      return;
    }
    const linhas: string[] = [];
    // 1) Geocoding API
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', 'Avenida Francisco Glicério, Campinas, SP');
      url.searchParams.set('key', key);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (data?.status === 'OK') linhas.push('✅ Geocoding API: chave válida, respondeu certo.');
      else linhas.push(`⚠️ Geocoding API: ${data?.status || 'erro'} ${data?.error_message || ''}`);
    } catch {
      linhas.push('⚠️ Geocoding API: não deu para testar pelo navegador (bloqueio de CORS).');
    }
    // 2) Routes API
    try {
      const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'routes.distanceMeters',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: -22.9099, longitude: -47.0626 } } },
          destination: { location: { latLng: { latitude: -22.8997, longitude: -47.0632 } } },
          travelMode: 'DRIVE',
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && typeof data?.routes?.[0]?.distanceMeters === 'number') {
        linhas.push('✅ Routes API: chave válida, calculou a rota.');
      } else {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        linhas.push(`⚠️ Routes API: ${msg} (verifique se a Routes API está ativada no projeto).`);
      }
    } catch {
      linhas.push('⚠️ Routes API: não deu para testar pelo navegador (bloqueio de CORS).');
    }
    setTestResult(linhas.join('\n'));
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando configuração do mapa…
      </div>
    );
  }

  const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <MapIcon className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Mapa e Geolocalização</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        O mapa usa sempre o <strong>OpenStreetMap</strong>. Aqui você escolhe o provedor da
        <strong> geolocalização</strong>: OpenStreetMap (padrão, sem chave) ou <strong>Google</strong>
        {' '}(Geocoding API para o endereço + Routes API para a rota/distância).
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 text-green-700 px-3 py-2 text-sm">
          <CheckCircle2 className="w-4 h-4" /> {success}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Provedor da geolocalização</label>
          <div className="flex gap-2">
            <button
              onClick={() => setProvider('openstreetmap')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${provider === 'openstreetmap' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'}`}
            >
              OpenStreetMap
            </button>
            <button
              onClick={() => setProvider('google')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${provider === 'google' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'}`}
            >
              Google (Geocoding + Routes)
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Com o Google selecionado e uma chave válida, o endereço e a rota usam o Google; se o Google falhar, cai automaticamente para o OpenStreetMap.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Chave do Google Maps</label>
          <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIzaSy..." className={`${inputCls} font-mono`} />
          <p className="text-xs text-slate-400 mt-1">
            No Google Cloud, ative a <strong>Geocoding API</strong> e a <strong>Routes API</strong> no mesmo projeto e habilite o faturamento. Deixe em branco para usar o OpenStreetMap.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button onClick={() => save()} disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm font-medium">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button onClick={testarChave} disabled={testing} className="rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 text-sm font-medium">
            {testing ? 'Testando…' : 'Testar chave'}
          </button>
          <button onClick={removerChave} disabled={saving} className="rounded-lg border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5">
            <Trash2 className="w-4 h-4" /> Remover chave (voltar ao OpenStreetMap)
          </button>
        </div>

        {testResult && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 text-sm whitespace-pre-line">{testResult}</div>
        )}
      </section>
    </div>
  );
}
