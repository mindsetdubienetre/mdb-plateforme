// Appels Stripe sans SDK (API REST), + vérification de signature des webhooks.
import { env } from "./core.ts";

function encode(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") encode(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe(path: string, params?: Record<string, unknown>, method = "POST", idempotencyKey?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : encode(params ?? {}),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Stripe ${path}: ${j.error?.message ?? r.status}`);
  return j;
}

/** Vérifie l'en-tête Stripe-Signature (HMAC SHA-256, tolérance 5 min). */
export async function verifyWebhook(payload: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env("STRIPE_WEBHOOK_SECRET")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => timingSafeEqual(s, hex));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
