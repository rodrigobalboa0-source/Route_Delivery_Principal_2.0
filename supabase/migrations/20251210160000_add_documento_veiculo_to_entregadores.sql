
alter table "public"."entregadores" 
add column if not exists "documento_veiculo_url" text,
add column if not exists "documento_veiculo_base64" text;
