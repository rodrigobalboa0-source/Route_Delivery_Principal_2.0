create extension if not exists pg_net;

create or replace function public.handle_new_delivery_webhook()
returns trigger as $$
declare

  url text := 'SUBSTITUA_PELA_URL_DO_AMBIENTE/functions/v1/push-notification';

  api_key text := 'SUBSTITUA_PELO_ANON_KEY_DO_AMBIENTE';
  
  payload jsonb;
begin
  
  payload := jsonb_build_object(
    'record', row_to_json(NEW)
  );

  
  perform net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || api_key
    ),
    body := payload
  );

  return new;
end;
$$ language plpgsql;


drop trigger if exists nova_entrega_webhook on public.nova_entrega;

create trigger nova_entrega_webhook
after insert or update on public.nova_entrega
for each row
execute function public.handle_new_delivery_webhook();
