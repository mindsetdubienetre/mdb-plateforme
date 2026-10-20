// « Bilan de ton système nerveux » : appel découverte offert de 20 minutes, en visio (Meet) ou sur WhatsApp.
// Mêmes horaires que les consultations en visio, sur des plages de 30 minutes : 20 minutes d'appel + 10 minutes de pause.
import { DATE_OVERRIDES, db, GP_TZ, HORIZON_MS, HOUR_MS, overlaps, RULES } from "./core.ts";
import { busy } from "./google.ts";

export const BILAN_MS = 20 * 60e3;
export const PAUSE_MS = 10 * 60e3;
const GP_OFFSET_H = 4; // UTC-4 toute l'année
// Réservation possible jusqu'à 12 h avant ; déplacer ou annuler aussi.
export const BILAN_NOTICE_MS = 12 * HOUR_MS;

// Heures (heure de Guadeloupe) où un bilan peut commencer, par jour (0 = dimanche) :
// samedi 8h-12h, lundi 8h-12h, jeudi 14h-17h.
export const BILAN_HOURS: Record<number, number[]> = { 6: [8, 9, 10, 11], 1: [8, 9, 10, 11], 4: [14, 15, 16] };

export const MODES = ["meet", "whatsapp"] as const;
export type Mode = typeof MODES[number];

// Intitulés exacts des pages de résultat du quiz
export const QUIZ = [
  "La tête qui continue",
  "Le pilote automatique",
  "Le moteur qui ne coupe pas",
  "La réserve à sec",
  "Je ne l'ai pas encore fait",
];
export const DEBORDE = [
  "Je suis fatiguée même quand je me repose",
  "Ma tête tourne en boucle, j'imagine souvent le pire",
  "Je repousse ce que je dois faire, mes objectifs n'avancent pas",
  "Je dors mal",
  "Je réagis trop vite (couple, enfants, travail)",
];

/** Créneaux théoriques d'un bilan, en ISO UTC. Une exception de date (DATE_OVERRIDES) retire aussi les bilans. */
export function bilanCandidates(now = Date.now()): string[] {
  const out: string[] = [];
  const gpToday = new Date(now - GP_OFFSET_H * HOUR_MS);
  for (let d = 0; d <= 22; d++) {
    const day = new Date(Date.UTC(gpToday.getUTCFullYear(), gpToday.getUTCMonth(), gpToday.getUTCDate() + d));
    const override = DATE_OVERRIDES[day.toISOString().slice(0, 10)]?.visio;
    const open = override ?? RULES.visio[day.getUTCDay()] ?? [];
    for (const h of BILAN_HOURS[day.getUTCDay()] ?? []) {
      if (!open.includes(h)) continue;
      for (const m of [0, 30]) {
        const t = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h + GP_OFFSET_H, m);
        if (t < now + BILAN_NOTICE_MS || t > now + HORIZON_MS) continue;
        out.push(new Date(t).toISOString());
      }
    }
  }
  return out;
}

/** Bilans à venir (hors celui qu'on ignore), sous forme d'intervalles. */
export async function bilanIntervals(timeMin: string, timeMax: string, ignoreId?: string) {
  const { data, error } = await db().from("bilans").select("id,start_at,end_at")
    .eq("status", "confirmed").gte("end_at", timeMin).lte("start_at", timeMax);
  if (error) throw error;
  return (data ?? []).filter((b) => b.id !== ignoreId)
    .map((b) => ({ start: Date.parse(b.start_at), end: Date.parse(b.end_at) }));
}

/**
 * Créneaux de bilan réellement libres : horaires − agenda Google − consultations − autres bilans,
 * avec 10 minutes de pause avant et après chaque rendez-vous.
 * `ignore` : le bilan qu'on déplace ne se bloque pas lui-même (ni en base, ni dans l'agenda).
 */
export async function freeBilanSlots(ignore?: { id: string; start: string; end: string }) {
  const candidates = bilanCandidates();
  if (!candidates.length) return [];
  const timeMin = new Date(Date.parse(candidates[0]) - HOUR_MS).toISOString();
  const timeMax = new Date(Date.parse(candidates[candidates.length - 1]) + HOUR_MS).toISOString();

  const [{ data: bookings, error }, bilans, busyList] = await Promise.all([
    db().from("bookings").select("start_at,end_at,status,hold_until").in("status", ["pending", "confirmed"])
      .gte("end_at", timeMin).lte("start_at", timeMax),
    bilanIntervals(timeMin, timeMax, ignore?.id),
    busy(timeMin, timeMax),
  ]);
  if (error) throw error;
  const own = ignore ? { start: Date.parse(ignore.start), end: Date.parse(ignore.end) } : null;
  const blocks = [
    // une consultation en attente de paiement bloque tant que son délai n'est pas dépassé
    ...(bookings ?? []).filter((b) => b.status === "confirmed" || !b.hold_until || Date.parse(b.hold_until) > Date.now())
      .map((b) => ({ start: Date.parse(b.start_at), end: Date.parse(b.end_at) })),
    ...bilans,
    ...busyList.filter((b) => !(own && b.start === own.start && b.end === own.end)),
  ];
  return candidates.filter((iso) => {
    const s = Date.parse(iso), e = s + BILAN_MS;
    return !blocks.some((b) => overlaps(s, e, b.start - PAUSE_MS, b.end + PAUSE_MS));
  });
}

// ---------- Dates dans le fuseau de la cliente ----------
export const validTz = (tz: string | null | undefined) => {
  if (!tz) return GP_TZ;
  try { new Intl.DateTimeFormat("fr-FR", { timeZone: tz }); return tz; } catch { return GP_TZ; }
};
const TZ_NAMES: Record<string, string> = {
  "America/Guadeloupe": "Guadeloupe", "America/Martinique": "Martinique", "America/Cayenne": "Guyane",
  "Indian/Reunion": "La Réunion", "Indian/Mayotte": "Mayotte", "Europe/Paris": "Paris",
  "America/Montreal": "Montréal", "America/Toronto": "Montréal", "Africa/Abidjan": "Abidjan",
};
/** « heure de Paris », « heure de Guadeloupe »… */
export const tzLabel = (tz: string) => {
  const city = TZ_NAMES[tz] ?? tz.split("/").pop()!.replace(/_/g, " ");
  return /^[AEIOUÉ]/i.test(city) ? `heure d'${city}` : `heure de ${city}`;
};
