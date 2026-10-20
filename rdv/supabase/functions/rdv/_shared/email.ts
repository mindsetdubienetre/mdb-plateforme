// Emails transactionnels, envoyés depuis la boîte Gmail de Vanille (contact@vanille-naime.com)
// via l'API Gmail, avec la même connexion Google que l'agenda (autorisation « envoyer » seulement).
// TEXTES EN BROUILLON : à valider par Vanille avant la mise en ligne.
// Règles : tutoiement, doux, aucun tiret cadratin, « Vanille Naime ».
import { ADDRESS, env, fmtDate, fmtHour, GP_TZ, SITE_URL, sameOffset } from "./core.ts";
import { accessToken } from "./google.ts";

const OX = "#6B2B26", CREME = "#FAF6EC", JAUNE = "#FEF18E", NUIT = "#3E140F";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

type Attachment = { name: string; content: string }; // base64

const utf8b64 = (s: string) => b64(new TextEncoder().encode(s));
const encodeHeader = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8b64(s)}?=`;
const wrap76 = (s: string) => s.replace(/.{1,76}/g, "$&\r\n");
const mimeType = (name: string) =>
  name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".ics") ? "text/calendar; method=PUBLISH" : "application/octet-stream";

export async function send(to: { email: string; name?: string }[], subject: string, html: string, attachments: Attachment[] = []) {
  const from = env("EMAIL_FROM", "contact@vanille-naime.com");
  const boundary = `mdb-${crypto.randomUUID()}`;
  const lines = [
    `From: ${encodeHeader("Vanille Naime")} <${from}>`,
    `To: ${to.map((t) => t.name ? `${encodeHeader(t.name)} <${t.email}>` : t.email).join(", ")}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(utf8b64(html)),
    ...attachments.flatMap((a) => [
      `--${boundary}`,
      `Content-Type: ${mimeType(a.name)}; name="${a.name}"`,
      `Content-Disposition: attachment; filename="${a.name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(a.content),
    ]),
    `--${boundary}--`,
  ];
  const raw = utf8b64(lines.join("\r\n")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!r.ok) throw new Error(`Gmail ${r.status}: ${await r.text()}`);
}

export const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

// ---------- Mise en page commune aux couleurs MDB ----------
const layout = (title: string, body: string, cta?: { href: string; label: string }) => `<!doctype html>
<html lang="fr"><body style="margin:0;background:${NUIT};font-family:Inter,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(160deg,#8a3d33,${OX} 45%,${NUIT});padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="color:${CREME};font-size:13px;padding:0 8px 18px;opacity:.8">Vanille Naime · Consultation individuelle</td></tr>
<tr><td style="background:${CREME};color:${OX};border-radius:24px;padding:32px 28px;">
<h1 style="font-family:Advercase,Georgia,serif;font-weight:400;font-size:30px;line-height:1.1;margin:0 0 18px;color:${OX}">${title}</h1>
<div style="font-size:15px;line-height:1.6;color:${OX}">${body}</div>
${cta ? `<p style="margin:26px 0 0"><a href="${cta.href}" style="display:inline-block;background:${JAUNE};color:${OX};text-decoration:none;font-weight:600;padding:14px 24px;border-radius:999px">${cta.label}</a></p>` : ""}
</td></tr>
<tr><td style="color:${CREME};font-size:12px;line-height:1.5;padding:18px 8px 0;opacity:.75">
Ces consultations ne sont pas un service d'urgence. Si tu traverses un moment où tu penses à mettre fin à tes jours, appelle le 3114 (gratuit, 24h/24) ou le 15.
</td></tr>
</table></td></tr></table></body></html>`;

const rows = (pairs: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-top:1px solid rgba(107,43,38,.15)">${
    pairs.map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(107,43,38,.15);font-size:13px;opacity:.75;width:90px;vertical-align:top">${k}</td><td style="padding:10px 0;border-bottom:1px solid rgba(107,43,38,.15);font-size:15px">${v}</td></tr>`).join("")
  }</table>`;

export type BookingInfo = {
  id: string; format: string; start_at: string; end_at: string; client_tz: string | null;
  meet_link: string | null; cancel_token: string;
  first: string; last: string; email: string; phone: string;
  parent: { first: string; last: string; email: string; phone: string } | null;
  kind?: string; amount_cents?: number;
  pack?: { type: string; sessions_total: number; amount_cents: number; expires_at: string | null; stripe_payment_intent?: string | null } | null;
  pack_purchase?: boolean;
};
const PACK_NAMES: Record<string, string> = { demarrage: "Pack Démarrage", accompagnement: "Pack Accompagnement", suivi: "Pack Suivi" };
const eur = (c: number) => `${(c / 100).toString().replace(".", ",")} €`;
const dayFr = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: GP_TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
const noInvoice = (b: BookingInfo) => b.kind === "mdb_included" || (b.kind === "pack" && !b.pack_purchase);
const tarif = (b: BookingInfo) =>
  b.kind === "mdb_included" ? "Incluse dans ton accompagnement MDB"
  : b.pack && b.pack_purchase ? `${PACK_NAMES[b.pack.type]} (${b.pack.sessions_total} séances), ${eur(b.pack.amount_cents)}, réglé`
  : b.pack ? `Comprise dans ton ${PACK_NAMES[b.pack.type]}`
  : `${eur(b.amount_cents ?? 9500)}, réglé${b.kind === "mdb_extra" ? " (membre MDB)" : ""}`;
const packNote = (b: BookingInfo) => b.pack && b.pack.expires_at
  ? `<p style="margin:0 0 10px">Ton ${PACK_NAMES[b.pack.type]} est valable jusqu'au ${dayFr(b.pack.expires_at)}. Pour réserver tes prochaines séances, va sur <a href="${SITE_URL()}" style="color:${OX}">la page de réservation</a> et choisis « J'ai un pack en cours ».</p>`
  : "";

const when = (b: BookingInfo) => {
  const gp = `${fmtDate(b.start_at)} à ${fmtHour(b.start_at)} (heure de Guadeloupe)`;
  return sameOffset(b.client_tz, b.start_at) ? gp : `${gp}<br><span style="opacity:.75">soit ${fmtHour(b.start_at, b.client_tz!)} chez toi</span>`;
};
const where = (b: BookingInfo) => b.format === "visio"
  ? (b.meet_link ? `En visio : <a href="${b.meet_link}" style="color:${OX}">${b.meet_link}</a>` : "En visio, Google Meet")
  : `Au cabinet : ${ADDRESS}`;
export const manageUrl = (b: BookingInfo) => `${SITE_URL()}/gerer.html?b=${b.id}&t=${b.cancel_token}`;

// ---------- Fichier .ics ----------
export function ics(b: BookingInfo) {
  const d = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const loc = b.format === "visio" ? (b.meet_link ?? "Google Meet") : ADDRESS;
  const txt = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vanille Naime//Consultation//FR", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${b.id}@vanille-naime.com`, `DTSTAMP:${d(new Date().toISOString())}`,
    `DTSTART:${d(b.start_at)}`, `DTEND:${d(b.end_at)}`,
    "SUMMARY:Consultation avec Vanille Naime", `LOCATION:${loc.replace(/,/g, "\\,")}`,
    `DESCRIPTION:Pour annuler ou déplacer : ${manageUrl(b)}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return { name: "consultation-vanille-naime.ics", content: btoa(unescape(encodeURIComponent(txt))) };
}

// Son espace personnel (plateforme) : où se connecter, et comment l'installer comme une application
const ESPACE_URL = () => env("ESPACE_URL", "https://espace.vanille-naime.com");
const espaceNote = (b: BookingInfo) => `
    <div style="margin:0 0 14px;padding:16px 18px;border-radius:16px;background:rgba(107,43,38,.06)">
      <p style="margin:0 0 8px"><strong>Ton espace personnel.</strong> Après notre séance, tu y retrouves le résumé de ce qu'on a vu, tes exercices et un lien direct avec moi.</p>
      <p style="margin:0 0 8px">Va sur <a href="${ESPACE_URL()}" style="color:${OX};font-weight:600">${ESPACE_URL().replace("https://", "")}</a> et entre ton email, <strong>${esc(b.email)}</strong> : tu reçois un code pour te connecter. Pas de mot de passe.</p>
      <p style="margin:0 0 4px"><strong>Pour l'avoir comme une application sur ton téléphone :</strong></p>
      <p style="margin:0">· iPhone : ouvre le lien dans Safari, touche le bouton Partager (le carré avec une flèche), puis « Sur l'écran d'accueil ».<br>
      · Android : ouvre le lien dans Chrome, touche le menu ⋮, puis « Installer l'application » (ou « Ajouter à l'écran d'accueil »).</p>
    </div>`;

// ---------- 1. Confirmation (cliente, et parent si mineure) ----------
export function confirmation(b: BookingInfo, forParent = false) {
  const hello = forParent ? `Bonjour ${esc(b.parent!.first)},` : `Coucou ${esc(b.first)},`;
  const intro = forParent
    ? `La consultation de ${esc(b.first)} avec moi est bien réservée. Merci pour ta confiance.`
    : `C'est noté, ta séance est réservée. J'ai hâte de te ${b.kind === "standard" || b.pack_purchase && b.pack?.type !== "suivi" ? "rencontrer" : "retrouver"}.`;
  return layout(forParent ? "Rendez-vous confirmé" : "À très vite", `
    <p style="margin:0 0 10px">${hello}</p>
    <p style="margin:0">${intro}</p>
    ${rows([["Quand", when(b)], ["Où", where(b)], ["Durée", "1 heure"], ["Tarif", tarif(b)]])}
    <p style="margin:0 0 10px"><strong>Comment ça va se passer.</strong> On commence par faire le point sur ce que tu vis en ce moment. Ensuite, on comprend ensemble ce qui se joue, sans jargon. Et tu repars avec ta fiche d'autothérapie, des pistes concrètes pour la suite.</p>
    ${b.format === "visio" ? `<p style="margin:0 0 10px">Installe-toi dans un endroit calme, avec des écouteurs si tu peux. Le lien Meet ci-dessus fonctionne depuis ton téléphone ou ton ordinateur.</p>` : `<p style="margin:0 0 10px">Le cabinet est au 2 rue Charlery Bance, au Moule. Arrive quelques minutes en avance pour te poser.</p>`}
    <p style="margin:0 0 10px;padding:14px 16px;border-radius:14px;background:rgba(107,43,38,.06)">Ce qu'on se dit en séance reste entre nous. Je prends des notes pendant nos rendez-vous : elles me servent uniquement à suivre ton chemin d'une séance à l'autre. Elles sont conservées de façon sécurisée et ne sont jamais partagées.</p>
    ${packNote(b)}
    ${forParent ? "" : espaceNote(b)}
    <p style="margin:0">${noInvoice(b) ? "Un fichier pour ajouter la séance à ton agenda est joint à cet email." : "Ta facture et un fichier pour ajouter la séance à ton agenda sont joints à cet email."} Tu peux annuler ou déplacer ton rendez-vous jusqu'à 48h avant.</p>
    <p style="margin:16px 0 0">Vanille</p>`,
    { href: manageUrl(b), label: "Annuler ou déplacer" });
}

// ---------- 3. Nouvelle réservation (Vanille) ----------
export function notifyVanille(b: BookingInfo, flags: { aBout: boolean; minor: boolean; message: boolean; mdb?: string }, adminUrl: string) {
  const alerts = [
    flags.mdb,
    flags.aBout && "A répondu « Je suis à bout »",
    flags.minor && "Moins de 18 ans (parent : " + esc(b.parent?.first) + " " + esc(b.parent?.last) + ", " + esc(b.parent?.phone) + ")",
    flags.message && "A laissé un message dans la fiche",
  ].filter(Boolean);
  return layout(`Nouvelle réservation : ${esc(b.first)}`, `
    ${alerts.length ? `<p style="margin:0 0 12px;padding:12px 14px;border-radius:12px;background:${JAUNE}"><strong>À regarder :</strong><br>${alerts.join("<br>")}</p>` : ""}
    ${rows([["Qui", `${esc(b.first)} ${esc(b.last)}`], ["Format", b.format === "visio" ? "Visio" : "Présentiel"], ["Quand", `${fmtDate(b.start_at)} à ${fmtHour(b.start_at)}`], ["Téléphone", esc(b.phone)]])}
    <p style="margin:0">Les réponses de la fiche restent dans l'espace sécurisé.</p>`,
    { href: adminUrl, label: "Voir la fiche" });
}

