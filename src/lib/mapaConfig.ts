import { supabase } from './supabase';

/**
 * Configuração de Mapa / Geolocalização, controlada pela aba Configurações.
 * Fonte: tabela `configuracoes_mapa`. Fallback: variáveis do .env. Por fim,
 * OpenStreetMap (sempre funciona, sem chave). O resultado é cacheado (a tela
 * de config limpa o cache ao salvar).
 *
 * provider = 'google'       -> Geocoding API (endereço) + Routes API (rota),
 *                              com reserva automática no OpenStreetMap.
 * provider = 'openstreetmap'-> Nominatim (endereço) + OSRM (rota).
 * O MAPA (tiles) é sempre OpenStreetMap, independente do provedor.
 */
export interface MapaConfig {
  provider: 'google' | 'openstreetmap';
  apiKey: string;
}

let cache: MapaConfig | null = null;
let cachePromise: Promise<MapaConfig> | null = null;

export async function getMapaConfig(): Promise<MapaConfig> {
  if (cache) return cache;
  if (cachePromise) return cachePromise;
  cachePromise = (async () => {
    const envKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();
    try {
      const { data } = await supabase
        .from('configuracoes_mapa')
        .select('provider, google_maps_api_key')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        const apiKey = String((data as any).google_maps_api_key || envKey).trim();
        const provider = (String((data as any).provider || '').trim() as MapaConfig['provider']) ||
          (apiKey ? 'google' : 'openstreetmap');
        cache = { provider: provider === 'google' ? 'google' : 'openstreetmap', apiKey };
        return cache;
      }
    } catch {
      // Tabela pode ainda não existir no backend — segue no fallback.
    }
    // Sem config legível (ex.: cadastro público/anônimo): usa OpenStreetMap.
    cache = { provider: 'openstreetmap', apiKey: envKey };
    return cache;
  })();
  return cachePromise;
}

export function clearMapaConfigCache(): void {
  cache = null;
  cachePromise = null;
}
