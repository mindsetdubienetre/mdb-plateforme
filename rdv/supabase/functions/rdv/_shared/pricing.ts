// Tarifs et packs. Première séance 95 €, suivi 85 €, moins de 18 ans 70 € pour toute séance.
// Packs payés en une fois, validité comptée à partir de l'achat.
import { db, env, MINOR_PRICE_CENTS, PRICE_CENTS } from "./core.ts";
import { memberStatus, monthKey } from "./members.ts";

export const FOLLOWUP_CENTS = 8500;

export const PACKS = {
  demarrage: { name: "Pack Démarrage", sessions: 3, cents: 24500, months: 3, forNew: true },
  accompagnement: { name: "Pack Accompagnement", sessions: 6, cents: 47000, months: 6, forNew: true },
  suivi: { name: "Pack Suivi", sessions: 5, cents: 39000, months: 5, forNew: false },
} as const;
export type PackType = keyof typeof PACKS;
export const isPackType = (v: unknown): v is PackType => typeof v === "string" && v in PACKS;

/** Valeur des séances faites au tarif à l'unité (pour rembourser un pack entamé). */
export const unitValue = (type: PackType, used: number) =>
  PACKS[type].forNew ? (used > 0 ? PRICE_CENTS + (used - 1) * FOLLOWUP_CENTS : 0) : used * FOLLOWUP_CENTS;

/** Pack actif avec des séances restantes (le plus ancien d'abord). */
export async function activePack(clientId: string) {
  const { data: packs } = await db().from("packs").select("*").eq("client_id", clientId).eq("status", "active")
    .gt("expires_at", new Date().toISOString()).order("purchased_at");
  for (const p of packs ?? []) {
    const used = await packUsed(p.id);
    if (used < p.sessions_total) return { ...p, used, remaining: p.sessions_total - used };
  }
  return null;
}
export async function packUsed(packId: string) {
  const { count } = await db().from("bookings").select("id", { count: "exact", head: true })
    .eq("pack_id", packId).in("status", ["pending", "confirmed"]);
  return count ?? 0;
}

/** Ce qu'on sait d'une personne vérifiée par son code : déjà venue, MDB, pack en cours. */
export async function clientStatus(email: string) {
  const sb = db();
  const { data: cl } = await sb.from("clients").select("id,first_name,last_name,phone,birth_date").eq("email", email).maybeSingle();
  const [mdb, known, pastBooking, anyPack, pack] = await Promise.all([
    memberStatus(email),
    sb.from("known_clients").select("email").eq("email", email).maybeSingle().then((r) => !!r.data),
    cl ? sb.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", cl.id).eq("status", "confirmed").then((r) => (r.count ?? 0) > 0) : false,
    cl ? sb.from("packs").select("id", { count: "exact", head: true }).eq("client_id", cl.id).neq("status", "pending").then((r) => (r.count ?? 0) > 0) : false,
    cl ? activePack(cl.id) : null,
  ]);
  return {
    clientId: cl?.id ?? null,
    member: mdb.member,
    known: known || pastBooking || anyPack || mdb.member,
    pack: pack ? { id: pack.id, type: pack.type as PackType, name: PACKS[pack.type as PackType].name, remaining: pack.remaining, total: pack.sessions_total, expiresAt: pack.expires_at } : null,
    dob: cl?.birth_date ?? "",
  };
}

// Abonnement mensuel à 85 € (Stripe, produit « Séance d'accompagnement individuel MDB ») : 1 séance comprise
// chaque mois. La première est réservée en même temps que le premier paiement.
export const ABONNEMENT_CENTS = 8500;
export const ABONNEMENT_PRICE = () => env("ABONNEMENT_PRICE_ID", "price_1UM5cyDZVw57t2JXycQ8bjMI");

export type Offer = "single" | "followup" | "abonnement" | "mdb" | "pack_credit" | PackType;
export type Quote = {
  kind: "standard" | "followup" | "pack" | "mdb_included" | "mdb_extra";
  amount: number;            // payé pour cette réservation (le pack entier si achat de pack)
  month: string | null;      // séance MDB incluse : mois concerné
  packId: string | null;     // séance prise sur un pack existant
  newPack: PackType | null;  // achat d'un pack
  minorRate: boolean;
  subscription?: boolean;    // paiement = début de l'abonnement mensuel
};

/**
 * Prix d'une réservation. `status` est null si la personne n'a pas vérifié son email
 * (parcours première séance) : seuls la séance à 95 € et les packs de démarrage sont possibles.
 */
export async function quote(offer: Offer, startIso: string, minor: boolean, status: Awaited<ReturnType<typeof clientStatus>> | null): Promise<Quote | { error: string }> {
  const base = { month: null, packId: null, newPack: null, minorRate: false };
  const unit = (kind: "standard" | "followup" | "mdb_extra", cents: number): Quote =>
    minor && cents > MINOR_PRICE_CENTS ? { ...base, kind, amount: MINOR_PRICE_CENTS, minorRate: true } : { ...base, kind, amount: cents };

  if (offer === "pack_credit") {
    const p = status?.pack;
    if (!p || p.remaining < 1 || Date.parse(startIso) > Date.parse(p.expiresAt)) return { error: "pack" };
    return { ...base, kind: "pack", amount: 0, packId: p.id };
  }
  if (offer === "mdb") {
    if (!status?.member) return { error: "mdb" };
    const month = monthKey(startIso);
    if (!status.clientId) return { ...base, kind: "mdb_included", amount: 0, month };
    const { count } = await db().from("bookings").select("id", { count: "exact", head: true })
      .eq("client_id", status.clientId).eq("kind", "mdb_included").eq("included_month", month).in("status", ["pending", "confirmed"]);
    if ((count ?? 0) > 0) return unit("mdb_extra", FOLLOWUP_CENTS);
    return { ...base, kind: "mdb_included", amount: 0, month };
  }
  if (offer === "abonnement") {
    if (!status?.known) return { error: "abonnement" };
    if (status.member) return { error: "deja_abonnee" };                    // elle a déjà sa séance comprise : offre « mdb »
    if (minor) return unit("followup", FOLLOWUP_CENTS);                     // moins de 18 ans : séance à l'unité (70 €)
    return { ...base, kind: "mdb_included", amount: ABONNEMENT_CENTS, month: monthKey(startIso), subscription: true };
  }
  if (offer === "followup") return status?.known ? unit("followup", FOLLOWUP_CENTS) : unit("standard", PRICE_CENTS);
  if (isPackType(offer)) {
    const pk = PACKS[offer];
    if (!pk.forNew && !status?.known) return { error: "pack" };
    // Moins de 18 ans : 70 € la séance, moins cher que n'importe quel pack
    if (minor) return unit(pk.forNew ? "standard" : "followup", PRICE_CENTS);
    return { ...base, kind: "pack", amount: pk.cents, newPack: offer };
  }
  return unit(status?.known ? "followup" : "standard", status?.known ? FOLLOWUP_CENTS : PRICE_CENTS);
}
