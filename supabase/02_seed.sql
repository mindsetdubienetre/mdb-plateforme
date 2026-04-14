-- ============================================================
--  MDB — SEED · PARTIE 2/2
--  Données initiales : phases, semaines, contenu programme,
--  compte test, messages Vanille.
--  À exécuter APRÈS 01_schema.sql dans Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LES 4 PHASES
-- ------------------------------------------------------------
insert into phases (id, nom, semaines, objectif, couleur) values
  (1, 'Fondations',      'S1 — S3',  'Sécuriser le système nerveux, sortir du mode survie',          '#C86030'),
  (2, 'Reprogrammation', 'S4 — S6',  'Transformer les croyances et schémas inconscients',            '#9A8090'),
  (3, 'Activation',      'S7 — S9',  'Incarner la nouvelle identité, créer la cohérence intérieure', '#C9A84C'),
  (4, 'Intégration',     'S10 — S12','Stabiliser la transformation, devenir autonome',               '#8A7A68')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2. LES 12 SEMAINES
-- ------------------------------------------------------------
insert into semaines (numero, phase_id, titre, theme, mots_cles) values
  (1,  1, 'Revenir dans son corps',           'Reconnecter au corps. Comprendre le système nerveux autonome.', array['système nerveux','cohérence cardiaque','nerf vague']),
  (2,  1, 'La fenêtre de tolérance',          'Comprendre hyperactivation et hypoactivation.',                 array['fenêtre de tolérance','respiration 4-7-8','TIPP']),
  (3,  1, 'Libérer le stress stocké',         'Identifier les déclencheurs. Première séance EFT.',             array['déclencheurs','EFT','régulation']),
  (4,  2, 'Les croyances limitantes',         'Identifier les croyances profondes. Neuroplasticité.',           array['croyances','neuroplasticité','subconscient']),
  (5,  2, 'Les blessures relationnelles',     'Explorer les schémas. Écriture thérapeutique.',                 array['blessures','auto-compassion','défusion']),
  (6,  2, 'Reprogrammer au niveau cellulaire','Épigénétique. Consolider les nouvelles croyances.',             array['épigénétique','reprogrammation']),
  (7,  3, 'La nouvelle identité',             'Incarner. Futur mémorisé. Émotions élevées.',                   array['identité','visualisation','futur']),
  (8,  3, 'Les rituels d''alignement',        'Routines qui ancrent. Ancrage sensoriel PNL.',                  array['rituels','morning routine','ancrage']),
  (9,  3, 'Auto-thérapie IFS & incarnation',  'Dialogue avec les parties intérieures.',                         array['IFS','enfant intérieur']),
  (10, 4, 'Ancrer le changement',             'Hardwiring Happiness. Gérer les rechutes.',                     array['ancrage','rechute','consolidation']),
  (11, 4, 'Les limites et les besoins',       'Poser ses limites. Besoins authentiques.',                      array['limites','besoins','DBT']),
  (12, 4, 'Devenir sa propre thérapeute',     'Protocole de maintenance. Rituel de clôture.',                  array['autonomie','clôture','maintenance'])
on conflict (numero) do nothing;

-- ------------------------------------------------------------
-- 3. ACTIVITÉS — SEMAINE 1 (exemple complet à dupliquer pour les autres semaines)
-- ------------------------------------------------------------

-- Vidéos Semaine 1 (6 vidéos incluant s1v6 intro méditation)
insert into activites (slug, type, semaine, titre, description, duree_min, duree_max, format, ordre, url) values
  ('s1v1', 'video', 1, 'Bienvenue dans la Semaine 1', 'Ouverture de ton parcours.',                                  5, 8,  'Face cam',         1, null),
  ('s1v2', 'video', 1, 'Ce qui se passe dans ton cerveau', 'Neurosciences simples sur le mode survie.',              10, 15, 'Slides + voix',    2, null),
  ('s1v3', 'video', 1, 'La cohérence cardiaque pas à pas', 'Tutoriel pratique 5-5-5.',                                8, 10, 'Tutoriel face cam', 3, null),
  ('s1v4', 'video', 1, 'Body scan & ancrage corporel',    'Méditation guidée d''ancrage.',                           12, 15, 'Méditation guidée', 4, null),
  ('s1v5', 'video', 1, 'Le nerf vague : ton bouton reset', 'Comprendre ton réflexe de sécurité intérieure.',          10, 12, 'Slides + voix',    5, null),
  ('s1v6', 'video', 1, 'Pourquoi la méditation reconstruit ton cerveau', 'Intro thérapie · méditation.',             8, 10, 'Slides + voix',    6, null)
on conflict (slug) do nothing;

update activites set is_intro_therapie = true where slug = 's1v6';

