// GET /availability?format=presentiel|visio  →  { slots: [ISO UTC, ...] }
import { cors, json, RULES } from "../_shared/core.ts";
import { freeSlots } from "../_shared/slots.ts";

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  const format = new URL(req.url).searchParams.get("format") ?? "";
  if (!RULES[format]) return json(req, { error: "format" }, 400);
  try {
    return json(req, { slots: await freeSlots(format) });
  } catch (e) {
    console.error("availability", e);
    return json(req, { error: "agenda" }, 503);
  }
};
