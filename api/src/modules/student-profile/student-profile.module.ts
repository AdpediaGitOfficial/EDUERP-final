import { Module } from "@nestjs/common";
import { StudentProfileController } from "./student-profile.controller";
import { StudentProfileService } from "./student-profile.service";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [StudentProfileController],
  providers: [StudentProfileService],
})
export class StudentProfileModule {}
