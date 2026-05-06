-- Optimization for Active Orders Dashboard (High Traffic Query)
-- These partial indexes are extremely small and fast, specifically targeting the default view of "Active Orders"
-- They prevent full table scans when filtering out completed/cancelled orders.

-- 1. Partial Index for Active Pedidos (sorted by date)
-- Used when: fetchPedidos() called without specific status filter (showing all active)
CREATE INDEX IF NOT EXISTS idx_pedidos_active_created_at 
ON public.pedidos(created_at DESC) 
WHERE status NOT IN ('entregue', 'cancelado');

-- 2. Partial Index for Active Entregas (sorted by date)
CREATE INDEX IF NOT EXISTS idx_nova_entrega_active_created_at 
ON public.nova_entrega(created_at DESC) 
WHERE status NOT IN ('entregue', 'cancelada');

-- 3. Foreign Key Indexes for filtering by Cliente (Common filter)
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id 
ON public.pedidos(cliente_id);

CREATE INDEX IF NOT EXISTS idx_nova_entrega_cliente_id 
ON public.nova_entrega(cliente_id);

-- 4. Status Indexes for specific status filtering
CREATE INDEX IF NOT EXISTS idx_pedidos_status 
ON public.pedidos(status);

CREATE INDEX IF NOT EXISTS idx_nova_entrega_status 
ON public.nova_entrega(status);
