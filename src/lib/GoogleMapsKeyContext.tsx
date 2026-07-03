import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';

interface GoogleMapsKeys {
  apiKey: string;
  mapId: string;
}

const envKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();
const envMapId = String(import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? '').trim();

const GoogleMapsKeyContext = createContext<GoogleMapsKeys>({ apiKey: envKey, mapId: envMapId });

export function GoogleMapsKeyProvider({ children }: { children: ReactNode }) {
  // Start with empty strings so MapView waits before loading the script with a possibly wrong key.
  // The fetch resolves quickly (<200 ms) and then provides the correct per-store key (or falls
  // back to the global env-var key for admins and delivery persons).
  const [keys, setKeys] = useState<GoogleMapsKeys>({ apiKey: '', mapId: '' });

  useEffect(() => {
    let cancelled = false;

    const fetchKeys = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setKeys({ apiKey: envKey, mapId: envMapId });
          return;
        }

        const { data: userData } = await supabase
          .from('users')
          .select('cliente_id')
          .eq('id', user.id)
          .maybeSingle();

        const clienteId = String((userData as any)?.cliente_id ?? '').trim();

        if (!clienteId) {
          if (!cancelled) setKeys({ apiKey: envKey, mapId: envMapId });
          return;
        }

        const { data: cliente } = await supabase
          .from('clientes')
          .select('google_maps_api_key, google_maps_map_id')
          .eq('id', clienteId)
          .maybeSingle();

        const dbApiKey = String((cliente as any)?.google_maps_api_key ?? '').trim();
        const dbMapId = String((cliente as any)?.google_maps_map_id ?? '').trim();

        if (!cancelled) {
          setKeys({
            apiKey: dbApiKey || envKey,
            mapId: dbMapId || envMapId,
          });
        }
      } catch {
        if (!cancelled) setKeys({ apiKey: envKey, mapId: envMapId });
      }
    };

    void fetchKeys();
    return () => { cancelled = true; };
  }, []);

  return (
    <GoogleMapsKeyContext.Provider value={keys}>
      {children}
    </GoogleMapsKeyContext.Provider>
  );
}

export function useGoogleMapsKey() {
  return useContext(GoogleMapsKeyContext);
}
