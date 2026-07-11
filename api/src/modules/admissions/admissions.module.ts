import { Module } from "@nestjs/common";
import { AdmissionsController } from "./admissions.controller";
import { AdmissionsService } from "./admissions.service";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
})
export class AdmissionsModule {}
