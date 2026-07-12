import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * Admin/HR editing for the teacher detail page. The teacher record itself is thin
 * (`teachers`), while most of the page's data lives on the linked `staff` row and
 * a set of child tables. Teachers provisioned through the Users screen have no
 * `staff_id`, so this service lazily creates + links a staff record the first time
 * any staff-scoped field is written — that's what makes the empty tabs fillable.
 *
 * Two id conventions (see staff.service.ts): qualifications/experience/reviews key
 * on `teachers.id`; timetable/teacher_classes key on the teacher's profile/user id.
 */
@Injectable()
export class TeacherProfileService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private requireManage(actor: AuthUser) {
    if (!actor.roles.some((r) => r === "admin" || r === "hr"))
      throw new ForbiddenException("Only administrators and HR can edit teacher records.");
  }

  private async getTeacher(teacherId: string) {
    const teacher = await this.prisma.teachers.findUnique({ where: { id: teacherId } });
    if (!teacher) throw new NotFoundException("Teacher not found");
    return teacher;
  }

  /** Resolve the teacher's profile/user id (for timetable/class scoped rows). */
  private async resolveProfileId(teacher: {
    staff_id: string | null;
    email: string | null;
  }): Promise<string | null> {
    if (teacher.staff_id) {
      const staff = await this.prisma.staff.findUnique({
        where: { id: teacher.staff_id },
        select: { profile_id: true },
      });
      if (staff?.profile_id) return staff.profile_id;
    }
    if (teacher.email) {
      const user = await this.prisma.users.findUnique({
        where: { email: teacher.email.toLowerCase() },
        select: { id: true },
      });
      if (user) return user.id;
    }
    return null;
  }

  /** Return the linked staff id, creating + linking a staff row if none exists. */
  private async ensureStaff(teacherId: string): Promise<string> {
    const teacher = await this.getTeacher(teacherId);
    if (teacher.staff_id) return teacher.staff_id;
    const profileId = await this.resolveProfileId(teacher);
    const base = `TCH-${teacher.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const data = {
      full_name: teacher.full_name,
      email: teacher.email || null,
      phone: teacher.phone,
      department: "Academic",
      designation: "Teacher",
      employment_type: "full_time",
      status: teacher.status ?? "active",
      confirmation_status: "confirmed",
      join_date: teacher.joined_date ?? new Date(),
      ...(profileId ? { profile_id: profileId } : {}),
    };
    // employee_code is unique; on the rare collision (two teacher ids sharing an
    // 8-char prefix) retry with a longer suffix so linking never dead-ends.
    let created;
    try {
      created = await this.prisma.staff.create({ data: { employee_code: base, ...data } });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        created = await this.prisma.staff.create({
          data: { employee_code: `${base}-${teacher.id.replace(/-/g, "").slice(8, 14).toUpperCase()}`, ...data },
        });
      } else {
        throw e;
      }
    }
    await this.prisma.teachers.update({
      where: { id: teacherId },
      data: { staff_id: created.id },
    });
    return created.id;
  }

  // ---- Core teacher fields --------------------------------------------------
  async updateCore(
    actor: AuthUser,
    teacherId: string,
    input: {
      fullName?: string;
      phone?: string | null;
      subject?: string;
      qualification?: string | null;
      experienceYears?: number;
      joinedDate?: string;
      status?: string;
    },
  ) {
    this.requireManage(actor);
    await this.getTeacher(teacherId);
    const data: Record<string, unknown> = { updated_at: new Date() };
    if (input.fullName !== undefined) data.full_name = input.fullName;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.subject !== undefined) data.subject = input.subject;
    if (input.qualification !== undefined) data.qualification = input.qualification;
    if (input.experienceYears !== undefined) data.experience_years = input.experienceYears;
    if (input.joinedDate !== undefined) data.joined_date = new Date(input.joinedDate);
    if (input.status !== undefined) data.status = input.status;
    // Keep the linked staff row's headline fields in step where they mirror.
    const teacher = await this.prisma.teachers.update({ where: { id: teacherId }, data });
    if (teacher.staff_id) {
      await this.prisma.staff.update({
        where: { id: teacher.staff_id },
        data: {
          ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updated_at: new Date(),
        },
      });
    }
    return { ok: true };
  }

  // ---- Staff profile (personal + employment + bank) -------------------------
  async updateStaffProfile(
    actor: AuthUser,
    teacherId: string,
    input: {
      department?: string;
      designation?: string;
      employmentType?: string;
      confirmationStatus?: string;
      probationEndDate?: string | null;
      joinDate?: string;
      dob?: string | null;
      bloodGroup?: string | null;
      address?: string | null;
      phone?: string | null;
      skills?: string[];
      emergencyContact?: { name?: string; phone?: string } | null;
      medicalInfo?: string | null;
      bankDetails?: { bank?: string; account?: string; ifsc?: string } | null;
    },
  ) {
    this.requireManage(actor);
    const staffId = await this.ensureStaff(teacherId);

    const data: Record<string, unknown> = { updated_at: new Date() };
    if (input.department !== undefined) data.department = input.department;
    if (input.designation !== undefined) data.designation = input.designation;
    if (input.employmentType !== undefined) data.employment_type = input.employmentType;
    if (input.confirmationStatus !== undefined) data.confirmation_status = input.confirmationStatus;
    if (input.probationEndDate !== undefined)
      data.probation_end_date = input.probationEndDate ? new Date(input.probationEndDate) : null;
    if (input.joinDate !== undefined) data.join_date = new Date(input.joinDate);
    if (input.dob !== undefined) data.dob = input.dob ? new Date(input.dob) : null;
    if (input.bloodGroup !== undefined) data.blood_group = input.bloodGroup;
    if (input.address !== undefined) data.address = input.address;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.skills !== undefined) data.skills = input.skills;
    if (input.emergencyContact !== undefined) data.emergency_contact = input.emergencyContact;
    if (input.medicalInfo !== undefined)
      data.medical_info = input.medicalInfo ? { notes: input.medicalInfo } : null;
    if (input.bankDetails !== undefined) data.bank_details = input.bankDetails;

    await this.prisma.$transaction([
      this.prisma.staff.update({ where: { id: staffId }, data }),
      this.prisma.staff_employment_history.create({
        data: {
          staff_id: staffId,
          event_type: "revised",
          effective_date: new Date(),
          notes: "Profile updated",
        },
      }),
    ]);
    return { ok: true, staffId };
  }

  // ---- Qualifications (teacher-scoped) --------------------------------------
  async addQualification(
    actor: AuthUser,
    teacherId: string,
    input: { degree: string; institution?: string; year?: number; certification?: string },
  ) {
    this.requireManage(actor);
    await this.getTeacher(teacherId);
    const row = await this.prisma.teacher_qualifications.create({
      data: {
        teacher_id: teacherId,
        degree: input.degree,
        institution: input.institution ?? null,
        year: input.year ?? null,
        certification: input.certification ?? null,
      },
    });
    return { ok: true, id: row.id };
  }

  async deleteQualification(actor: AuthUser, teacherId: string, id: string) {
    this.requireManage(actor);
    await this.prisma.teacher_qualifications.deleteMany({ where: { id, teacher_id: teacherId } });
    return { ok: true };
  }

  // ---- Prior experience (teacher-scoped) ------------------------------------
  async addExperience(
    actor: AuthUser,
    teacherId: string,
    input: { employer: string; role?: string; startDate?: string; endDate?: string },
  ) {
    this.requireManage(actor);
    await this.getTeacher(teacherId);
    const row = await this.prisma.teacher_experience.create({
      data: {
        teacher_id: teacherId,
        employer: input.employer,
        role: input.role ?? null,
        start_date: input.startDate ? new Date(input.startDate) : null,
        end_date: input.endDate ? new Date(input.endDate) : null,
      },
    });
    return { ok: true, id: row.id };
  }

  async deleteExperience(actor: AuthUser, teacherId: string, id: string) {
    this.requireManage(actor);
    await this.prisma.teacher_experience.deleteMany({ where: { id, teacher_id: teacherId } });
    return { ok: true };
  }

  // ---- Performance reviews (teacher-scoped) ---------------------------------
  async addReview(
    actor: AuthUser,
    teacherId: string,
    input: { period: string; rating: number; notes?: string },
  ) {
    this.requireManage(actor);
    await this.getTeacher(teacherId);
    const row = await this.prisma.teacher_performance_reviews.create({
      data: {
        teacher_id: teacherId,
        period: input.period,
        rating: input.rating,
        reviewer_id: actor.id,
        notes: input.notes ?? null,
      },
    });
    return { ok: true, id: row.id };
  }

  async deleteReview(actor: AuthUser, teacherId: string, id: string) {
    this.requireManage(actor);
    await this.prisma.teacher_performance_reviews.deleteMany({
      where: { id, teacher_id: teacherId },
    });
    return { ok: true };
  }

  // ---- Employment history (staff-scoped) ------------------------------------
  async addHistory(
    actor: AuthUser,
    teacherId: string,
    input: {
      eventType: string;
      effectiveDate: string;
      fromValue?: string;
      toValue?: string;
      notes?: string;
    },
  ) {
    this.requireManage(actor);
    const staffId = await this.ensureStaff(teacherId);
    const row = await this.prisma.staff_employment_history.create({
      data: {
        staff_id: staffId,
        event_type: input.eventType,
        effective_date: new Date(input.effectiveDate),
        from_value: input.fromValue ?? null,
        to_value: input.toValue ?? null,
        notes: input.notes ?? null,
      },
    });
    return { ok: true, id: row.id };
  }

  async deleteHistory(actor: AuthUser, teacherId: string, id: string) {
    this.requireManage(actor);
    const teacher = await this.getTeacher(teacherId);
    if (teacher.staff_id)
      await this.prisma.staff_employment_history.deleteMany({
        where: { id, staff_id: teacher.staff_id },
      });
    return { ok: true };
  }

  // ---- Payroll (staff-scoped) -----------------------------------------------
  async addPayroll(
    actor: AuthUser,
    teacherId: string,
    input: {
      month: string;
      baseSalary: number;
      allowances?: number;
      deductions?: number;
      status?: string;
      payDate?: string;
      notes?: string;
    },
  ) {
    this.requireManage(actor);
    const staffId = await this.ensureStaff(teacherId);
    const base = input.baseSalary;
    const allowances = input.allowances ?? 0;
    const deductions = input.deductions ?? 0;
    const net = base + allowances - deductions;
    // month is a period marker; normalise to the first of the month.
    const month = new Date(`${input.month.slice(0, 7)}-01T00:00:00.000Z`);
    const row = await this.prisma.payroll_runs.upsert({
      where: { staff_id_month: { staff_id: staffId, month } },
      create: {
        staff_id: staffId,
        month,
        base_salary: base,
        allowances,
        deductions,
        net_salary: net,
        status: input.status ?? "pending",
        pay_date: input.payDate ? new Date(input.payDate) : null,
        notes: input.notes ?? null,
      },
      update: {
        base_salary: base,
        allowances,
        deductions,
        net_salary: net,
        status: input.status ?? "pending",
        pay_date: input.payDate ? new Date(input.payDate) : null,
        notes: input.notes ?? null,
        updated_at: new Date(),
      },
    });
    return { ok: true, id: row.id };
  }

  async deletePayroll(actor: AuthUser, teacherId: string, id: string) {
    this.requireManage(actor);
    const teacher = await this.getTeacher(teacherId);
    if (teacher.staff_id)
      await this.prisma.payroll_runs.deleteMany({ where: { id, staff_id: teacher.staff_id } });
    return { ok: true };
  }

  // ---- Training (staff-scoped) ----------------------------------------------
  async addTraining(
    actor: AuthUser,
    teacherId: string,
    input: {
      title: string;
      provider?: string;
      programType?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
    },
  ) {
    this.requireManage(actor);
    const staffId = await this.ensureStaff(teacherId);
    const attended = (input.status ?? "").toLowerCase() === "completed";
    const program = await this.prisma.training_programs.create({
      data: {
        title: input.title,
        provider: input.provider ?? null,
        program_type: input.programType ?? "workshop",
        start_date: input.startDate ? new Date(input.startDate) : null,
        end_date: input.endDate ? new Date(input.endDate) : null,
      },
    });
    const row = await this.prisma.training_attendance.create({
      data: { program_id: program.id, staff_id: staffId, attended },
    });
    return { ok: true, id: row.id };
  }

  async deleteTraining(actor: AuthUser, teacherId: string, id: string) {
    this.requireManage(actor);
    const teacher = await this.getTeacher(teacherId);
    if (teacher.staff_id)
      await this.prisma.training_attendance.deleteMany({
        where: { id, staff_id: teacher.staff_id },
      });
    return { ok: true };
  }

  // ---- Documents (staff-scoped) ---------------------------------------------
  async addDocument(
    actor: AuthUser,
    teacherId: string,
    input: { docType: string; title: string; fileUrl?: string; expiryDate?: string },
  ) {
    this.requireManage(actor);
    const staffId = await this.ensureStaff(teacherId);
    const row = await this.prisma.staff_documents.create({
      data: {
        staff_id: staffId,
        doc_type: input.docType,
        title: input.title,
        file_url: input.fileUrl ?? null,
        expiry_date: input.expiryDate ? new Date(input.expiryDate) : null,
      },
    });
    return { ok: true, id: row.id };
  }

  async deleteDocument(actor: AuthUser, teacherId: string, id: string) {
    this.requireManage(actor);
    const teacher = await this.getTeacher(teacherId);
    if (teacher.staff_id)
      await this.prisma.staff_documents.deleteMany({ where: { id, staff_id: teacher.staff_id } });
    return { ok: true };
  }

  // ---- Timetable (profile-scoped) -------------------------------------------
  private timeToDate(hhmm: string): Date {
    if (!/^\d{2}:\d{2}$/.test(hhmm)) throw new BadRequestException(`Invalid time: ${hhmm}`);
    return new Date(`1970-01-01T${hhmm}:00.000Z`);
  }

  private dateToTime(d: Date | null): string | null {
    return d ? d.toISOString().slice(11, 16) : null;
  }

  async getTimetable(actor: AuthUser, teacherId: string) {
    this.requireManage(actor);
    const teacher = await this.getTeacher(teacherId);
    const profileId = await this.resolveProfileId(teacher);
    if (!profileId) return { profileLinked: false, entries: [] as unknown[] };
    const rows = await this.prisma.timetable.findMany({
      where: { teacher_id: profileId },
      orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
      include: {
        classes: { select: { name: true, section: true } },
        subjects: { select: { name: true, code: true } },
      },
    });
    return {
      profileLinked: true,
      entries: rows.map((r) => ({
        id: r.id,
        classId: r.class_id,
        className: r.classes?.name ?? null,
        section: r.classes?.section ?? null,
        subjectId: r.subject_id,
        subjectName: r.subjects?.name ?? null,
        subjectCode: r.subjects?.code ?? null,
        dayOfWeek: r.day_of_week,
        startTime: this.dateToTime(r.start_time),
        endTime: this.dateToTime(r.end_time),
        room: r.room,
      })),
    };
  }

  /** Replace the teacher's whole weekly timetable with the supplied entries. */
  async saveTimetable(
    actor: AuthUser,
    teacherId: string,
    entries: {
      classId: string;
      subjectId?: string | null;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      room?: string | null;
    }[],
  ) {
    this.requireManage(actor);
    const teacher = await this.getTeacher(teacherId);
    const profileId = await this.resolveProfileId(teacher);
    if (!profileId)
      throw new BadRequestException(
        "This teacher has no linked login account, so a timetable can't be assigned yet.",
      );
    for (const e of entries) {
      if (this.timeToDate(e.endTime) <= this.timeToDate(e.startTime))
        throw new BadRequestException("Each slot's end time must be after its start time.");
    }
    await this.prisma.$transaction([
      this.prisma.timetable.deleteMany({ where: { teacher_id: profileId } }),
      ...entries.map((e) =>
        this.prisma.timetable.create({
          data: {
            teacher_id: profileId,
            class_id: e.classId,
            subject_id: e.subjectId ?? null,
            day_of_week: e.dayOfWeek,
            start_time: this.timeToDate(e.startTime),
            end_time: this.timeToDate(e.endTime),
            room: e.room ?? null,
          },
        }),
      ),
    ]);
    return { ok: true, count: entries.length };
  }
}
