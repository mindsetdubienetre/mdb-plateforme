-- « Bilan de ton système nerveux » : appels de vente offerts (20 min, Meet ou WhatsApp).
-- Table séparée de bookings : un bilan n'ouvre pas l'espace cliente, n'a ni paiement ni facture.
create table if not exists public.bilans (
  id uuid primary key default gen_random_uuid(),
  prenom text not null,
  email text not null,
  mode text not null check (mode in ('meet', 'whatsapp')),
  whatsapp text not null,
  quiz text,
  deborde text[] not null default '{}',
  message text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  client_tz text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  google_event_id text,
  meet_link text,
  cancel_token uuid not null default gen_random_uuid(),
  cancelled_by text check (cancelled_by in ('client', 'vanille')),
  cancelled_at timestamptz,
  reminder_veille_at timestamptz,
  reminder_1h_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.bilans is 'Bilans de vente offerts (page bilan.html). Écriture par la fonction rdv uniquement.';

create unique index if not exists bilans_one_per_slot on public.bilans (start_at) where status = 'confirmed';
create index if not exists bilans_start_idx on public.bilans (start_at);
create index if not exists bilans_email_idx on public.bilans (lower(email));

alter table public.bilans enable row level security;
-- Vanille lit ses bilans depuis son espace (même règle que les rendez-vous)
drop policy if exists "vanille lit bilans" on public.bilans;
create policy "vanille lit bilans" on public.bilans for select using (is_vanille());

-- Rappels (la veille, puis 1 heure avant) : toutes les 5 minutes
select cron.unschedule('rdv-bilans-rappels') where exists (select 1 from cron.job where jobname = 'rdv-bilans-rappels');
select cron.schedule('rdv-bilans-rappels', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://adasvbvfhvxnykosjzxo.supabase.co/functions/v1/rdv/bilan-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-key', (select value from private.app_secrets where name = 'cron_key')),
    body := '{}'::jsonb
  );
$$);
