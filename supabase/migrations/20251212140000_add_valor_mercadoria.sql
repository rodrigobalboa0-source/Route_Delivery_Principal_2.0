create table if not exists public.temp_check (id int);
alter table "public"."nova_entrega" 
add column if not exists "valor_mercadoria" numeric default 0;