// Personnes déjà venues (pack, MDB, suivi) : code par email, puis situation et tarif.
// POST { action: "send", email }                       → { sent: true } (toujours, pour ne rien révéler)
// POST { action: "check", email, code }                → { ok, known, member, pack, profile }
// POST { action: "quote", email, code, offer, start }  → { ok, price, kind, minorRate } ou { ok: false, error }
import { cors, db, json } from "../_shared/core.ts";
import { checkCode, memberProfile, sendCode } from "../_shared/members.ts";
import { clientStatus, type Offer, quote } from "../_shared/pricing.ts";

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const OFFERS = ["single", "followup", "abonnement", "mdb", "pack_credit", "demarrage", "accompagnement", "suivi"];

export const ageOn = (dob: string, atIso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [y, m, d] = dob.split("-").map(Number);
  const at = new Date(atIso);
  let age = at.getUTCFullYear() - y;
  if (at.getUTCMonth() + 1 < m || (at.getUTCMonth() + 1 === m && at.getUTCDate() < d)) age--;
  return age;
};

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  let p: Record<string, any>;
  try { p = await req.json(); } catch { return json(req, { error: "json" }, 400); }
  const email = String(p.email ?? "").trim().toLowerCase();
  if (!emailOk(email)) return json(req, { error: "email" }, 400);

  try {
    if (p.action === "send") {
      await sendCode(email);
      return json(req, { sent: true });
    }
    if (!(await checkCode(email, String(p.code ?? "")))) return json(req, { ok: false, error: "code" });
    const status = await clientStatus(email);

    if (p.action === "check") {
      // Le code prouve que c'est bien elle : on peut lui renvoyer ses coordonnées pour lui éviter de les retaper.
      const profile = status.known ? await memberProfile(email) : null;
      return json(req, { ok: true, known: status.known, member: status.member, pack: status.pack, profile });
    }
    if (p.action === "quote") {
      const offer = String(p.offer ?? "") as Offer;
      const start = typeof p.start === "string" && !isNaN(Date.parse(p.start)) ? new Date(p.start).toISOString() : new Date().toISOString();
      if (!OFFERS.includes(offer)) return json(req, { error: "offer" }, 400);
      const age = ageOn(status.dob || String(p.dob ?? ""), start);
      const q = await quote(offer, start, age !== null && age < 18, status);
      if ("error" in q) return json(req, { ok: false, error: q.error });
      // Moins de 18 ans sans parent connu : il faudra ses coordonnées et son accord
      let needsParent = false;
      if (age !== null && age < 18) {
        const { data: last } = await db().from("bookings").select("id, clients!inner(email)")
          .eq("clients.email", email).not("parent", "is", null).limit(1).maybeSingle();
        needsParent = !last;
      }
      return json(req, { ok: true, price: q.amount, kind: q.kind, minorRate: q.minorRate, needsParent, subscription: !!q.subscription });
    }
    return json(req, { error: "action" }, 400);
  } catch (e) {
    console.error("member", e);
    return json(req, { error: "serveur" }, 500);
  }
};
