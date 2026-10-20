// Bilans de vente dans le planning de Vanille (espace.vanille-naime.com/vanille).
// À brancher dans le planning existant, à côté des rendez-vous (table bookings).
//
// La table `bilans` est lisible par Vanille avec sa session (policy « vanille lit bilans », même règle
// is_vanille() que bookings). Rien à configurer côté base.
//
// Utilisation (avec le client Supabase déjà connecté de l'espace) :
//   import { chargerBilans, annulerBilan, carteBilan } from "./planning-bilans.js";
//   const bilans = await chargerBilans(supabase, debutISO, finISO);
//   // → même forme que les rendez-vous du planning : { id, type: "bilan", titre, debut, fin, ... }

const FONCTION_RDV = "https://adasvbvfhvxnykosjzxo.supabase.co/functions/v1/rdv";
const GP = "America/Guadeloupe";

/** Bilans confirmés entre deux dates (ISO), triés par heure. */
export async function chargerBilans(supabase, debutISO, finISO) {
  const { data, error } = await supabase.from("bilans")
    .select("id,prenom,email,mode,whatsapp,quiz,deborde,message,start_at,end_at,client_tz,meet_link,status,created_at")
    .eq("status", "confirmed").gte("start_at", debutISO).lt("start_at", finISO)
    .order("start_at");
  if (error) throw error;
  return (data ?? []).map((b) => ({
    id: b.id,
    type: "bilan",
    titre: `Bilan · ${b.mode === "meet" ? "Meet" : "WhatsApp"} · ${b.prenom}`,
    debut: b.start_at,
    fin: b.end_at,
    prenom: b.prenom,
    email: b.email,
    mode: b.mode,                    // "meet" | "whatsapp"
    whatsapp: b.whatsapp,
    lienWhatsApp: `https://wa.me/${b.whatsapp.replace(/\D/g, "")}`,
    lienMeet: b.meet_link,
    quiz: b.quiz,
    deborde: b.deborde ?? [],
    message: b.message,
    fuseauCliente: b.client_tz,
  }));
}

/** Annule un bilan (la cliente reçoit un email doux et le lien pour reprendre un créneau). */
export async function annulerBilan(supabase, id) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${FONCTION_RDV}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify({ action: "bilan-cancel", id }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "annulation");
  return j;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const heure = (iso) => {
  const [h, m] = new Intl.DateTimeFormat("fr-FR", { timeZone: GP, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).split(":").map(Number);
  return `${h % 24}h${m ? String(m).padStart(2, "0") : ""}`;
};
const jour = (iso) => new Intl.DateTimeFormat("fr-FR", { timeZone: GP, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));

/** Carte HTML d'un bilan, si le planning affiche des cartes (heure de Guadeloupe). */
export function carteBilan(b) {
  return `<article class="rdv rdv-bilan" data-bilan="${esc(b.id)}" style="border-left:4px solid #FEF18E">
    <p class="rdv-quand"><strong>${heure(b.debut)} – ${heure(b.fin)}</strong> · ${esc(jour(b.debut))}</p>
    <p class="rdv-titre">${esc(b.titre)}</p>
    <p class="rdv-detail">Quiz : ${esc(b.quiz || "non renseigné")}</p>
    ${b.deborde.length ? `<p class="rdv-detail">Ce qui déborde : ${b.deborde.map(esc).join(" · ")}</p>` : ""}
    ${b.message ? `<p class="rdv-detail">Message : ${esc(b.message)}</p>` : ""}
    <p class="rdv-actions">
      <a href="${esc(b.lienWhatsApp)}" target="_blank" rel="noopener">WhatsApp ${esc(b.whatsapp)}</a>
      ${b.lienMeet ? ` · <a href="${esc(b.lienMeet)}" target="_blank" rel="noopener">Ouvrir le Meet</a>` : ""}
    </p>
  </article>`;
}
