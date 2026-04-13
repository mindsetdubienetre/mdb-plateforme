# CLAUDE CODE — RÉFÉRENCE PLATEFORME MDB
# Mindset du Bien-Être — Fichier de contexte complet
# Dernière mise à jour : 12 avril 2026

---

## 1. QUI EST VANILLE NAIME

Vanille NAIME est la fondatrice de Mindset du Bien-Être (MDB). Son parcours : ingénieure biomédicale et chimique, neurosciences, psychothérapie. Clientèle internationale.

**Histoire fondatrice** : Burnout à 25 ans au Canada. Poste d'ingénieure dans une des entreprises les plus cotées du pays. Téléconsultation médicale le 31 décembre à 19h parce qu'elle ne pouvait plus se déplacer. Semaines dans le noir, épuisement total, désalignement profond. Démission. Reconstruction par les neurosciences et la psychologie. MDB est né comme mission de vie — pas en passe-temps, en dévotion.

**Instagram** : @mindset.du.bienetre

---

## 2. LE PROGRAMME MDB

Programme d'accompagnement au bien-être mental de 12 semaines, structuré en 4 phases progressives. Utilise les neurosciences, la psychologie et la physique quantique. Ce n'est pas un programme. C'est une reconstruction.

### Les 4 phases

**Phase 1 — Fondations (Semaines 1 à 3)**
Comprendre son fonctionnement mental et émotionnel. Reconnexion à soi. Bases de la régulation du système nerveux.
Outils : vidéos pédagogiques, exercices d'introspection, respirations, premières méditations.
Exercices : cohérence cardiaque 5-5-5, respiration 4-7-8, body scan guidé, journaling de décharge, fenêtre de tolérance, protocole anti-dissociation.

**Phase 2 — Reprogrammation (Semaines 4 à 6)**
Transformer les anciens schémas. Croyances limitantes, réactions répétitives, blessures relationnelles.
Outils : EFT/tapping, autothérapies, méditations, travail subconscient.
Exercices : EFT ciblé, auto-hypnose, recadrage cognitif, méditation theta, lettre à soi-même, défusion cognitive.

**Phase 3 — Activation (Semaines 7 à 9)**
Incarner un nouvel état intérieur. Identité, rituels, alignement, énergie, cohérence intérieure.
Outils : routines d'alignement, respirations, auto-hypnoses, visualisations, exercices d'incarnation.
Exercices : méditation du futur mémorisé, ancrage NLP, valeurs, morning routine quantique, IFS, EFT anti-syndrome imposteur.

**Phase 4 — Intégration (Semaines 10 à 12)**
Stabiliser la transformation. Maintenir, gérer les rechutes, environnement aligné.
Outils : pratiques d'ancrage, méditations, observation, consolidation.
Exercices : protocole anti-rechute, projection 6 mois, limites, journaling de consolidation, rituel de clôture, bilan structuré.

### Le suivi inclus
- Accès WhatsApp plusieurs fois par semaine
- Sessions de groupe en visio
- Vidéos pédagogiques courtes
- Exercices guidés, méditations, respirations, auto-hypnoses
- PDF d'autothérapies

### Le prix
- 599€ prix de lancement (10 premières clientes)
- 799€ prix standard ensuite
- 1× ou 3× sans frais (3 × 200€)
- Stripe 1× : https://buy.stripe.com/7sI5lw1Yu8SMati14d
- Stripe 3× : https://buy.stripe.com/eVqbJ15v1ftdg6mbjj9EI0k

### La cible
Femmes en stress chronique, anxiété, surcharge mentale, désalignement. Elles "gèrent" en apparence mais sont épuisées intérieurement. Pas malades — perdues, à bout, déconnectées d'elles-mêmes.

---

## 3. IDENTITÉ VISUELLE — PALETTE VALIDÉE (AVRIL 2026)

### Couleurs

