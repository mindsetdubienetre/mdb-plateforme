// Google Agenda : source de vérité des disponibilités, et lieu où arrivent les rendez-vous.
import { db, env } from "./core.ts";

const CAL = () => encodeURIComponent(env("GOOGLE_CALENDAR_ID", "primary"));
let cached: { token: string; exp: number } | null = null;

export async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const { data: refresh, error } = await db().rpc("get_google_refresh_token");
  if (error || !refresh) throw new Error("Google Agenda n'est pas encore connecté");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: refresh as string,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Google token: ${j.error ?? r.status}`);
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

async function gfetch(path: string, init: RequestInit = {}) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !(init.method === "DELETE" && (r.status === 404 || r.status === 410))) {
    throw new Error(`Google ${path}: ${r.status} ${JSON.stringify(j.error ?? j)}`);
  }
  return j;
}

/** Périodes « occupé » de l'agenda (les événements « disponible » ne bloquent pas). */
export async function busy(timeMin: string, timeMax: string): Promise<{ start: number; end: number }[]> {
  const j = await gfetch("/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin, timeMax, timeZone: "UTC", items: [{ id: env("GOOGLE_CALENDAR_ID", "primary") }] }),
  });
  const cal = Object.values(j.calendars ?? {})[0] as { busy?: { start: string; end: string }[]; errors?: unknown[] };
  if (cal?.errors?.length) throw new Error(`Google freeBusy: ${JSON.stringify(cal.errors)}`);
  return (cal?.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
}

export async function createEvent(o: {
  bookingId: string; format: string; start: string; end: string;
  firstName: string; lastInitial: string; phone: string; adminUrl: string; address: string;
}) {
  const visio = o.format === "visio";
  // Ne JAMAIS mettre les réponses de la fiche ici (données sensibles).
  const body: Record<string, unknown> = {
    summary: `Consultation · ${visio ? "Visio" : "Présentiel"} · ${o.firstName} ${o.lastInitial}.`,
    description: `${o.firstName}\nFormat : ${visio ? "Visio" : "Présentiel"}\nTéléphone : ${o.phone}\nFiche : ${o.adminUrl}`,
    start: { dateTime: o.start, timeZone: "America/Guadeloupe" },
    end: { dateTime: o.end, timeZone: "America/Guadeloupe" },
    transparency: "opaque",
    reminders: { useDefault: true },
    extendedProperties: { private: { mdbBookingId: o.bookingId } },
  };
  if (visio) {
    body.conferenceData = {
      createRequest: { requestId: o.bookingId, conferenceSolutionKey: { type: "hangoutsMeet" } },
    };
  } else {
    body.location = o.address;
  }
  const ev = await gfetch(`/calendars/${CAL()}/events?conferenceDataVersion=1`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const meet = ev.hangoutLink ??
    ev.conferenceData?.entryPoints?.find((e: { entryPointType: string }) => e.entryPointType === "video")?.uri ?? null;
  return { id: ev.id as string, meetLink: meet as string | null };
}

export const moveEvent = (id: string, start: string, end: string) =>
  gfetch(`/calendars/${CAL()}/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ start: { dateTime: start }, end: { dateTime: end } }),
  });

export const deleteEvent = (id: string) =>
  gfetch(`/calendars/${CAL()}/events/${encodeURIComponent(id)}`, { method: "DELETE" });
