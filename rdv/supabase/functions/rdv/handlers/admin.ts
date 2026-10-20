// Actions de l'espace privé de Vanille. Exige sa session Supabase (jeton dans Authorization).
// POST { action: "cancel", id }  → annule et rembourse, à tout moment.
// POST { action: "bilan-cancel", id } → annule un bilan de vente (la cliente reçoit un email).
import { createClient } from "npm:@supabase/supabase-js@2";
import { db, env } from "../_shared/core.ts";
import { issueCreditNote } from "../_shared/invoice.ts";
import { cancelBooking } from "../_shared/cancel.ts";
import { cancelBilan } from "./bilan.ts";
import { memberStatus } from "../_shared/members.ts";
import { PACKS, type PackType, unitValue } from "../_shared/pricing.ts";
import { stripe } from "../_shared/stripe.ts";
import { b64, packRefunded, send } from "../_shared/email.ts";

const adminCors = (req: Request) => ({
  "Access-Control-Allow-Origin": req.headers.get("origin") ?? "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-cron-key",
  "Vary": "Origin",
});

export const handler = async (req: Request): Promise<Response> => {
  const h = adminCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...h } });

  // Vérifie que c'est bien Vanille (même règle que les policies de la base)
  const auth = req.headers.get("authorization") ?? "";
  const asUser = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: ok } = await asUser.rpc("is_vanille");
  const internal = (await db().rpc("check_cron_key", { p_key: req.headers.get("x-cron-key") ?? "" })).data === true;
  if (ok !== true && !internal) return reply({ error: "interdit" }, 403);

  let p: Record<string, any>;
  try { p = await req.json(); } catch { return reply({ error: "json" }, 400); }

  try {
    if (p.action === "cancel" && typeof p.id === "string") {
      return reply({ ok: true, status: await cancelBooking(p.id, "vanille") });
    }
    if (p.action === "bilan-cancel" && typeof p.id === "string") {
      return reply({ ok: true, status: await cancelBilan(p.id, "vanille") });
    }
    if (p.action === "member-status" && typeof p.email === "string") {
      return reply({ ok: true, ...(await memberStatus(p.email.trim().toLowerCase())) });
    }
    if (p.action === "avoir" && typeof p.id === "string") {
      // rattrapage : avoir pour un rendez-vous déjà remboursé
      const { data: b } = await db().from("bookings").select("status,cancelled_at").eq("id", p.id).single();
      if (b?.status !== "refunded") return reply({ error: "pas rembourse" }, 400);
      const cn = await issueCreditNote(p.id, b.cancelled_at ? new Date(b.cancelled_at) : new Date());
      return reply({ ok: true, number: cn?.number ?? null });
    }
    if ((p.action === "pack-preview" || p.action === "pack-refund") && typeof p.id === "string") {
      // Arrêt d'un pack : on rembourse ce qui a été payé moins les séances faites, au tarif à l'unité
      const sb = db();
      const { data: pack } = await sb.from("packs").select("*, clients(email,first_name,last_name)").eq("id", p.id).single();
      if (!pack || pack.status !== "active") return reply({ error: "pack inactif" }, 400);
      const { data: bks } = await sb.from("bookings").select("id,start_at,status,invoice_number").eq("pack_id", pack.id).order("created_at");
      const upcoming = (bks ?? []).filter((b) => b.status === "confirmed" && Date.parse(b.start_at) > Date.now()).length;
      const used = (bks ?? []).filter((b) => b.status === "confirmed" && Date.parse(b.start_at) <= Date.now()).length;
      const refund = Math.max(0, pack.amount_cents - unitValue(pack.type as PackType, used));
      const info = { used, upcoming, total: pack.sessions_total, paid: pack.amount_cents, refund };
      if (p.action === "pack-preview") return reply({ ok: true, ...info });
      if (upcoming > 0) return reply({ error: "rendez-vous à venir", ...info }, 409);
      if (refund > 0) {
        await stripe("/refunds", { payment_intent: pack.stripe_payment_intent, amount: refund, metadata: { pack_id: pack.id } }, "POST", `pack-refund-${pack.id}`);
      }
      await sb.from("packs").update({ status: "refunded", refunded_cents: refund, refunded_at: new Date().toISOString() }).eq("id", pack.id);
      const name = PACKS[pack.type as PackType].name;
      const invoiced = (bks ?? []).find((b) => b.invoice_number);
      let attachments: { name: string; content: string }[] = [];
      if (refund > 0 && invoiced) {
        try {
          const cn = await issueCreditNote(invoiced.id, new Date(), {
            cents: refund, label: `Remboursement partiel : ${name},`, detail: `${used} séance${used > 1 ? "s" : ""} faite${used > 1 ? "s" : ""} sur ${pack.sessions_total}, déduite${used > 1 ? "s" : ""} au tarif à l'unité`,
          });
          if (cn) attachments = [{ name: `avoir-${cn.number}.pdf`, content: b64(cn.bytes) }];
        } catch (e) { console.error("avoir pack", pack.id, e); }
      }
      const c = (pack as any).clients;
      if (refund > 0) await send([{ email: c.email, name: c.first_name }], "Ton pack est remboursé", packRefunded(c.first_name, name, refund, attachments.length > 0), attachments).catch((e) => console.error("mail pack", e));
      return reply({ ok: true, ...info });
    }
    return reply({ error: "action" }, 400);
  } catch (e) {
    console.error("admin", e);
    return reply({ error: "serveur" }, 500);
  }
};
