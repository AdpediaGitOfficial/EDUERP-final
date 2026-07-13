import PDFDocument from "pdfkit";
import type { Response } from "express";

export interface PayslipData {
  schoolName: string;
  staffName: string | null;
  employeeCode: string | null;
  designation: string | null;
  department: string | null;
  month: Date;
  workingDays: number | null;
  daysWorked: number | null;
  grossSalary: number;
  attendanceDeduction: number;
  statutoryDeductions: number;
  otherDeductions: number;
  netSalary: number;
  status: string;
}

const INR = (n: number) =>
  "INR " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(n || 0);
const MONTH = (d: Date) =>
  d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

/** Stream a salary-slip PDF (pure pdfkit — runs anywhere the API runs). */
export function streamPayslipPdf(res: Response, d: PayslipData) {
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="payslip-${d.employeeCode ?? "staff"}-${d.month.toISOString().slice(0, 7)}.pdf"`,
  );
  doc.pipe(res);

  const ink = "#111827";
  const muted = "#6b7280";
  const accent = "#4f46e5";

  doc.fillColor(accent).fontSize(22).font("Helvetica-Bold").text(d.schoolName);
  doc.moveDown(0.2);
  doc
    .fillColor(muted)
    .fontSize(11)
    .font("Helvetica")
    .text(`Salary Slip — ${MONTH(d.month)}`);
  doc
    .moveTo(56, doc.y + 8)
    .lineTo(539, doc.y + 8)
    .strokeColor("#e5e7eb")
    .stroke();
  doc.moveDown(1.2);

  // Employee meta (two columns)
  const meta: [string, string][] = [
    ["Employee", d.staffName ?? "—"],
    ["Employee code", d.employeeCode ?? "—"],
    ["Designation", d.designation ?? "—"],
    ["Department", d.department ?? "—"],
    ["Days worked", `${d.daysWorked ?? "—"} / ${d.workingDays ?? "—"}`],
    ["Status", d.status.toUpperCase()],
  ];
  let my = doc.y;
  meta.forEach(([label, value], i) => {
    const col = i % 2;
    const x = 56 + col * 245;
    if (col === 0 && i > 0) my += 34;
    doc.fillColor(muted).fontSize(9).font("Helvetica").text(label.toUpperCase(), x, my);
    doc
      .fillColor(ink)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text(value, x, my + 12, { width: 230 });
  });
  doc.y = my + 44;
  doc.moveDown(0.4);

  const line = (label: string, value: string, bold = false) => {
    const y = doc.y;
    doc.fillColor(muted).fontSize(10).font("Helvetica").text(label, 56, y, { width: 300 });
    doc
      .fillColor(ink)
      .fontSize(11)
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .text(value, 356, y, { width: 183, align: "right" });
    doc.moveDown(0.9);
  };

  doc.fillColor(accent).fontSize(12).font("Helvetica-Bold").text("Earnings");
  doc.moveDown(0.4);
  line("Gross salary", INR(d.grossSalary), true);
  doc.moveDown(0.3);

  doc.fillColor(accent).fontSize(12).font("Helvetica-Bold").text("Deductions");
  doc.moveDown(0.4);
  line("Attendance deduction", INR(d.attendanceDeduction));
  line("Statutory (PF / ESI / PT / TDS)", INR(d.statutoryDeductions));
  line("Other deductions", INR(d.otherDeductions));
  line(
    "Total deductions",
    INR(d.attendanceDeduction + d.statutoryDeductions + d.otherDeductions),
    true,
  );

  doc.moveDown(0.6);
  const boxY = doc.y;
  doc.roundedRect(56, boxY, 483, 56, 8).fillAndStroke("#f5f3ff", "#ddd6fe");
  doc
    .fillColor(muted)
    .fontSize(10)
    .font("Helvetica")
    .text("NET SALARY", 72, boxY + 12);
  doc
    .fillColor(accent)
    .fontSize(22)
    .font("Helvetica-Bold")
    .text(INR(d.netSalary), 72, boxY + 24, { width: 451, align: "right" });

  doc.fillColor(muted).fontSize(8).font("Helvetica");
  doc.text("This is a computer-generated payslip and does not require a signature.", 56, 760, {
    align: "center",
    width: 483,
  });
  doc.end();
}
