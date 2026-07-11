import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { FleetService } from "./fleet.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class VehicleDocumentDto {
  @IsString()
  @MinLength(1)
  docKind: string;

  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  fileUrl: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

class VehicleDto {
  @IsString()
  @MinLength(2)
  registrationNo: string;

  @IsOptional()
  @IsIn(["bus", "van"])
  vehicleType?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  purchaseDate?: string;

  @IsOptional()
  @IsString()
  insuranceExpiry?: string;

  @IsOptional()
  @IsString()
  permitExpiry?: string;

  @IsOptional()
  @IsIn(["active", "maintenance", "inactive"])
  status?: string;
}

class DriverDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsString()
  @MinLength(2)
  licenseNo: string;

  @IsOptional()
  @IsString()
  licenseExpiry?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @IsOptional()
  @IsUUID()
  assignedVehicleId?: string;
}

class FuelLogDto {
  @IsUUID()
  vehicleId: string;

  @IsDateString()
  date: string;

  @IsNumber()
  @Min(0.1)
  liters: number;

  @IsNumber()
  @Min(0)
  cost: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  odometer?: number;
}

class MaintenanceDto {
  @IsUUID()
  vehicleId: string;

  @IsDateString()
  serviceDate: string;

  @IsString()
  @MinLength(2)
  serviceType: string;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class IncidentDto {
  @IsString() incidentType: string;
  @IsOptional() @IsString() severity?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() incidentDate?: string;
  @IsString() @MinLength(1) description: string;
}

class AssignStudentsDto {
  @IsUUID() routeId: string;
  @IsOptional() @IsString() stopId?: string | null;
  @IsArray() @IsUUID("all", { each: true }) @ArrayMaxSize(200) studentIds: string[];
}

class RouteStopDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() eta?: string | null;
  @IsOptional() @IsNumber() estimatedMinutes?: number | null;
}

class SaveRouteDto {
  @IsOptional() @IsString() id?: string | null;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() vehicleId?: string | null;
  @IsOptional() @IsString() driverId?: string | null;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteStopDto)
  @ArrayMaxSize(50)
  stops: RouteStopDto[];
}

@UseGuards(JwtAuthGuard)
@Controller("fleet")
export class FleetController {
  constructor(@Inject(FleetService) private readonly fleet: FleetService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() actor: AuthUser, @Query("since") since?: string) {
    return this.fleet.dashboard(actor, since);
  }

  @Get("analytics")
  analytics(@CurrentUser() actor: AuthUser, @Query("since") since?: string) {
    return this.fleet.analytics(actor, since);
  }

  @Get("fuel-logs")
  fuelLogs(@CurrentUser() actor: AuthUser) {
    return this.fleet.listFuelLogs(actor);
  }

  @Post("fuel-logs")
  createFuelLog(@CurrentUser() actor: AuthUser, @Body() dto: FuelLogDto) {
    return this.fleet.createFuelLog(actor, dto);
  }

  @Get("maintenance")
  maintenance(@CurrentUser() actor: AuthUser) {
    return this.fleet.listMaintenance(actor);
  }

  @Post("maintenance")
  createMaintenance(@CurrentUser() actor: AuthUser, @Body() dto: MaintenanceDto) {
    return this.fleet.createMaintenance(actor, dto);
  }

  @Get("vehicles")
  vehicles(@CurrentUser() actor: AuthUser) {
    return this.fleet.listVehicles(actor);
  }

  @Post("vehicles")
  createVehicle(@CurrentUser() actor: AuthUser, @Body() dto: VehicleDto) {
    return this.fleet.createVehicle(actor, dto);
  }

  @Patch("vehicles/:id")
  updateVehicle(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: VehicleDto) {
    return this.fleet.updateVehicle(actor, id, dto);
  }

  @Get("drivers")
  drivers(@CurrentUser() actor: AuthUser) {
    return this.fleet.listDrivers(actor);
  }

  @Post("drivers")
  createDriver(@CurrentUser() actor: AuthUser, @Body() dto: DriverDto) {
    return this.fleet.createDriver(actor, dto);
  }

  @Patch("drivers/:id")
  updateDriver(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: DriverDto) {
    return this.fleet.updateDriver(actor, id, dto);
  }

  @Get("routes")
  routes(@CurrentUser() actor: AuthUser) {
    return this.fleet.listRoutes(actor);
  }

  // Enriched routes (vehicle/driver/stops/student-count) for the routes list + tracking.
  @Get("routes-full")
  routesFull(@CurrentUser() actor: AuthUser) {
    return this.fleet.listRoutesFull(actor);
  }

  @Post("routes")
  saveRoute(@CurrentUser() actor: AuthUser, @Body() dto: SaveRouteDto) {
    return this.fleet.saveRoute(actor, dto);
  }

  @Get("routes/:id")
  route(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fleet.getRoute(actor, id);
  }

  @Get("routes/:id/students")
  routeStudents(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fleet.listRouteStudents(actor, id);
  }

  @Get("routes/:id/roster")
  routeRoster(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fleet.routeRoster(actor, id);
  }

  @Post("route-students")
  assignStudents(@CurrentUser() actor: AuthUser, @Body() dto: AssignStudentsDto) {
    return this.fleet.assignRouteStudents(actor, dto);
  }

  @Delete("route-students/:id")
  removeStudent(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fleet.removeRouteStudent(actor, id);
  }

  @Get("students-picker")
  studentsPicker(@CurrentUser() actor: AuthUser, @Query("q") q?: string) {
    return this.fleet.studentPicker(actor, q);
  }

  // ---- Vehicle detail ------------------------------------------------------
  @Get("vehicles/:id")
  vehicle(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fleet.getVehicle(actor, id);
  }

  @Get("vehicles/:id/fuel")
  vehicleFuel(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fleet.vehicleFuel(actor, id);
  }

  @Get("vehicles/:id/maintenance")
  vehicleMaintenance(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fleet.vehicleMaintenance(actor, id);
  }

  @Get("vehicles/:id/documents")
  vehicleDocuments(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fleet.vehicleDocuments(actor, id);
  }

  @Post("vehicles/:id/documents")
  addVehicleDocument(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: VehicleDocumentDto,
  ) {
    return this.fleet.addVehicleDocument(actor, id, dto);
  }

  // ---- Driver detail -------------------------------------------------------
  @Get("drivers/:id")
  driver(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fleet.getDriver(actor, id);
  }

  @Get("drivers/:id/incidents")
  driverIncidents(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fleet.driverIncidents(actor, id);
  }

  @Post("drivers/:id/incidents")
  createIncident(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: IncidentDto,
  ) {
    return this.fleet.createDriverIncident(actor, id, dto);
  }
}
