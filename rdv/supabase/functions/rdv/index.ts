// Point d'entrée unique des réservations : /functions/v1/rdv/<action>
import { cors } from "./_shared/core.ts";
import { handler as availability } from "./handlers/availability.ts";
import { handler as createCheckout } from "./handlers/create-checkout.ts";
import { handler as stripeWebhook } from "./handlers/stripe-webhook.ts";
import { handler as googleAuth } from "./handlers/google-auth.ts";
import { handler as manageBooking } from "./handlers/manage-booking.ts";
import { handler as reminders } from "./handlers/reminders.ts";
import { handler as admin } from "./handlers/admin.ts";
import { handler as member } from "./handlers/member.ts";

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "availability": availability,
  "create-checkout": createCheckout,
  "stripe-webhook": stripeWebhook,
  "google-auth": googleAuth,
  "manage-booking": manageBooking,
  "reminders": reminders,
  "admin": admin,
  "member": member,
};

Deno.serve((req) => {
  const action = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const route = routes[action];
  if (!route) return new Response("Not found", { status: 404, headers: cors(req) });
  return route(req);
});