| Rôle | Nom | Hex | Usage |
|---|---|---|---|
| Fond principal | Ivoire chaud | #F5F0E8 | Fonds de page, cards, sections |
| Profondeur / texte | Brun-noir | #1A1410 | Texte, titres, sidebar |
| Accent principal | Ambre-terracotta | #C86030 | Orbe, boutons secondaires, accents |
| Accent premium / CTA | Or doux | #C9A84C | CTA, premium, badges |
| Accent secondaire | Mauve terreux | #9A8090 | Touches féminines, tags |
| Support neutre | Taupe chaud | #B0A090 | Texte secondaire, bordures |

**IMPORTANT : PAS DE VERT. Positionnement premium reconstruction neuroscientifique, pas yoga/nature.**

### Fonds de déclinaison
- Ivoire #F5F0E8 → fond principal
- Brun-noir #1A1410 → impact, sidebar, topbar
- Noir #080806 → sales page
- Mauve #E8DFE4 → stories, touches féminines

### Typographies
- **Playfair Display** — titres éditoriaux, élégance
- **Cormorant Garamond** — titres premium, grands nombres
- **Times New Roman** — "Mindset" dans le logo (italic)
- **Be Vietnam Pro** — corps, "du bien-être." (Bold 800), UI, boutons
- **Jost** — alternative UI

### Logo
1. **Orbe** : core gradient radial #E08858 → #D06030 → #B04018, halo double mauve + or
2. **Texte sur UNE LIGNE** : "*Mindset* **du bien-être.**"
3. **Deux versions** :
   - **Version A** (minimaliste) : orbe + texte. Usage principal.
   - **Version B** (structurée) : + séparateur fin + "M D B" espacé (letter-spacing 0.35em).

### Variables CSS

```css
:root {
  --ivoire: #F5F0E8;
  --brun-noir: #1A1410;
  --ambre: #C86030;
  --ambre-light: #D87A48;
  --ambre-deep: #A04820;
  --or: #C9A84C;
  --or-light: #D4B86A;
  --mauve: #9A8090;
  --mauve-light: #B8A0B0;
  --mauve-bg: #E8DFE4;
  --taupe: #B0A090;
  --taupe-light: #C8BEB0;
  --noir-sales: #080806;
}
```

---

## 4. ARCHITECTURE DE LA PLATEFORME

### Stack
- **Frontend** : PWA HTML/CSS/JS, mobile-first
- **Backend** : Supabase (auth, PostgreSQL, storage, edge functions)
- **Hébergement** : Vercel
- **Paiement** : Stripe (webhooks)
- **Vidéos** : YouTube unlisted (P1), Vimeo Pro (upgrade)
- **Repo** : mindsetdubienetre/mdb-plateforme
- **Domaine prévu** : plateforme.mindsetdubienetre.com
- **Sales page live** : https://peaceful-bunny-70dce1.netlify.app
- **Compte test** : contact@vanille-naime.com / MDB-2026-TEST

---

## 5. MODULES — SPECS DÉTAILLÉES

### 5.1 INSCRIPTION & ONBOARDING
1. Paiement Stripe → webhook → Supabase crée compte avec code MDB-2026-XXXX
2. Email auto avec lien plateforme + code
3. Login email + code → onboarding
4. Onboarding 5 écrans : bienvenue → infos (prénom, WhatsApp, situation) → consentement RGPD/CGU → check-in initial → vidéo bienvenue Vanille
5. Notif côté admin → Vanille envoie WhatsApp de bienvenue

### 5.2 ESPACE PROGRAMME 12 SEMAINES
- Dashboard avec vue 12 semaines, déblocage progressif
- Chaque semaine : vidéo + 1-3 exercices + journal + thérapie + check-ins début/fin
- Barre de progression + célébration fin de phase + badges

### 5.3 ESPACES THÉRAPEUTIQUES
- **EFT** : protocoles guidés, points illustrés, audio, sensations avant/après
- **Respirations** : animations temps réel, minuteur, 4-7-8, 5-5-5, carrée, son optionnel
- **Méditations** : player audio, favoris, historique
- **Auto-hypnoses** : audio + environnement apaisant + timer
- **Autothérapies** : PDF interactifs ou exercices in-app

