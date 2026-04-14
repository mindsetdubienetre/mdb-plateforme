-- ============================================================
--  MDB — SCHÉMA SUPABASE · PARTIE 1/2
--  Tables · Enums · Index
--  À exécuter dans l'éditeur SQL de Supabase APRÈS 00_reset.sql
--  Partie 2 (données de base) : voir 02_seed.sql
--
--  Noms de tables alignés sur le code HTML existant :
--    clientes, checkins_emotionnels, reponses_introspection,
--    victoires, messages_chat, boosts_mindset, etc.
-- ============================================================

-- ------------------------------------------------------------
-- 0. EXTENSIONS
-- ------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. ENUMS
-- ------------------------------------------------------------
create type statut_client as enum ('active','inactive','pause','urgence');

create type segment_crm as enum (
  'prospect_froid','prospect_chaud','cliente_active',
  'cliente_pause','ancienne_cliente','freemium'
);

create type type_activite as enum (
  'video','introspection','journal','eft',
  'meditation','hypnose','pdf'
);

create type type_alerte as enum ('urgence','attention','info');

create type intensite_message as enum ('legere','moderee','intense');

create type tunnel_email as enum (
  'bienvenue','transition_phase','relance',
  'appel_non_converti','prospect'
);

create type expediteur_type as enum ('cliente','vanille','admin');

-- ------------------------------------------------------------
-- 2. TABLES DE CONTENU (statiques)
-- ------------------------------------------------------------

-- Les 4 phases du programme
create table phases (
  id          int primary key,
  nom         text not null,
  semaines    text not null,
  objectif    text not null,
  couleur     text not null
);

-- Les 12 semaines du programme
create table semaines (
  numero      int primary key,
  phase_id    int not null references phases(id),
  titre       text not null,
  theme       text not null,
  mots_cles   text[] default '{}'
);

-- Toutes les activités (vidéos, exercices, EFT, méditations, PDFs)
create table activites (
  id                uuid primary key default uuid_generate_v4(),
  slug              text unique not null,
  type              type_activite not null,
  semaine           int not null references semaines(numero),
  titre             text not null,
  description       text,
  duree_min         int,
  duree_max         int,
  format            text,
  ordre             int default 0,
  url               text,
  url_pdf           text,
  metadata          jsonb default '{}'::jsonb,
  is_intro_therapie boolean default false,
  created_at        timestamptz default now()
);
create index idx_activites_semaine on activites(semaine);
create index idx_activites_type    on activites(type);

-- ------------------------------------------------------------
-- 3. CLIENTES (table principale utilisateurs)
-- ------------------------------------------------------------
create table clientes (
  id                      uuid primary key default uuid_generate_v4(),
  email                   text unique not null,
  prenom                  text,
  nom                     text,
  whatsapp                text,
  code_acces              text unique,
  situation               text[] default '{}',
  date_inscription        timestamptz default now(),
  semaine_debloquee       int default 1,
  semaine_actuelle        int default 1,
  phase_actuelle          int default 1,
  pourcentage_completion  int default 0,
  statut                  statut_client default 'active',
  actif                   boolean default true,
  est_freemium            boolean default false,
  est_admin               boolean default false,
  onboarding_complete     boolean default false,
  en_pause                boolean default false,
  derniere_connexion      timestamptz,
  consentements           jsonb default '{}'::jsonb,
  created_at              timestamptz default now()
);
create index idx_clientes_email  on clientes(email);
create index idx_clientes_code   on clientes(code_acces);
create index idx_clientes_statut on clientes(statut);

-- ------------------------------------------------------------
-- 4. TABLES USER-FACING (dépendent de clientes)
-- ------------------------------------------------------------

