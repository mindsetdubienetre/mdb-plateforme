// Rappel la veille à 18h, heure de la cliente. Appelé chaque heure par pg_cron.
// Protégé par une clé générée et stockée dans la base (schéma privé).
import { db, GP_TZ, json } from "../_shared/core.ts";
import { reminder, send } from "../_shared/email.ts";
import { loadBooking } from "../_shared/booking.ts";

/** Instant UTC correspondant à 18h00 la veille du rendez-vous, dans le fuseau `tz`. */
export function reminderAt(startIso: string, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(new Date(startIso)).map((x) => [x.type, x.value]));
  const guess = Date.UTC(+p.year, +p.month - 1, +p.day - 1, 18);
  // décalage du fuseau à cet instant (gère l'heure d'été de Paris, etc.)
  const q = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asLocal = Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour % 24, +q.minute);
  return guess - (asLocal - guess);
}

export const handler = async (req: Request): Promise<Response> => {
  const sb = db();
  const { data: ok } = await sb.rpc("check_cron_key", { p_key: req.headers.get("x-cron-key") ?? "" });
  if (ok !== true) return new Response("forbidden", { status: 403 });

  const now = Date.now();
  const { data: rows, error } = await sb.from("bookings").select("id,start_at,client_tz")
    .eq("status", "confirmed").is("reminder_sent_at", null)
    .gt("start_at", new Date(now).toISOString())
    .lt("start_at", new Date(now + 48 * 3600e3).toISOString());
  if (error) return json(req, { error: error.message }, 500);

  let sent = 0;
  for (const r of rows ?? []) {
    let tz = r.client_tz || GP_TZ;
    try { new Intl.DateTimeFormat("fr-FR", { timeZone: tz }); } catch { tz = GP_TZ; }
    if (now < reminderAt(new Date(r.start_at).toISOString(), tz)) continue;
    const loaded = await loadBooking(r.id);
    if (!loaded) continue;
    try {
      await send([{ email: loaded.info.email, name: loaded.info.first }], "On se voit demain", reminder(loaded.info));
      if (loaded.info.parent) await send([{ email: loaded.info.parent.email }], `Rappel : consultation de ${loaded.info.first} demain`, reminder(loaded.info));
      await sb.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", r.id);
      sent++;
    } catch (e) { console.error("reminder", r.id, e); }
  }
  return json(req, { sent });
};
