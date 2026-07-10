import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./infra/database/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { StudentsModule } from "./modules/students/students.module";
import { StaffModule } from "./modules/staff/staff.module";
import { AcademicsModule } from "./modules/academics/academics.module";
import { AttendanceModule } from "./modules/attendance/attendance.module";
import { HomeworkModule } from "./modules/homework/homework.module";
import { FeesModule } from "./modules/fees/fees.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    StudentsModule,
    StaffModule,
    AcademicsModule,
    AttendanceModule,
    HomeworkModule,
    FeesModule,
    // Remaining modules land one at a time, in dependency order, each verified
    // against its extracted RLS policies before the next starts — see
    // BACKEND_MIGRATION_LOG.md for the order and current status:
    // hr, finance, library, fleet, assets, complaints, communication,
    // reports, analytics, audit.
  ],
  controllers: [HealthController],
})
export class AppModule {}
