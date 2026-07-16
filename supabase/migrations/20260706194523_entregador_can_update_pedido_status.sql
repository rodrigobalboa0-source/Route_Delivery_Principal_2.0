-- Sem esta policy, o entregador não conseguia atualizar pedidos.status ao concluir
-- uma entrega (só existia policy de UPDATE para o comércio/tenant). O RLS bloqueava
-- silenciosamente, deixando o pedido preso em "pronto" mesmo com a entrega já entregue/cancelada.
CREATE POLICY entregador_pode_atualizar_status_pedido ON pedidos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM nova_entrega ne
    JOIN users u ON u.entregador_id = ne.entregador_id
    WHERE ne.pedido_id = pedidos.id AND u.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM nova_entrega ne
    JOIN users u ON u.entregador_id = ne.entregador_id
    WHERE ne.pedido_id = pedidos.id AND u.id = auth.uid()
  )
);
