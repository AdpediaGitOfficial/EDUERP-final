import { ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   visitor_logs:        rec_admin_vl  (reception|admin ALL)
 *   admission_enquiries: rec_admin_ae  (reception|admin ALL)
 *   transport_routes:    fleet_admin_tr (write) + rec_read_tr (reception read)
 *   route_stops:         fleet_admin_rs (write) + rec_read_rs (reception read)
 *   route_students:      fleet_rec_admin_rst (fleet|reception|admin ALL)
 */
@Injectable()
export class ReceptionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private assertDesk(actor: AuthUser) {
    if (!actor.roles.some((r) => r === "admin" || r === "reception")) {
      throw new ForbiddenException();
    }
  }

  private assertTransport(actor: AuthUser) {
    if (!actor.roles.some((r) => r === "admin" || r === "reception" || r === "fleet")) {
      throw new ForbiddenException();
    }
  }

  async dashboard(actor: AuthUser) {
    this.assertDesk(actor);
    const [enquiries, visitors] = await Promise.all([
      this.prisma.admission_enquiries.findMany({ select: { status: true } }),
      this.prisma.visitor_logs.findMany({ select: { check_out: true } }),
    ]);
    const cnt = (s: string) => enquiries.filter((e) => e.status === s).length;
    return {
      enquiries: {
        new: cnt("new"),
        follow_up: cnt("follow_up"),
        converted: cnt("converted"),
        lost: cnt("lost"),
      },
      visitors: {
        total: visitors.length,
        active: visitors.filter((v) => !v.check_out).length,
      },
    };
  }

  // ---- Visitors ----
  async listVisitors(actor: AuthUser) {
    this.assertDesk(actor);
    const rows = await this.prisma.visitor_logs.findMany({
      orderBy: { check_in: "desc" },
      take: 500,
    });
    return rows.map((v) => ({
      id: v.id,
      name: v.name,
      purpose: v.purpose,
      meetingPerson: v.meeting_person,
      department: v.department,
      idReference: v.id_reference,
      checkIn: v.check_in,
      checkOut: v.check_out,
    }));
  }

  async checkInVisitor(
    actor: AuthUser,
    data: {
      name: string;
      purpose: string;
      meetingPerson?: string;
      department?: string;
      idReference?: string;
    },
  ) {
    this.assertDesk(actor);
    const row = await this.prisma.visitor_logs.create({
      data: {
        name: data.name,
        purpose: data.purpose,
        meeting_person: data.meetingPerson || null,
        department: data.department || null,
        id_reference: data.idReference || null,
      },
    });
    return { id: row.id };
  }

  async checkOutVisitor(actor: AuthUser, id: string) {
    this.assertDesk(actor);
    await this.prisma.visitor_logs.update({ where: { id }, data: { check_out: new Date() } });
    return { ok: true };
  }

  // ---- Admissions ----
  async listEnquiries(actor: AuthUser) {
    this.assertDesk(actor);
    const rows = await this.prisma.admission_enquiries.findMany({
      orderBy: { enquiry_date: "desc" },
      take: 500,
    });
    return rows.map((e) => ({
      id: e.id,
      studentName: e.student_name,
      parentName: e.parent_name,
      parentPhone: e.parent_phone,
      parentEmail: e.parent_email,
      gradeApplying: e.grade_applying,
      enquiryDate: e.enquiry_date,
      status: e.status,
      notes: e.notes,
    }));
  }

  async createEnquiry(
    actor: AuthUser,
    data: {
      studentName: string;
      parentName?: string;
      parentPhone?: string;
      parentEmail?: string;
      gradeApplying?: string;
      notes?: string;
    },
  ) {
    this.assertDesk(actor);
    const row = await this.prisma.admission_enquiries.create({
      data: {
        student_name: data.studentName,
        parent_name: data.parentName || null,
        parent_phone: data.parentPhone || null,
        parent_email: data.parentEmail || null,
        grade_applying: data.gradeApplying || null,
        notes: data.notes || null,
      },
    });
    return { id: row.id };
  }

  async updateEnquiryStatus(actor: AuthUser, id: string, status: string) {
    this.assertDesk(actor);
    await this.prisma.admission_enquiries.update({ where: { id }, data: { status } });
    return { ok: true };
  }

  // ---- Transport ----
  async listRoutes(actor: AuthUser) {
    this.assertTransport(actor);
    const rows = await this.prisma.transport_routes.findMany({ orderBy: { name: "asc" } });
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  async listStops(actor: AuthUser, routeId: string) {
    this.assertTransport(actor);
    const rows = await this.prisma.route_stops.findMany({
      where: { route_id: routeId },
      orderBy: { sequence: "asc" },
    });
    return rows.map((s) => ({ id: s.id, name: s.name, sequence: s.sequence }));
  }

  async listAssignments(actor: AuthUser) {
    this.assertTransport(actor);
    const rows = await this.prisma.route_students.findMany({
      take: 100,
      orderBy: { id: "desc" },
      include: {
        transport_routes: { select: { name: true } },
        route_stops: { select: { name: true } },
        students: { select: { profiles: { select: { full_name: true } } } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      studentName: a.students?.profiles?.full_name ?? null,
      routeName: a.transport_routes?.name ?? null,
      stopName: a.route_stops?.name ?? null,
    }));
  }

  async assignStudent(
    actor: AuthUser,
    data: { routeId: string; stopId?: string; studentId: string },
  ) {
    this.assertTransport(actor);
    // UNIQUE (route_id, student_id): a student can only be on a route once.
    const existing = await this.prisma.route_students.findFirst({
      where: { route_id: data.routeId, student_id: data.studentId },
    });
    if (existing) throw new ConflictException("That student is already assigned to this route");
    const row = await this.prisma.route_students.create({
      data: {
        route_id: data.routeId,
        stop_id: data.stopId || null,
        student_id: data.studentId,
      },
    });
    return { id: row.id };
  }
}
