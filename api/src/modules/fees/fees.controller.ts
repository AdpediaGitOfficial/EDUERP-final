import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { FeesService } from "./fees.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { streamReceiptPdf } from "../../common/pdf/receipt-pdf";
import { streamCollectionReceiptPdf } from "../../common/pdf/collection-receipt-pdf";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const SCHOOL_NAME = process.env.SCHOOL_NAME || "Greenwood International School";

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

  @IsIn(["upi", "card", "netbanking"])
  method: "upi" | "card" | "netbanking";

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

class CollectLineDto {
  @IsUUID()
  feeAssignmentId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  paying?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fine?: number;
}

class CollectPaymentsDto {
  @IsUUID()
  studentId: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  depositAccount?: string;

  @IsOptional()
  @IsString()
  receiptNo?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CollectLineDto)
  lines: CollectLineDto[];
}

class SendRemindersDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  studentIds: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(["sms", "whatsapp", "email", "in_app"], { each: true })
  channels: string[];

  @IsOptional()
  @IsString()
  message?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class FeesController {
  constructor(@Inject(FeesService) private readonly fees: FeesService) {}

  // ============================ Fees Collection ============================

  @Get("fees/collection/filters")
  @Roles("admin", "accountant")
  collectionFilters(@CurrentUser() actor: AuthUser) {
    return this.fees.collectionFilters(actor);
  }

  @Get("fees/collection/students")
  @Roles("admin", "accountant")
  collectionStudents(
    @CurrentUser() actor: AuthUser,
    @Query("academicYear") academicYear?: string,
    @Query("className") className?: string,
    @Query("section") section?: string,
    @Query("category") category?: string,
    @Query("status") status?: string,
    @Query("dueDate") dueDate?: string,
    @Query("search") search?: string,
    @Query("onlyDue") onlyDue?: string,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.fees.collectionStudents(actor, {
      academicYear,
      className,
      section,
      category,
      status,
      dueDate,
      search,
      onlyDue: onlyDue === "1" || onlyDue === "true",
      page,
      pageSize,
    });
  }

  @Get("fees/collection/students/:id")
  @Roles("admin", "accountant")
  collectionStudentDetail(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fees.collectionStudentDetail(actor, id);
  }

  @Get("fees/collection/students/:id/reminders")
  @Roles("admin", "accountant")
  reminderHistory(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fees.reminderHistory(actor, id);
  }

  @Post("fees/collection/payments")
  @Roles("admin", "accountant")
  collect(@CurrentUser() actor: AuthUser, @Body() dto: CollectPaymentsDto) {
    return this.fees.collectPayments(actor, dto);
  }

  @Post("fees/collection/reminders")
  @Roles("admin", "accountant")
  sendReminders(@CurrentUser() actor: AuthUser, @Body() dto: SendRemindersDto) {
    return this.fees.sendReminders(actor, dto);
  }

  // Combined receipt for a collection (one or more payment ids from the batch).
  @Get("fees/collection/receipt.pdf")
  async collectionReceiptPdf(
    @CurrentUser() actor: AuthUser,
    @Query("ids") ids: string,
    @Res() res: Response,
  ) {
    const paymentIds = (ids || "").split(",").map((s) => s.trim()).filter(Boolean);
    const data = await this.fees.collectionReceipt(actor, paymentIds);
    streamCollectionReceiptPdf(res, { schoolName: SCHOOL_NAME, ...data });
  }

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

  // Downloadable PDF receipt for a payment (scoped: admin/accountant, or the
  // parent/student the payment belongs to).
  @Get("payments/:id/receipt.pdf")
  async receiptPdf(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Res() res: Response) {
    const data = await this.fees.getPaymentForReceipt(actor, id);
    streamReceiptPdf(res, { schoolName: SCHOOL_NAME, ...data });
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
  @Roles("admin", "accountant")
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
