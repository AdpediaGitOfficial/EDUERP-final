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
  IsDateString,
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
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.fees.listPayments(actor, { studentId, page, pageSize });
  }

  @Post("payments")
  @Roles("admin")
  record(@CurrentUser() actor: AuthUser, @Body() dto: RecordPaymentDto) {
    return this.fees.recordPayment(actor, dto);
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
