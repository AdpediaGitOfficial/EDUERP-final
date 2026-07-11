import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";
import { FleetService } from "./fleet.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

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

@UseGuards(JwtAuthGuard)
@Controller("fleet")
export class FleetController {
  constructor(@Inject(FleetService) private readonly fleet: FleetService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() actor: AuthUser, @Query("since") since?: string) {
    return this.fleet.dashboard(actor, since);
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

  @Get("routes/:id/students")
  routeStudents(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fleet.listRouteStudents(actor, id);
  }
}
