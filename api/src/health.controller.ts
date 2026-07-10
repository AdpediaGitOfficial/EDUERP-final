import { Controller, Get, Inject } from "@nestjs/common";
import { PrismaService } from "./infra/database/prisma.service";

@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", uptime: process.uptime() };
  }
}
