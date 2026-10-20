// Emails du « Bilan de ton système nerveux ». Même mise en page que les consultations.
// Règles : tutoiement, doux, aucun tiret cadratin, pas de vocabulaire scientifique.
import { env, fmtDate, fmtHour, GP_TZ, SITE_URL } from "./core.ts";
import { esc, layout, rows } from "./email.ts";
import { tzLabel, validTz } from "./bilan.ts";

export type Bilan = {
  id: string; prenom: string; email: string; mode: "meet" | "whatsapp"; whatsapp: string;
  quiz: string | null; deborde: string[] | null; message: string | null;
  start_at: string; end_at: string; client_tz: string | null; meet_link: string | null; cancel_token: string;
};

const OX = "#6B2B26";
const KICKER = "Bilan de ton système nerveux";
const WHAT = "Ce bilan n'est pas";
const page = (title: string, body: string, cta?: { href: string; label: string }) => layout(title, body, cta, KICKER, WHAT);
const p = (html: string, last = false) => `<p style="margin:0 0 ${last ? 0 : 10}px">${html}</p>`;
const sign = `<p style="margin:16px 0 0">Vanille</p>`;

export const bilanPageUrl = () => env("BILAN_URL", `${SITE_URL()}/bilan.html`);
export const bilanManageUrl = (b: Bilan) => `${SITE_URL()}/gerer-bilan.html?b=${b.id}&t=${b.cancel_token}`;

const lower = (s: string) => s[0].toLowerCase() + s.slice(1);
/** « le samedi 24 octobre à 8h30 (heure de Paris) », dans le fuseau de la cliente */
export const whenClient = (b: Bilan) => {
  const tz = validTz(b.client_tz);
  return `le ${lower(fmtDate(b.start_at, tz))} à ${fmtHour(b.start_at, tz)} (${tzLabel(tz)})`;
};
const whenGp = (iso: string) => `${fmtDate(iso)} à ${fmtHour(iso)}`;
const meetLink = (b: Bilan) => b.meet_link
  ? `<a href="${esc(b.meet_link)}" style="color:${OX};font-weight:600">${esc(b.meet_link)}</a>`
  : "le lien arrive dans un prochain email";
const where = (b: Bilan) => b.mode === "meet" ? `En visio (Google Meet) : ${meetLink(b)}` : `Appel WhatsApp, je t'appelle au ${esc(b.whatsapp)}`;
const practical = (b: Bilan) => rows([
  ["Quand", "L" + whenClient(b).slice(1)],
  ["Où", where(b)],
  ["Durée", "20 minutes"],
  ["Tarif", "Offert"],
]);

// ---------- Confirmation (cliente) ----------
/** Phrase de confirmation, identique sur la page et dans l'email. */
export const confirmLines = (b: Bilan) => b.mode === "meet"
  ? [`C'est noté 🤍 On se retrouve ${whenClient(b)}.`, "Le lien de la visio est dans cet email.", "Prévois 20 minutes au calme, avec de quoi noter."]
  : [`C'est noté 🤍 Je t'appelle sur WhatsApp ${whenClient(b)}, au ${b.whatsapp}.`, "Garde ton téléphone près de toi et prévois 20 minutes au calme, avec de quoi noter."];

export const bilanConfirmation = (b: Bilan) => page("À très vite", `
  ${p(`Coucou ${esc(b.prenom)},`)}
  ${confirmLines(b).map((l) => p(esc(l))).join("")}
  ${practical(b)}
  ${p("Tu peux déplacer ou annuler ton bilan jusqu'à 12 heures avant, avec le bouton ci-dessous.", true)}
  ${sign}`, { href: bilanManageUrl(b), label: "Déplacer ou annuler" });

