import PDFDocument from "pdfkit";
import type { Response } from "express";

export interface ReportCardSubject {
  subject: string;
  exam: string;
  term: string | null;
  marks: number;
  max: number;
  grade: string | null;
}

export interface ReportCardData {
  schoolName: string;
  studentName: string | null;
  admissionNo: string | null;
  className: string | null;
  academicYear: string | null;
  term: string | null;
  subjects: ReportCardSubject[];
  totalMarks: number;
  totalMax: number;
  percentage: number;
  overallGrade: string;
  attendancePresent: number;
  attendanceTotal: number;
  attendancePct: number;
}

const ink = "#111827";
const muted = "#6b7280";
const accent = "#4f46e5";

/** Stream a student report-card PDF (pure pdfkit — no headless browser). */
export function streamReportCardPdf(res: Response, d: ReportCardData) {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const safeName = (d.studentName ?? "student").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="report-card-${safeName}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fillColor(accent).fontSize(20).font("Helvetica-Bold").text(d.schoolName);
  doc.fillColor(muted).fontSize(11).font("Helvetica").text("Student Report Card");
  doc
    .moveTo(48, doc.y + 6)
    .lineTo(547, doc.y + 6)
    .strokeColor("#e5e7eb")
    .stroke();
  doc.moveDown(1);

  // Student meta (two columns)
  const top = doc.y;
  const metaL = (label: string, value: string) => {
    doc.fillColor(muted).fontSize(9).font("Helvetica").text(label, 48, doc.y);
    doc.fillColor(ink).fontSize(11).font("Helvetica-Bold").text(value, 48, doc.y);
    doc.moveDown(0.4);
  };
  metaL("STUDENT", d.studentName ?? "—");
  metaL("CLASS", d.className ?? "—");
  const leftBottom = doc.y;
  doc.y = top;
  const metaR = (label: string, value: string) => {
    doc.fillColor(muted).fontSize(9).font("Helvetica").text(label, 320, doc.y, { width: 227 });
    doc.fillColor(ink).fontSize(11).font("Helvetica-Bold").text(value, 320, doc.y, { width: 227 });
    doc.moveDown(0.4);
  };
  metaR("ADMISSION NO", d.admissionNo ?? "—");
  metaR("TERM", `${d.term ?? "All terms"}${d.academicYear ? "  ·  " + d.academicYear : ""}`);
  doc.y = Math.max(leftBottom, doc.y);
  doc.moveDown(1);

  // Subject table
  const cols = { subject: 48, exam: 210, marks: 380, grade: 500 };
  const headerY = doc.y;
  doc.rect(48, headerY - 4, 499, 22).fill("#f5f3ff");
  doc.fillColor(muted).fontSize(9).font("Helvetica-Bold");
  doc.text("SUBJECT", cols.subject + 6, headerY + 2);
  doc.text("EXAM", cols.exam, headerY + 2);
  doc.text("MARKS", cols.marks, headerY + 2, { width: 110, align: "right" });
  doc.text("GRADE", cols.grade, headerY + 2, { width: 41, align: "right" });
  doc.moveDown(1.4);

  doc.font("Helvetica").fontSize(10);
  if (d.subjects.length === 0) {
    doc.fillColor(muted).text("No published exam results for this term.", 54, doc.y + 4);
    doc.moveDown(1);
  }
  for (const s of d.subjects) {
    const y = doc.y;
    doc
      .fillColor(ink)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(s.subject, cols.subject + 6, y, { width: 155 });
    doc.fillColor(muted).font("Helvetica").fontSize(9).text(s.exam, cols.exam, y, { width: 165 });
    doc.fillColor(ink).font("Helvetica").fontSize(10).text(`${s.marks} / ${s.max}`, cols.marks, y, {
      width: 110,
      align: "right",
    });
    doc.text(s.grade ?? "—", cols.grade, y, { width: 41, align: "right" });
    doc.moveDown(0.7);
    doc
      .moveTo(48, doc.y - 4)
      .lineTo(547, doc.y - 4)
      .strokeColor("#f0f0f3")
      .stroke();
  }
  doc.moveDown(0.6);

  // Summary box
  const boxY = doc.y;
  doc.roundedRect(48, boxY, 499, 64, 8).fillAndStroke("#f5f3ff", "#ddd6fe");
  const cell = (x: number, label: string, value: string) => {
    doc
      .fillColor(muted)
      .fontSize(9)
      .font("Helvetica")
      .text(label, x, boxY + 12, { width: 150 });
    doc
      .fillColor(accent)
      .fontSize(16)
      .font("Helvetica-Bold")
      .text(value, x, boxY + 28, { width: 150 });
  };
  cell(66, "TOTAL", `${d.totalMarks} / ${d.totalMax}`);
  cell(236, "PERCENTAGE", `${d.percentage.toFixed(1)}%`);
  cell(396, "OVERALL GRADE", d.overallGrade);
  doc.moveDown(4.4);

  // Attendance line
  doc
    .fillColor(muted)
    .fontSize(10)
    .font("Helvetica")
    .text(
      `Attendance: ${d.attendancePresent} / ${d.attendanceTotal} days (${d.attendancePct.toFixed(1)}%)`,
      48,
      doc.y,
    );

  // Footer
  doc.fillColor(muted).fontSize(8);
  doc.text(
    "This is a computer-generated report card. Grades reflect published exam results on record.",
    48,
    770,
    { align: "center", width: 499 },
  );
  doc.end();
}
