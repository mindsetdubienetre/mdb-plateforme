// Membres MDB (séance incluse) : liste de Vanille, abonnement de suivi actif, ou programme MDB acheté il y a moins de 3 mois.
// Tarifs : 1 séance incluse par mois (heure de Guadeloupe), puis 85 €.
import { db, env, PRICE_CENTS } from "./core.ts";
import { stripe } from "./stripe.ts";
import { send } from "./email.ts";

export const MEMBER_PRICE_CENTS = 8500;
const MDB_PRODUCT = /MDB|Mindset du Bien/i;
const ABONNEMENT_SUIVI = /s[ée]ance|accompagnement individuel/i;
const CODE_TTL_MS = 30 * 60e3;

const sha = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
const codeHash = (email: string, code: string) => sha(`${email.toLowerCase()}:${code}:${env("SUPABASE_URL")}`);

/** Mois 'AAAA-MM' d'un créneau, en heure de Guadeloupe. */
export const monthKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guadeloupe", year: "numeric", month: "2-digit" }).format(new Date(iso));

// Nom d'un produit Stripe (Stripe limite les « expand » à 4 niveaux : on le lit à part, avec un petit cache)
const productNames = new Map<string, string>();
async function productName(product: unknown): Promise<string> {
  if (!product) return "";
  if (typeof product === "object") return (product as any).name ?? "";
  const id = String(product);
  if (!productNames.has(id)) productNames.set(id, (await stripe(`/products/${id}`, undefined, "GET")).name ?? "");
  return productNames.get(id)!;
}

/** D'où vient l'accès MDB : liste de Vanille, abonnement Stripe, ou rien. `stripeError` si Stripe n'a pas pu être lu. */
export async function memberStatus(email: string) {
  const sb = db();
  const today = new Date().toISOString().slice(0, 10);
  const { data: manual } = await sb.from("mdb_members").select("active_until").eq("email", email).maybeSingle();
  if (manual && (!manual.active_until || manual.active_until >= today)) return { member: true, source: "liste", product: null, stripeError: null };
  try {
    const customers = await stripe(`/customers?email=${encodeURIComponent(email)}&limit=10`, undefined, "GET");
    for (const c of customers.data ?? []) {
      const subs = await stripe(`/subscriptions?customer=${c.id}&status=all&limit=20`, undefined, "GET");
      for (const s of subs.data ?? []) {
        if (!["active", "trialing", "past_due"].includes(s.status)) continue;
        for (const i of s.items?.data ?? []) {
          const name = await productName(i.price?.product);
          if (!MDB_PRODUCT.test(name)) continue;
          // Règle de Vanille (6 oct. 2026) : l'abonnement de suivi donne la séance du mois tant qu'il est actif ;
          // un programme MDB ne la donne que les 3 premiers mois après l'achat.
          const debut = new Date((s.start_date || s.created) * 1000); debut.setUTCMonth(debut.getUTCMonth() + 3);
          if (ABONNEMENT_SUIVI.test(name) || debut.getTime() > Date.now()) return { member: true, source: "stripe", product: name, stripeError: null };
        }
      }
    }
    return { member: false, source: null, product: null, stripeError: null };
  } catch (e) {
    console.error("isMember stripe", e); // ex. droit « Subscriptions : lecture » manquant sur la clé
    return { member: false, source: null, product: null, stripeError: String((e as Error).message ?? e) };
  }
}

/** Coordonnées connues d'une membre (réservations passées, sinon fiche client Stripe). */
export async function memberProfile(email: string) {
  const { data: c } = await db().from("clients").select("first_name,last_name,phone,birth_date").eq("email", email).maybeSingle();
  if (c?.first_name) return { first: c.first_name, last: c.last_name ?? "", phone: c.phone ?? "", dob: c.birth_date ?? "" };
  try {
    const customers = await stripe(`/customers?email=${encodeURIComponent(email)}&limit=1`, undefined, "GET");
    const cu = customers.data?.[0];
    if (cu) {
      const [first, ...rest] = String(cu.name ?? "").trim().split(/\s+/);
      return { first: first ?? "", last: rest.join(" "), phone: cu.phone ?? "", dob: "" };
    }
  } catch (e) { console.error("memberProfile", e); }
  return { first: "", last: "", phone: "", dob: "" };
}

export async function isMember(email: string): Promise<boolean> {
  return (await memberStatus(email)).member;
}

/** Prix pour cette cliente et ce créneau : 0 (incluse), 8500 (membre) ou 9500. */
export async function priceFor(email: string, startIso: string, member: boolean) {
  if (!member) return { kind: "standard" as const, amount: PRICE_CENTS, month: null };
  const month = monthKey(startIso);
  const { data: cl } = await db().from("clients").select("id").eq("email", email).maybeSingle();
  if (cl) {
    const { count } = await db().from("bookings").select("id", { count: "exact", head: true })
      .eq("client_id", cl.id).eq("kind", "mdb_included").eq("included_month", month)
      .in("status", ["pending", "confirmed"]);
    if ((count ?? 0) > 0) return { kind: "mdb_extra" as const, amount: MEMBER_PRICE_CENTS, month: null };
  }
  return { kind: "mdb_included" as const, amount: 0, month };
}

export async function sendCode(email: string) {
  const sb = db();
  const { data: prev } = await sb.from("email_codes").select("created_at").eq("email", email).maybeSingle();
  if (prev && Date.now() - Date.parse(prev.created_at) < 45_000) return; // anti-répétition
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  await sb.from("email_codes").upsert({
    email, code_hash: await codeHash(email, code), attempts: 0,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(), created_at: new Date().toISOString(),
  });
  await send([{ email }], `Ton code : ${code}`, codeEmail(code));
}

/** Vérifie le code (5 essais max). `consume` le supprime après usage. */
export async function checkCode(email: string, code: string, consume = false) {
  const sb = db();
  const { data: row } = await sb.from("email_codes").select("*").eq("email", email).maybeSingle();
  if (!row || Date.parse(row.expires_at) < Date.now() || row.attempts >= 5) return false;
  const ok = row.code_hash === await codeHash(email, String(code).trim());
  if (!ok) { await sb.from("email_codes").update({ attempts: row.attempts + 1 }).eq("email", email); return false; }
  if (consume) await sb.from("email_codes").delete().eq("email", email);
  return true;
}

const codeEmail = (code: string) => `<!doctype html><html lang="fr"><body style="margin:0;background:#3E140F;font-family:Inter,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FAF6EC;border-radius:24px">
<tr><td style="padding:32px 28px;color:#6B2B26;font-size:15px;line-height:1.6">
<p style="margin:0 0 12px">Voici ton code pour vérifier ton accès MDB :</p>
<p style="margin:0 0 16px;font-size:34px;letter-spacing:8px;font-weight:600">${code}</p>
<p style="margin:0;font-size:13px;opacity:.75">Il est valable 30 minutes. Si tu n'as rien demandé, ignore simplement cet email.</p>
<p style="margin:16px 0 0">Vanille</p></td></tr></table></td></tr></table></body></html>`;
