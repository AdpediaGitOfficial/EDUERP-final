import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

const REL_TYPES = ["father", "mother", "guardian", "emergency_contact"] as const;

@Injectable()
export class ParentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  private requireDesk(actor: AuthUser) {
    if (!actor.roles.some((r) => r === "admin" || r === "reception"))
      throw new ForbiddenException("Admin or reception only");
  }
  private requireAdmin(actor: AuthUser) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException("Admin only");
  }

  /** Children (with class) linked to a set of parent ids, grouped by parent. */
  private async childrenByParent(parentIds: string[]) {
    if (!parentIds.length) return new Map<string, any[]>();
    const links = await this.prisma.parent_student.findMany({
      where: { parent_id: { in: parentIds } },
      include: {
        students: {
          select: {
            id: true,
            admission_no: true,
            roll_no: true,
            profiles: { select: { full_name: true } },
            classes: { select: { name: true, section: true } },
          },
        },
      },
    });
    const map = new Map<string, any[]>();
    for (const l of links) {
      const arr = map.get(l.parent_id) ?? [];
      arr.push({
        studentId: l.student_id,
        relationshipType: l.relationship_type,
        name: l.students?.profiles?.full_name ?? null,
        admissionNo: l.students?.admission_no ?? null,
        rollNo: l.students?.roll_no ?? null,
        className: l.students?.classes
          ? `${l.students.classes.name}${l.students.classes.section ? "-" + l.students.classes.section : ""}`
          : null,
      });
      map.set(l.parent_id, arr);
    }
    return map;
  }

  /**
   * Search EXISTING parents before creating a new one (duplicate-prevention).
   * Matches exact email/phone/national ID (the dedupe keys) and/or a name/email
   * substring. Returns each match with its linked children so the caller can
   * pick the real person instead of minting a duplicate.
   */
  async search(
    actor: AuthUser,
    params: { email?: string; phone?: string; nationalId?: string; q?: string },
  ) {
    this.requireDesk(actor);
    const { email, phone, nationalId, q } = params;
    if (!email && !phone && !nationalId && !q?.trim()) return { matches: [] };

    const conds: Prisma.Sql[] = [];
    if (email) conds.push(Prisma.sql`lower(p.email) = lower(${email})`);
    if (phone) conds.push(Prisma.sql`p.phone = ${phone}`);
    if (nationalId) conds.push(Prisma.sql`p.national_id = ${nationalId}`);
    if (q?.trim()) {
      const like = `%${q.trim()}%`;
      conds.push(
        Prisma.sql`(p.full_name ILIKE ${like} OR p.email ILIKE ${like} OR p.phone ILIKE ${like})`,
      );
    }
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        full_name: string;
        email: string | null;
        phone: string | null;
        national_id: string | null;
      }[]
    >(Prisma.sql`
      SELECT DISTINCT p.id, p.full_name, p.email, p.phone, p.national_id
      FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'parent'
      WHERE ${Prisma.join(conds, " OR ")}
      ORDER BY p.full_name
      LIMIT 25
    `);
    const kids = await this.childrenByParent(rows.map((r) => r.id));
    return {
      matches: rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        phone: r.phone,
        nationalId: r.national_id,
        children: kids.get(r.id) ?? [],
      })),
    };
  }

  /** Parent directory (searchable, paginated) for the management list page. */
  async list(actor: AuthUser, page = 1, pageSize = 50, q?: string) {
    this.requireDesk(actor);
    const take = Math.min(pageSize, 200);
    const skip = (page - 1) * take;
    const filter = q?.trim()
      ? Prisma.sql`AND (p.full_name ILIKE ${"%" + q.trim() + "%"} OR p.email ILIKE ${"%" + q.trim() + "%"} OR p.phone ILIKE ${"%" + q.trim() + "%"} OR p.national_id ILIKE ${"%" + q.trim() + "%"})`
      : Prisma.empty;
    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<
        {
          id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          national_id: string | null;
          status: string;
          children: bigint;
          last_sign_in_at: Date | null;
        }[]
      >(Prisma.sql`
        SELECT p.id, p.full_name, p.email, p.phone, p.national_id, p.status,
               (SELECT count(*) FROM parent_student ps WHERE ps.parent_id = p.id) AS children,
               u.last_sign_in_at
        FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'parent'
        LEFT JOIN auth.users u ON u.id = p.id
        WHERE 1=1 ${filter}
        ORDER BY p.full_name
        LIMIT ${take} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
        SELECT count(*) AS n
        FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'parent'
        WHERE 1=1 ${filter}
      `),
    ]);
    return {
      total: Number(countRows[0]?.n ?? 0),
      page,
      pageSize: take,
      rows: rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        phone: r.phone,
        nationalId: r.national_id,
        status: r.status,
        childrenCount: Number(r.children),
        lastSignInAt: r.last_sign_in_at,
      })),
    };
  }

  /** Standalone parent profile: details + children + cross-child fees + comms. */
  async getProfile(actor: AuthUser, id: string) {
    if (!actor.roles.some((r) => r === "admin" || r === "reception") && actor.id !== id)
      throw new ForbiddenException();
    const profile = await this.prisma.profiles.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException("Parent not found");

    const [children, account, comms] = await Promise.all([
      (async () => (await this.childrenByParent([id])).get(id) ?? [])(),
      this.prisma.users.findUnique({
        where: { id },
        select: { last_sign_in_at: true, email_confirmed_at: true },
      }),
      this.prisma.broadcast_recipients.findMany({
        where: { user_id: id },
        orderBy: { created_at: "desc" },
        take: 30,
        include: { broadcasts: { select: { subject: true, body: true, created_at: true } } },
      }),
    ]);

    const studentIds = children.map((c: any) => c.studentId);
    const fees = studentIds.length
      ? await this.prisma.fee_assignments.aggregate({
          where: { student_id: { in: studentIds } },
          _sum: { amount_due: true, amount_paid: true },
        })
      : { _sum: { amount_due: null, amount_paid: null } };
    const due = Number(fees._sum.amount_due ?? 0);
    const paid = Number(fees._sum.amount_paid ?? 0);

    return {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      nationalId: profile.national_id,
      address: profile.address,
      occupation: profile.occupation,
      status: profile.status,
      children,
      feeSummary: { totalDue: due, totalPaid: paid, outstanding: Math.max(0, due - paid) },
      login: {
        lastSignInAt: account?.last_sign_in_at ?? null,
        confirmed: !!account?.email_confirmed_at,
        active: profile.status !== "inactive",
      },
      communications: comms.map((c) => ({
        id: c.id,
        subject: c.broadcasts?.subject ?? null,
        body: c.broadcasts?.body ?? null,
        sentAt: c.broadcasts?.created_at ?? c.created_at,
        readAt: c.read_at,
      })),
    };
  }

  /**
   * Create a new parent — but only after confirming no existing parent matches
   * the email/phone/national ID. Returns 409 with the existing match otherwise
   * (the DB trigger is the hard backstop; this is the friendly path).
   */
  async create(
    actor: AuthUser,
    input: {
      fullName: string;
      email: string;
      phone?: string;
      nationalId?: string;
      address?: string;
      occupation?: string;
      password?: string;
    },
  ) {
    this.requireDesk(actor);
    const dup = await this.search(actor, {
      email: input.email,
      phone: input.phone,
      nationalId: input.nationalId,
    });
    if (dup.matches.length)
      throw new ConflictException({
        message: "A parent with this email, mobile, or national ID already exists.",
        existing: dup.matches[0],
      });
    const password = input.password?.trim() || "Welcome123!";
    try {
      const { userId } = await this.auth.provisionAccount({
        email: input.email,
        password,
        fullName: input.fullName,
        role: "parent",
        phone: input.phone ?? null,
        nationalId: input.nationalId ?? null,
        address: input.address ?? null,
        occupation: input.occupation ?? null,
      });
      return { ok: true, parentId: userId, tempPassword: password };
    } catch (e) {
      if (this.isDuplicateParent(e))
        throw new ConflictException(
          "A parent with this email, mobile, or national ID already exists.",
        );
      throw e;
    }
  }

  /** The DB trigger raises SQLSTATE 23505 with a `duplicate_parent_identity` tag. */
  private isDuplicateParent(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("duplicate_parent_identity")) return true;
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
  }

  async update(
    actor: AuthUser,
    id: string,
    input: {
      fullName?: string;
      phone?: string | null;
      nationalId?: string | null;
      address?: string | null;
      occupation?: string | null;
    },
  ) {
    this.requireDesk(actor);
    const exists = await this.prisma.profiles.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("Parent not found");
    try {
      await this.prisma.profiles.update({
        where: { id },
        data: {
          ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.nationalId !== undefined ? { national_id: input.nationalId } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.occupation !== undefined ? { occupation: input.occupation } : {}),
          updated_at: new Date(),
        },
      });
      return { ok: true };
    } catch (e) {
      if (this.isDuplicateParent(e))
        throw new ConflictException("Another parent already uses this mobile or national ID.");
      throw e;
    }
  }

  async linkChild(actor: AuthUser, parentId: string, studentId: string, relationshipType: string) {
    this.requireDesk(actor);
    if (!(REL_TYPES as readonly string[]).includes(relationshipType))
      throw new BadRequestException("Invalid relationship type");
    const [parent, student] = await Promise.all([
      this.prisma.profiles.findUnique({ where: { id: parentId }, select: { id: true } }),
      this.prisma.students.findUnique({ where: { id: studentId }, select: { id: true } }),
    ]);
    if (!parent) throw new NotFoundException("Parent not found");
    if (!student) throw new NotFoundException("Student not found");
    await this.prisma.parent_student.upsert({
      where: { parent_id_student_id: { parent_id: parentId, student_id: studentId } },
      create: { parent_id: parentId, student_id: studentId, relationship_type: relationshipType },
      update: { relationship_type: relationshipType },
    });
    return { ok: true };
  }

  async unlinkChild(actor: AuthUser, parentId: string, studentId: string) {
    this.requireDesk(actor);
    await this.prisma.parent_student.deleteMany({
      where: { parent_id: parentId, student_id: studentId },
    });
    return { ok: true };
  }

  /**
   * Admin utility: surface data-integrity gaps in the parent↔student graph —
   * students with no guardian, and guardian links whose "parent" isn't actually
   * a parent-role account (mislinked/orphaned).
   */
  async mappingIssues(actor: AuthUser) {
    this.requireAdmin(actor);
    const unlinkedRows = await this.prisma.$queryRaw<
      {
        id: string;
        admission_no: string | null;
        roll_no: string | null;
        full_name: string | null;
        class_name: string | null;
      }[]
    >(Prisma.sql`
      SELECT s.id, s.admission_no, s.roll_no, pr.full_name,
             (c.name || COALESCE('-' || c.section, '')) AS class_name
      FROM students s
      LEFT JOIN profiles pr ON pr.id = s.profile_id
      LEFT JOIN classes c ON c.id = s.class_id
      WHERE NOT EXISTS (SELECT 1 FROM parent_student ps WHERE ps.student_id = s.id)
      ORDER BY pr.full_name
      LIMIT 500
    `);
    const orphanRows = await this.prisma.$queryRaw<
      {
        id: string;
        parent_id: string;
        student_id: string;
        parent_name: string | null;
        student_name: string | null;
      }[]
    >(Prisma.sql`
      SELECT ps.id, ps.parent_id, ps.student_id, pp.full_name AS parent_name, sp.full_name AS student_name
      FROM parent_student ps
      LEFT JOIN profiles pp ON pp.id = ps.parent_id
      LEFT JOIN students st ON st.id = ps.student_id
      LEFT JOIN profiles sp ON sp.id = st.profile_id
      WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = ps.parent_id AND ur.role = 'parent')
      ORDER BY pp.full_name
      LIMIT 500
    `);
    return {
      unlinkedStudents: unlinkedRows.map((r) => ({
        id: r.id,
        admissionNo: r.admission_no,
        rollNo: r.roll_no,
        name: r.full_name,
        className: r.class_name,
      })),
      orphanGuardians: orphanRows.map((r) => ({
        id: r.id,
        parentId: r.parent_id,
        studentId: r.student_id,
        parentName: r.parent_name,
        studentName: r.student_name,
      })),
    };
  }
}
