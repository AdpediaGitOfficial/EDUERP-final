import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../infra/database/prisma.service";
import { AuthService } from "../auth/auth.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ParentsService } from "../parents/parents.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/** The ordered admission pipeline. `rejected` is a terminal off-ramp. */
export const STAGES = [
  "draft",
  "submitted",
  "under_review",
  "document_verification",
  "parent_verification",
  "fee_assignment",
  "class_allocation",
  "approved",
  "admitted",
] as const;
export type Stage = (typeof STAGES)[number];

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.|\.$/g, "")
      .slice(0, 24) || "student"
  );
}

@Injectable()
export class AdmissionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(ParentsService) private readonly parents: ParentsService,
  ) {}

  private requireDesk(actor: AuthUser) {
    if (!actor.roles.some((r) => r === "admin" || r === "reception"))
      throw new ForbiddenException("Admin or reception only");
  }

  private async logStage(
    admissionId: string,
    from: string | null,
    to: string,
    actorId: string,
    note?: string,
  ) {
    await this.prisma.admission_stage_history.create({
      data: {
        admission_id: admissionId,
        from_stage: from,
        to_stage: to,
        actor_id: actorId,
        note: note ?? null,
      },
    });
  }

  /** Notify the linked parent account (if any) of a stage change. */
  private async notifyParent(
    admission: { id: string; parent_id: string | null; student_name: string },
    subject: string,
    body: string,
    actorId: string,
  ) {
    if (!admission.parent_id) return;
    await this.notifications
      .notify({ senderId: actorId, userIds: [admission.parent_id], subject, body })
      .catch(() => undefined);
  }

  async list(
    actor: AuthUser,
    opts: { stage?: string; q?: string; page?: number; pageSize?: number } = {},
  ) {
    this.requireDesk(actor);
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 50, 200);
    const where: any = {};
    if (opts.stage && (STAGES as readonly string[]).includes(opts.stage)) where.stage = opts.stage;
    else if (opts.stage === "rejected") where.stage = "rejected";
    if (opts.q?.trim()) {
      where.OR = [
        { student_name: { contains: opts.q, mode: "insensitive" } },
        { admission_no: { contains: opts.q, mode: "insensitive" } },
        { parent_name: { contains: opts.q, mode: "insensitive" } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.admission_enquiries.count({ where }),
      this.prisma.admission_enquiries.findMany({
        where,
        orderBy: { updated_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, rows: rows.map((r) => this.shape(r)) };
  }

  async get(actor: AuthUser, id: string) {
    this.requireDesk(actor);
    const a = await this.prisma.admission_enquiries.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Admission not found");
    const [history, cls, fee, parent] = await Promise.all([
      this.prisma.admission_stage_history.findMany({
        where: { admission_id: id },
        orderBy: { created_at: "desc" },
      }),
      a.class_id
        ? this.prisma.classes.findUnique({
            where: { id: a.class_id },
            select: { name: true, section: true },
          })
        : null,
      a.fee_structure_id
        ? this.prisma.fee_structures.findUnique({
            where: { id: a.fee_structure_id },
            select: { name: true, amount: true },
          })
        : null,
      a.parent_id
        ? this.prisma.profiles.findUnique({
            where: { id: a.parent_id },
            select: { full_name: true, email: true, phone: true },
          })
        : null,
    ]);
    return {
      ...this.shape(a),
      className: cls ? `${cls.name}${cls.section ? "-" + cls.section : ""}` : null,
      feeStructureName: fee?.name ?? null,
      feeAmount: fee ? Number(fee.amount) : null,
      parent: parent
        ? { id: a.parent_id, fullName: parent.full_name, email: parent.email, phone: parent.phone }
        : null,
      history: history.map((h) => ({
        id: h.id,
        fromStage: h.from_stage,
        toStage: h.to_stage,
        actorId: h.actor_id,
        note: h.note,
        at: h.created_at,
      })),
    };
  }

  private shape(a: any) {
    return {
      id: a.id,
      studentName: a.student_name,
      stage: a.stage,
      status: a.status,
      admissionNo: a.admission_no,
      gradeApplying: a.grade_applying,
      parentName: a.parent_name,
      parentPhone: a.parent_phone,
      parentEmail: a.parent_email,
      parentId: a.parent_id,
      applicantDob: a.applicant_dob,
      applicantGender: a.applicant_gender,
      applicantAddress: a.applicant_address,
      previousSchool: a.previous_school,
      bloodGroup: a.blood_group,
      transportRequired: a.transport_required,
      hostelRequired: a.hostel_required,
      medicalNotes: a.medical_notes,
      academicYear: a.academic_year,
      classId: a.class_id,
      section: a.section,
      feeStructureId: a.fee_structure_id,
      rejectionReason: a.rejection_reason,
      documents: a.documents ?? [],
      convertedStudentId: a.converted_student_id,
      submittedAt: a.submitted_at,
      approvedAt: a.approved_at,
      admittedAt: a.admitted_at,
      notes: a.notes,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    };
  }

  private applicantData(input: Record<string, any>) {
    const d: Record<string, unknown> = {};
    const map: Record<string, string> = {
      studentName: "student_name",
      gradeApplying: "grade_applying",
      parentName: "parent_name",
      parentPhone: "parent_phone",
      parentEmail: "parent_email",
      applicantDob: "applicant_dob",
      applicantGender: "applicant_gender",
      applicantAddress: "applicant_address",
      previousSchool: "previous_school",
      bloodGroup: "blood_group",
      transportRequired: "transport_required",
      hostelRequired: "hostel_required",
      medicalNotes: "medical_notes",
      academicYear: "academic_year",
      notes: "notes",
    };
    for (const [k, col] of Object.entries(map)) {
      if (input[k] !== undefined) {
        d[col] = col === "applicant_dob" && input[k] ? new Date(input[k]) : input[k];
      }
    }
    return d;
  }

  async createDraft(actor: AuthUser, input: Record<string, any>) {
    this.requireDesk(actor);
    if (!input.studentName?.trim()) throw new BadRequestException("Student name is required");
    const created = await this.prisma.admission_enquiries.create({
      data: {
        student_name: input.studentName,
        stage: "draft",
        status: "new",
        ...this.applicantData(input),
      },
    });
    await this.logStage(created.id, null, "draft", actor.id, "Draft created");
    return { ok: true, id: created.id };
  }

  async saveDraft(actor: AuthUser, id: string, input: Record<string, any>) {
    this.requireDesk(actor);
    const a = await this.prisma.admission_enquiries.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Admission not found");
    await this.prisma.admission_enquiries.update({
      where: { id },
      data: { ...this.applicantData(input), updated_at: new Date() },
    });
    return { ok: true };
  }

  async setDocuments(actor: AuthUser, id: string, documents: unknown[]) {
    this.requireDesk(actor);
    await this.prisma.admission_enquiries.update({
      where: { id },
      data: { documents: documents as any, updated_at: new Date() },
    });
    return { ok: true };
  }

  async submit(actor: AuthUser, id: string) {
    this.requireDesk(actor);
    const a = await this.prisma.admission_enquiries.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Admission not found");
    if (a.stage !== "draft") throw new BadRequestException("Only a draft can be submitted");
    let admissionNo = a.admission_no;
    if (!admissionNo) {
      const r = await this.prisma.$queryRaw<{ next_admission_no: string }[]>`
        SELECT public.next_admission_no() AS next_admission_no`;
      admissionNo = r[0]?.next_admission_no ?? null;
    }
    await this.prisma.admission_enquiries.update({
      where: { id },
      data: {
        stage: "submitted",
        admission_no: admissionNo,
        submitted_at: new Date(),
        updated_at: new Date(),
      },
    });
    await this.logStage(id, "draft", "submitted", actor.id, "Submitted for review");
    return { ok: true, admissionNo };
  }

  /** Link (or set) the parent for the parent-verification step. */
  async setParent(actor: AuthUser, id: string, parentId: string) {
    this.requireDesk(actor);
    const [a, parent] = await Promise.all([
      this.prisma.admission_enquiries.findUnique({ where: { id } }),
      this.prisma.profiles.findUnique({
        where: { id: parentId },
        select: { id: true, full_name: true },
      }),
    ]);
    if (!a) throw new NotFoundException("Admission not found");
    if (!parent) throw new NotFoundException("Parent not found");
    await this.prisma.admission_enquiries.update({
      where: { id },
      data: {
        parent_id: parentId,
        parent_name: parent.full_name ?? a.parent_name,
        updated_at: new Date(),
      },
    });
    return { ok: true };
  }

  /**
   * Advance to the next stage, applying any allocation/fee/reviewer data passed
   * with the move. Reaching `admitted` runs the enquiry→student conversion.
   */
  async advance(actor: AuthUser, id: string, input: Record<string, any> = {}) {
    this.requireDesk(actor);
    const a = await this.prisma.admission_enquiries.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Admission not found");
    if (a.stage === "rejected")
      throw new BadRequestException("A rejected admission can't be advanced");
    if (a.stage === "admitted") throw new BadRequestException("Already admitted");
    const idx = (STAGES as readonly string[]).indexOf(a.stage);
    if (idx < 1) throw new BadRequestException("Submit the draft before advancing");
    const next = STAGES[idx + 1];

    // Apply stage data that arrives with the move.
    const data: Record<string, unknown> = { updated_at: new Date() };
    if (input.classId !== undefined) data.class_id = input.classId || null;
    if (input.section !== undefined) data.section = input.section || null;
    if (input.academicYear !== undefined) data.academic_year = input.academicYear || null;
    if (input.feeStructureId !== undefined) data.fee_structure_id = input.feeStructureId || null;
    data.reviewer_id = actor.id;

    // Gate the important transitions.
    if (next === "approved") {
      const classId = (data.class_id as string) ?? a.class_id;
      if (!classId) throw new BadRequestException("Assign a class & section before approval");
    }
    if (next === "admitted") {
      if (!a.parent_id && !input.parentId)
        throw new BadRequestException("Link a parent before admitting the student");
    }
    if (next === "approved") data.approved_at = new Date();

    data.stage = next;
    const updated = await this.prisma.admission_enquiries.update({ where: { id }, data });
    await this.logStage(id, a.stage, next, actor.id, input.note);

    if (next === "admitted") {
      const result = await this.convertToStudent(actor, id);
      await this.notifyParent(
        updated,
        "Admission confirmed",
        `${updated.student_name}'s admission is confirmed. Admission No: ${result.admissionNo}. A student portal account has been created.`,
        actor.id,
      );
      return { ok: true, stage: next, ...result };
    }
    if (next === "approved") {
      await this.notifyParent(
        updated,
        "Admission approved",
        `${updated.student_name}'s admission has been approved.`,
        actor.id,
      );
    }
    return { ok: true, stage: next };
  }

  async reject(actor: AuthUser, id: string, reason: string) {
    this.requireDesk(actor);
    if (!reason?.trim()) throw new BadRequestException("A rejection reason is required");
    const a = await this.prisma.admission_enquiries.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Admission not found");
    if (a.stage === "admitted")
      throw new BadRequestException("An admitted student can't be rejected");
    const updated = await this.prisma.admission_enquiries.update({
      where: { id },
      data: { stage: "rejected", status: "lost", rejection_reason: reason, updated_at: new Date() },
    });
    await this.logStage(id, a.stage, "rejected", actor.id, reason);
    await this.notifyParent(
      updated,
      "Admission update",
      `We're sorry — ${updated.student_name}'s admission was not successful. Reason: ${reason}`,
      actor.id,
    );
    return { ok: true };
  }

  /**
   * Enquiry → student: provisions the student portal account, creates the
   * students row (auto per-class roll), links the verified parent, assigns the
   * chosen fee structure, and stamps the enquiry as converted. Idempotent.
   */
  private async convertToStudent(actor: AuthUser, id: string) {
    const a = await this.prisma.admission_enquiries.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Admission not found");
    if (a.converted_student_id) {
      const existing = await this.prisma.students.findUnique({
        where: { id: a.converted_student_id },
        select: { admission_no: true },
      });
      return {
        studentId: a.converted_student_id,
        admissionNo: existing?.admission_no ?? a.admission_no,
        tempPassword: null,
      };
    }
    if (!a.class_id) throw new BadRequestException("A class must be allocated before admitting");

    let admissionNo = a.admission_no;
    if (!admissionNo) {
      const r = await this.prisma.$queryRaw<{ next_admission_no: string }[]>`
        SELECT public.next_admission_no() AS next_admission_no`;
      admissionNo = r[0]?.next_admission_no ?? null;
    }
    const email = `adm.${slug(a.student_name)}.${(admissionNo ?? id).toLowerCase().replace(/[^a-z0-9]/g, "")}@student.greenwood.test`;
    const tempPassword = `Welcome-${Math.random().toString(36).slice(2, 8)}!`;
    const { userId } = await this.auth.provisionAccount({
      email,
      password: tempPassword,
      fullName: a.student_name,
      role: "student",
    });

    try {
      const roll = await this.prisma.$queryRaw<{ next_roll_no: string }[]>`
        SELECT public.next_roll_no(${a.class_id}::uuid) AS next_roll_no`;
      const student = await this.prisma.students.create({
        data: {
          profile_id: userId,
          class_id: a.class_id,
          admission_no: admissionNo,
          roll_no: roll[0]?.next_roll_no ?? null,
          gender: a.applicant_gender ?? null,
          status: "active",
        },
      });

      // Link the verified parent (primary + fee-responsible).
      if (a.parent_id) {
        await this.prisma.parent_student.upsert({
          where: { parent_id_student_id: { parent_id: a.parent_id, student_id: student.id } },
          create: {
            parent_id: a.parent_id,
            student_id: student.id,
            relationship_type: "guardian",
            is_primary: true,
            fee_responsible: true,
          },
          update: {},
        });
      }

      // Assign the chosen fee structure as the student's first fee.
      if (a.fee_structure_id) {
        const fs = await this.prisma.fee_structures.findUnique({
          where: { id: a.fee_structure_id },
        });
        if (fs) {
          await this.prisma.fee_assignments.create({
            data: {
              student_id: student.id,
              structure_id: fs.id,
              title: fs.name,
              amount_due: fs.amount,
              due_date: new Date(Date.now() + 30 * 86_400_000),
            },
          });
        }
      }

      await this.prisma.admission_enquiries.update({
        where: { id },
        data: {
          converted_student_id: student.id,
          admission_no: admissionNo,
          status: "converted",
          admitted_at: new Date(),
          updated_at: new Date(),
        },
      });
      return { studentId: student.id, admissionNo, tempPassword };
    } catch (e) {
      await this.auth.deleteAccount(userId);
      throw e;
    }
  }

  /**
   * Direct admission (the 5-step "Admit Student" wizard). Atomically creates the
   * student account + rich details + medical, resolves the parent (link an
   * existing one or create a new deduped account), links guardians, and raises a
   * fee invoice for every selected fee group plus any opening balance — in one
   * operation. Rolls back the provisioned accounts if the transaction fails.
   */
  async admitDirect(actor: AuthUser, dto: AdmitDirectInput) {
    this.requireDesk(actor);
    const first = (dto.firstName ?? "").trim();
    if (!first) throw new BadRequestException("First name is required");
    if (!dto.classId) throw new BadRequestException("Class is required");
    const fullName = [dto.firstName, dto.middleName, dto.lastName]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" ");

    // Admission number + roll (reuse the standard DB sequences).
    let admissionNo = dto.admissionNo?.trim() || null;
    if (!admissionNo) {
      const r = await this.prisma.$queryRaw<{ next_admission_no: string }[]>`
        SELECT public.next_admission_no() AS next_admission_no`;
      admissionNo = r[0]?.next_admission_no ?? null;
    }
    let rollNo = dto.rollNo?.trim() || null;
    if (!rollNo) {
      const r = await this.prisma.$queryRaw<{ next_roll_no: string }[]>`
        SELECT public.next_roll_no(${dto.classId}::uuid) AS next_roll_no`;
      rollNo = r[0]?.next_roll_no ?? null;
    }

    // ---- resolve the parent (existing link or a new deduped account) --------
    let parentId: string | null = null;
    let parentTempPassword: string | null = null;
    let createdParentId: string | null = null;
    if (dto.parentMode === "existing") {
      if (!dto.existingParentId) throw new BadRequestException("Select an existing parent to link");
      const p = await this.prisma.profiles.findUnique({ where: { id: dto.existingParentId } });
      if (!p) throw new NotFoundException("Selected parent not found");
      parentId = p.id;
    } else {
      const guardian = dto.primaryGuardian === "mother" ? dto.mother : dto.father;
      const gName = (guardian?.name ?? "").trim() || fullName + " (Guardian)";
      const email = (dto.parentLoginEmail ?? "").trim();
      if (!email) throw new BadRequestException("Parent Account Login Email is required for a new parent");
      // Reuse the parents module: dedup (email/phone/national id) + provision.
      const created = await this.parents.create(actor, {
        fullName: gName,
        email,
        phone: guardian?.phone ?? undefined,
        nationalId: guardian?.aadhaar ?? undefined,
        occupation: guardian?.occupation ?? undefined,
        address: dto.guardianAddress ?? undefined,
      });
      parentId = created.parentId;
      createdParentId = created.parentId;
      parentTempPassword = created.tempPassword;
      // Persist the primary guardian's extra fields.
      await this.prisma.profiles.update({
        where: { id: parentId },
        data: {
          qualification: guardian?.qualification ?? null,
          annual_income: guardian?.annualIncome != null ? new Prisma.Decimal(guardian.annualIncome) : null,
        },
      });
    }

    // Student account.
    const studentEmail =
      dto.studentEmail?.trim() ||
      `adm.${slug(fullName)}.${(admissionNo ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}@student.greenwood.test`;
    const tempPassword = `Welcome-${Math.random().toString(36).slice(2, 8)}!`;
    const { userId } = await this.auth.provisionAccount({
      email: studentEmail,
      password: tempPassword,
      fullName,
      role: "student",
      phone: dto.studentPhone ?? null,
    });

    try {
      const studentId = await this.prisma.$transaction(async (tx) => {
        const student = await tx.students.create({
          data: {
            profile_id: userId,
            class_id: dto.classId,
            admission_no: admissionNo,
            roll_no: rollNo,
            gender: dto.gender ?? null,
            status: "active",
            ...(dto.admissionDate ? { admission_date: new Date(dto.admissionDate) } : {}),
          },
        });

        await tx.student_details.create({
          data: {
            student_id: student.id,
            first_name: dto.firstName ?? null,
            middle_name: dto.middleName ?? null,
            last_name: dto.lastName ?? null,
            dob: dto.dob ? new Date(dto.dob) : null,
            current_address: dto.currentAddress ?? null,
            permanent_address: dto.permanentAddress ?? null,
            category_id: dto.categoryId ?? null,
            house: dto.house ?? null,
            religion: dto.religion ?? null,
            caste: dto.caste ?? null,
            sub_caste: dto.subCaste ?? null,
            mother_tongue: dto.motherTongue ?? null,
            place_of_birth: dto.placeOfBirth ?? null,
            nationality: dto.nationality ?? "Indian",
            aadhaar_no: dto.aadhaarNo ?? null,
            pen_sssm_id: dto.penSssmId ?? null,
            bpl: !!dto.bpl,
            rte: !!dto.rte,
            biometric_id: dto.biometricId ?? null,
            previous_school: dto.previousSchool ?? null,
            opening_due_balance: new Prisma.Decimal(dto.openingDueBalance ?? 0),
            bank_name: dto.bankName ?? null,
            bank_account: dto.bankAccount ?? null,
            bank_ifsc: dto.bankIfsc ?? null,
            photo_url: dto.photoUrl ?? null,
            student_phone: dto.studentPhone ?? null,
            student_email: dto.studentEmail ?? studentEmail,
            custom: (dto.customFields ?? {}) as Prisma.InputJsonValue,
            updated_by: actor.id,
          },
        });

        if (
          dto.heightCm != null ||
          dto.weightKg != null ||
          dto.bloodGroup ||
          dto.medicalHistory ||
          dto.emergencyContactName ||
          dto.emergencyContactPhone
        ) {
          await tx.student_medical.create({
            data: {
              student_id: student.id,
              blood_group: dto.bloodGroup ?? null,
              allergies: dto.medicalHistory ?? null,
              height_cm: dto.heightCm != null ? new Prisma.Decimal(dto.heightCm) : null,
              weight_kg: dto.weightKg != null ? new Prisma.Decimal(dto.weightKg) : null,
              emergency_contact_name: dto.emergencyContactName ?? null,
              emergency_contact_phone: dto.emergencyContactPhone ?? null,
              updated_by: actor.id,
            },
          });
        }

        // Primary guardian link.
        if (parentId) {
          const rel =
            dto.primaryGuardian === "mother"
              ? "mother"
              : dto.primaryGuardian === "other"
                ? "guardian"
                : "father";
          await tx.parent_student.upsert({
            where: { parent_id_student_id: { parent_id: parentId, student_id: student.id } },
            create: {
              parent_id: parentId,
              student_id: student.id,
              relationship_type: rel,
              is_primary: true,
              fee_responsible: true,
              emergency_contact: true,
            },
            update: {},
          });
        }

        // Fee invoices for each selected fee group.
        for (const fid of dto.feeGroupIds ?? []) {
          const fs = await tx.fee_structures.findUnique({ where: { id: fid } });
          if (!fs) continue;
          await tx.fee_assignments.create({
            data: {
              student_id: student.id,
              structure_id: fs.id,
              title: fs.name,
              amount_due: fs.amount,
              due_date: new Date(Date.now() + 30 * 86_400_000),
            },
          });
        }
        // Opening balance as its own invoice line.
        if (dto.openingDueBalance && dto.openingDueBalance > 0) {
          await tx.fee_assignments.create({
            data: {
              student_id: student.id,
              title: "Opening Due Balance",
              amount_due: new Prisma.Decimal(dto.openingDueBalance),
              due_date: new Date(Date.now() + 30 * 86_400_000),
            },
          });
        }

        // Activity log entry.
        await tx.student_activity_log.create({
          data: {
            student_id: student.id,
            actor_id: actor.id,
            event_type: "admitted",
            description: `Admitted via admission wizard (${admissionNo ?? "no number"}).`,
          },
        });

        return student.id;
      });

      // Secondary guardian (the other parent block) — a guardian record so
      // "multiple guardians per student" holds, without a second login.
      const other = dto.primaryGuardian === "mother" ? dto.father : dto.mother;
      if (dto.parentMode === "new" && other?.name?.trim()) {
        await this.linkSecondaryGuardian(studentId, other, dto.primaryGuardian ?? "father");
      }

      // Notify the parent portal.
      if (parentId) {
        await this.notifications
          .notify({
            senderId: actor.id,
            userIds: [parentId],
            subject: "Admission confirmed",
            body: `${fullName}'s admission is confirmed. Admission No: ${admissionNo}.`,
          })
          .catch(() => undefined);
      }

      return { ok: true, studentId, admissionNo, rollNo, tempPassword, parentId, parentTempPassword };
    } catch (e) {
      await this.auth.deleteAccount(userId).catch(() => undefined);
      if (createdParentId) await this.auth.deleteAccount(createdParentId).catch(() => undefined);
      throw e;
    }
  }

  /** Create a non-login guardian profile for the secondary parent and link it. */
  private async linkSecondaryGuardian(
    studentId: string,
    g: GuardianInput,
    primary: string,
  ) {
    const rel = primary === "mother" ? "father" : "mother";
    const profile = await this.prisma.profiles.create({
      data: {
        id: randomUUID(),
        full_name: g.name!.trim(),
        phone: g.phone ?? null,
        occupation: g.occupation ?? null,
        qualification: g.qualification ?? null,
        national_id: g.aadhaar ?? null,
        annual_income: g.annualIncome != null ? new Prisma.Decimal(g.annualIncome) : null,
      },
    });
    await this.prisma.parent_student.create({
      data: {
        parent_id: profile.id,
        student_id: studentId,
        relationship_type: rel,
        is_primary: false,
      },
    });
  }
}

export type GuardianInput = {
  name?: string;
  middleName?: string;
  phone?: string;
  occupation?: string;
  qualification?: string;
  aadhaar?: string;
  annualIncome?: number;
  photoUrl?: string;
};

export type AdmitDirectInput = {
  // Academic
  admissionNo?: string;
  rollNo?: string;
  admissionDate?: string;
  classId: string;
  section?: string;
  biometricId?: string;
  previousSchool?: string;
  openingDueBalance?: number;
  // Personal
  firstName: string;
  middleName?: string;
  lastName?: string;
  gender?: string;
  dob?: string;
  categoryId?: string;
  house?: string;
  bloodGroup?: string;
  religion?: string;
  aadhaarNo?: string;
  penSssmId?: string;
  caste?: string;
  subCaste?: string;
  motherTongue?: string;
  placeOfBirth?: string;
  nationality?: string;
  bpl?: boolean;
  rte?: boolean;
  studentPhone?: string;
  studentEmail?: string;
  photoUrl?: string;
  // Parents
  parentMode: "new" | "existing";
  existingParentId?: string;
  primaryGuardian?: "father" | "mother" | "other";
  father?: GuardianInput;
  mother?: GuardianInput;
  parentLoginEmail?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  guardianAddress?: string;
  currentAddress?: string;
  permanentAddress?: string;
  // Health & bank
  heightCm?: number;
  weightKg?: number;
  medicalHistory?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  // Fees & custom
  feeGroupIds?: string[];
  customFields?: Record<string, unknown>;
};
