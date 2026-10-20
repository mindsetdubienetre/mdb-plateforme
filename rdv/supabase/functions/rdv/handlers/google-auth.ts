// Connexion unique de l'agenda Google de Vanille (OAuth).
// 1. Vanille ouvre  …/functions/v1/rdv/google-auth?key=<SETUP_SECRET>
// 2. Elle autorise l'accès avec contact@vanille-naime.com
// 3. Le jeton de rafraîchissement est stocké côté serveur (schéma privé), jamais dans le navigateur.
import { db, env } from "../_shared/core.ts";

const SCOPES = [
  "openid", "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/gmail.send", // envoyer les confirmations (pas de lecture des emails)
].join(" ");
const redirectUri = () => `${env("SUPABASE_URL")}/functions/v1/rdv/google-auth`;

async function sign(v: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("SETUP_SECRET")),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
}

const page = (title: string, text: string, status = 200) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#3E140F;font-family:Inter,system-ui,sans-serif;color:#FAF6EC">
  <div style="max-width:420px;padding:32px;text-align:center"><h1 style="font-weight:400;font-family:Georgia,serif">${title}</h1><p>${text}</p></div></body>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

export const handler = async (req: Request): Promise<Response> => {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");

  if (!code) {
    if (u.searchParams.get("key") !== env("SETUP_SECRET")) return page("Accès refusé", "Ce lien est réservé à Vanille.", 403);
    const nonce = crypto.randomUUID();
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.search = new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: redirectUri(), response_type: "code",
      scope: SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true",
      login_hint: "contact@vanille-naime.com", state: `${nonce}.${await sign(nonce)}`,
    }).toString();
    return Response.redirect(auth.toString(), 302);
  }

  const [nonce, sig] = (u.searchParams.get("state") ?? "").split(".");
  if (!nonce || sig !== await sign(nonce)) return page("Lien expiré", "Recommence depuis le lien de connexion.", 400);

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri(), grant_type: "authorization_code",
    }),
  });
  const tok = await r.json();
  if (!r.ok || !tok.refresh_token) {
    console.error("google-auth", tok);
    return page("Ça n'a pas marché", "Google n'a pas renvoyé d'autorisation. Réessaie depuis le lien de connexion.", 400);
  }
  let email: string | null = null;
  try { email = JSON.parse(atob(tok.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email ?? null; } catch { /* facultatif */ }

  const { error } = await db().rpc("set_google_refresh_token", { p_token: tok.refresh_token, p_email: email });
  if (error) { console.error(error); return page("Erreur", "Impossible d'enregistrer l'accès.", 500); }
  return page("C'est connecté", `Ton agenda ${email ?? ""} est relié à la page de réservation. Tu peux fermer cette fenêtre.`);
};
