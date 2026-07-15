ALTER TABLE conversas ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id);
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS entregador_id UUID REFERENCES entregadores(id);

CREATE INDEX IF NOT EXISTS idx_conversas_cliente_id ON conversas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_conversas_entregador_id ON conversas(entregador_id);