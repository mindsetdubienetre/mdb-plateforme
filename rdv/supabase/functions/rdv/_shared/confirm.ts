// Confirmation d'une réservation, payée (webhook Stripe) ou incluse dans l'abonnement MDB.
import { ADDRESS, db, env } from "./core.ts";
import { PACKS, type PackType } from "./pricing.ts";
import { createEvent } from "./google.ts";
import { issueInvoice } from "./invoice.ts";
import { b64, confirmation, ics, notifyVanille, send } from "./email.ts";
import { adminUrl, loadBooking, vanilleEmail } from "./booking.ts";

/** Confirme une réservation : agenda (+ Meet), facture si payée, emails. Idempotent. */
export async function confirmBooking(bookingId: string, pay: { paymentIntent: string | null; paidAt: Date } | null) {
  const sb = db();
  const loaded = await loadBooking(bookingId);
  if (!loaded) throw new Error(`réservation introuvable ${bookingId}`);
  let { row, info } = loaded;

  // Achat d'un pack : le paiement concerne le pack, pas la séance (annuler la séance la recrédite)
  const packPurchase = !!(pay && row.pack_id && info.pack);
  if (packPurchase && !info.pack!.stripe_payment_intent) {
    const months = PACKS[info.pack!.type as PackType].months;
    const exp = new Date(pay!.paidAt); exp.setMonth(exp.getMonth() + months);
    await sb.from("packs").update({
      status: "active", purchased_at: pay!.paidAt.toISOString(), expires_at: exp.toISOString(),
      stripe_payment_intent: pay!.paymentIntent,
    }).eq("id", row.pack_id);
    info.pack = { ...info.pack!, expires_at: exp.toISOString() };
  }
  info.pack_purchase = packPurchase;

  // 1. Réservation confirmée
  if (row.status !== "confirmed") {
    const { error } = await sb.from("bookings").update({
      status: "confirmed", confirmed_at: new Date().toISOString(), hold_until: null,
      stripe_payment_intent: packPurchase ? null : pay?.paymentIntent ?? null,
    }).eq("id", bookingId);
    if (error) throw error; // ex. créneau repris entre-temps : à traiter à la main (remboursement)
  }

  // 2. Événement Google Agenda (+ lien Meet en visio)
  if (!row.google_event_id) {
    const ev = await createEvent({
      bookingId, format: info.format, start: info.start_at, end: info.end_at,
      firstName: info.first, lastInitial: info.last.charAt(0).toUpperCase(),
      phone: info.phone, adminUrl: adminUrl(bookingId), address: ADDRESS,
    });
    await sb.from("bookings").update({ google_event_id: ev.id, meet_link: ev.meetLink }).eq("id", bookingId);
    info = { ...info, meet_link: ev.meetLink };
  }

  if (row.notified_at) return;

  // 3. Facture (au nom du parent si mineure) : seulement s'il y a eu un paiement
  const attachments = [ics(info)];
  const paidCents = packPurchase ? info.pack!.amount_cents : row.amount_cents;
  if (pay && paidCents > 0) {
    const payer = info.parent ? `${info.parent.first} ${info.parent.last}` : `${info.first} ${info.last}`;
    const payerEmail = info.parent ? info.parent.email : info.email;
    const invoice = await issueInvoice({
      bookingId, format: info.format, startAt: info.start_at, billedTo: payer, billedEmail: payerEmail,
      paidAt: pay.paidAt, amountCents: paidCents,
      label: packPurchase ? `${PACKS[info.pack!.type as PackType].name} : ${info.pack!.sessions_total} séances de coaching psychothérapie,` : undefined,
      detail: packPurchase ? `1 heure chacune, valable jusqu'au ${new Intl.DateTimeFormat("fr-FR", { timeZone: "America/Guadeloupe" }).format(new Date(info.pack!.expires_at!))}`
        : row.kind === "mdb_extra" ? "membre MDB" : row.kind === "followup" ? "séance de suivi"
        : row.kind === "mdb_included" ? "abonnement mensuel, séance du mois" : undefined,
    });
    attachments.unshift({ name: `facture-${invoice.number}.pdf`, content: b64(invoice.bytes) });
  }

  // 4. Emails
  await send([{ email: info.email, name: info.first }], "Ta consultation est réservée", confirmation(info), attachments);
  if (info.parent) {
    await send([{ email: info.parent.email, name: info.parent.first }], `Consultation de ${info.first} confirmée`, confirmation(info, true), attachments);
  }

  const { data: form } = await sb.from("intake_forms").select("answers,message").eq("booking_id", bookingId).maybeSingle();
  // Le mot laissé en réservant devient le premier message de sa discussion dans l'espace de Vanille
  if (form?.message?.trim()) {
    const quand = new Intl.DateTimeFormat("fr-FR", { timeZone: "America/Guadeloupe", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(info.start_at));
    const { error: me } = await sb.from("messages").insert({ client_id: row.client_id, de: "cliente", texte: `Message laissé en réservant (séance du ${quand}) :\n\n${form.message.trim()}` });
    if (me) console.error("message réservation", me.message);
  }
  const flags = {
    aBout: form?.answers?.q4 === "Je suis à bout",
    minor: !!info.parent,
    message: !!form?.message?.trim(),
    mdb: row.kind === "mdb_included" && pay ? "Nouvel abonnement mensuel (85 €) · séance du mois"
      : row.kind === "mdb_included" ? "Séance MDB incluse ce mois-ci" : row.kind === "mdb_extra" ? "Membre MDB, séance à 85 €"
      : info.pack ? (packPurchase ? `${PACKS[info.pack.type as PackType].name} acheté (${info.pack.sessions_total} séances)` : `Séance prise sur son ${PACKS[info.pack.type as PackType].name}`)
      : row.kind === "followup" ? "Séance de suivi" : "",
  };
  await send([{ email: vanilleEmail() }], `Nouvelle réservation : ${info.first}${flags.aBout || flags.minor || flags.message ? " ⚑" : ""}${row.kind.startsWith("mdb") ? " · MDB" : info.pack ? " · Pack" : ""}`,
    notifyVanille(info, flags, adminUrl(bookingId)));

  // Notification sur le téléphone de Vanille (si activée dans son espace) : rien de plus que le prénom et l'heure
  try {
    const quand = new Intl.DateTimeFormat("fr-FR", { timeZone: "America/Guadeloupe", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(info.start_at));
    await fetch(`${env("SUPABASE_URL")}/functions/v1/push`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ action: "interne", titre: `Nouvelle réservation : ${info.first}`, texte: `${quand} · ${info.format === "visio" ? "visio" : "au cabinet"}`,
        url: adminUrl(bookingId), tag: `rdv-${bookingId}` }),
    });
  } catch (e) { console.error("push vanille", e); }

  await sb.from("bookings").update({ notified_at: new Date().toISOString() }).eq("id", bookingId);
}
