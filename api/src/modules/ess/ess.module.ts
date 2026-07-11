import { Module } from "@nestjs/common";
import { EssController } from "./ess.controller";
import { EssService } from "./ess.service";

@Module({
  controllers: [EssController],
  providers: [EssService],
})
export class EssModule {}
