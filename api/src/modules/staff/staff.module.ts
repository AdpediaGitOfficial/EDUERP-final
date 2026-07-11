import { Module } from "@nestjs/common";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";
import { TeacherProfileController } from "./teacher-profile.controller";
import { TeacherProfileService } from "./teacher-profile.service";

@Module({
  controllers: [StaffController, TeacherProfileController],
  providers: [StaffService, TeacherProfileService],
})
export class StaffModule {}