// ---------- 4. Annulation / report ----------
const notRefundedNote = (b: BookingInfo) =>
  b.kind === "mdb_included" ? "Ta séance incluse du mois est de nouveau disponible."
  : b.kind === "pack" ? "La séance revient dans ton pack, tu peux la reprendre quand tu veux."
  : "";
export function cancelledForClient(b: BookingInfo, by: "client" | "vanille", refunded: boolean, withCreditNote = false) {
  const body = by === "vanille"
    ? `<p style="margin:0 0 10px">Coucou ${esc(b.first)},</p><p style="margin:0 0 10px">Je dois annuler notre rendez-vous du ${fmtDate(b.start_at)} à ${fmtHour(b.start_at)}. Je suis désolée pour ce changement.</p><p style="margin:0">${refunded ? "Le remboursement est intégral, l'argent revient sur ta carte sous quelques jours." : notRefundedNote(b)} Si tu le souhaites, tu peux reprendre un créneau quand tu veux.</p>`
    : `<p style="margin:0 0 10px">Coucou ${esc(b.first)},</p><p style="margin:0 0 10px">Ton rendez-vous du ${fmtDate(b.start_at)} à ${fmtHour(b.start_at)} est bien annulé.</p><p style="margin:0">${refunded ? "Le remboursement est intégral, l'argent revient sur ta carte sous quelques jours." : notRefundedNote(b)} Quand tu en auras envie, je serai là.</p>`;
  const avoir = withCreditNote ? `<p style="margin:10px 0 0;font-size:13px;opacity:.8">La facture d'avoir qui annule ta facture est jointe à cet email.</p>` : "";
  return layout("Rendez-vous annulé", body + avoir + `<p style="margin:16px 0 0">Vanille</p>`, { href: SITE_URL(), label: "Reprendre un créneau" });
}

