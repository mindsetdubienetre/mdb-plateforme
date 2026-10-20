# Rendez-vous : consultations et « Bilan de ton système nerveux »

Tout le moteur de réservation vit dans le projet Supabase **mdb-base** (`adasvbvfhvxnykosjzxo`),
fonction Edge `rdv` : `https://adasvbvfhvxnykosjzxo.supabase.co/functions/v1/rdv/<action>`.

```
rdv/
  supabase/functions/rdv/   source de la fonction (copie de ce qui est déployé)
  supabase/migrations/      SQL appliqué sur mdb-base
  site/                     pages à déposer sur rdv.vanille-naime.com
  espace/                   module pour afficher les bilans dans le planning de l'espace
```

## Bilan de ton système nerveux (appel de vente offert)

- **20 minutes**, en visio (Google Meet) ou appel WhatsApp (c'est Vanille qui appelle).
- **Horaires** (heure de Guadeloupe) : samedi 8h-12h, lundi 8h-12h, jeudi 14h-17h, sur les mêmes règles que les
  consultations en visio (`RULES.visio` et `DATE_OVERRIDES` dans `_shared/core.ts`) : une exception de date
  ferme aussi les bilans.
- **Créneaux toutes les 30 minutes** : 20 min d'appel + **10 min de pause**. La pause s'applique aussi entre un
  bilan et une consultation, dans les deux sens.
- Seuls les créneaux **libres dans Google Agenda** (contact@vanille-naime.com) sont proposés, en enlevant aussi
  les consultations en base et les autres bilans. Réservable jusqu'à 12 h avant, sur 3 semaines.
- À la réservation : événement Google Agenda (avec lien Meet si visio, toutes les réponses dans la description),
  email de confirmation à la cliente (+ fichier agenda), email de notification à Vanille, notification push.
- **Rappels** : email la veille à 18h (heure de la cliente), puis 1 heure avant (cron `rdv-bilans-rappels`,
  toutes les 5 minutes).
- **Déplacer / annuler** : lien dans l'email (`gerer-bilan.html`), jusqu'à 12 heures avant.
- Données : table `bilans` (séparée de `bookings` : un bilan n'ouvre pas l'espace cliente et n'a ni paiement ni
  facture). Lecture réservée à Vanille (RLS `is_vanille()`), écriture uniquement par la fonction.

### Actions de la fonction

| Action | Méthode | Rôle |
|---|---|---|
| `bilan-availability` | GET | créneaux libres (ISO UTC) |
| `bilan-book` | POST | réservation |
| `bilan-manage` | GET / POST | résumé, `slots`, `move`, `cancel` (lien signé) |
| `bilan-reminders` | POST | rappels (cron, `x-cron-key`) |
| `admin` `{ action: "bilan-cancel", id }` | POST | annulation par Vanille depuis son espace |

### Mise en ligne de la page

Déposer `site/bilan.html`, `site/gerer-bilan.html` et `site/bilan.css` à la racine du site
rdv.vanille-naime.com (à côté de `gerer.html`). Les liens des emails pointent vers
`https://rdv.vanille-naime.com/bilan.html` et `/gerer-bilan.html` (variable `BILAN_URL` pour changer l'adresse
de la page de réservation). La page appelle la fonction depuis le navigateur : son adresse doit faire partie
de `ALLOWED_ORIGINS` (rdv.vanille-naime.com y est déjà).

### Planning de l'espace

`espace/planning-bilans.js` lit la table `bilans` avec la session de Vanille et renvoie les bilans dans la même
forme que les rendez-vous, plus `annulerBilan()` et une carte HTML prête à l'emploi. À brancher dans le
planning de espace.vanille-naime.com/vanille.
