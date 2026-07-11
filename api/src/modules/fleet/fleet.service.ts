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
    const renewals = await this.renewalsDue(60);

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

  /**
   * Ports fleet_renewals_due(_days): vehicle insurance + permit and driver
   * licences expiring within `days`, sorted soonest-first. Shared by the
   * dashboard (60d) and analytics (180d) views.
   */
  private async renewalsDue(days: number) {
    const horizon = new Date(Date.now() + days * DAY);
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
    return [
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
  }

  async listFuelLogs(actor: AuthUser) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const rows = await this.prisma.fuel_logs.findMany({
      orderBy: { date: "desc" },
      take: 1000,
      include: { fleet_vehicles: { select: { registration_no: true } } },
    });
    return rows.map((f) => ({
      id: f.id,
      vehicleId: f.vehicle_id,
      registrationNo: f.fleet_vehicles?.registration_no ?? null,
      date: f.date,
      liters: f.liters,
      cost: f.cost,
      odometer: f.odometer,
    }));
  }

  async createFuelLog(
    actor: AuthUser,
    data: { vehicleId: string; date: string; liters: number; cost: number; odometer?: number },
  ) {
    if (!this.canWriteFleet(actor)) throw new ForbiddenException();
    const row = await this.prisma.fuel_logs.create({
      data: {
        vehicle_id: data.vehicleId,
        date: new Date(data.date),
        liters: new Prisma.Decimal(data.liters),
        cost: new Prisma.Decimal(data.cost),
        odometer: data.odometer ?? null,
      },
    });
    return { id: row.id };
  }

  async listMaintenance(actor: AuthUser) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const rows = await this.prisma.vehicle_maintenance.findMany({
      orderBy: { service_date: "desc" },
      take: 1000,
      include: { fleet_vehicles: { select: { registration_no: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      vehicleId: m.vehicle_id,
      registrationNo: m.fleet_vehicles?.registration_no ?? null,
      serviceDate: m.service_date,
      serviceType: m.service_type,
      vendor: m.vendor,
      cost: m.cost,
      nextDueDate: m.next_due_date,
      notes: m.notes,
    }));
  }

  async createMaintenance(
    actor: AuthUser,
    data: {
      vehicleId: string;
      serviceDate: string;
      serviceType: string;
      vendor?: string;
      cost?: number;
      nextDueDate?: string;
      notes?: string;
    },
  ) {
    if (!this.canWriteFleet(actor)) throw new ForbiddenException();
    const row = await this.prisma.vehicle_maintenance.create({
      data: {
        vehicle_id: data.vehicleId,
        service_date: new Date(data.serviceDate),
        service_type: data.serviceType,
        vendor: data.vendor || null,
        cost: new Prisma.Decimal(data.cost ?? 0),
        next_due_date: data.nextDueDate ? new Date(data.nextDueDate) : null,
        notes: data.notes || null,
      },
    });
    return { id: row.id };
  }

  /**
   * Fleet analytics — ports fleet.analytics.tsx: period fuel + maintenance spend,
   * per-vehicle cost breakdown, route utilization (filled/capacity), and the
   * 180-day renewals calendar. Enhancement: cost-per-student is computed
   * server-side from route ridership.
   */
  async analytics(actor: AuthUser, since?: string) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const sinceD = since
      ? new Date(since)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const num = (v: unknown) => Number(v ?? 0);
    const [fuel, maint, routes, renewals] = await Promise.all([
      this.prisma.fuel_logs.findMany({
        where: { date: { gte: sinceD } },
        include: { fleet_vehicles: { select: { registration_no: true } } },
      }),
      this.prisma.vehicle_maintenance.findMany({
        where: { service_date: { gte: sinceD } },
        include: { fleet_vehicles: { select: { registration_no: true } } },
      }),
      this.prisma.transport_routes.findMany({
        include: {
          fleet_vehicles: { select: { id: true, capacity: true, registration_no: true } },
          _count: { select: { route_students: true } },
        },
      }),
      this.renewalsDue(180),
    ]);

    const perVehicleMap = new Map<
      string,
      { registrationNo: string | null; fuel: number; maint: number }
    >();
    for (const f of fuel) {
      const e = perVehicleMap.get(f.vehicle_id) ?? {
        registrationNo: f.fleet_vehicles?.registration_no ?? null,
        fuel: 0,
        maint: 0,
      };
      e.fuel += num(f.cost);
      perVehicleMap.set(f.vehicle_id, e);
    }
    for (const m of maint) {
      const e = perVehicleMap.get(m.vehicle_id) ?? {
        registrationNo: m.fleet_vehicles?.registration_no ?? null,
        fuel: 0,
        maint: 0,
      };
      e.maint += num(m.cost);
      perVehicleMap.set(m.vehicle_id, e);
    }
    const perVehicle = Array.from(perVehicleMap.entries())
      .map(([id, v]) => ({ id, ...v, total: v.fuel + v.maint }))
      .sort((a, b) => b.total - a.total);

    const fuelSpend = fuel.reduce((a, f) => a + num(f.cost), 0);
    const maintSpend = maint.reduce((a, m) => a + num(m.cost), 0);
    const totalStudents = routes.reduce((a, r) => a + r._count.route_students, 0);
    const totalCost = fuelSpend + maintSpend;

    return {
      fuelSpend,
      maintSpend,
      totalCost,
      totalStudents,
      costPerStudent: totalStudents ? totalCost / totalStudents : 0,
      perVehicle,
      routeUtilization: routes.map((r) => ({
        id: r.id,
        name: r.name,
        capacity: r.fleet_vehicles?.capacity ?? 0,
        filled: r._count.route_students,
      })),
      renewals,
    };
  }

  // ---- Vehicle detail (fleet_admin_*; reception read) ----------------------
  async getVehicle(actor: AuthUser, id: string) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const v = await this.prisma.fleet_vehicles.findUnique({
      where: { id },
      include: {
        drivers: { select: { id: true, full_name: true, phone: true, license_no: true } },
        transport_routes: {
          select: { id: true, name: true, _count: { select: { route_stops: true } } },
        },
      },
    });
    if (!v) throw new NotFoundException("Vehicle not found");
    const driver = v.drivers[0] ?? null;
    const route = v.transport_routes[0] ?? null;
    return {
      id: v.id,
      registration_no: v.registration_no,
      vehicle_type: v.vehicle_type,
      model: v.model,
      capacity: v.capacity,
      status: v.status,
      purchase_date: v.purchase_date ? v.purchase_date.toISOString().slice(0, 10) : null,
      insurance_expiry: v.insurance_expiry ? v.insurance_expiry.toISOString().slice(0, 10) : null,
      permit_expiry: v.permit_expiry ? v.permit_expiry.toISOString().slice(0, 10) : null,
      insuranceDaysLeft: daysUntil(v.insurance_expiry),
      permitDaysLeft: daysUntil(v.permit_expiry),
      driver: driver ? { id: driver.id, full_name: driver.full_name } : null,
      route: route ? { id: route.id, name: route.name, stops: route._count.route_stops } : null,
    };
  }

  async vehicleFuel(actor: AuthUser, id: string) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const rows = await this.prisma.fuel_logs.findMany({
      where: { vehicle_id: id },
      orderBy: { date: "desc" },
    });
    return rows.map((f) => ({
      id: f.id,
      date: f.date ? f.date.toISOString().slice(0, 10) : null,
      liters: Number(f.liters ?? 0),
      cost: Number(f.cost ?? 0),
      odometer: f.odometer,
    }));
  }

  async vehicleMaintenance(actor: AuthUser, id: string) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const rows = await this.prisma.vehicle_maintenance.findMany({
      where: { vehicle_id: id },
      orderBy: { service_date: "desc" },
    });
    return rows.map((m) => ({
      id: m.id,
      service_date: m.service_date ? m.service_date.toISOString().slice(0, 10) : null,
      service_type: m.service_type,
      vendor: m.vendor,
      cost: Number(m.cost ?? 0),
      next_due_date: m.next_due_date ? m.next_due_date.toISOString().slice(0, 10) : null,
    }));
  }

  async vehicleDocuments(actor: AuthUser, id: string) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const rows = await this.prisma.vehicle_documents.findMany({
      where: { vehicle_id: id },
      orderBy: { expiry_date: "asc" },
    });
    return rows.map((d) => ({
      id: d.id,
      title: d.title,
      doc_kind: d.doc_kind,
      issue_date: d.issue_date ? d.issue_date.toISOString().slice(0, 10) : null,
      expiry_date: d.expiry_date ? d.expiry_date.toISOString().slice(0, 10) : null,
    }));
  }

  // ---- Driver detail (fleet_admin_di; reception read) ----------------------
  async getDriver(actor: AuthUser, id: string) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const d = await this.prisma.drivers.findUnique({
      where: { id },
      include: {
        fleet_vehicles: { select: { id: true, registration_no: true, model: true } },
      },
    });
    if (!d) throw new NotFoundException("Driver not found");
    return {
      id: d.id,
      full_name: d.full_name,
      license_no: d.license_no,
      license_expiry: d.license_expiry ? d.license_expiry.toISOString().slice(0, 10) : null,
      licenseDaysLeft: daysUntil(d.license_expiry),
      phone: d.phone,
      years_experience: d.years_experience,
      assigned_vehicle_id: d.assigned_vehicle_id,
      vehicle: d.fleet_vehicles
        ? { id: d.fleet_vehicles.id, registration_no: d.fleet_vehicles.registration_no }
        : null,
    };
  }

  async driverIncidents(actor: AuthUser, id: string) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const rows = await this.prisma.driver_incidents.findMany({
      where: { driver_id: id },
      orderBy: { incident_date: "desc" },
    });
    return rows.map((i) => ({
      id: i.id,
      incident_date: i.incident_date ? i.incident_date.toISOString().slice(0, 10) : null,
      incident_type: i.incident_type,
      severity: i.severity,
      description: i.description,
      status: i.status,
    }));
  }

  async createDriverIncident(
    actor: AuthUser,
    driverId: string,
    input: {
      incidentType: string;
      severity?: string;
      status?: string;
      incidentDate?: string;
      description: string;
    },
  ) {
    if (!this.canWriteFleet(actor)) throw new ForbiddenException();
    const driver = await this.prisma.drivers.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException("Driver not found");
    if (!input.description?.trim()) throw new BadRequestException("description required");
    const row = await this.prisma.driver_incidents.create({
      data: {
        driver_id: driverId,
        incident_type: input.incidentType,
        severity: input.severity ?? "low",
        status: input.status ?? "open",
        incident_date: input.incidentDate ? new Date(input.incidentDate) : new Date(),
        description: input.description,
      },
    });
    return { id: row.id };
  }

  // ---- Route detail, roster + CRUD (fleet_admin_tr/_rs; reception read) -----
  private routeCard(r: {
    id: string;
    name: string;
    vehicle_id: string | null;
    driver_id: string | null;
    fleet_vehicles: { id: string; registration_no: string; capacity: number } | null;
    drivers: { id: string; full_name: string } | null;
    route_stops: {
      id: string;
      name: string;
      sequence: number;
      eta: string | null;
      estimated_minutes: number;
    }[];
    _count?: { route_students: number };
  }) {
    return {
      id: r.id,
      name: r.name,
      vehicle_id: r.vehicle_id,
      driver_id: r.driver_id,
      vehicle: r.fleet_vehicles
        ? {
            id: r.fleet_vehicles.id,
            registration_no: r.fleet_vehicles.registration_no,
            capacity: r.fleet_vehicles.capacity,
          }
        : null,
      driver: r.drivers ? { id: r.drivers.id, full_name: r.drivers.full_name } : null,
      stops: r.route_stops.map((s) => ({
        id: s.id,
        name: s.name,
        sequence: s.sequence,
        eta: s.eta,
        estimated_minutes: s.estimated_minutes,
      })),
      studentCount: r._count?.route_students ?? 0,
    };
  }

  async listRoutesFull(actor: AuthUser) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const rows = await this.prisma.transport_routes.findMany({
      orderBy: { name: "asc" },
      include: {
        fleet_vehicles: { select: { id: true, registration_no: true, capacity: true } },
        drivers: { select: { id: true, full_name: true } },
        route_stops: { orderBy: { sequence: "asc" } },
        _count: { select: { route_students: true } },
      },
    });
    return rows.map((r) => this.routeCard(r));
  }

  async getRoute(actor: AuthUser, id: string) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const r = await this.prisma.transport_routes.findUnique({
      where: { id },
      include: {
        fleet_vehicles: { select: { id: true, registration_no: true, capacity: true } },
        drivers: { select: { id: true, full_name: true } },
        route_stops: { orderBy: { sequence: "asc" } },
        _count: { select: { route_students: true } },
      },
    });
    if (!r) throw new NotFoundException("Route not found");
    return this.routeCard(r);
  }

  async routeRoster(actor: AuthUser, routeId: string) {
    if (!this.canReadFleet(actor)) throw new ForbiddenException();
    const rows = await this.prisma.route_students.findMany({
      where: { route_id: routeId },
      include: {
        students: { select: { admission_no: true, profiles: { select: { full_name: true } } } },
        route_stops: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      studentName: r.students?.profiles?.full_name ?? null,
      admissionNo: r.students?.admission_no ?? null,
      stopId: r.stop_id,
      stopName: r.route_stops?.name ?? null,
    }));
  }

  async assignRouteStudents(
    actor: AuthUser,
    input: { routeId: string; stopId?: string | null; studentIds: string[] },
  ) {
    if (!this.canWriteFleet(actor)) throw new ForbiddenException();
    if (!input.routeId) throw new BadRequestException("routeId required");
    if (!input.studentIds?.length) throw new BadRequestException("no students selected");
    let assigned = 0;
    for (const studentId of input.studentIds) {
      await this.prisma.route_students.upsert({
        where: { route_id_student_id: { route_id: input.routeId, student_id: studentId } },
        create: {
          route_id: input.routeId,
          student_id: studentId,
          stop_id: input.stopId || null,
          pickup_time: "07:00 AM",
          drop_time: "03:30 PM",
        },
        update: { stop_id: input.stopId || null },
      });
      assigned++;
    }
    return { assigned };
  }

  async removeRouteStudent(actor: AuthUser, id: string) {
    if (!this.canWriteFleet(actor)) throw new ForbiddenException();
    const row = await this.prisma.route_students.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    await this.prisma.route_students.delete({ where: { id } });
    return { ok: true };
  }

  async saveRoute(
    actor: AuthUser,
    input: {
      id?: string | null;
      name: string;
      vehicleId?: string | null;
      driverId?: string | null;
      stops: { name: string; eta?: string | null; estimatedMinutes?: number | null }[];
    },
  ) {
    if (!this.canWriteFleet(actor)) throw new ForbiddenException();
    if (!input.name?.trim()) throw new BadRequestException("name required");
    const data = {
      name: input.name,
      vehicle_id: input.vehicleId || null,
      driver_id: input.driverId || null,
    };
    const stopRows = (input.stops ?? []).map((s, idx) => ({
      name: s.name,
      sequence: idx + 1,
      eta: s.eta || null,
      estimated_minutes: Number(s.estimatedMinutes) || 0,
    }));
    if (input.id) {
      const existing = await this.prisma.transport_routes.findUnique({ where: { id: input.id } });
      if (!existing) throw new NotFoundException("Route not found");
      const routeId = input.id;
      await this.prisma.$transaction([
        this.prisma.transport_routes.update({ where: { id: routeId }, data }),
        this.prisma.route_stops.deleteMany({ where: { route_id: routeId } }),
        ...(stopRows.length
          ? [
              this.prisma.route_stops.createMany({
                data: stopRows.map((s) => ({ ...s, route_id: routeId })),
              }),
            ]
          : []),
      ]);
      return { id: routeId };
    }
    const created = await this.prisma.transport_routes.create({ data });
    if (stopRows.length) {
      await this.prisma.route_stops.createMany({
        data: stopRows.map((s) => ({ ...s, route_id: created.id })),
      });
    }
    return { id: created.id };
  }

  async studentPicker(actor: AuthUser, q?: string) {
    if (!this.canWriteFleet(actor)) throw new ForbiddenException();
    const rows = await this.prisma.students.findMany({
      where: {
        status: "active",
        ...(q
          ? {
              OR: [
                { admission_no: { contains: q, mode: "insensitive" } },
                { profiles: { full_name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      select: { id: true, admission_no: true, profiles: { select: { full_name: true } } },
      orderBy: { admission_no: "asc" },
      take: 50,
    });
    return rows.map((s) => ({
      id: s.id,
      admission_no: s.admission_no,
      full_name: s.profiles?.full_name ?? null,
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
