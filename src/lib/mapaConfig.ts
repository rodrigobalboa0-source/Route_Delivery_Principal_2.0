import { supabase } from './supabase';

/**
 * Configuração de Mapa / Geolocalização, controlada pela aba Configurações.
 * Fonte: tabela `configuracoes_mapa`. Fallback: variáveis do .env. Por fim,
 * OpenStreetMap. O resultado é cacheado (a tela de config limpa o cache ao salvar).
 */
export interface MapaConfig {
  provider: 'google' | 'openstreetmap';
  apiKey: string;
  mapId: string;
}

let cache: MapaConfig | null = null;
let cachePromise: Promise<MapaConfig> | null = null;

export async function getMapaConfig(): Promise<MapaConfig> {
  if (cache) return cache;
  if (cachePromise) return cachePromise;
  cachePromise = (async () => {
    const envKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();
    const envMapId = String(import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? '').trim();
    try {
      const { data } = await supabase
        .from('configuracoes_mapa')
        .select('provider, google_maps_api_key, google_maps_map_id')
        .limit(1)
        .maybeSingle();
      if (data) {
        const apiKey = String((data as any).google_maps_api_key || envKey).trim();
        const provider = (String((data as any).provider || '').trim() as MapaConfig['provider']) ||
          (apiKey ? 'google' : 'openstreetmap');
        cache = { provider, apiKey, mapId: String((data as any).google_maps_map_id || envMapId).trim() };
        return cache;
      }
    } catch {
      // Tabela pode ainda não existir no backend — segue no fallback.
    }
    cache = { provider: envKey ? 'google' : 'openstreetmap', apiKey: envKey, mapId: envMapId };
    return cache;
  })();
  return cachePromise;
}

export function clearMapaConfigCache(): void {
  cache = null;
  cachePromise = null;
}
