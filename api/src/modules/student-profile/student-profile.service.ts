import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * Student profile detail: the medical / hostel / disciplinary / documents /
 * activity-log data that hangs off a student record. Read access mirrors the
 * students RLS scope (admin, reception, the child's teachers, its parents, the
 * student themselves); write access is desk-only (admin + reception), with
 * teachers additionally allowed to file disciplinary incidents for their own
 * classes. Every mutation appends to the student's activity log so the timeline
 * is a durable audit trail rather than a derived guess.
 */
@Injectable()
export class StudentProfileService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private isDesk(actor: AuthUser) {
    return actor.roles.some((r) => r === "admin" || r === "reception");
  }
  private requireDesk(actor: AuthUser) {
    if (!this.isDesk(actor)) throw new ForbiddenException("Admin or reception only");
  }

  /** Prisma where-scope for the students table, or null for roles with no access. */
  private scope(actor: AuthUser): Prisma.studentsWhereInput | null {
    if (actor.roles.includes("admin") || actor.roles.includes("reception")) return {};
    if (actor.roles.includes("teacher"))
      return { classes: { teacher_classes: { some: { teacher_id: actor.id } } } };
    if (actor.roles.includes("parent"))
      return { parent_student: { some: { parent_id: actor.id } } };
    if (actor.roles.includes("student")) return { profile_id: actor.id };
    return null;
  }

  /** Assert the actor may READ this student; returns the student's class_id. */
  private async assertReadable(actor: AuthUser, studentId: string): Promise<string | null> {
    const scope = this.scope(actor);
    if (scope === null) throw new ForbiddenException();
    const s = await this.prisma.students.findFirst({
      where: { AND: [{ id: studentId }, scope] },
      select: { id: true, class_id: true },
    });
    if (!s) throw new NotFoundException("Student not found");
    return s.class_id;
  }

  /** Append an activity-log entry (best-effort audit trail). */
  private async log(
    studentId: string,
    actor: AuthUser,
    eventType: string,
    description: string,
    meta?: Prisma.InputJsonValue,
  ) {
    await this.prisma.student_activity_log.create({
      data: {
        student_id: studentId,
        actor_id: actor.id,
        event_type: eventType,
        description,
        ...(meta !== undefined ? { meta } : {}),
      },
    });
  }

  // ------------------------------------------------------------------ read ---

  /** Consolidated profile detail for every new tab in one round trip. */
  async getProfile(actor: AuthUser, studentId: string) {
    await this.assertReadable(actor, studentId);
    const canEdit = this.isDesk(actor);

    const [medical, hostel, disciplinary, documents, activity, admission, progressNotes] =
      await Promise.all([
        this.prisma.student_medical.findUnique({ where: { student_id: studentId } }),
        this.prisma.student_hostel.findUnique({ where: { student_id: studentId } }),
        this.prisma.student_disciplinary.findMany({
          where: { student_id: studentId },
          orderBy: [{ incident_date: "desc" }, { created_at: "desc" }],
          include: { profiles: { select: { full_name: true } } },
        }),
        this.prisma.student_documents.findMany({
          where: { student_id: studentId },
          orderBy: { created_at: "desc" },
          include: { profiles: { select: { full_name: true } } },
        }),
        this.prisma.student_activity_log.findMany({
          where: { student_id: studentId },
          orderBy: { created_at: "desc" },
          take: 100,
          include: { profiles: { select: { full_name: true } } },
        }),
        this.prisma.admission_enquiries.findFirst({
          where: { converted_student_id: studentId },
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            admission_no: true,
            stage: true,
            academic_year: true,
            previous_school: true,
            applicant_dob: true,
            applicant_gender: true,
            applicant_address: true,
            transport_required: true,
            hostel_required: true,
            submitted_at: true,
            approved_at: true,
            admitted_at: true,
            created_at: true,
          },
        }),
        this.prisma.progress_notes.findMany({
          where: { student_id: studentId },
          orderBy: { note_date: "desc" },
          take: 30,
        }),
      ]);

    const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : null);
    const t = (v: Date | null | undefined) => (v ? v.toISOString() : null);

    // Teacher names for progress notes (teacher_id -> profiles).
    const teacherIds = Array.from(new Set(progressNotes.map((p) => p.teacher_id)));
    const teacherNames = teacherIds.length
      ? new Map(
          (
            await this.prisma.profiles.findMany({
              where: { id: { in: teacherIds } },
              select: { id: true, full_name: true },
            })
          ).map((p) => [p.id, p.full_name]),
        )
      : new Map<string, string>();

    return {
      canEdit,
      medical: medical
        ? {
            bloodGroup: medical.blood_group,
            allergies: medical.allergies,
            chronicConditions: medical.chronic_conditions,
            medications: medical.medications,
            disabilities: medical.disabilities,
            physicianName: medical.physician_name,
            physicianPhone: medical.physician_phone,
            emergencyContactName: medical.emergency_contact_name,
            emergencyContactPhone: medical.emergency_contact_phone,
            insuranceProvider: medical.insurance_provider,
            insuranceNumber: medical.insurance_number,
            notes: medical.notes,
            updatedAt: t(medical.updated_at),
          }
        : null,
      hostel: hostel
        ? {
            isResident: hostel.is_resident,
            hostelBlock: hostel.hostel_block,
            roomNo: hostel.room_no,
            bedNo: hostel.bed_no,
            wardenName: hostel.warden_name,
            wardenPhone: hostel.warden_phone,
            checkInDate: d(hostel.check_in_date),
            checkOutDate: d(hostel.check_out_date),
            notes: hostel.notes,
            updatedAt: t(hostel.updated_at),
          }
        : null,
      disciplinary: disciplinary.map((r) => ({
        id: r.id,
        incidentDate: d(r.incident_date),
        category: r.category,
        severity: r.severity,
        description: r.description,
        actionTaken: r.action_taken,
        status: r.status,
        reportedBy: r.profiles?.full_name ?? null,
        createdAt: t(r.created_at),
      })),
      documents: documents.map((r) => ({
        id: r.id,
        docType: r.doc_type,
        title: r.title,
        fileUrl: r.file_url,
        issuedDate: d(r.issued_date),
        expiryDate: d(r.expiry_date),
        verified: r.verified,
        uploadedBy: r.profiles?.full_name ?? null,
        createdAt: t(r.created_at),
      })),
      activity: activity.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        description: r.description,
        meta: r.meta,
        actor: r.profiles?.full_name ?? null,
        createdAt: t(r.created_at),
      })),
      admission: admission
        ? {
            id: admission.id,
            admissionNo: admission.admission_no,
            stage: admission.stage,
            academicYear: admission.academic_year,
            previousSchool: admission.previous_school,
            dob: d(admission.applicant_dob),
            gender: admission.applicant_gender,
            address: admission.applicant_address,
            transportRequired: admission.transport_required,
            hostelRequired: admission.hostel_required,
            submittedAt: t(admission.submitted_at),
            approvedAt: t(admission.approved_at),
            admittedAt: t(admission.admitted_at),
          }
        : null,
      progressNotes: progressNotes.map((p) => ({
        id: p.id,
        note: p.note,
        tone: p.tone,
        noteDate: d(p.note_date),
        teacher: teacherNames.get(p.teacher_id) ?? null,
      })),
    };
  }

  // ---------------------------------------------------------- medical (1:1) ---

  async saveMedical(actor: AuthUser, studentId: string, input: Record<string, any>) {
    this.requireDesk(actor);
    await this.assertReadable(actor, studentId);
    const data = {
      blood_group: input.bloodGroup ?? null,
      allergies: input.allergies ?? null,
      chronic_conditions: input.chronicConditions ?? null,
      medications: input.medications ?? null,
      disabilities: input.disabilities ?? null,
      physician_name: input.physicianName ?? null,
      physician_phone: input.physicianPhone ?? null,
      emergency_contact_name: input.emergencyContactName ?? null,
      emergency_contact_phone: input.emergencyContactPhone ?? null,
      insurance_provider: input.insuranceProvider ?? null,
      insurance_number: input.insuranceNumber ?? null,
      notes: input.notes ?? null,
      updated_by: actor.id,
    };
    await this.prisma.student_medical.upsert({
      where: { student_id: studentId },
      create: { student_id: studentId, ...data },
      update: { ...data, updated_at: new Date() },
    });
    await this.log(studentId, actor, "medical_updated", "Medical information updated");
    return this.getProfile(actor, studentId);
  }

  // ----------------------------------------------------------- hostel (1:1) ---

  async saveHostel(actor: AuthUser, studentId: string, input: Record<string, any>) {
    this.requireDesk(actor);
    await this.assertReadable(actor, studentId);
    const data = {
      is_resident: !!input.isResident,
      hostel_block: input.hostelBlock ?? null,
      room_no: input.roomNo ?? null,
      bed_no: input.bedNo ?? null,
      warden_name: input.wardenName ?? null,
      warden_phone: input.wardenPhone ?? null,
      check_in_date: input.checkInDate ? new Date(input.checkInDate) : null,
      check_out_date: input.checkOutDate ? new Date(input.checkOutDate) : null,
      notes: input.notes ?? null,
      updated_by: actor.id,
    };
    await this.prisma.student_hostel.upsert({
      where: { student_id: studentId },
      create: { student_id: studentId, ...data },
      update: { ...data, updated_at: new Date() },
    });
    await this.log(
      studentId,
      actor,
      "hostel_updated",
      data.is_resident ? "Hostel details updated (resident)" : "Hostel details updated (day scholar)",
    );
    return this.getProfile(actor, studentId);
  }

  // ------------------------------------------------------ disciplinary (n) ---

  async addDisciplinary(actor: AuthUser, studentId: string, input: Record<string, any>) {
    // Desk always; a class teacher may file an incident for their own student.
    if (!this.isDesk(actor)) {
      const classId = await this.assertReadable(actor, studentId);
      if (!actor.roles.includes("teacher") || classId === null)
        throw new ForbiddenException("Not permitted to file incidents for this student");
    } else {
      await this.assertReadable(actor, studentId);
    }
    const row = await this.prisma.student_disciplinary.create({
      data: {
        student_id: studentId,
        incident_date: input.incidentDate ? new Date(input.incidentDate) : undefined,
        category: input.category || "general",
        severity: input.severity || "minor",
        description: input.description,
        action_taken: input.actionTaken ?? null,
        status: input.status || "open",
        reported_by: actor.id,
      },
    });
    await this.log(studentId, actor, "disciplinary_added", `Incident logged: ${row.description}`, {
      id: row.id,
      severity: row.severity,
    });
    return this.getProfile(actor, studentId);
  }

  async updateDisciplinary(
    actor: AuthUser,
    studentId: string,
    id: string,
    input: Record<string, any>,
  ) {
    this.requireDesk(actor);
    await this.assertReadable(actor, studentId);
    await this.prisma.student_disciplinary.update({
      where: { id },
      data: {
        ...(input.incidentDate !== undefined
          ? { incident_date: input.incidentDate ? new Date(input.incidentDate) : undefined }
          : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.severity !== undefined ? { severity: input.severity } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.actionTaken !== undefined ? { action_taken: input.actionTaken } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updated_at: new Date(),
      },
    });
    await this.log(studentId, actor, "disciplinary_updated", "Incident updated", { id });
    return this.getProfile(actor, studentId);
  }

  async deleteDisciplinary(actor: AuthUser, studentId: string, id: string) {
    this.requireDesk(actor);
    await this.assertReadable(actor, studentId);
    await this.prisma.student_disciplinary.delete({ where: { id } });
    await this.log(studentId, actor, "disciplinary_removed", "Incident removed", { id });
    return this.getProfile(actor, studentId);
  }

  // --------------------------------------------------------- documents (n) ---

  async addDocument(actor: AuthUser, studentId: string, input: Record<string, any>) {
    this.requireDesk(actor);
    await this.assertReadable(actor, studentId);
    const row = await this.prisma.student_documents.create({
      data: {
        student_id: studentId,
        doc_type: input.docType || "other",
        title: input.title,
        file_url: input.fileUrl ?? null,
        issued_date: input.issuedDate ? new Date(input.issuedDate) : null,
        expiry_date: input.expiryDate ? new Date(input.expiryDate) : null,
        verified: !!input.verified,
        uploaded_by: actor.id,
      },
    });
    await this.log(studentId, actor, "document_added", `Document added: ${row.title}`, {
      id: row.id,
    });
    return this.getProfile(actor, studentId);
  }

  async updateDocument(actor: AuthUser, studentId: string, id: string, input: Record<string, any>) {
    this.requireDesk(actor);
    await this.assertReadable(actor, studentId);
    await this.prisma.student_documents.update({
      where: { id },
      data: {
        ...(input.docType !== undefined ? { doc_type: input.docType } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.fileUrl !== undefined ? { file_url: input.fileUrl } : {}),
        ...(input.issuedDate !== undefined
          ? { issued_date: input.issuedDate ? new Date(input.issuedDate) : null }
          : {}),
        ...(input.expiryDate !== undefined
          ? { expiry_date: input.expiryDate ? new Date(input.expiryDate) : null }
          : {}),
        ...(input.verified !== undefined ? { verified: !!input.verified } : {}),
        updated_at: new Date(),
      },
    });
    await this.log(studentId, actor, "document_updated", "Document updated", { id });
    return this.getProfile(actor, studentId);
  }

  async deleteDocument(actor: AuthUser, studentId: string, id: string) {
    this.requireDesk(actor);
    await this.assertReadable(actor, studentId);
    await this.prisma.student_documents.delete({ where: { id } });
    await this.log(studentId, actor, "document_removed", "Document removed", { id });
    return this.getProfile(actor, studentId);
  }
}
