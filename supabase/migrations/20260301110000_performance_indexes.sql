-- Migration to add performance indexes and optimize queries
-- Addresses High Disk I/O by adding missing indexes for Foreign Keys and RLS columns

-- 1. Functional Indexes for Email (Crucial for RLS case-insensitive comparisons)
-- These prevent full table scans when RLS policies use `lower(email) = ...`
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON public.users(lower(email));
CREATE INDEX IF NOT EXISTS idx_clientes_lower_email ON public.clientes(lower(email));
CREATE INDEX IF NOT EXISTS idx_entregadores_lower_email ON public.entregadores(lower(email));
CREATE INDEX IF NOT EXISTS idx_contas_gerenciais_lower_email ON public.contas_gerenciais(lower(email_acesso));

-- 2. Indexes for Role/Status filtering (Heavily used in RLS and Admin Panels)
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
-- Composite index for very common RLS pattern: WHERE id = auth.uid() AND role = '...'
-- Note: id is PK, but combining with role can avoid a heap fetch if index-only scan is possible
CREATE INDEX IF NOT EXISTS idx_users_id_role ON public.users(id, role);

-- 3. Missing Foreign Key Indexes (Prevent sequential scans on joins/deletes)
CREATE INDEX IF NOT EXISTS idx_nova_entrega_endereco ON public.nova_entrega(endereco_id);
CREATE INDEX IF NOT EXISTS idx_nova_entrega_tipo_servico ON public.nova_entrega(tipo_servico_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_endereco ON public.pedidos(endereco_id);

-- 4. Financial Tables Optimization (Reports often filter by date and status)
CREATE INDEX IF NOT EXISTS idx_acertos_pago_em ON public.acertos_entregadores(pago_em);
CREATE INDEX IF NOT EXISTS idx_comissoes_status ON public.comissoes_entregadores(status);
CREATE INDEX IF NOT EXISTS idx_comissoes_entregador ON public.comissoes_entregadores(entregador_id);

-- 5. Solicitacoes Credito (If table exists from previous migrations)
-- Checking if table exists before adding index to avoid errors if migration order varies slightly
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'solicitacoes_credito') THEN
        CREATE INDEX IF NOT EXISTS idx_solicitacoes_status ON public.solicitacoes_credito(status);
        CREATE INDEX IF NOT EXISTS idx_solicitacoes_cliente ON public.solicitacoes_credito(cliente_id);
    END IF;
END $$;

-- 6. Integracoes iFood (If exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'integracoes_ifood_pedidos') THEN
        CREATE INDEX IF NOT EXISTS idx_ifood_pedidos_status ON public.integracoes_ifood_pedidos(status);
        CREATE INDEX IF NOT EXISTS idx_ifood_pedidos_created ON public.integracoes_ifood_pedidos(created_at);
    END IF;
END $$;