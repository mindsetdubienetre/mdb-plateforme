// « Bilan de ton système nerveux » (appel de vente offert, 20 min)
// GET  /bilan-availability                        → { slots: [ISO UTC, ...] }
// POST /bilan-book { prenom, email, mode, whatsapp, quiz, deborde[], message, start, tz, hp }
//                                                 → { ok, bilan: { start, mode, whatsapp, tz, lines } } | 409 taken
// GET  /bilan-manage?b=<id>&t=<token>             → résumé
// POST /bilan-manage { b, t, action: "slots" | "cancel" | "move", start? }
// POST /bilan-reminders  (pg_cron toutes les 5 min, x-cron-key) → rappels la veille et 1 h avant
import { cors, db, env, GP_TZ, json } from "../_shared/core.ts";
import { BILAN_MS, BILAN_NOTICE_MS, DEBORDE, freeBilanSlots, MODES, QUIZ, validTz } from "../_shared/bilan.ts";
import {
  type Bilan, bilanCancelled, bilanChangeForVanille, bilanConfirmation, bilanEventText, bilanForVanille, bilanIcs,
  bilanMoved, bilanReminder1h, bilanReminderVeille, confirmLines,
} from "../_shared/bilan-mail.ts";
import { createBilanEvent, deleteEvent, moveEvent } from "../_shared/google.ts";
import { send } from "../_shared/email.ts";
import { vanilleEmail } from "../_shared/booking.ts";
import { reminderAt } from "./reminders.ts";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const UUID = /^[0-9a-f-]{36}$/i;
const COLS = "id,prenom,email,mode,whatsapp,quiz,deborde,message,start_at,end_at,client_tz,meet_link,cancel_token,status,google_event_id,created_at";

/** « +590 690 12 34 56 », « 0033 6… » → « +590690123456 » ; null si ce n'est pas un numéro international. */
export const normPhone = (v: string) => {
  const s = v.replace(/[\s.\-()]/g, "").replace(/^00/, "+");
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
};

const iso = (v: string) => new Date(v).toISOString();
const asBilan = (r: Record<string, any>): Bilan => ({ ...r, start_at: iso(r.start_at), end_at: iso(r.end_at) } as Bilan);
const publicView = (b: Bilan) => ({ start: b.start_at, mode: b.mode, whatsapp: b.whatsapp, tz: validTz(b.client_tz), prenom: b.prenom, lines: confirmLines(b) });

// ---------- Disponibilités ----------
export const availability = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  try {
    return json(req, { slots: await freeBilanSlots() });
  } catch (e) {
    console.error("bilan-availability", e);
    return json(req, { error: "agenda" }, 503);
  }
};

