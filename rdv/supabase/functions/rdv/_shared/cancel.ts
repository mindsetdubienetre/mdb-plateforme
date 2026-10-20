// Annulation commune (cliente via son lien, ou Vanille depuis son espace) :
// remboursement intégral Stripe, suppression de l'événement Google, emails.
import { db } from "./core.ts";
import { stripe } from "./stripe.ts";
import { deleteEvent } from "./google.ts";
import { b64, cancelledForClient, changeForVanille, send } from "./email.ts";
import { issueCreditNote } from "./invoice.ts";
import { loadBooking, vanilleEmail } from "./booking.ts";

export async function cancelBooking(id: string, by: "client" | "vanille") {
  const loaded = await loadBooking(id);
  if (!loaded) throw new Error("introuvable");
  const { row, info } = loaded;
  if (row.status !== "confirmed") return row.status;

  const refunded = !!row.stripe_payment_intent;
  if (refunded) {
    await stripe("/refunds", { payment_intent: row.stripe_payment_intent, metadata: { booking_id: row.id } }, "POST", `refund-${row.id}`);
  }
  await db().from("bookings").update({
    status: refunded ? "refunded" : "cancelled", cancelled_by: by, cancelled_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (row.google_event_id) await deleteEvent(row.google_event_id).catch((e) => console.error("deleteEvent", e));

  // Remboursement = facture d'avoir qui annule la facture (obligation comptable)
  let attachments: { name: string; content: string }[] = [];
  if (refunded) {
    try {
      const cn = await issueCreditNote(row.id);
      if (cn) attachments = [{ name: `avoir-${cn.number}.pdf`, content: b64(cn.bytes) }];
    } catch (e) { console.error("avoir", row.id, e); }
  }

  const mail = cancelledForClient(info, by, refunded, attachments.length > 0);
  const payerTo = info.parent ? [{ email: info.parent.email }] : null;
  await Promise.allSettled([
    send([{ email: info.email, name: info.first }], "Ton rendez-vous est annulé", mail, payerTo ? [] : attachments),
    payerTo && send(payerTo, `Rendez-vous de ${info.first} annulé`, mail, attachments),
    by === "client" && send([{ email: vanilleEmail() }], `Annulation : ${info.first}`, changeForVanille(info, "annulé")),
  ]);
  return refunded ? "refunded" : "cancelled";
}
