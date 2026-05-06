ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS entrega_codigo_pedido text;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS entrega_contato text;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS entrega_telefone text;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS valor_entrega numeric;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS modal_tipo text DEFAULT 'moto';