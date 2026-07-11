import {
  Body,
  Controller,
  Get,
  Inject,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { FeesService } from "./fees.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from "class-validator";

class CreateStructureDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  term?: string;

  @IsOptional()
  @IsString()
  academicYear?: string;

  @IsOptional()
  @IsString()
  frequency?: string;
}

class AssignStructureDto {
  @IsUUID()
  structureId: string;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsUUID()
  classId?: string;
}

class RecordPaymentDto {
  @IsUUID()
  studentId: string;

  @IsUUID()
  feeAssignmentId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  proofUrl?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

class OnlinePaymentDto {
  @IsUUID()
  feeAssignmentId: string;

  @IsIn(["upi", "card", "netbanking", "wallet"])
  method: "upi" | "card" | "netbanking" | "wallet";

  @IsOptional()
  @IsString()
  instrument?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsIn(["successful", "pending", "failed"])
  simulateOutcome?: "successful" | "pending" | "failed";
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class FeesController {
  constructor(@Inject(FeesService) private readonly fees: FeesService) {}

  @Get("fees/assignments")
  assignments(
    @CurrentUser() actor: AuthUser,
    @Query("studentId") studentId?: string,
    @Query("status") status?: string,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.fees.listAssignments(actor, { studentId, status, page, pageSize });
  }

  @Get("payments")
  payments(
    @CurrentUser() actor: AuthUser,
    @Query("studentId") studentId?: string,
    @Query("source") source?: string,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.fees.listPayments(actor, { studentId, source, page, pageSize });
  }

  // Offline payment recorded by staff (cash / UPI / card / bank / cheque).
  @Post("payments")
  @Roles("admin", "accountant")
  record(@CurrentUser() actor: AuthUser, @Body() dto: RecordPaymentDto) {
    return this.fees.recordPayment(actor, dto);
  }

  // Parent-facing online payment on their own child's invoice (mock gateway).
  @Post("payments/online")
  @Roles("parent", "student")
  payOnline(@CurrentUser() actor: AuthUser, @Body() dto: OnlinePaymentDto) {
    return this.fees.payOnline(actor, dto);
  }

  @Get("fees/structures")
  @Roles("admin")
  structures(@CurrentUser() actor: AuthUser) {
    return this.fees.listStructures(actor);
  }

  @Post("fees/structures")
  @Roles("admin")
  createStructure(@CurrentUser() actor: AuthUser, @Body() dto: CreateStructureDto) {
    return this.fees.createStructure(actor, dto);
  }

  @Post("fees/assign")
  @Roles("admin")
  assign(@CurrentUser() actor: AuthUser, @Body() dto: AssignStructureDto) {
    return this.fees.assignStructure(actor, dto.structureId, dto.dueDate, dto.classId);
  }
}
