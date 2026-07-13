import PDFDocument from "pdfkit";
import type { Response } from "express";

export interface CollectionReceiptLine {
  feeTitle: string;
  paying: number;
  discount: number;
  fine: number;
}

export interface CollectionReceiptData {
  schoolName: string;
  receiptNo: string; // system receipt no (first payment of the collection)
  schoolReceiptNo?: string | null; // optional manual school receipt no
  paidAt: Date;
  studentName: string | null;
  admissionNo?: string | null;
  className?: string | null;
  method: string;
  reference?: string | null;
  depositAccount?: string | null;
  note?: string | null;
  lines: CollectionReceiptLine[];
  total: number;
}

const INR = (n: number) =>
  "INR " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(n);

/**
 * Stream a multi-line fee-collection receipt covering every fee head paid in a
 * single collection. Pure pdfkit (no headless browser).
 */
export function streamCollectionReceiptPdf(res: Response, d: CollectionReceiptData) {
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="receipt-${d.receiptNo}.pdf"`);
  doc.pipe(res);

  const ink = "#111827";
  const muted = "#6b7280";
  const accent = "#4f46e5";
  const left = 56;
  const right = 539;

  // Header
  doc.fillColor(accent).fontSize(22).font("Helvetica-Bold").text(d.schoolName, { align: "left" });
  doc.moveDown(0.2);
  doc.fillColor(muted).fontSize(11).font("Helvetica").text("Fee Collection Receipt");
  doc
    .moveTo(left, doc.y + 8)
    .lineTo(right, doc.y + 8)
    .strokeColor("#e5e7eb")
    .stroke();
  doc.moveDown(1.2);

  // Meta row (receipt no + date)
  const metaTop = doc.y;
  doc.fillColor(muted).fontSize(9).font("Helvetica").text("RECEIPT NO", left, metaTop);
  doc
    .fillColor(ink)
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(d.schoolReceiptNo || d.receiptNo, left, metaTop + 12);
  doc
    .fillColor(muted)
    .fontSize(9)
    .font("Helvetica")
    .text("DATE", 380, metaTop, { width: 159, align: "right" });
  doc
    .fillColor(ink)
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(d.paidAt.toISOString().slice(0, 10), 380, metaTop + 12, { width: 159, align: "right" });
  doc.moveDown(2.5);

  // Detail rows
  const row = (label: string, value: string) => {
    const y = doc.y;
    doc.fillColor(muted).fontSize(10).font("Helvetica").text(label, left, y, { width: 160 });
    doc.fillColor(ink).fontSize(11).font("Helvetica-Bold").text(value, 220, y, { width: 319 });
    doc.moveDown(0.9);
  };
  row("Student", d.studentName ?? "—");
  if (d.admissionNo) row("Admission No", d.admissionNo);
  if (d.className) row("Class", d.className);
  row("Payment method", d.method.toUpperCase());
  if (d.reference) row("Reference", d.reference);
  if (d.depositAccount) row("Deposited to", d.depositAccount);
  if (d.schoolReceiptNo && d.schoolReceiptNo !== d.receiptNo) row("System ref", d.receiptNo);

  doc.moveDown(0.4);

  // Line-item table header
  const cols = { fee: left, paying: 320, discount: 400, fine: 470 };
  const headerY = doc.y;
  doc.fillColor(muted).fontSize(9).font("Helvetica-Bold");
  doc.text("FEE HEAD", cols.fee, headerY, { width: 250 });
  doc.text("PAYING", cols.paying, headerY, { width: 70, align: "right" });
  doc.text("DISC.", cols.discount, headerY, { width: 60, align: "right" });
  doc.text("FINE", cols.fine, headerY, { width: 69, align: "right" });
  doc.moveDown(0.4);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor("#e5e7eb").stroke();
  doc.moveDown(0.5);

  const money = (n: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(n);
  for (const line of d.lines) {
    const y = doc.y;
    doc.fillColor(ink).fontSize(10).font("Helvetica");
    doc.text(line.feeTitle, cols.fee, y, { width: 250 });
    doc.text(money(line.paying), cols.paying, y, { width: 70, align: "right" });
    doc.text(line.discount ? money(line.discount) : "—", cols.discount, y, { width: 60, align: "right" });
    doc.text(line.fine ? money(line.fine) : "—", cols.fine, y, { width: 69, align: "right" });
    doc.moveDown(0.7);
  }

  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor("#e5e7eb").stroke();
  doc.moveDown(0.8);

  // Amount box
  const boxY = doc.y;
  doc.roundedRect(left, boxY, 483, 56, 8).fillAndStroke("#f5f3ff", "#ddd6fe");
  doc
    .fillColor(muted)
    .fontSize(10)
    .font("Helvetica")
    .text("TOTAL PAID", 72, boxY + 12);
  doc
    .fillColor(accent)
    .fontSize(22)
    .font("Helvetica-Bold")
    .text(INR(d.total), 72, boxY + 24, { width: 451, align: "right" });

  if (d.note) {
    doc.moveDown(4.5);
    doc.fillColor(muted).fontSize(9).font("Helvetica").text(`Note: ${d.note}`, left, doc.y, {
      width: 483,
    });
  }

  // Footer
  doc.fillColor(muted).fontSize(8).font("Helvetica");
  doc.text("This is a computer-generated receipt and does not require a signature.", left, 760, {
    align: "center",
    width: 483,
  });

  doc.end();
}
