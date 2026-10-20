// Webhook Stripe : le cœur du système. Signature vérifiée, traitement idempotent
// (chaque étape vérifie si elle a déjà été faite, Stripe peut rejouer l'événement).
import { db } from "../_shared/core.ts";
import { verifyWebhook } from "../_shared/stripe.ts";
import { confirmBooking } from "../_shared/confirm.ts";

export const handler = async (req: Request): Promise<Response> => {
  const payload = await req.text();
  if (!(await verifyWebhook(payload, req.headers.get("stripe-signature")))) {
    return new Response("signature invalide", { status: 400 });
  }
  const event = JSON.parse(payload);
  const sb = db();

  const { data: seen } = await sb.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return new Response("déjà traité");

  try {
    const session = event.data.object;
    const bookingId = session.metadata?.booking_id ?? session.client_reference_id;

    if (event.type === "checkout.session.expired" && bookingId) {
      await sb.from("bookings").update({ status: "expired" }).eq("id", bookingId).eq("status", "pending");
      const { data: bk } = await sb.from("bookings").select("pack_id").eq("id", bookingId).maybeSingle();
      if (bk?.pack_id) await sb.from("packs").update({ status: "expired" }).eq("id", bk.pack_id).eq("status", "pending");
    }

    if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded")
        && session.payment_status === "paid" && bookingId) {
      const abonnement = session.mode === "subscription";
      if (abonnement) {
        // Abonnée tout de suite (la synchronisation Stripe de l'espace prendra le relais). Une ligne ajoutée
        // à la main par Vanille n'est pas touchée.
        const { data: bk } = await sb.from("bookings").select("clients(email)").eq("id", bookingId).maybeSingle();
        const email = (bk as any)?.clients?.email;
        if (email) {
          const jusqu = new Date(Date.now() + 40 * 86400e3).toISOString().slice(0, 10);
          await sb.from("mdb_members").upsert({ email, active_until: jusqu, note: "Stripe · en cours (Séance d'accompagnement individuel MDB)" },
            { onConflict: "email", ignoreDuplicates: true });
        }
      }
      await confirmBooking(bookingId, {
        // Abonnement : pas de remboursement automatique si elle annule (sa séance du mois redevient disponible)
        paymentIntent: abonnement ? null : session.payment_intent,
        paidAt: new Date((session.created ?? Date.now() / 1000) * 1000),
      });
    }

    await sb.from("stripe_events").insert({ id: event.id, type: event.type });
    return new Response("ok");
  } catch (e) {
    console.error("stripe-webhook", event.type, e);
    // 500 : Stripe réessaiera, les étapes déjà faites ne seront pas refaites.
    return new Response("erreur", { status: 500 });
  }
};
