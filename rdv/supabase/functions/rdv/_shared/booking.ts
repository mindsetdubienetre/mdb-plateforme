import { db, env } from "./core.ts";
import type { BookingInfo } from "./email.ts";

export async function loadBooking(id: string) {
  const { data, error } = await db().from("bookings")
    .select("*, clients(first_name,last_name,email,phone,birth_date), packs(type,sessions_total,amount_cents,expires_at,stripe_payment_intent)")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const c = (data as any).clients;
  const info: BookingInfo = {
    id: data.id, format: data.format, start_at: new Date(data.start_at).toISOString(), end_at: new Date(data.end_at).toISOString(),
    client_tz: data.client_tz, meet_link: data.meet_link, cancel_token: data.cancel_token,
    first: c.first_name, last: c.last_name, email: c.email, phone: c.phone, parent: data.parent,
    kind: data.kind, amount_cents: data.amount_cents,
    pack: (data as any).packs ?? null,
  };
  return { row: data, info };
}

// Lien vers la fiche pour Vanille : le rendez-vous dans son espace (espace.vanille-naime.com)
export const adminUrl = (id: string) =>
  env("ADMIN_URL_TEMPLATE", "https://espace.vanille-naime.com/vanille#rendez-vous/{id}").replace("{id}", id);

export const vanilleEmail = () => env("VANILLE_EMAIL", "contact@vanille-naime.com");
