// Facture PDF automatique (auto-entrepreneuse, franchise en base de TVA).
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import { db, env } from "./core.ts";

const OX = rgb(107 / 255, 43 / 255, 38 / 255);
const GREY = rgb(0.35, 0.33, 0.32);
const frDate = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "America/Guadeloupe", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

// Date du jour en Guadeloupe (YYYY-MM-DD), pour que la facture porte la date locale
const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";
const gpDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guadeloupe" }).format(d);

export async function issueInvoice(o: {
  bookingId: string; format: string; startAt: string; billedTo: string; billedEmail: string; paidAt: Date;
  amountCents: number; label?: string; detail?: string;
}) {
  const sb = db();
  const { data, error } = await sb.rpc("issue_invoice", {
    p_booking_id: o.bookingId, p_billed_to: o.billedTo,
    p_issued_at: gpDay(o.paidAt), p_service_date: gpDay(new Date(o.startAt)), p_amount_cents: o.amountCents,
  });
  if (error) throw error;
  const number = data as string;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 780;
  const text = (t: string, x: number, size = 10, f = font, color = GREY) => page.drawText(t, { x, y, size, font: f, color });
  const line = (t: string, size = 10, f = font, color = GREY) => { text(t, 50, size, f, color); y -= size + 6; };

  line("FACTURE", 22, bold, OX);
  y -= 4;
  line(`N° ${number}`, 11, bold, OX);
  line(`Date de facture : ${frDate(o.paidAt)}`);
  line(`Date de la prestation : ${frDate(new Date(o.startAt))}`);

  y -= 18;
  line(env("INVOICE_ISSUER_NAME", "Vanille Naime"), 11, bold, OX);
  line("Entrepreneur individuel (EI)");
  line(env("INVOICE_ISSUER_ADDRESS", "2 rue Charlery Bance, 97160 Le Moule, Guadeloupe"));
  line(`SIRET : ${env("INVOICE_SIRET", "908 582 091 00025")}`);
  line("contact@vanille-naime.com");

  y -= 18;
  line("Facturé à", 9, font, GREY);
  line(o.billedTo, 11, bold, OX);
  line(o.billedEmail);

  y -= 26;
  page.drawLine({ start: { x: 50, y: y + 14 }, end: { x: 545, y: y + 14 }, thickness: 0.6, color: OX });
  text("Désignation", 50, 9); text("Montant", 480, 9);
  y -= 22;
  text(o.label ?? "Séance de coaching psychothérapie,", 50, 10, font, OX);
  text(euros(o.amountCents), 480, 10, bold, OX);
  y -= 14;
  text(o.label ? o.detail ?? "" : `1 heure, ${o.format === "visio" ? "visio" : "présentiel"}${o.detail ? `, ${o.detail}` : ""}`, 50, 10, font, OX);
  y -= 26;
  page.drawLine({ start: { x: 50, y: y + 14 }, end: { x: 545, y: y + 14 }, thickness: 0.6, color: OX });
  text("Total à payer", 50, 11, bold, OX); text(euros(o.amountCents), 480, 11, bold, OX);
  y -= 30;
  line("TVA non applicable, art. 293 B du CGI");
  line(`Payée le ${frDate(o.paidAt)} par carte bancaire`);

  const bytes = await pdf.save();
  const path = `${number.slice(0, 4)}/${number}.pdf`;
  const up = await sb.storage.from("invoices").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) throw up.error;

  await sb.from("invoices").update({ pdf_path: path }).eq("number", number);
  return { number, bytes };
}

/** Facture d'avoir : annule une facture remboursée (montant négatif). Renvoie null s'il n'y avait pas de facture. */
export async function issueCreditNote(bookingId: string, refundedAt = new Date(), partial?: { cents: number; label: string; detail: string }) {
  const sb = db();
  const { data: number, error } = await sb.rpc("issue_credit_note", {
    p_booking_id: bookingId, p_issued_at: gpDay(refundedAt), p_amount_cents: partial?.cents ?? null,
  });
  if (error) throw error;
  if (!number) return null;
  const { data: cn } = await sb.from("credit_notes").select("*").eq("number", number).single();
  const { data: inv } = await sb.from("invoices").select("number,issued_at,service_date").eq("number", cn.invoice_number).single();
  const { data: bk } = await sb.from("bookings").select("format,kind,clients(email),parent").eq("id", bookingId).single();
  if (!cn || !inv) throw new Error(`avoir ${number} : facture introuvable`);
  const billedEmail = (bk as any)?.parent?.email ?? (bk as any)?.clients?.email ?? "";
  const frDay = (iso: string) => iso.split("-").reverse().join("/");

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 780;
  const text = (t: string, x: number, size = 10, f = font, color = GREY) => page.drawText(t, { x, y, size, font: f, color });
  const line = (t: string, size = 10, f = font, color = GREY) => { text(t, 50, size, f, color); y -= size + 6; };

  line("FACTURE D'AVOIR", 22, bold, OX);
  y -= 4;
  line(`N° ${number}`, 11, bold, OX);
  line(`Date de l'avoir : ${frDay(cn.issued_at)}`);
  line(`${partial ? "Se rapporte à" : "Annule"} la facture n° ${inv.number} du ${frDay(inv.issued_at)} (prestation du ${frDay(inv.service_date)})`);

  y -= 18;
  line(env("INVOICE_ISSUER_NAME", "Vanille Naime"), 11, bold, OX);
  line("Entrepreneur individuel (EI)");
  line(env("INVOICE_ISSUER_ADDRESS", "2 rue Charlery Bance, 97160 Le Moule, Guadeloupe"));
  line(`SIRET : ${env("INVOICE_SIRET", "908 582 091 00025")}`);
  line("contact@vanille-naime.com");

  y -= 18;
  line("Établi pour", 9, font, GREY);
  line(cn.billed_to, 11, bold, OX);
  if (billedEmail) line(billedEmail);

  y -= 26;
  page.drawLine({ start: { x: 50, y: y + 14 }, end: { x: 545, y: y + 14 }, thickness: 0.6, color: OX });
  text("Désignation", 50, 9); text("Montant", 480, 9);
  y -= 22;
  text(partial?.label ?? "Annulation : séance de coaching psychothérapie,", 50, 10, font, OX);
  text(`-${euros(cn.amount_cents)}`, 474, 10, bold, OX);
  y -= 14;
  text(partial?.detail ?? `1 heure, ${(bk as any)?.format === "visio" ? "visio" : "présentiel"}${(bk as any)?.kind === "mdb_extra" ? ", membre MDB" : (bk as any)?.kind === "followup" ? ", séance de suivi" : ""}`, 50, 10, font, OX);
  y -= 26;
  page.drawLine({ start: { x: 50, y: y + 14 }, end: { x: 545, y: y + 14 }, thickness: 0.6, color: OX });
  text("Total de l'avoir", 50, 11, bold, OX); text(`-${euros(cn.amount_cents)}`, 474, 11, bold, OX);
  y -= 30;
  line("TVA non applicable, art. 293 B du CGI");
  line(`Remboursé le ${frDay(cn.issued_at)} sur la carte bancaire utilisée pour le paiement`);

  const bytes = await pdf.save();
  const path = `${number.slice(3, 7)}/${number}.pdf`;
  const up = await sb.storage.from("invoices").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) throw up.error;
  await sb.from("credit_notes").update({ pdf_path: path }).eq("number", number);
  return { number, bytes };
}
