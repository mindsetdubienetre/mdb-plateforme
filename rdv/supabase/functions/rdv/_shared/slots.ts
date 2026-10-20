import { candidateSlots, db, HOUR_MS, overlaps } from "./core.ts";
import { busy } from "./google.ts";
import { bilanIntervals, PAUSE_MS } from "./bilan.ts";

/** Libère les créneaux en attente dont le délai de paiement est dépassé. */
export async function expireStaleHolds() {
  await db().from("bookings")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("hold_until", new Date().toISOString());
}

/**
 * Créneaux réellement libres : règles horaires − rendez-vous actifs en base − « occupé » Google.
 * `ignoreBookingId` permet à une cliente qui déplace son rendez-vous de ne pas se bloquer elle-même.
 */
export async function freeSlots(format: string, opts: { ignoreBookingId?: string; ignoreGoogleEventStart?: string } = {}) {
  const candidates = candidateSlots(format);
  if (!candidates.length) return [];
  await expireStaleHolds();

  const timeMin = candidates[0];
  const timeMax = new Date(Date.parse(candidates[candidates.length - 1]) + HOUR_MS).toISOString();

  const [{ data: taken, error }, busyList, bilans] = await Promise.all([
    db().from("bookings").select("id,start_at")
      .in("status", ["pending", "confirmed"])
      .gte("start_at", timeMin).lte("start_at", timeMax),
    busy(timeMin, timeMax),
    bilanIntervals(new Date(Date.parse(timeMin) - HOUR_MS).toISOString(), timeMax),
  ]);
  if (error) throw error;

  const takenSet = new Set(
    (taken ?? []).filter((b) => b.id !== opts.ignoreBookingId).map((b) => Date.parse(b.start_at)),
  );
  const ignore = opts.ignoreGoogleEventStart ? Date.parse(opts.ignoreGoogleEventStart) : null;

  return candidates.filter((iso) => {
    const s = Date.parse(iso), e = s + HOUR_MS;
    if (takenSet.has(s)) return false;
    // Bilan de vente : 10 minutes de pause avant et après
    if (bilans.some((b) => overlaps(s, e, b.start - PAUSE_MS, b.end + PAUSE_MS))) return false;
    // Le rendez-vous qu'on déplace occupe son propre créneau dans l'agenda : on l'ignore.
    return !busyList.some((b) => !(ignore !== null && b.start === ignore && b.end === ignore + HOUR_MS) && overlaps(s, e, b.start, b.end));
  });
}
