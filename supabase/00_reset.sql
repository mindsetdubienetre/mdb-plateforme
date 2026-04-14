-- ============================================================
--  MDB — RESET COMPLET de la base Supabase
--  ATTENTION : supprime toutes les données et la structure.
--  À exécuter AVANT 01_schema.sql si tu veux repartir de zéro.
-- ============================================================

-- Tables nouvelles (schéma aligné sur le HTML)
drop table if exists emails_envoyes        cascade;
drop table if exists contacts_crm          cascade;
drop table if exists alertes_admin         cascade;
drop table if exists boosts_mindset        cascade;
drop table if exists messages_vanille      cascade;
drop table if exists messages_chat         cascade;
drop table if exists victoires             cascade;
drop table if exists progression           cascade;
drop table if exists favoris               cascade;
drop table if exists exercices_completes   cascade;
drop table if exists reponses_introspection cascade;
drop table if exists journal_entries       cascade;
drop table if exists checkins_emotionnels  cascade;
drop table if exists clientes              cascade;
drop table if exists activites             cascade;
drop table if exists semaines              cascade;
drop table if exists phases                cascade;

-- Tables de l'ancien schéma (au cas où elles traînent encore)
drop table if exists users                 cascade;
drop table if exists checkins              cascade;
drop table if exists exercices_reponses    cascade;
drop table if exists activites_completes   cascade;

-- Enums
drop type if exists expediteur_type   cascade;
drop type if exists tunnel_email      cascade;
drop type if exists intensite_message cascade;
drop type if exists type_alerte       cascade;
drop type if exists type_activite     cascade;
drop type if exists segment_crm       cascade;
drop type if exists statut_client     cascade;
