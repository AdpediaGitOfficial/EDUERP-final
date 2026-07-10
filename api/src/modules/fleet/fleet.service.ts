import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   fleet_vehicles/drivers/transport_routes: fleet_manager|admin ALL; reception read
 *   route_students: fleet_manager|admin|reception ALL (fleet_rec_admin_rst)
 * Parent-side transport visibility flows through route_students of their child
 * (the app's parent Transport view) — included here as the child-scoped read.
 */
@Injectable()
export class FleetService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private canReadFleet(actor: AuthUser) {
    return actor.roles.some((r) => r === "admin" || r === "fleet_manager" || r === "reception");
  }

  private canWriteFleet(actor: AuthUser) {
    return actor.roles.some((r) => r === "admin" || r === "fleet_manager");
  }

  async listVehicles(actor: AuthUser) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    return this.prisma.fleet_vehicles.findMany({ orderBy: { registration_no: "asc" } });
  }

  async listDrivers(actor: AuthUser) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    return this.prisma.drivers.findMany({ orderBy: { full_name: "asc" } });
  }

  async listRoutes(actor: AuthUser) {
    if (this.canReadFleet(actor)) {
      return this.prisma.transport_routes.findMany({
        orderBy: { name: "asc" },
        include: { route_stops: { orderBy: { sequence: "asc" } } },
      });
    }
    if (actor.roles.includes("parent")) {
      // Parent: only routes their children are assigned to.
      return this.prisma.transport_routes.findMany({
        where: {
          route_students: {
            some: { students: { parent_student: { some: { parent_id: actor.id } } } },
          },
        },
        include: { route_stops: { orderBy: { sequence: "asc" } } },
      });
    }
    throw new ForbiddenException();
  }

  async listRouteStudents(actor: AuthUser, routeId: string) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const rows = await this.prisma.route_students.findMany({
      where: { route_id: routeId },
      include: {
        students: {
          select: { admission_no: true, profiles: { select: { full_name: true } } },
        },
      },
    });
    return rows.map((r) => ({
      studentId: r.student_id,
      studentName: r.students?.profiles?.full_name ?? null,
      admissionNo: r.students?.admission_no ?? null,
      stopId: (r as any).stop_id ?? null,
    }));
  }
}
