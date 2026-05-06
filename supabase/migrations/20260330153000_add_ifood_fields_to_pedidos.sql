ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS ifood_order_id text,
  ADD COLUMN IF NOT EXISTS ifood_info jsonb;

CREATE INDEX IF NOT EXISTS idx_pedidos_ifood_order_id ON public.pedidos(ifood_order_id);