### 5.4 CHECK-IN ÉMOTIONNEL
- Score 1-10 + mots-clés (épuisée, anxieuse, en colère, triste, neutre, calme, en paix, confiante, joyeuse) + note libre
- Stocké timestamped, historique visuel
- Si ≤ 2/10 ou détresse → alerte admin + message ressources

### 5.5 RÉPONSES PERSONNALISÉES "VOIX DE VANILLE"
- Banque de messages pré-écrits par Vanille, classés par thème/intensité/phase
- Match avec réponses de la cliente
- Table `messages_vanille` : id, theme, intensite, phase, contenu, mots_cles_declencheurs

**Ton de Vanille :**
- Tutoiement direct
- Phrases ultra-courtes
- Pas de jargon scientifique
- Langage corporel et émotionnel
- Punchlines fortes
- Chaleur sans pitié
- JAMAIS de noms de chercheurs

### 5.6 CHAT WHATSAPP
- Bouton sur chaque page : `wa.me/NUMERO?text=PREFILLED`
- Message pré-rempli avec prénom + semaine
- Côté admin : envoi proactif (bienvenue, rappel, check-in, encouragement, alerte)

### 5.7 ADMIN
- Dashboard global : actives, inactives, bloquées
- Liste clientes filtrables (phase, statut, activité)
- Fiche cliente : progression, check-ins, réponses, WhatsApp
- Alertes : 🔴 urgence (≤2/10) | 🟡 attention (3j inactif) | 🟢 normal
- Boutons rapides : WhatsApp, voir réponses, export

### 5.8 CRM & EMAIL
- Segments : prospect_froid, prospect_chaud, cliente_active, cliente_pause, ancienne_cliente, freemium
- Tags personnalisables, historique interactions
- **5 tunnels** :
  1. Bienvenue (J0, J1, J3)
  2. Transition de phase (1→2, 2→3, 3→4)
  3. Relance inactives (J3, J7, J14)
  4. Appel découverte non converti (J1, J3, J7)
  5. Prospects intéressés (1 email/3-4j, max 6)
- Templates au design MDB, automatisations sur triggers

### 5.9 ZONE FREEMIUM
- 2-3 méditations gratuites + 1-2 respirations + 1 exo découverte
- Aperçu programme (verrouillé)
- Capture email → tunnel "prospects"
- CTA inscription MDB (599€)

---

## 6. SÉCURITÉ, JURIDIQUE & ÉTHIQUE

### RGPD
- Consentement explicite case non pré-cochée
- Droit suppression + export
- Données sensibles chiffrées
- Aucun partage tiers

### Mentions
- "Ce programme ne remplace pas un suivi médical ou psychologique professionnel."
- "En cas de crise : 3114 (prévention suicide) ou 15 (SAMU)."
- CGU à accepter à l'onboarding

### Protocole de crise
- Détection mots-clés détresse → message doux + ressources + alerte admin urgente
- Vanille contacte WhatsApp en priorité
- JAMAIS de diagnostic

### Confidentialité exercices
- Réponses privées par défaut
- Toggle "partager avec Vanille" par exercice
- Vanille ne voit que le partagé sauf alerte crise

---

## 7. BASE DE DONNÉES SUPABASE

**users** : id, email, prenom, whatsapp, code_acces, situation[], date_inscription, semaine_actuelle, phase_actuelle, statut, est_freemium, est_admin, onboarding_complete

**checkins** : id, user_id, score, mots_cles[], note_libre, created_at

**exercices_reponses** : id, user_id, exercice_id, semaine, phase, reponses(jsonb), partage_avec_vanille, created_at

**journal_entries** : id, user_id, semaine, contenu(encrypted), created_at

