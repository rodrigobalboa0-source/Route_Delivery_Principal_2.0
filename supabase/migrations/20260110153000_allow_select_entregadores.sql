-- Permitir que usuários autenticados (incluindo clientes/comércio) visualizem entregadores ativos
-- para que possam ver no mapa de operações

create policy "Permitir leitura de entregadores para autenticados"
on public.entregadores
for select
to authenticated
using (true);

-- Caso a política já exista ou conflite, podemos tentar ajustar.
-- Geralmente, políticas são permissivas (OR). Se já houver uma política restrita, adicionar esta deve liberar o acesso.
-- Mas se houver uma política que diz "apenas admin", e o RLS estiver ativo, esta nova política adiciona permissão.

-- Verificar se RLS está habilitado
alter table public.entregadores enable row level security;
