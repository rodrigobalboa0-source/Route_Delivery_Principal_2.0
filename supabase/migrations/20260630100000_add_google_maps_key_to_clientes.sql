ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS google_maps_api_key text,
  ADD COLUMN IF NOT EXISTS google_maps_map_id text;

COMMENT ON COLUMN clientes.google_maps_api_key IS 'Chave de API do Google Maps exclusiva desta loja, para separação de custos por cliente';
COMMENT ON COLUMN clientes.google_maps_map_id IS 'Map ID do Google Maps exclusivo desta loja (necessário para AdvancedMarkerElement)';
