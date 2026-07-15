ALTER TABLE public.nova_entrega ADD COLUMN IF NOT EXISTS pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_nova_entrega_pedido_id ON public.nova_entrega(pedido_id);
