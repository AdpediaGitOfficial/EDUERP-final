import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./infra/database/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { StudentsModule } from "./modules/students/students.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    StudentsModule,
    // Remaining modules land one at a time, in dependency order, each verified
    // against its extracted RLS policies before the next starts — see
    // BACKEND_MIGRATION_LOG.md for the order and current status:
    // staff, academics, attendance, homework, exams, fees, payments, hr,
    // finance, library, fleet, assets, complaints, communication, reports,
    // analytics, audit.
  ],
  controllers: [HealthController],
})
export class AppModule {}
