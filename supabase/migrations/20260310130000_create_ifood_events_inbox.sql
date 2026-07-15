create table if not exists public.ifood_events_inbox (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null,
  event_id uuid not null,
  merchant_id uuid,
  order_id uuid,
  code text,
  created_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  acked_at timestamptz,
  last_error text
);

create unique index if not exists ifood_events_inbox_event_id_uq
  on public.ifood_events_inbox(event_id);

create index if not exists ifood_events_inbox_integration_id_idx
  on public.ifood_events_inbox(integration_id);

create index if not exists ifood_events_inbox_order_id_idx
  on public.ifood_events_inbox(order_id);

alter table public.ifood_events_inbox enable row level security;
