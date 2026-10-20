// POST /create-checkout  →  { url }  (ou 409 si le créneau vient d'être pris)
// Revérifie l'agenda, bloque le créneau le temps du paiement, enregistre la fiche,
// puis ouvre une session Stripe Checkout.
import { cors, db, HOUR_MS, json, RULES, fmtDate, fmtHour, originOrSite } from "../_shared/core.ts";
import { freeSlots } from "../_shared/slots.ts";
import { stripe } from "../_shared/stripe.ts";
import { checkCode, memberProfile } from "../_shared/members.ts";
import { ABONNEMENT_PRICE, clientStatus, type Offer, PACKS, packUsed, quote } from "../_shared/pricing.ts";
import { confirmBooking } from "../_shared/confirm.ts";

// Stripe impose au moins 30 min avant expiration d'une session Checkout :
// le créneau reste donc réservé ~30 min (au lieu de 15) pendant le paiement.
// Le blocage dure un peu plus longtemps que la session Stripe, pour qu'un
// paiement validé à la dernière seconde trouve toujours son créneau libre.
const STRIPE_TTL_MS = 30.5 * 60e3;
const HOLD_MS = 35 * 60e3;

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);

  let b: Record<string, any>;
  try { b = await req.json(); } catch { return json(req, { error: "json" }, 400); }

  // ---------- Validation ----------
  const format = str(b.format);
  const start = str(b.start);
  const c = b.client ?? {};
  const client = {
    first: str(c.first, 80), last: str(c.last, 80), email: str(c.email, 200).toLowerCase(),
    phone: str(c.phone, 40), dob: str(c.dob, 10), tz: str(c.tz, 60) || null,
  };
  const offer = (str(b.offer, 20) || "single") as Offer;
  // Déjà venue (pack, MDB, suivi) : vérifiée par le code reçu sur son email.
  // Ses coordonnées sont déjà connues, on complète ce qui manque.
  const memberCode = str(b.member?.code, 10);
  let status: Awaited<ReturnType<typeof clientStatus>> | null = null;
  if (memberCode) {
    if (!emailOk(client.email) || !(await checkCode(client.email, memberCode))) return json(req, { error: "code" }, 400);
    status = await clientStatus(client.email);
    if (status.known) {
      const pr = await memberProfile(client.email);
      client.first ||= pr.first; client.last ||= pr.last; client.phone ||= pr.phone; client.dob ||= pr.dob;
    }
  }
  const known = !!status?.known;

  const dobOk = /^\d{4}-\d{2}-\d{2}$/.test(client.dob);
  const fieldsOk = known
    ? !!client.first && emailOk(client.email) && (!client.dob || dobOk)
    : !!client.first && !!client.last && emailOk(client.email) && !!client.phone && dobOk;
  if (!RULES[format] || !start || !fieldsOk) return json(req, { error: "champs" }, 400);
  const startMs = Date.parse(start);
  const at = new Date(startMs);
  let minor = false;
  if (dobOk) {
    const [y, m, d] = client.dob.split("-").map(Number);
    let age = at.getUTCFullYear() - y;
    if (at.getUTCMonth() + 1 < m || (at.getUTCMonth() + 1 === m && at.getUTCDate() < d)) age--;
    minor = age < 18;
  }

  let parent: Record<string, string> | null = null;
  if (minor && known && !b.parent) {
    // Déjà venu avec moins de 18 ans : on reprend le parent de sa dernière réservation
    const { data: last } = await db().from("bookings").select("parent, clients!inner(email)")
      .eq("clients.email", client.email).not("parent", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.parent) b.parent = { ...(last.parent as Record<string, string>), auth: true };
  }
  if (minor) {
    const p = b.parent ?? {};
    parent = { first: str(p.first, 80), last: str(p.last, 80), email: str(p.email, 200).toLowerCase(), phone: str(p.phone, 40) };
    if (!parent.first || !parent.last || !emailOk(parent.email) || !parent.phone || p.auth !== true) {
      return json(req, { error: "parent" }, 400);
    }
  }
  const consents = b.consents ?? {};
  if (consents.accomp !== true || consents.conf !== true || consents.cancel !== true) return json(req, { error: "consentements" }, 400);

  const answers = typeof b.answers === "object" && b.answers ? b.answers : {};
  const message = str(b.message, 5000) || null;

  const sb = db();
  let heldId: string | null = null;
  try {
    // ---------- Une cliente qui revient du paiement sur le même créneau ----------
    const { data: prev } = await sb.from("bookings")
      .select("id, stripe_session_id, clients!inner(email)")
      .eq("status", "pending").eq("start_at", at.toISOString()).maybeSingle();
    if (prev && (prev as any).clients.email.toLowerCase() === client.email) {
      if (prev.stripe_session_id) await stripe(`/checkout/sessions/${prev.stripe_session_id}/expire`).catch(() => {});
      await sb.from("bookings").update({ status: "expired" }).eq("id", prev.id);
    }

    // ---------- Revérification juste avant paiement (agenda + base) ----------
    const free = await freeSlots(format);
    if (!free.includes(at.toISOString())) return json(req, { error: "taken" }, 409);

    // ---------- Cliente (fiche unique par email) ----------
    const { data: cl, error: ce } = await sb.from("clients").upsert({
      email: client.email, first_name: client.first, last_name: client.last || "",
      phone: client.phone || null, birth_date: dobOk ? client.dob : null, updated_at: new Date().toISOString(),
    }, { onConflict: "email" }).select("id").single();
    if (ce) throw ce;

    // ---------- Tarif : 95 €, suivi 85 €, moins de 18 ans 70 €, pack, séance incluse ----------
    const price = await quote(offer, at.toISOString(), minor, status);
    if ("error" in price) return json(req, { error: price.error }, 400);
    const minorRate = price.minorRate;

    // Achat d'un pack : il devient actif au paiement
    let packId = price.packId;
    if (price.newPack) {
      const pk = PACKS[price.newPack];
      const { data: pack, error: pe } = await sb.from("packs").insert({
        client_id: cl.id, type: price.newPack, sessions_total: pk.sessions, amount_cents: pk.cents,
      }).select("id").single();
      if (pe) throw pe;
      packId = pack.id;
    }

    // ---------- Blocage du créneau (l'index unique empêche la double réservation) ----------
    const { data: booking, error: be } = await sb.from("bookings").insert({
      client_id: cl.id, format, start_at: at.toISOString(), end_at: new Date(startMs + HOUR_MS).toISOString(),
      status: "pending", hold_until: new Date(Date.now() + HOLD_MS).toISOString(),
      amount_cents: price.kind === "pack" ? 0 : price.amount, kind: price.kind, included_month: price.month,
      client_tz: client.tz, parent, pack_id: packId,
    }).select("id, cancel_token").single();
    if (be) {
      // 23505 : créneau pris, ou séance incluse du mois déjà réservée entre-temps
      if ((be as any).code === "23505") return json(req, { error: "taken" }, 409);
      throw be;
    }

    heldId = booking.id;
    // Séance prise sur un pack : on vérifie qu'il en restait bien une (deux réservations simultanées)
    if (price.packId && (await packUsed(price.packId)) > (status?.pack?.total ?? 0)) {
      await sb.from("bookings").update({ status: "expired" }).eq("id", booking.id);
      return json(req, { error: "pack" }, 400);
    }

    const { error: fe } = await sb.from("intake_forms").insert({
      booking_id: booking.id, answers, message,
      consents: {
        ni_medecin_ni_psychologue: true, confidentialite: true, annulation: true,
        parent_autorisation: minor ? true : undefined, at: new Date().toISOString(),
      },
    });
    if (fe) throw fe;

    // ---------- Séance incluse (MDB ou pack) : pas de paiement, confirmation directe ----------
    if (price.amount === 0) {
      await checkCode(client.email, memberCode, true); // code utilisé
      // La réservation est confirmée dès la 1re étape ; un souci d'email ne doit pas faire échouer la cliente.
      try { await confirmBooking(booking.id, null); } catch (e) { console.error("confirm incluse", booking.id, e); }
      return json(req, { url: `${originOrSite(req)}/?paiement=ok`, included: true });
    }
    if (memberCode) await checkCode(client.email, memberCode, true);

    // ---------- Stripe Checkout ----------
    const label = `${fmtDate(at.toISOString())} à ${fmtHour(at.toISOString())} (heure de Guadeloupe)`;
    // Abonnement mensuel : le 1er paiement démarre l'abonnement et couvre la séance de ce mois
    const session = price.subscription ? await stripe("/checkout/sessions", {
      mode: "subscription",
      locale: "fr",
      customer_email: client.email,
      client_reference_id: booking.id,
      expires_at: Math.floor((Date.now() + STRIPE_TTL_MS) / 1000),
      line_items: { 0: { quantity: 1, price: ABONNEMENT_PRICE() } },
      subscription_data: { metadata: { booking_id: booking.id, origine: "page de rendez-vous" } },
      custom_text: { submit: { message: `85 € par mois, 1 séance comprise chaque mois. Ta première séance : ${label}.` } },
      metadata: { booking_id: booking.id },
      success_url: `${originOrSite(req)}/?paiement=ok`,
      cancel_url: `${originOrSite(req)}/?paiement=annule`,
    }, "POST", `checkout-${booking.id}`) : await stripe("/checkout/sessions", {
      mode: "payment",
      locale: "fr",
      customer_email: minor ? parent!.email : client.email,
      client_reference_id: booking.id,
      expires_at: Math.floor((Date.now() + STRIPE_TTL_MS) / 1000),
      line_items: {
        0: {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: price.amount,
            product_data: {
              name: price.newPack
                ? `${PACKS[price.newPack].name} · ${PACKS[price.newPack].sessions} séances de coaching psychothérapie`
                : `Séance de coaching psychothérapie · ${format === "visio" ? "Visio" : "Présentiel au Moule"}${minorRate ? " · moins de 18 ans" : price.kind === "followup" ? " · suivi" : price.kind === "mdb_extra" ? " · membre MDB" : ""}`,
              description: price.newPack
                ? `Valable ${PACKS[price.newPack].months} mois · 1re séance : ${label}`
                : `1 heure avec Vanille Naime · ${label}`,
            },
          },
        },
      },
      payment_intent_data: { metadata: { booking_id: booking.id } },
      metadata: { booking_id: booking.id },
      success_url: `${originOrSite(req)}/?paiement=ok`,
      cancel_url: `${originOrSite(req)}/?paiement=annule`,
    }, "POST", `checkout-${booking.id}`);

    await sb.from("bookings").update({ stripe_session_id: session.id }).eq("id", booking.id);
    return json(req, { url: session.url });
  } catch (e) {
    console.error("create-checkout", e);
    // on ne garde pas le créneau bloqué si le paiement n'a pas pu démarrer
    if (heldId) await sb.from("bookings").update({ status: "expired" }).eq("id", heldId).eq("status", "pending");
    return json(req, { error: "serveur" }, 500);
  }
};
