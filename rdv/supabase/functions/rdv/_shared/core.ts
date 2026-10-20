// Outils communs aux Edge Functions de réservation.
import { createClient } from "npm:@supabase/supabase-js@2";

export const env = (k: string, fallback?: string) => {
  // .trim() : un espace ou retour à la ligne collé par erreur avec une clé la casserait
  const v = Deno.env.get(k)?.trim() || fallback;
  if (v === undefined) throw new Error(`Variable manquante : ${k}`);
  return v;
};

export const db = () =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

export const SITE_URL = () => env("SITE_URL", "https://rdv.vanille-naime.com").replace(/\/$/, "");
export const PRICE_CENTS = 9500;
export const MINOR_PRICE_CENTS = 7000;
export const ADDRESS = "2 rue Charlery Bance, 97160 Le Moule, Guadeloupe";
export const GP_TZ = "America/Guadeloupe";
const GP_OFFSET_H = 4; // UTC-4 toute l'année, pas d'heure d'été

// ---------- CORS ----------
// Adresses autorisées à appeler le serveur (rien de secret ici).
const DEFAULT_ORIGINS = [
  "https://rdv.vanille-naime.com",
  "https://rdv-vanille-naime.netlify.app",
  "http://localhost:5173",
].join(",");
export const allowedOrigins = () =>
  env("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);

/** Adresse de la page d'où vient la cliente (pour le retour Stripe), sinon l'adresse officielle. */
export const originOrSite = (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  return allowedOrigins().includes(origin) ? origin : SITE_URL();
};

export const cors = (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
};
export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(req) },
  });

// ---------- Créneaux ----------
// Heures de début, en heure de Guadeloupe, par jour de semaine (0 = dimanche)
export const RULES: Record<string, Record<number, number[]>> = {
  presentiel: { 6: [8, 9, 10, 11, 13, 14, 15] },
  visio: { 6: [8, 9, 10, 11, 13, 14, 15], 1: [8, 9, 10, 11], 4: [14, 15, 16] },
};
// Exceptions ponctuelles (date en heure de Guadeloupe) : remplacent les horaires habituels ce jour-là
export const DATE_OVERRIDES: Record<string, Record<string, number[]>> = {
  "2026-10-24": { presentiel: [8, 9, 13, 14, 15], visio: [8, 9, 13, 14, 15] }, // comme d'habitude, sauf 10h-12h
};
export const MIN_NOTICE_MS = 48 * 3600e3;
export const HORIZON_MS = 21 * 86400e3;
export const HOUR_MS = 3600e3;

/** Tous les créneaux théoriques (avant agenda et réservations), en ISO UTC. */
export function candidateSlots(format: string, now = Date.now()): string[] {
  const rules = RULES[format];
  if (!rules) return [];
  const out: string[] = [];
  const gpToday = new Date(now - GP_OFFSET_H * HOUR_MS);
  for (let d = 0; d <= 22; d++) {
    const day = new Date(Date.UTC(gpToday.getUTCFullYear(), gpToday.getUTCMonth(), gpToday.getUTCDate() + d));
    const hours = DATE_OVERRIDES[day.toISOString().slice(0, 10)]?.[format] ?? rules[day.getUTCDay()] ?? [];
    for (const h of hours) {
      const t = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h + GP_OFFSET_H);
      if (t < now + MIN_NOTICE_MS || t > now + HORIZON_MS) continue;
      out.push(new Date(t).toISOString());
    }
  }
  return out;
}

export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

// ---------- Dates en français ----------
export const fmtDate = (iso: string, tz = GP_TZ) => {
  const s = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" })
    .format(new Date(iso));
  return s[0].toUpperCase() + s.slice(1);
};
export const fmtHour = (iso: string, tz = GP_TZ) => {
  const [h, m] = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date(iso)).split(":").map(Number);
  return `${h % 24}h${m ? String(m).padStart(2, "0") : ""}`;
};
export const sameOffset = (tz: string | null | undefined, iso: string) =>
  !tz || fmtHour(iso, tz) === fmtHour(iso, GP_TZ);
