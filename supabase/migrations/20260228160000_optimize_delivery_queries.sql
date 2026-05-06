-- Optimization: Create targeted indexes for high-frequency queries
-- This migration addresses Disk I/O bottlenecks by creating partial and composite indexes
-- specifically designed for the Entregador App polling and dashboard queries.

-- 1. Optimize "Available Deliveries" Query
-- Query: status='criada' AND entregador_id IS NULL
-- This partial index allows instant lookup of open deliveries without scanning the full table.
CREATE INDEX IF NOT EXISTS idx_nova_entrega_disponiveis 
ON public.nova_entrega(created_at DESC) 
WHERE status = 'criada' AND entregador_id IS NULL;

-- 2. Optimize "My Active Deliveries" Query
-- Query: status='atribuida' AND entregador_id = X
-- This index speeds up the check for an individual deliverer's assigned tasks.
CREATE INDEX IF NOT EXISTS idx_nova_entrega_atribuida_entregador 
ON public.nova_entrega(entregador_id, status) 
WHERE status = 'atribuida';

-- 3. Optimize "Pedidos Prontos" Join
-- The query joins `pedidos` on `status='pronto'`.
-- A partial index on `pedidos` makes this join extremely fast.
CREATE INDEX IF NOT EXISTS idx_pedidos_status_pronto 
ON public.pedidos(id) 
WHERE status = 'pronto';

-- 4. Optimize "Entregador Online" Lookup
-- The `is_online` status is checked frequently.
CREATE INDEX IF NOT EXISTS idx_entregadores_online_lookup 
ON public.entregadores(id) 
WHERE is_online = true;

-- 5. Optimize "Rastreamento" Updates
-- If location updates are frequent, indexing the `updated_at` column helps prune old data.
CREATE INDEX IF NOT EXISTS idx_entregadores_updated_at 
ON public.entregadores(updated_at DESC);

-- 6. Vacuum Analyze to update statistics immediately (if run manually, otherwise handled by autovacuum)
-- Note: Cannot run VACUUM inside a transaction block in standard migrations, so we omit it here.
-- The indexes will be picked up by the query planner automatically.
