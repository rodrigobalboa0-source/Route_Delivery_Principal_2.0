ALTER TABLE public.configuracoes_comercio 
ADD COLUMN IF NOT EXISTS permitir_pedido_pronto BOOLEAN DEFAULT TRUE;

UPDATE public.configuracoes_comercio 
SET permitir_pedido_pronto = TRUE 
WHERE permitir_pedido_pronto IS NULL;