import PDFDocument from "pdfkit";
import type { Response } from "express";

export interface ChallanData {
  schoolName: string;
  challanNo: string;
  createdAt: Date;
  dueDate?: Date | null;
  studentName: string | null;
  admissionNo?: string | null;
  className?: string | null;
  title?: string | null;
  notes?: string | null;
  items: { label: string; amount: number }[];
  total: number;
}

const INR = (n: number) =>
  "INR " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(n);

/** Stream a fee-challan (demand voucher) PDF. Pure pdfkit, no headless browser. */
export function streamChallanPdf(res: Response, d: ChallanData) {
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="challan-${d.challanNo}.pdf"`);
  doc.pipe(res);

  const ink = "#111827";
  const muted = "#6b7280";
  const accent = "#0f766e";

  doc.fillColor(accent).fontSize(22).font("Helvetica-Bold").text(d.schoolName, { align: "left" });
  doc.moveDown(0.2);
  doc.fillColor(muted).fontSize(11).font("Helvetica").text(d.title || "Fee Challan");
  doc
    .moveTo(56, doc.y + 8)
    .lineTo(539, doc.y + 8)
    .strokeColor("#e5e7eb")
    .stroke();
  doc.moveDown(1.2);

  const metaTop = doc.y;
  doc.fillColor(muted).fontSize(9).font("Helvetica").text("CHALLAN NO", 56, metaTop);
  doc
    .fillColor(ink)
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(d.challanNo, 56, metaTop + 12);
  doc
    .fillColor(muted)
    .fontSize(9)
    .font("Helvetica")
    .text("DATE", 380, metaTop, { width: 159, align: "right" });
  doc
    .fillColor(ink)
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(d.createdAt.toISOString().slice(0, 10), 380, metaTop + 12, { width: 159, align: "right" });
  doc.moveDown(2.5);

  const row = (label: string, value: string) => {
    const y = doc.y;
    doc.fillColor(muted).fontSize(10).font("Helvetica").text(label, 56, y, { width: 160 });
    doc.fillColor(ink).fontSize(11).font("Helvetica-Bold").text(value, 220, y, { width: 319 });
    doc.moveDown(0.9);
  };
  row("Student", d.studentName ?? "—");
  if (d.admissionNo) row("Admission No", d.admissionNo);
  if (d.className) row("Class", d.className);
  if (d.dueDate) row("Pay by", d.dueDate.toISOString().slice(0, 10));

  doc.moveDown(0.4);

  // Items table
  const tableTop = doc.y;
  doc.fillColor(muted).fontSize(9).font("Helvetica-Bold");
  doc.text("PARTICULARS", 56, tableTop);
  doc.text("AMOUNT", 380, tableTop, { width: 159, align: "right" });
  doc
    .moveTo(56, tableTop + 14)
    .lineTo(539, tableTop + 14)
    .strokeColor("#e5e7eb")
    .stroke();
  doc.moveDown(1.2);

  for (const it of d.items) {
    const y = doc.y;
    doc.fillColor(ink).fontSize(11).font("Helvetica").text(it.label, 56, y, { width: 320 });
    doc
      .fillColor(ink)
      .fontSize(11)
      .font("Helvetica")
      .text(INR(it.amount), 380, y, { width: 159, align: "right" });
    doc.moveDown(0.8);
  }

  doc.moveTo(56, doc.y).lineTo(539, doc.y).strokeColor("#e5e7eb").stroke();
  doc.moveDown(0.8);

  const boxY = doc.y;
  doc.roundedRect(56, boxY, 483, 56, 8).fillAndStroke("#f0fdfa", "#99f6e4");
  doc
    .fillColor(muted)
    .fontSize(10)
    .font("Helvetica")
    .text("TOTAL PAYABLE", 72, boxY + 12);
  doc
    .fillColor(accent)
    .fontSize(22)
    .font("Helvetica-Bold")
    .text(INR(d.total), 72, boxY + 24, { width: 451, align: "right" });

  if (d.notes) {
    doc.moveDown(3);
    doc.fillColor(muted).fontSize(9).font("Helvetica").text(d.notes, 56, doc.y, { width: 483 });
  }

  doc.fillColor(muted).fontSize(8).font("Helvetica");
  doc.text("This is a computer-generated challan. Please pay by the due date to avoid a fine.", 56, 760, {
    align: "center",
    width: 483,
  });

  doc.end();
}
