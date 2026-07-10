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
import { LibraryModule } from "./modules/library/library.module";
import { ComplaintsModule } from "./modules/complaints/complaints.module";
import { CommunicationModule } from "./modules/communication/communication.module";
import { HrModule } from "./modules/hr/hr.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { FleetModule } from "./modules/fleet/fleet.module";
import { AssetsModule } from "./modules/assets/assets.module";
import { ReportsModule } from "./modules/reports/reports.module";
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
    HrModule,
    FinanceModule,
    LibraryModule,
    FleetModule,
    AssetsModule,
    ComplaintsModule,
    CommunicationModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
