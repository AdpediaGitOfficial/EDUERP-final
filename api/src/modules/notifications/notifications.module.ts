import { Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { NotificationsService } from "./notifications.service";

@Module({
  providers: [EmailService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
