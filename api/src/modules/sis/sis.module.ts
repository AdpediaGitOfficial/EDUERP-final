import { Module } from "@nestjs/common";
import { SisController } from "./sis.controller";
import { SisService } from "./sis.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [SisController],
  providers: [SisService],
  exports: [SisService],
})
export class SisModule {}