-- Check-ins émotionnels
create table checkins_emotionnels (
  id          uuid primary key default uuid_generate_v4(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  score       int check (score between 1 and 10),
  emoji       text,
  semaine     int,
  mots_cles   text[] default '{}',
  note_libre  text,
  contexte    text,
  created_at  timestamptz default now()
);
create index idx_checkins_cliente_date on checkins_emotionnels(cliente_id, created_at desc);
create index idx_checkins_score        on checkins_emotionnels(score);

-- Journal intime
create table journal_entries (
  id              uuid primary key default uuid_generate_v4(),
  cliente_id      uuid not null references clientes(id) on delete cascade,
  semaine         int,
  contenu         text,
  partage_vanille boolean default false,
  created_at      timestamptz default now()
);
create index idx_journal_cliente on journal_entries(cliente_id, created_at desc);

-- Réponses aux exercices d'introspection (avec infos admin)
create table reponses_introspection (
  id                   uuid primary key default uuid_generate_v4(),
  cliente_id           uuid not null references clientes(id) on delete cascade,
  exercice_slug        text not null,
  exercice_titre       text,
  semaine              int,
  reponses             jsonb not null default '{}'::jsonb,
  reponse_libre_1      text,
  reponse_libre_2      text,
  emotions_ressenties  text[] default '{}',
  partage_avec_vanille boolean default false,
  lu_par_admin         boolean default false,
  lu_at                timestamptz,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  unique (cliente_id, exercice_slug)
);
create index idx_reponses_cliente    on reponses_introspection(cliente_id, created_at desc);
create index idx_reponses_slug       on reponses_introspection(exercice_slug);
create index idx_reponses_non_lues   on reponses_introspection(lu_par_admin, created_at desc);

-- Log des activités/exercices complétés
create table exercices_completes (
  id              uuid primary key default uuid_generate_v4(),
  cliente_id      uuid not null references clientes(id) on delete cascade,
  activite_slug   text not null,
  activite_type   type_activite not null,
  semaine         int,
  metadata        jsonb default '{}'::jsonb,
  completed_at    timestamptz default now(),
  unique (cliente_id, activite_slug)
);
create index idx_completes_cliente on exercices_completes(cliente_id, completed_at desc);

-- Favoris
create table favoris (
  id             uuid primary key default uuid_generate_v4(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  activite_slug  text not null,
  created_at     timestamptz default now(),
  unique (cliente_id, activite_slug)
);

-- Progression par semaine
create table progression (
  id                  uuid primary key default uuid_generate_v4(),
  cliente_id          uuid not null references clientes(id) on delete cascade,
  semaine             int not null,
  date_debloquee      timestamptz,
  checkin_debut_id    uuid references checkins_emotionnels(id),
  checkin_fin_id      uuid references checkins_emotionnels(id),
  completed           boolean default false,
  completed_at        timestamptz,
  unique (cliente_id, semaine)
);
create index idx_progression_cliente on progression(cliente_id);

-- Victoires (célébrations de la cliente)
create table victoires (
  id          uuid primary key default uuid_generate_v4(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  contenu     text not null,
  created_at  timestamptz default now()
);
create index idx_victoires_cliente on victoires(cliente_id, created_at desc);

-- Chat cliente ↔ Vanille/admin
create table messages_chat (
  id               uuid primary key default uuid_generate_v4(),
  cliente_id       uuid not null references clientes(id) on delete cascade,
  contenu          text not null,
  expediteur_type  expediteur_type not null default 'cliente',
  lu               boolean default false,
  created_at       timestamptz default now()
);
create index idx_chat_cliente on messages_chat(cliente_id, created_at);

-- ------------------------------------------------------------
-- 5. OUTILS CÔTÉ VANILLE / ADMIN
-- ------------------------------------------------------------

-- Banque de templates messages (voix de Vanille — différent de messages_chat)
create table messages_vanille (
  id                     uuid primary key default uuid_generate_v4(),
  theme                  text not null,
  intensite              intensite_message not null,
  phase                  int check (phase between 1 and 4),
  contenu                text not null,
  mots_cles_declencheurs text[] default '{}',
  created_at             timestamptz default now()
);
create index idx_messages_vanille_theme on messages_vanille(theme);

-- Boosts mindset envoyés en masse par segment
create table boosts_mindset (
  id          uuid primary key default uuid_generate_v4(),
  message     text not null,
  segment     text,
  canal       text default 'plateforme',
  envoye      boolean default false,
  envoye_at   timestamptz,
  created_at  timestamptz default now()
);

-- Alertes côté admin
create table alertes_admin (
  id          uuid primary key default uuid_generate_v4(),
  cliente_id  uuid references clientes(id) on delete cascade,
  type        type_alerte not null,
  motif       text not null,
  message     text,
  lue         boolean default false,
  resolue     boolean default false,
  created_at  timestamptz default now()
);
create index idx_alertes_non_lues on alertes_admin(lue, created_at desc);

-- ------------------------------------------------------------
-- 6. CRM & EMAILS
-- ------------------------------------------------------------

-- Contacts CRM
create table contacts_crm (
  id                     uuid primary key default uuid_generate_v4(),
  email                  text unique not null,
  prenom                 text,
  whatsapp               text,
  segment                segment_crm default 'prospect_froid',
  tags                   text[] default '{}',
  source                 text,
  cliente_id             uuid references clientes(id),
  date_creation          timestamptz default now(),
  derniere_interaction   timestamptz default now()
);
create index idx_contacts_email   on contacts_crm(email);
create index idx_contacts_segment on contacts_crm(segment);

-- Log des emails envoyés
create table emails_envoyes (
  id          uuid primary key default uuid_generate_v4(),
  contact_id  uuid references contacts_crm(id),
  cliente_id  uuid references clientes(id),
  tunnel      tunnel_email not null,
  sujet       text not null,
  contenu     text,
  envoye_at   timestamptz default now(),
  ouvert      boolean default false,
  ouvert_at   timestamptz,
  clique      boolean default false,
  clique_at   timestamptz
);
create index idx_emails_contact on emails_envoyes(contact_id);
create index idx_emails_tunnel  on emails_envoyes(tunnel);

-- ------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (DÉSACTIVÉ EN DEV)
-- ------------------------------------------------------------
alter table phases                 disable row level security;
alter table semaines               disable row level security;
alter table activites              disable row level security;
alter table clientes               disable row level security;
alter table checkins_emotionnels   disable row level security;
alter table journal_entries        disable row level security;
alter table reponses_introspection disable row level security;
alter table exercices_completes    disable row level security;
alter table favoris                disable row level security;
alter table progression            disable row level security;
alter table victoires              disable row level security;
alter table messages_chat          disable row level security;
alter table messages_vanille       disable row level security;
alter table boosts_mindset         disable row level security;
alter table alertes_admin          disable row level security;
alter table contacts_crm           disable row level security;
alter table emails_envoyes         disable row level security;