// ---------- Réservation ----------
export const book = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);
  let b: Record<string, any>;
  try { b = await req.json(); } catch { return json(req, { error: "json" }, 400); }
  if (b.hp) return json(req, { ok: true }); // champ piège rempli : robot

  const prenom = str(b.prenom, 60);
  const email = str(b.email, 200).toLowerCase();
  const mode = str(b.mode, 10) as Bilan["mode"];
  const whatsapp = normPhone(str(b.whatsapp, 40));
  const quiz = QUIZ.includes(str(b.quiz, 80)) ? str(b.quiz, 80) : null;
  const deborde = Array.isArray(b.deborde) ? DEBORDE.filter((d) => b.deborde.includes(d)) : [];
  const message = str(b.message, 2000) || null;
  const start = str(b.start, 40);
  const tz = validTz(str(b.tz, 60) || null);
  if (!prenom || !emailOk(email) || !MODES.includes(mode) || !whatsapp || !start || isNaN(Date.parse(start))) {
    return json(req, { error: "champs" }, 400);
  }
  const startIso = iso(start);
  const sb = db();

  try {
    // Un seul bilan à venir par personne (pour changer d'horaire : le lien reçu par email)
    const { data: existing } = await sb.from("bilans").select("id").eq("email", email).eq("status", "confirmed")
      .gt("start_at", new Date().toISOString()).limit(1).maybeSingle();
    if (existing) return json(req, { error: "deja" }, 409);

    if (!(await freeBilanSlots()).includes(startIso)) return json(req, { error: "taken" }, 409);

    const endIso = new Date(Date.parse(startIso) + BILAN_MS).toISOString();
    const { data: row, error } = await sb.from("bilans").insert({
      prenom, email, mode, whatsapp, quiz, deborde, message, start_at: startIso, end_at: endIso, client_tz: tz,
    }).select(COLS).single();
    if (error) {
      if ((error as any).code === "23505") return json(req, { error: "taken" }, 409);
      throw error;
    }
    let bilan = asBilan(row);

    // Agenda Google (+ lien Meet). Sans agenda, on n'enregistre pas le bilan.
    let eventUrl: string | null = null;
    try {
      const ev = await createBilanEvent({
        bilanId: bilan.id, meet: mode === "meet", start: startIso, end: endIso,
        summary: `Bilan · ${mode === "meet" ? "Meet" : "WhatsApp"} · ${prenom}`, description: bilanEventText(bilan),
      });
      await sb.from("bilans").update({ google_event_id: ev.id, meet_link: ev.meetLink }).eq("id", bilan.id);
      bilan = { ...bilan, meet_link: ev.meetLink };
      eventUrl = ev.htmlLink;
    } catch (e) {
      console.error("bilan agenda", e);
      await sb.from("bilans").delete().eq("id", bilan.id);
      return json(req, { error: "agenda" }, 503);
    }

    const sent = await Promise.allSettled([
      send([{ email, name: prenom }], "Ton bilan est réservé", bilanConfirmation(bilan), [bilanIcs(bilan)]),
      send([{ email: vanilleEmail() }], `Nouveau bilan : ${prenom}`, bilanForVanille(bilan, eventUrl)),
    ]);
    sent.forEach((s) => s.status === "rejected" && console.error("bilan email", s.reason));

    // Notification sur le téléphone de Vanille (si activée dans son espace) : prénom, heure et mode seulement
    try {
      const quand = new Intl.DateTimeFormat("fr-FR", { timeZone: GP_TZ, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(startIso));
      await fetch(`${env("SUPABASE_URL")}/functions/v1/push`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ action: "interne", titre: `Nouveau bilan : ${prenom}`, texte: `${quand} · ${mode === "meet" ? "Meet" : "WhatsApp"}`,
          url: `${env("ESPACE_URL", "https://espace.vanille-naime.com")}/vanille`, tag: `bilan-${bilan.id}` }),
      });
    } catch (e) { console.error("push bilan", e); }
    return json(req, { ok: true, bilan: publicView(bilan) });
  } catch (e) {
    console.error("bilan-book", e);
    return json(req, { error: "serveur" }, 500);
  }
};

// ---------- Annulation commune (cliente via son lien, ou Vanille depuis son espace) ----------
export async function cancelBilan(id: string, by: "client" | "vanille") {
  const sb = db();
  const { data: row } = await sb.from("bilans").select(COLS).eq("id", id).maybeSingle();
  if (!row) throw new Error("introuvable");
  if (row.status !== "confirmed") return row.status as string;
  await sb.from("bilans").update({ status: "cancelled", cancelled_by: by, cancelled_at: new Date().toISOString() }).eq("id", id);
  if (row.google_event_id) await deleteEvent(row.google_event_id).catch((e) => console.error("bilan deleteEvent", e));
  const bilan = asBilan(row);
  await Promise.allSettled([
    send([{ email: bilan.email, name: bilan.prenom }], "Ton bilan est annulé", bilanCancelled(bilan, by)),
    by === "client" && send([{ email: vanilleEmail() }], `Bilan annulé : ${bilan.prenom}`, bilanChangeForVanille(bilan, "annulé")),
  ]);
  return "cancelled";
}

