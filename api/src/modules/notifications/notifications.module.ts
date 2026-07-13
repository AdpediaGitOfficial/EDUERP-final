import { Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { MessagingService } from "./messaging.service";
import { NotificationsService } from "./notifications.service";

@Module({
  providers: [EmailService, MessagingService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
