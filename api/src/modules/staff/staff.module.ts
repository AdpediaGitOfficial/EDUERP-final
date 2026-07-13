import { Module } from "@nestjs/common";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";
import { TeacherProfileController } from "./teacher-profile.controller";
import { TeacherProfileService } from "./teacher-profile.service";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [StaffController, TeacherProfileController],
  providers: [StaffService, TeacherProfileService],
})
export class StaffModule {}
