-- ============================================================
--  MDB — SCHÉMA SUPABASE · PARTIE 1/2
--  Tables · Enums · Index · Row Level Security
--  À exécuter dans l'éditeur SQL de Supabase.
--  Partie 2 (données de base) : voir 02_seed.sql
-- ============================================================

-- ------------------------------------------------------------
-- 0. EXTENSIONS
-- ------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. ENUMS (types énumérés)
-- ------------------------------------------------------------
do $$ begin
  create type statut_client as enum ('active','inactive','pause','urgence');
exception when duplicate_object then null; end $$;

do $$ begin
  create type segment_crm as enum (
    'prospect_froid','prospect_chaud','cliente_active',
    'cliente_pause','ancienne_cliente','freemium'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type type_activite as enum (
    'video','introspection','journal','eft',
    'meditation','hypnose','pdf'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type type_alerte as enum ('urgence','attention','info');
exception when duplicate_object then null; end $$;

do $$ begin
  create type intensite_message as enum ('legere','moderee','intense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tunnel_email as enum (
    'bienvenue','transition_phase','relance',
    'appel_non_converti','prospect'
  );
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. TABLES DE CONTENU (statiques — définies une fois)
-- ------------------------------------------------------------

-- Les 4 phases du programme
create table if not exists phases (
  id          int primary key,              -- 1, 2, 3, 4
  nom         text not null,                -- "Fondations"
  semaines    text not null,                -- "S1 — S3"
  objectif    text not null,
  couleur     text not null                 -- hex, ex #C86030
);

-- Les 12 semaines du programme
create table if not exists semaines (
  numero      int primary key,              -- 1 à 12
  phase_id    int not null references phases(id),
  titre       text not null,                -- "Revenir dans son corps"
  theme       text not null,
  mots_cles   text[] default '{}'
);

-- Toutes les activités (vidéos, exercices, EFT, méditations, hypnoses, PDFs)
-- Table polymorphe — le champ `type` distingue la nature
create table if not exists activites (
  id             uuid primary key default uuid_generate_v4(),
  slug           text unique not null,      -- ex: s1v1, eft-stress-s3
  type           type_activite not null,
  semaine        int not null references semaines(numero),
  titre          text not null,
  description    text,
  duree_min      int,                       -- durée minimum en minutes
  duree_max      int,                       -- durée max en minutes
  format         text,                      -- ex: "Face cam", "Slides + voix"
  ordre          int default 0,             -- ordre d'affichage dans la semaine
  url            text,                      -- URL vidéo ou audio
  url_pdf        text,                      -- URL du PDF si applicable
  metadata       jsonb default '{}'::jsonb, -- extras (points EFT, rondes, etc.)
  is_intro_therapie boolean default false,  -- vidéo d'intro d'une thérapie
  created_at     timestamptz default now()
);
create index if not exists idx_activites_semaine on activites(semaine);
create index if not exists idx_activites_type on activites(type);

-- ------------------------------------------------------------
-- 3. TABLES UTILISATEURS (données dynamiques des clientes)
-- ------------------------------------------------------------

-- Table des utilisatrices (clientes + freemium + admin)
create table if not exists users (
  id                    uuid primary key default uuid_generate_v4(),
  email                 text unique not null,
  prenom                text,
  whatsapp              text,
  code_acces            text unique,        -- ex: MDB-2026-XXXX
  situation             text[] default '{}',-- choix onboarding (stress, anxiété…)
  date_inscription      timestamptz default now(),
  semaine_debloquee     int default 1,      -- dernière semaine débloquée
  semaine_actuelle      int default 1,      -- semaine actuellement visitée
  phase_actuelle        int default 1,
  statut                statut_client default 'active',
  est_freemium          boolean default false,
  est_admin             boolean default false,
  onboarding_complete   boolean default false,
  en_pause              boolean default false, -- toggle admin pour pause
  derniere_connexion    timestamptz,
  consentements         jsonb default '{}'::jsonb, -- RGPD, CGU, IA
  created_at            timestamptz default now()
);
create index if not exists idx_users_email on users(email);
create index if not exists idx_users_code on users(code_acces);
create index if not exists idx_users_statut on users(statut);

-- Check-ins émotionnels
create table if not exists checkins (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references users(id) on delete cascade,
  score       int not null check (score between 1 and 10),
  mots_cles   text[] default '{}',          -- épuisée, anxieuse, calme…
  note_libre  text,
  contexte    text,                         -- "debut_semaine" / "fin_semaine" / "libre"
  created_at  timestamptz default now()
);
create index if not exists idx_checkins_user_date on checkins(user_id, created_at desc);
create index if not exists idx_checkins_score on checkins(score);

-- Journal intime (contenu chiffré côté client avant insertion)
create table if not exists journal_entries (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references users(id) on delete cascade,
  semaine        int,
  contenu        text,                      -- chiffré côté client
  partage_vanille boolean default false,    -- si la cliente veut le partager
  created_at     timestamptz default now()
);
create index if not exists idx_journal_user on journal_entries(user_id, created_at desc);

-- Réponses aux exercices d'introspection
create table if not exists exercices_reponses (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references users(id) on delete cascade,
  activite_slug         text not null,      -- ex: "inventaire-croyances-s4"
  semaine               int,
  reponses              jsonb not null,     -- structure flexible
  partage_avec_vanille  boolean default false,
  created_at            timestamptz default now()
);
create index if not exists idx_reponses_user on exercices_reponses(user_id, created_at desc);
create index if not exists idx_reponses_slug on exercices_reponses(activite_slug);

-- Log des activités complétées (video vue, médit écoutée, PDF téléchargé…)
create table if not exists activites_completes (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id) on delete cascade,
  activite_slug   text not null,
  activite_type   type_activite not null,
  semaine         int,
  metadata        jsonb default '{}'::jsonb, -- ex: {suds_avant: 7, suds_apres: 3}
  completed_at    timestamptz default now(),
  unique (user_id, activite_slug)
);
create index if not exists idx_completes_user on activites_completes(user_id, completed_at desc);

-- Favoris (méditations et autres)
create table if not exists favoris (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references users(id) on delete cascade,
  activite_slug  text not null,
  created_at     timestamptz default now(),
  unique (user_id, activite_slug)
);

-- Progression par semaine (une ligne par user x semaine)
create table if not exists progression (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references users(id) on delete cascade,
  semaine             int not null,
  date_debloquee      timestamptz,
  checkin_debut_id    uuid references checkins(id),
  checkin_fin_id      uuid references checkins(id),
  completed           boolean default false,
  completed_at        timestamptz,
  unique (user_id, semaine)
);
create index if not exists idx_progression_user on progression(user_id);

-- ------------------------------------------------------------
-- 4. TABLES VOIX DE VANILLE & ALERTES
-- ------------------------------------------------------------

-- Banque de messages pré-écrits (voix de Vanille)
create table if not exists messages_vanille (
  id                    uuid primary key default uuid_generate_v4(),
  theme                 text not null,      -- anxiété, fatigue, croyances…
  intensite             intensite_message not null,
  phase                 int check (phase between 1 and 4),
  contenu               text not null,
  mots_cles_declencheurs text[] default '{}',
  created_at            timestamptz default now()
);
create index if not exists idx_messages_theme on messages_vanille(theme);

-- Alertes côté admin
create table if not exists alertes_admin (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references users(id) on delete cascade,
  type        type_alerte not null,
  motif       text not null,                -- ex: "score_bas", "inactivite_3j"
  message     text,
  lue         boolean default false,
  resolue     boolean default false,
  created_at  timestamptz default now()
);
create index if not exists idx_alertes_non_lues on alertes_admin(lue, created_at desc);

-- ------------------------------------------------------------
-- 5. TABLES CRM & EMAILS
-- ------------------------------------------------------------

-- Contacts CRM (leads, prospects, anciennes clientes…)
create table if not exists contacts_crm (
  id                     uuid primary key default uuid_generate_v4(),
  email                  text unique not null,
  prenom                 text,
  whatsapp               text,
  segment                segment_crm default 'prospect_froid',
  tags                   text[] default '{}',
  source                 text,               -- instagram, freemium, appel_decouverte…
  user_id                uuid references users(id),  -- si convertie en cliente
  date_creation          timestamptz default now(),
  derniere_interaction   timestamptz default now()
);
create index if not exists idx_contacts_email on contacts_crm(email);
create index if not exists idx_contacts_segment on contacts_crm(segment);

-- Log des emails envoyés
create table if not exists emails_envoyes (
  id          uuid primary key default uuid_generate_v4(),
  contact_id  uuid references contacts_crm(id),
  user_id     uuid references users(id),
  tunnel      tunnel_email not null,
  sujet       text not null,
  contenu     text,
  envoye_at   timestamptz default now(),
  ouvert      boolean default false,
  ouvert_at   timestamptz,
  clique      boolean default false,
  clique_at   timestamptz
);
create index if not exists idx_emails_contact on emails_envoyes(contact_id);
create index if not exists idx_emails_tunnel on emails_envoyes(tunnel);

-- ------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (DÉSACTIVÉ EN DEV)
--    Active ces policies en production via le dashboard Supabase.
-- ------------------------------------------------------------

-- En dev on désactive RLS sur toutes les tables
alter table phases               disable row level security;
alter table semaines             disable row level security;
alter table activites            disable row level security;
alter table users                disable row level security;
alter table checkins             disable row level security;
alter table journal_entries      disable row level security;
alter table exercices_reponses   disable row level security;
alter table activites_completes  disable row level security;
alter table favoris              disable row level security;
alter table progression          disable row level security;
alter table messages_vanille     disable row level security;
alter table alertes_admin        disable row level security;
alter table contacts_crm         disable row level security;
alter table emails_envoyes       disable row level security;

-- En prod tu activeras comme ceci (à faire APRÈS les tests) :
-- alter table users enable row level security;
-- create policy "users_select_own" on users for select using (auth.uid() = id);
-- create policy "admin_all" on users for all using (
--   exists (select 1 from users where id = auth.uid() and est_admin = true)
-- );
-- (idem pour checkins, journal_entries, etc.)
