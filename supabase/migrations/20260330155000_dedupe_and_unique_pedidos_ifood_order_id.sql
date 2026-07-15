UPDATE public.pedidos
SET ifood_order_id = COALESCE(ifood_order_id, (ifood_info->>'id'))
WHERE ifood_order_id IS NULL
  AND ifood_info IS NOT NULL
  AND (ifood_info ? 'id');

WITH duplicates AS (
  SELECT ifood_order_id, array_agg(id ORDER BY created_at, id) AS ids
  FROM public.pedidos
  WHERE ifood_order_id IS NOT NULL
  GROUP BY ifood_order_id
  HAVING COUNT(*) > 1
),
to_fix AS (
  SELECT ifood_order_id, ids[1] AS keep_id, unnest(ids[2:]) AS dup_id
  FROM duplicates
)
UPDATE public.nova_entrega ne
SET pedido_id = tf.keep_id
FROM to_fix tf
WHERE ne.pedido_id = tf.dup_id;

WITH duplicates AS (
  SELECT ifood_order_id, array_agg(id ORDER BY created_at, id) AS ids
  FROM public.pedidos
  WHERE ifood_order_id IS NOT NULL
  GROUP BY ifood_order_id
  HAVING COUNT(*) > 1
),
to_fix AS (
  SELECT ifood_order_id, ids[1] AS keep_id, unnest(ids[2:]) AS dup_id
  FROM duplicates
)
DELETE FROM public.pedidos p
USING to_fix tf
WHERE p.id = tf.dup_id;

CREATE UNIQUE INDEX IF NOT EXISTS unique_pedidos_ifood_order_id
  ON public.pedidos(ifood_order_id)
  WHERE ifood_order_id IS NOT NULL;