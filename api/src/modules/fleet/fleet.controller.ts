import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { FleetService } from "./fleet.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

@UseGuards(JwtAuthGuard)
@Controller("fleet")
export class FleetController {
  constructor(@Inject(FleetService) private readonly fleet: FleetService) {}

  @Get("vehicles")
  vehicles(@CurrentUser() actor: AuthUser) {
    return this.fleet.listVehicles(actor);
  }

  @Get("drivers")
  drivers(@CurrentUser() actor: AuthUser) {
    return this.fleet.listDrivers(actor);
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