// ---------- Rappels (cliente) ----------
export const bilanReminderVeille = (b: Bilan) => page("C'est demain", `
  ${p(`Coucou ${esc(b.prenom)},`)}
  ${p(b.mode === "meet" ? `Petit rappel : on se retrouve demain pour ton bilan, ${esc(whenClient(b))}.` : `Petit rappel : je t'appelle demain sur WhatsApp, ${esc(whenClient(b))}, au ${esc(b.whatsapp)}.`)}
  ${practical(b)}
  ${p(b.mode === "meet" ? "Prévois 20 minutes au calme, avec de quoi noter." : "Garde ton téléphone près de toi et prévois 20 minutes au calme, avec de quoi noter.", true)}
  ${sign}`, { href: bilanManageUrl(b), label: "Déplacer ou annuler" });

export const bilanReminder1h = (b: Bilan) => {
  const tz = validTz(b.client_tz);
  const at = `à ${fmtHour(b.start_at, tz)} (${tzLabel(tz)})`;
  return page("Dans une heure", `
  ${p(`Coucou ${esc(b.prenom)},`)}
  ${b.mode === "meet"
    ? p(`On se retrouve dans une heure, ${esc(at)}. Le lien de la visio : ${meetLink(b)}`)
    : p(`Je t'appelle sur WhatsApp dans une heure, ${esc(at)}, au ${esc(b.whatsapp)}. Garde ton téléphone près de toi.`)}
  ${p("Installe-toi au calme, avec de quoi noter. À tout de suite.", true)}
  ${sign}`, b.mode === "meet" && b.meet_link ? { href: b.meet_link, label: "Rejoindre la visio" } : undefined);
};

// ---------- Déplacement / annulation (cliente) ----------
export const bilanMoved = (b: Bilan) => page("Bilan déplacé", `
  ${p(`Coucou ${esc(b.prenom)},`)}
  ${p("C'est fait, ton bilan est déplacé.")}
  ${practical(b)}
  ${p("Le nouveau fichier agenda est joint à cet email.", true)}
  ${sign}`, { href: bilanManageUrl(b), label: "Déplacer ou annuler" });

export const bilanCancelled = (b: Bilan, by: "client" | "vanille") => page("Bilan annulé", `
  ${p(`Coucou ${esc(b.prenom)},`)}
  ${by === "vanille"
    ? p(`Je dois annuler notre bilan prévu ${esc(whenClient(b))}. Je suis désolée pour ce changement. Tu peux reprendre un créneau quand tu veux.`, true)
    : p(`Ton bilan prévu ${esc(whenClient(b))} est bien annulé. Quand tu en auras envie, je serai là.`, true)}
  ${sign}`, { href: bilanPageUrl(), label: "Reprendre un créneau" });

// ---------- Pour Vanille ----------
const details = (b: Bilan) => {
  const tz = validTz(b.client_tz);
  const local = tz === GP_TZ || fmtHour(b.start_at, tz) === fmtHour(b.start_at) ? "" : `<br><span style="opacity:.75">soit ${fmtHour(b.start_at, tz)} chez elle (${tzLabel(tz)})</span>`;
  return rows([
    ["Prénom", esc(b.prenom)],
    ["Quand", `${whenGp(b.start_at)} (heure de Guadeloupe)${local}`],
    ["Mode", b.mode === "meet" ? `Google Meet${b.meet_link ? ` : <a href="${esc(b.meet_link)}" style="color:${OX}">${esc(b.meet_link)}</a>` : ""}` : "Appel WhatsApp (c'est toi qui appelles)"],
    ["WhatsApp", `<a href="https://wa.me/${b.whatsapp.replace(/\D/g, "")}" style="color:${OX}">${esc(b.whatsapp)}</a>`],
    ["Email", esc(b.email)],
    ["Quiz", esc(b.quiz || "Non renseigné")],
    ["Ce qui déborde", b.deborde?.length ? b.deborde.map(esc).join("<br>") : "Rien de coché"],
    ["Message", b.message ? esc(b.message).replace(/\n/g, "<br>") : "Pas de message"],
  ]);
};

export const bilanForVanille = (b: Bilan, eventUrl: string | null) =>
  layout(`Nouveau bilan : ${esc(b.prenom)}`, details(b), eventUrl ? { href: eventUrl, label: "Voir dans l'agenda" } : undefined, KICKER, WHAT);

export const bilanChangeForVanille = (b: Bilan, what: "annulé" | "déplacé", oldStart?: string) =>
  layout(`Bilan ${what} : ${esc(b.prenom)}`,
    (oldStart ? rows([["Avant", `${whenGp(oldStart)} (heure de Guadeloupe)`]]) : "") + details(b), undefined, KICKER, WHAT);

/** Texte de l'événement Google Agenda : les mêmes infos que l'email de Vanille. */
export const bilanEventText = (b: Bilan) => [
  `Prénom : ${b.prenom}`,
  `Quand : ${whenGp(b.start_at)} (heure de Guadeloupe)`,
  `Mode : ${b.mode === "meet" ? "Google Meet" : "Appel WhatsApp (c'est moi qui appelle)"}`,
  `WhatsApp : ${b.whatsapp} (https://wa.me/${b.whatsapp.replace(/\D/g, "")})`,
  `Email : ${b.email}`,
  `Quiz : ${b.quiz || "Non renseigné"}`,
  `Ce qui déborde : ${b.deborde?.length ? b.deborde.join(" · ") : "Rien de coché"}`,
  `Message : ${b.message || "Pas de message"}`,
].join("\n");

// ---------- Fichier .ics ----------
export function bilanIcs(b: Bilan) {
  const d = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const loc = b.mode === "meet" ? (b.meet_link ?? "Google Meet") : `Appel WhatsApp au ${b.whatsapp}`;
  const txt = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vanille Naime//Bilan//FR", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:bilan-${b.id}@vanille-naime.com`, `DTSTAMP:${d(new Date().toISOString())}`,
    `DTSTART:${d(b.start_at)}`, `DTEND:${d(b.end_at)}`,
    "SUMMARY:Bilan de ton système nerveux avec Vanille Naime", `LOCATION:${loc.replace(/,/g, "\\,")}`,
    `DESCRIPTION:Pour déplacer ou annuler : ${bilanManageUrl(b)}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return { name: "bilan-vanille-naime.ics", content: btoa(unescape(encodeURIComponent(txt))) };
}