**messages_vanille** : id, theme, intensite, phase, contenu, mots_cles_declencheurs[]

**progression** : id, user_id, semaine, exercices_completes[], videos_vues[], checkin_debut, checkin_fin, completed, completed_at

**contacts_crm** : id, email, prenom, whatsapp, segment, tags[], source, date_creation, derniere_interaction

**emails_envoyes** : id, contact_id, tunnel, sujet, contenu, envoye_at, ouvert, clique

**alertes_admin** : id, user_id, type, message, lue, created_at

### Notes Supabase
- `.maybeSingle()` au lieu de `.single()` (évite crashes 406)
- RLS désactivé en dev, à activer en prod
- Fonctions appelées dans `onclick` HTML : scope global, PAS dans `DOMContentLoaded`

---

## 8. PWA

- manifest.json : theme_color #F5F0E8, background_color #F5F0E8, display standalone
- Service Worker : cache assets statiques, network-first pour data
- Icônes 192×192 et 512×512 (orbe sur ivoire) + apple-touch-icon

```html
<meta name="theme-color" content="#F5F0E8">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
```

---

## 9. UX & DESIGN — RÈGLES ABSOLUES

### Principes
- Mobile-first
- Chaleur et sécurité
- Minimalisme premium, beaucoup d'espace
- Chaque bouton doit être cliquable — checklist obligatoire avant livraison

### Ton interface
- Tutoiement
- Phrases courtes et directes
- Langage corporel et émotionnel
- "Comment tu te sens ?", "Tu as avancé cette semaine", "Prends un moment pour toi"
- JAMAIS de noms d'experts ou chercheurs visibles

### Composants
- Cards : border-radius 16-20px, fond ivoire/blanc
- CTA : fond or #C9A84C, texte brun-noir #1A1410, br 12px
- Secondaire : fond ambre #C86030, texte blanc
- Sidebar/topbar : fond brun-noir #1A1410
- Tags phase : couleur d'accent par phase
- Progression : gradient ambre → or
- Alerte urgence : bordure #D85A30
- Alerte attention : bordure or #C9A84C
- Alerte info : bordure mauve #9A8090

### Polices à charger
```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Be+Vietnam+Pro:wght@300;400;500;700;800&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet">
```

---

## 10. CONTENU PROGRAMME — STRUCTURE

### Semaine 1 (Phase 1)
- Vidéo : Introduction au système nerveux et au mode survie
- Intro : "Décris une journée typique — sensations, pensées, corps"
- Respiration : cohérence cardiaque 5-5-5 (animée)
- Méditation : body scan (audio)
- Journal : "Qu'est-ce que tu portes en toi en ce moment ?"

### Semaine 2 (Phase 1)
- Vidéo : Le stress chronique et le cortisol
- Intro : "Quels sont les moments où tu te sens le plus en tension ?"
- Respiration : 4-7-8 (animée)
- Méditation : respiration consciente (audio)
- Journal : "Qu'est-ce que tu voudrais ressentir à la place ?"

### Semaines 3 à 12
Structure similaire, contenu adapté à chaque phase. Vanille remplit au fur et à mesure.

---

## 11. PRIORITÉS DE DÉVELOPPEMENT

### Phase 1 — MVP
1. Login code d'accès
2. Onboarding 5 écrans
3. Dashboard 12 semaines
4. Page semaine (vidéo + exo + journal)
5. Check-in émotionnel
6. Espace respiration animée
7. PWA
8. Dashboard admin basique

### Phase 2 — Personnalisation
9. Système "voix de Vanille"
10. Bouton WhatsApp intégré
11. EFT guidé
12. Méditations audio
13. Alertes admin
14. Historique check-ins (graphique)

### Phase 3 — CRM & Email
15. CRM (contacts, segments, tags)
16. Système email
17. 5 tunnels automatisés
18. Page admin CRM

### Phase 4 — Freemium
19. Zone freemium
20. Landing publique
21. Tunnel prospects
22. CTA conversion
