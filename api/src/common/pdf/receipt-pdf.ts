import PDFDocument from "pdfkit";
import type { Response } from "express";

export interface ReceiptData {
  schoolName: string;
  receiptNo: string;
  paidAt: Date;
  studentName: string | null;
  admissionNo?: string | null;
  className?: string | null;
  feeTitle: string | null;
  amount: number;
  method: string;
  reference?: string | null;
  recordedBy?: string | null;
}

const INR = (n: number) =>
  "INR " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(n);

/**
 * Stream a fee-payment receipt PDF to the HTTP response. Pure pdfkit (no
 * headless browser), so it runs anywhere the API runs.
 */
export function streamReceiptPdf(res: Response, d: ReceiptData) {
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="receipt-${d.receiptNo}.pdf"`);
  doc.pipe(res);

  const ink = "#111827";
  const muted = "#6b7280";
  const accent = "#4f46e5";

  // Header
  doc.fillColor(accent).fontSize(22).font("Helvetica-Bold").text(d.schoolName, { align: "left" });
  doc.moveDown(0.2);
  doc.fillColor(muted).fontSize(11).font("Helvetica").text("Fee Payment Receipt");
  doc
    .moveTo(56, doc.y + 8)
    .lineTo(539, doc.y + 8)
    .strokeColor("#e5e7eb")
    .stroke();
  doc.moveDown(1.2);

  // Meta row (receipt no + date)
  const metaTop = doc.y;
  doc.fillColor(muted).fontSize(9).font("Helvetica").text("RECEIPT NO", 56, metaTop);
  doc
    .fillColor(ink)
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(d.receiptNo, 56, metaTop + 12);
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
    doc.fillColor(muted).fontSize(10).font("Helvetica").text(label, 56, y, { width: 160 });
    doc.fillColor(ink).fontSize(11).font("Helvetica-Bold").text(value, 220, y, { width: 319 });
    doc.moveDown(0.9);
  };
  row("Student", d.studentName ?? "—");
  if (d.admissionNo) row("Admission No", d.admissionNo);
  if (d.className) row("Class", d.className);
  row("Fee", d.feeTitle ?? "—");
  row("Payment method", d.method.toUpperCase());
  if (d.reference) row("Reference", d.reference);
  if (d.recordedBy) row("Recorded by", d.recordedBy);

  doc.moveDown(0.6);
  doc.moveTo(56, doc.y).lineTo(539, doc.y).strokeColor("#e5e7eb").stroke();
  doc.moveDown(0.8);

  // Amount box
  const boxY = doc.y;
  doc.roundedRect(56, boxY, 483, 56, 8).fillAndStroke("#f5f3ff", "#ddd6fe");
  doc
    .fillColor(muted)
    .fontSize(10)
    .font("Helvetica")
    .text("AMOUNT PAID", 72, boxY + 12);
  doc
    .fillColor(accent)
    .fontSize(22)
    .font("Helvetica-Bold")
    .text(INR(d.amount), 72, boxY + 24, { width: 451, align: "right" });

  // Footer
  doc.fillColor(muted).fontSize(8).font("Helvetica");
  doc.text("This is a computer-generated receipt and does not require a signature.", 56, 760, {
    align: "center",
    width: 483,
  });

  doc.end();
}
