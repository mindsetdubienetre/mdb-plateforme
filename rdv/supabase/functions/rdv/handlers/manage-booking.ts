// Annuler ou déplacer son rendez-vous, depuis le lien signé reçu par email.
// GET  ?b=<id>&t=<token>                         → résumé
// POST { b, t, action: "slots" }                  → créneaux libres pour un report
// POST { b, t, action: "cancel" }                 → annulation + remboursement (si > 48h)
// POST { b, t, action: "move", start }            → report sur un autre créneau (si > 48h)
import { cors, db, HOUR_MS, json, MIN_NOTICE_MS } from "../_shared/core.ts";
import { freeSlots } from "../_shared/slots.ts";
import { moveEvent } from "../_shared/google.ts";
import { changeForVanille, ics, movedForClient, send } from "../_shared/email.ts";
import { cancelBooking } from "../_shared/cancel.ts";
import { loadBooking, vanilleEmail } from "../_shared/booking.ts";
import { monthKey } from "../_shared/members.ts";

const UUID = /^[0-9a-f-]{36}$/i;

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  let p: Record<string, any>;
  if (req.method === "GET") p = Object.fromEntries(new URL(req.url).searchParams);
  else { try { p = await req.json(); } catch { return json(req, { error: "json" }, 400); } }

  if (!UUID.test(p.b ?? "") || !UUID.test(p.t ?? "")) return json(req, { error: "lien" }, 404);
  const loaded = await loadBooking(p.b);
  if (!loaded || loaded.row.cancel_token !== p.t) return json(req, { error: "lien" }, 404);
  const { row, info } = loaded;

  const canChange = row.status === "confirmed" && Date.parse(info.start_at) - Date.now() > MIN_NOTICE_MS;
  const summary = { first: info.first, format: info.format, start: info.start_at, status: row.status, canChange, kind: row.kind };

  try {
    if (req.method === "GET") return json(req, summary);
    if (!canChange) return json(req, { error: "trop-tard", ...summary }, 409);
    const sb = db();

    if (p.action === "slots") {
      return json(req, { slots: await freeSlots(info.format) });
    }

    if (p.action === "cancel") {
      return json(req, { ok: true, status: await cancelBooking(row.id, "client") });
    }

    if (p.action === "move") {
      const start = new Date(String(p.start ?? "")).toISOString();
      const free = await freeSlots(info.format);
      if (!free.includes(start)) return json(req, { error: "taken" }, 409);
      // une séance de pack reste dans la durée de validité du pack
      if (info.pack?.expires_at && Date.parse(start) > Date.parse(info.pack.expires_at)) return json(req, { error: "pack" }, 409);
      const end = new Date(Date.parse(start) + HOUR_MS).toISOString();
      const { error } = await sb.from("bookings").update({
        start_at: start, end_at: end, reminder_sent_at: null,
        // une séance MDB incluse suit son nouveau mois (refusé si ce mois a déjà sa séance incluse)
        ...(row.kind === "mdb_included" ? { included_month: monthKey(start) } : {}),
      }).eq("id", row.id);
      if (error) return json(req, { error: (error as any).code === "23505" ? "taken" : "serveur" }, (error as any).code === "23505" ? 409 : 500);
      if (row.google_event_id) await moveEvent(row.google_event_id, start, end);
      const moved = { ...info, start_at: start, end_at: end };
      await Promise.allSettled([
        send([{ email: info.email, name: info.first }], "Ton rendez-vous est déplacé", movedForClient(moved), [ics(moved)]),
        info.parent && send([{ email: info.parent.email }], `Rendez-vous de ${info.first} déplacé`, movedForClient(moved), [ics(moved)]),
        send([{ email: vanilleEmail() }], `Report : ${info.first}`, changeForVanille(moved, "déplacé", info.start_at)),
      ]);
      return json(req, { ok: true, start });
    }

    return json(req, { error: "action" }, 400);
  } catch (e) {
    console.error("manage-booking", e);
    return json(req, { error: "serveur" }, 500);
  }
};
