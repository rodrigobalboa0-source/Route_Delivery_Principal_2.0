WITH duplicates AS (
  SELECT cliente_id, numero, array_agg(id ORDER BY created_at, id) AS ids
  FROM public.pedidos
  WHERE numero IS NOT NULL
  GROUP BY cliente_id, numero
  HAVING COUNT(*) > 1
),
to_fix AS (
  SELECT cliente_id, numero, ids[1] AS keep_id, unnest(ids[2:]) AS dup_id
  FROM duplicates
)
UPDATE public.nova_entrega ne
SET pedido_id = tf.keep_id
FROM to_fix tf
WHERE ne.pedido_id = tf.dup_id;

WITH duplicates AS (
  SELECT cliente_id, numero, array_agg(id ORDER BY created_at, id) AS ids
  FROM public.pedidos
  WHERE numero IS NOT NULL
  GROUP BY cliente_id, numero
  HAVING COUNT(*) > 1
),
to_fix AS (
  SELECT cliente_id, numero, ids[1] AS keep_id, unnest(ids[2:]) AS dup_id
  FROM duplicates
)
DELETE FROM public.pedidos p
USING to_fix tf
WHERE p.id = tf.dup_id;