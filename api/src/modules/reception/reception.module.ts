import { Module } from "@nestjs/common";
import { ReceptionController } from "./reception.controller";
import { ReceptionService } from "./reception.service";

@Module({
  controllers: [ReceptionController],
  providers: [ReceptionService],
})
export class ReceptionModule {}