export function packRefunded(first: string, packName: string, cents: number, withCreditNote: boolean) {
  return layout("Pack remboursé", `
    <p style="margin:0 0 10px">Coucou ${esc(first)},</p>
    <p style="margin:0">C'est fait : je t'ai remboursé ${eur(cents)} sur ton ${esc(packName)}, pour les séances que tu n'as pas faites. L'argent revient sur ta carte sous quelques jours.</p>
    ${withCreditNote ? `<p style="margin:10px 0 0;font-size:13px;opacity:.8">La facture d'avoir correspondante est jointe à cet email.</p>` : ""}
    <p style="margin:16px 0 0">Vanille</p>`);
}

export function movedForClient(b: BookingInfo) {
  return layout("Rendez-vous déplacé", `
    <p style="margin:0 0 10px">Coucou ${esc(b.first)},</p>
    <p style="margin:0">C'est fait, ton rendez-vous est déplacé.</p>
    ${rows([["Quand", when(b)], ["Où", where(b)]])}
    <p style="margin:0">Le nouveau fichier agenda est joint à cet email.</p>
    <p style="margin:16px 0 0">Vanille</p>`,
    { href: manageUrl(b), label: "Annuler ou déplacer" });
}

// ---------- 2. Rappel la veille (cliente) ----------
export function reminder(b: BookingInfo) {
  return layout("C'est demain", `
    <p style="margin:0 0 10px">Coucou ${esc(b.first)},</p>
    <p style="margin:0">Petit rappel : on se voit demain.</p>
    ${rows([["Quand", when(b)], ["Où", where(b)]])}
    <p style="margin:0">${b.format === "visio" ? "Pense à t'installer dans un endroit calme, avec des écouteurs si tu peux." : "Arrive quelques minutes en avance pour te poser."} Tu n'as rien à préparer : viens comme tu es.</p>
    <p style="margin:16px 0 0">Vanille</p>`);
}

export function changeForVanille(b: BookingInfo, what: "annulé" | "déplacé", oldStart?: string) {
  return layout(`Rendez-vous ${what} : ${esc(b.first)}`, rows([
    ["Qui", `${esc(b.first)} ${esc(b.last)}`],
    ["Format", b.format === "visio" ? "Visio" : "Présentiel"],
    ...(oldStart ? [["Avant", `${fmtDate(oldStart)} à ${fmtHour(oldStart)}`] as [string, string]] : []),
    [what === "déplacé" ? "Maintenant" : "Créneau", `${fmtDate(b.start_at)} à ${fmtHour(b.start_at)}`],
  ]));
}

export { GP_TZ };