-- Exercice d'introspection Semaine 1
insert into activites (slug, type, semaine, titre, description, duree_min, duree_max, format, ordre) values
  ('journal-decharge-s1', 'introspection', 1, 'Journal de décharge',
   '7 jours de journaling libre + méthode RAIN (Reconnaître, Accepter, Investiguer, Non-identification).',
   null, null, 'Journal guidé', 10)
on conflict (slug) do nothing;

-- PDFs Semaine 1
insert into activites (slug, type, semaine, titre, description, duree_min, duree_max, ordre, url_pdf) values
  ('guide-bienvenue-s1', 'pdf', 1, 'Guide de bienvenue Phase 1',
   'Présentation de la phase, conseils pour bien démarrer, planning de la semaine.',
   null, null, 20, null),
  ('fiche-cerveau-s1',   'pdf', 1, 'Fiche — Ce qui se passe dans ton cerveau',
   'Résumé visuel des 3 états du système nerveux.',
   null, null, 21, null)
on conflict (slug) do nothing;

-- TODO : dupliquer pour S2 à S12 (contenu à injecter quand Vanille
--        confirme / met à disposition les URLs vidéos).

-- ------------------------------------------------------------
-- 4. COMPTE DE TEST
-- ------------------------------------------------------------
insert into users (
  email, prenom, whatsapp, code_acces, situation,
  semaine_debloquee, semaine_actuelle, phase_actuelle,
  onboarding_complete, est_admin
) values (
  'contact@vanille-naime.com',
  'Vanille',
  null,
  'MDB-2026-TEST',
  array['stress','désalignement'],
  1, 1, 1,
  true,
  true
) on conflict (email) do nothing;

-- ------------------------------------------------------------
-- 5. MESSAGES VANILLE (10 templates pour démarrer)
-- ------------------------------------------------------------
insert into messages_vanille (theme, intensite, phase, contenu, mots_cles_declencheurs) values
  ('anxiété', 'intense', 1,
   'Ce que tu ressens là, c''est ton corps qui te parle. Il a raison. On va l''écouter ensemble — respire avec moi. Pose une main sur ton cœur. Tu n''es pas seule.',
   array['anxieuse','panique','angoisse','peur']),
  ('fatigue', 'modérée', 1,
   'Tu es fatiguée. C''est normal. Ton système nerveux est en train de relâcher des années de tension. Laisse-toi ralentir. Ton corps se répare.',
   array['épuisée','fatigue','vide','plus d''énergie']),
  ('tristesse', 'intense', 2,
   'Ce chagrin qui remonte, c''est quelque chose que tu portais depuis longtemps. Pleure s''il faut. C''est la libération qui se fait.',
   array['triste','pleure','larmes','vide']),
  ('colère', 'modérée', 2,
   'Ta colère est juste. Elle te dit où tu as été trahie. Elle a besoin d''être nommée, pas réprimée. Écris-la. Tape dans un coussin. Bouge.',
   array['en colère','rage','agacée','énervée']),
  ('croyances', 'modérée', 2,
   'Cette voix qui te dit que tu n''y arriveras pas — ce n''est pas toi. C''est une programmation. Tu peux la remercier, et choisir autre chose.',
   array['je ne peux pas','pas capable','pas assez']),
  ('confiance', 'légère', 3,
   'Regarde-toi. Tu es devenue quelqu''un que ton ancienne version ne reconnaîtrait pas. C''est toi qui as fait ça.',
   array['confiante','fière','forte']),
  ('relations', 'intense', 2,
   'Ce qu''il/elle a fait n''a rien à voir avec ta valeur. Rien. Tu l''apprends aujourd''hui. Tu n''as plus à porter ça.',
   array['rejet','abandon','trahison','blessure']),
  ('corps', 'modérée', 1,
   'Ton corps n''est pas un problème à résoudre. C''est ta maison. On va apprendre à l''habiter autrement.',
   array['corps','honte','dégoût','poids']),
  ('rechute', 'modérée', 4,
   'L''ancien schéma est revenu. C''est normal. Ça ne veut pas dire que tu as échoué. Ça veut dire que tu es humaine.',
   array['rechute','retombée','recommence','pareil']),
  ('clôture', 'légère', 4,
   'Regarde d''où tu es partie. Regarde où tu es maintenant. Honore-toi. Tu l''as fait.',
   array['fin','clôture','fière','merci'])
on conflict do nothing;

-- ------------------------------------------------------------
-- FIN DU SEED
-- ------------------------------------------------------------
-- Vérification rapide :
-- select count(*) from phases;    -- attendu : 4
-- select count(*) from semaines;  -- attendu : 12
-- select count(*) from activites where semaine = 1;  -- attendu : 9
-- select count(*) from users;     -- attendu : 1 (compte test)
-- select count(*) from messages_vanille; -- attendu : 10
