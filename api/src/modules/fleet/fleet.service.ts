import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

const DAY = 86_400_000;
function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / DAY);
}

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
    const rows = await this.prisma.fleet_vehicles.findMany({
      orderBy: { registration_no: "asc" },
      include: {
        drivers: { select: { id: true, full_name: true } },
        transport_routes: { select: { id: true, name: true } },
      },
    });
    return rows.map((v) => {
      const insDays = daysUntil(v.insurance_expiry);
      const perDays = daysUntil(v.permit_expiry);
      return {
        id: v.id,
        registrationNo: v.registration_no,
        vehicleType: v.vehicle_type,
        model: v.model,
        capacity: v.capacity,
        purchaseDate: v.purchase_date,
        insuranceExpiry: v.insurance_expiry,
        permitExpiry: v.permit_expiry,
        status: v.status,
        // Enhancement: expiry-due flags computed server-side (≤30 days).
        insuranceDue: insDays !== null && insDays <= 30,
        permitDue: perDays !== null && perDays <= 30,
        driver: v.drivers[0] ? { id: v.drivers[0].id, fullName: v.drivers[0].full_name } : null,
        route: v.transport_routes[0]
          ? { id: v.transport_routes[0].id, name: v.transport_routes[0].name }
          : null,
      };
    });
  }

  async listDrivers(actor: AuthUser) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const rows = await this.prisma.drivers.findMany({
      orderBy: { full_name: "asc" },
      include: { fleet_vehicles: { select: { id: true, registration_no: true } } },
    });
    return rows.map((d) => ({
      id: d.id,
      fullName: d.full_name,
      licenseNo: d.license_no,
      licenseExpiry: d.license_expiry,
      phone: d.phone,
      yearsExperience: d.years_experience,
      assignedVehicleId: d.assigned_vehicle_id,
      vehicleReg: d.fleet_vehicles?.registration_no ?? null,
      // Enhancement: licence-due flag (≤60 days) surfaced by the API.
      licenseDue: (() => {
        const n = daysUntil(d.license_expiry);
        return n !== null && n <= 60;
      })(),
    }));
  }

  /**
   * Fleet dashboard aggregation — ports fleet.index.tsx (counts, period fuel +
   * maintenance spend, and the fleet_renewals_due function). Enhancements:
   * in-maintenance count, vehicles with no driver assigned, and licence/doc
   * renewal buckets (urgent ≤15d / soon 16–60d) resolved server-side.
   */
  async dashboard(actor: AuthUser, since?: string) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const sinceD = since ? new Date(since) : null;
    const [vehicles, driverCount, routeCount, fuel, maint] = await Promise.all([
      this.prisma.fleet_vehicles.findMany({
        select: { status: true, id: true, drivers: { select: { id: true } } },
      }),
      this.prisma.drivers.count(),
      this.prisma.transport_routes.count(),
      this.prisma.fuel_logs.findMany({
        where: sinceD ? { date: { gte: sinceD } } : {},
        select: { cost: true },
      }),
      this.prisma.vehicle_maintenance.findMany({
        where: sinceD ? { service_date: { gte: sinceD } } : {},
        select: { cost: true },
      }),
    ]);
    const num = (v: unknown) => Number(v ?? 0);

    // Renewals due within 60 days — ports fleet_renewals_due(_days => 60).
    const horizon = new Date(Date.now() + 60 * DAY);
    const [insV, perV, licD] = await Promise.all([
      this.prisma.fleet_vehicles.findMany({
        where: { insurance_expiry: { not: null, lte: horizon }, status: { not: "inactive" } },
        select: { id: true, registration_no: true, insurance_expiry: true },
      }),
      this.prisma.fleet_vehicles.findMany({
        where: { permit_expiry: { not: null, lte: horizon }, status: { not: "inactive" } },
        select: { id: true, registration_no: true, permit_expiry: true },
      }),
      this.prisma.drivers.findMany({
        where: { license_expiry: { not: null, lte: horizon } },
        select: { id: true, full_name: true, license_expiry: true },
      }),
    ]);
    const renewals = [
      ...insV.map((v) => ({
        kind: "insurance",
        refId: v.id,
        label: v.registration_no,
        expiryDate: v.insurance_expiry,
        daysLeft: daysUntil(v.insurance_expiry) ?? 0,
      })),
      ...perV.map((v) => ({
        kind: "permit",
        refId: v.id,
        label: v.registration_no,
        expiryDate: v.permit_expiry,
        daysLeft: daysUntil(v.permit_expiry) ?? 0,
      })),
      ...licD.map((d) => ({
        kind: "license",
        refId: d.id,
        label: d.full_name,
        expiryDate: d.license_expiry,
        daysLeft: daysUntil(d.license_expiry) ?? 0,
      })),
    ].sort((a, b) => a.daysLeft - b.daysLeft);

    return {
      vehicles: {
        total: vehicles.length,
        active: vehicles.filter((v) => v.status === "active").length,
        inMaintenance: vehicles.filter((v) => v.status === "maintenance").length,
        unassigned: vehicles.filter((v) => v.drivers.length === 0).length,
      },
      drivers: driverCount,
      routes: routeCount,
      fuelSpend: fuel.reduce((a, f) => a + num(f.cost), 0),
      maintSpend: maint.reduce((a, m) => a + num(m.cost), 0),
      renewals,
    };
  }

  async createVehicle(actor: AuthUser, data: VehicleInput) {
    if (!this.canWriteFleet(actor)) throw new ForbiddenException();
    const existing = await this.prisma.fleet_vehicles.findUnique({
      where: { registration_no: data.registrationNo },
    });
    if (existing) throw new BadRequestException("A vehicle with that registration already exists");
    const row = await this.prisma.fleet_vehicles.create({ data: this.vehicleData(data) });
    return { id: row.id };
  }

  async updateVehicle(actor: AuthUser, id: string, data: VehicleInput) {
    if (!this.canWriteFleet(actor)) throw new ForbiddenException();
    const existing = await this.prisma.fleet_vehicles.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Vehicle not found");
    await this.prisma.fleet_vehicles.update({ where: { id }, data: this.vehicleData(data) });
    return { ok: true };
  }

  private vehicleData(data: VehicleInput): Prisma.fleet_vehiclesUncheckedCreateInput {
    return {
      registration_no: data.registrationNo,
      vehicle_type: data.vehicleType ?? "bus",
      model: data.model || null,
      capacity: data.capacity ?? 40,
      purchase_date: data.purchaseDate ? new Date(data.purchaseDate) : null,
      insurance_expiry: data.insuranceExpiry ? new Date(data.insuranceExpiry) : null,
      permit_expiry: data.permitExpiry ? new Date(data.permitExpiry) : null,
      status: data.status ?? "active",
    };
  }

  async createDriver(actor: AuthUser, data: DriverInput) {
    if (!this.canWriteFleet(actor)) throw new ForbiddenException();
    const existing = await this.prisma.drivers.findUnique({
      where: { license_no: data.licenseNo },
    });
    if (existing) throw new BadRequestException("A driver with that licence already exists");
    const row = await this.prisma.drivers.create({ data: this.driverData(data) });
    return { id: row.id };
  }

  async updateDriver(actor: AuthUser, id: string, data: DriverInput) {
    if (!this.canWriteFleet(actor)) throw new ForbiddenException();
    const existing = await this.prisma.drivers.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Driver not found");
    await this.prisma.drivers.update({ where: { id }, data: this.driverData(data) });
    return { ok: true };
  }

  private driverData(data: DriverInput): Prisma.driversUncheckedCreateInput {
    return {
      full_name: data.fullName,
      license_no: data.licenseNo,
      license_expiry: data.licenseExpiry ? new Date(data.licenseExpiry) : null,
      phone: data.phone || null,
      years_experience: data.yearsExperience ?? 0,
      assigned_vehicle_id: data.assignedVehicleId || null,
    };
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

export interface VehicleInput {
  registrationNo: string;
  vehicleType?: string;
  model?: string;
  capacity?: number;
  purchaseDate?: string;
  insuranceExpiry?: string;
  permitExpiry?: string;
  status?: string;
}

export interface DriverInput {
  fullName: string;
  licenseNo: string;
  licenseExpiry?: string;
  phone?: string;
  yearsExperience?: number;
  assignedVehicleId?: string;
}