// ---------- Déplacer ou annuler (lien signé de l'email) ----------
export const manage = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  let p: Record<string, any>;
  if (req.method === "GET") p = Object.fromEntries(new URL(req.url).searchParams);
  else { try { p = await req.json(); } catch { return json(req, { error: "json" }, 400); } }
  if (!UUID.test(p.b ?? "") || !UUID.test(p.t ?? "")) return json(req, { error: "lien" }, 404);

  const sb = db();
  const { data: row } = await sb.from("bilans").select(COLS).eq("id", p.b).maybeSingle();
  if (!row || row.cancel_token !== p.t) return json(req, { error: "lien" }, 404);
  const bilan = asBilan(row);
  const canChange = row.status === "confirmed" && Date.parse(bilan.start_at) - Date.now() > BILAN_NOTICE_MS;
  const summary = { ...publicView(bilan), status: row.status, canChange };

  try {
    if (req.method === "GET") return json(req, summary);
    if (!canChange) return json(req, { error: "trop-tard", ...summary }, 409);
    const own = { id: bilan.id, start: bilan.start_at, end: bilan.end_at };

    if (p.action === "slots") return json(req, { slots: await freeBilanSlots(own) });
    if (p.action === "cancel") return json(req, { ok: true, status: await cancelBilan(bilan.id, "client") });
    if (p.action === "move") {
      const start = iso(String(p.start ?? ""));
      if (!(await freeBilanSlots(own)).includes(start)) return json(req, { error: "taken" }, 409);
      const end = new Date(Date.parse(start) + BILAN_MS).toISOString();
      const { error } = await sb.from("bilans").update({
        start_at: start, end_at: end, reminder_veille_at: null, reminder_1h_at: null, updated_at: new Date().toISOString(),
      }).eq("id", bilan.id);
      if (error) {
        const taken = (error as any).code === "23505";
        return json(req, { error: taken ? "taken" : "serveur" }, taken ? 409 : 500);
      }
      const moved = { ...bilan, start_at: start, end_at: end };
      if (row.google_event_id) {
        await moveEvent(row.google_event_id, start, end).catch((e) => console.error("bilan moveEvent", e));
      }
      await Promise.allSettled([
        send([{ email: bilan.email, name: bilan.prenom }], "Ton bilan est déplacé", bilanMoved(moved), [bilanIcs(moved)]),
        send([{ email: vanilleEmail() }], `Bilan déplacé : ${bilan.prenom}`, bilanChangeForVanille(moved, "déplacé", bilan.start_at)),
      ]);
      return json(req, { ok: true, bilan: publicView(moved) });
    }
    return json(req, { error: "action" }, 400);
  } catch (e) {
    console.error("bilan-manage", e);
    return json(req, { error: "serveur" }, 500);
  }
};

// ---------- Rappels : la veille à 18h (heure de la cliente), puis 1 heure avant ----------
export const reminders = async (req: Request): Promise<Response> => {
  const sb = db();
  const { data: ok } = await sb.rpc("check_cron_key", { p_key: req.headers.get("x-cron-key") ?? "" });
  if (ok !== true) return new Response("forbidden", { status: 403 });

  const now = Date.now();
  const { data: rows, error } = await sb.from("bilans").select(`${COLS},reminder_veille_at,reminder_1h_at`)
    .eq("status", "confirmed").gt("start_at", new Date(now).toISOString())
    .lt("start_at", new Date(now + 48 * 3600e3).toISOString());
  if (error) return json(req, { error: error.message }, 500);

  let sent = 0;
  for (const r of rows ?? []) {
    const b = asBilan(r);
    const start = Date.parse(b.start_at);
    try {
      // 1 heure avant (le cron passe toutes les 5 minutes, les bilans commencent à l'heure ou à la demie)
      if (!r.reminder_1h_at && start - now <= 61 * 60e3) {
        await send([{ email: b.email, name: b.prenom }], b.mode === "meet" ? "On se retrouve dans une heure" : "Je t'appelle dans une heure", bilanReminder1h(b));
        await sb.from("bilans").update({ reminder_1h_at: new Date().toISOString() }).eq("id", b.id);
        sent++;
        continue;
      }
      // La veille à 18h, si le bilan a été réservé avant ce moment-là
      const veille = reminderAt(b.start_at, validTz(b.client_tz) || GP_TZ);
      if (!r.reminder_veille_at && now >= veille && Date.parse(r.created_at) < veille && start - now > 2 * 3600e3) {
        await send([{ email: b.email, name: b.prenom }], "Ton bilan, c'est demain", bilanReminderVeille(b));
        await sb.from("bilans").update({ reminder_veille_at: new Date().toISOString() }).eq("id", b.id);
        sent++;
      }
    } catch (e) { console.error("bilan reminder", b.id, e); }
  }
  return json(req, { sent });
};
