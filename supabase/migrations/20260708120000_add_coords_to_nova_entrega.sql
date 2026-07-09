-- Coordenadas confirmadas manualmente (pin arrastado no mapa) para essa
-- entrega específica. O geocode automático (/v1/geocode da Maps API própria)
-- só resolve endereço no nível de rua/CEP, sem número da casa — quando o
-- operador ajusta o pin manualmente (AddressPinPicker), guardamos aqui a
-- coordenada realmente usada no cálculo do km, como registro de auditoria.
ALTER TABLE nova_entrega
  ADD COLUMN IF NOT EXISTS coleta_lat numeric,
  ADD COLUMN IF NOT EXISTS coleta_lng numeric,
  ADD COLUMN IF NOT EXISTS entrega_lat numeric,
  ADD COLUMN IF NOT EXISTS entrega_lng numeric;

COMMENT ON COLUMN nova_entrega.coleta_lat IS 'Latitude confirmada manualmente (pin no mapa) do ponto de coleta, quando ajustada pelo operador';
COMMENT ON COLUMN nova_entrega.coleta_lng IS 'Longitude confirmada manualmente (pin no mapa) do ponto de coleta, quando ajustada pelo operador';
COMMENT ON COLUMN nova_entrega.entrega_lat IS 'Latitude confirmada manualmente (pin no mapa) do ponto de entrega, quando ajustada pelo operador';
COMMENT ON COLUMN nova_entrega.entrega_lng IS 'Longitude confirmada manualmente (pin no mapa) do ponto de entrega, quando ajustada pelo operador';
