import { Module } from "@nestjs/common";
import { FeesController } from "./fees.controller";
import { FeesService } from "./fees.service";
import { PaymentGatewayService } from "./payment-gateway.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [FeesController],
  providers: [FeesService, PaymentGatewayService],
})
export class FeesModule {}
