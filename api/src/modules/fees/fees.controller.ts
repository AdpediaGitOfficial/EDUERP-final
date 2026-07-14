import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
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
import { streamChallanPdf } from "../../common/pdf/challan-pdf";
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

class CreateFeeTypeDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateFeeTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class FeeGroupComponentDto {
  @IsOptional()
  @IsUUID()
  feeTypeId?: string;

  @IsString()
  @MinLength(1)
  label: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  demandDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fineAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fineAfterDays?: number;
}

class CreateFeeGroupDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  academicYear?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeeGroupComponentDto)
  components: FeeGroupComponentDto[];
}

class UpdateFeeGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  academicYear?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeeGroupComponentDto)
  components?: FeeGroupComponentDto[];
}

class ArchiveFeeGroupDto {
  @IsBoolean()
  archived: boolean;
}

class CloneFeeGroupDto {
  @IsOptional()
  @IsString()
  name?: string;
}

class AssignGroupDto {
  @IsUUID()
  groupId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  studentIds: string[];

  @IsOptional()
  @IsDateString()
  demandDate?: string;
}

class UnassignGroupDto {
  @IsUUID()
  groupId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  studentIds: string[];
}

class RefundPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  method?: string;
}

class CarryForwardDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  studentIds: string[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  label?: string;
}

class GenerateChallanDto {
  @IsUUID()
  studentId: string;

  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  feeAssignmentIds?: string[];

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class RequestConcessionDto {
  @IsUUID()
  studentId: string;

  @IsOptional()
  @IsUUID()
  feeAssignmentId?: string;

  @IsOptional()
  @IsIn(["flat", "percent"])
  type?: "flat" | "percent";

  @IsNumber()
  @Min(0.01)
  value: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

class ReviewConcessionDto {
  @IsOptional()
  @IsString()
  note?: string;
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
    const paymentIds = (ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
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

  // ============================ Fee Types ============================

  @Get("fees/types")
  @Roles("admin", "accountant")
  listFeeTypes(@Query("includeInactive") includeInactive?: string) {
    return this.fees.listFeeTypes(includeInactive === "1" || includeInactive === "true");
  }

  @Post("fees/types")
  @Roles("admin")
  createFeeType(@Body() dto: CreateFeeTypeDto) {
    return this.fees.createFeeType(dto);
  }

  @Patch("fees/types/:id")
  @Roles("admin")
  updateFeeType(@Param("id") id: string, @Body() dto: UpdateFeeTypeDto) {
    return this.fees.updateFeeType(id, dto);
  }

  @Delete("fees/types/:id")
  @Roles("admin")
  deleteFeeType(@Param("id") id: string) {
    return this.fees.deleteFeeType(id);
  }

  // ============================ Fee Groups ============================

  @Get("fees/groups")
  @Roles("admin", "accountant")
  listFeeGroups(@Query("includeArchived") includeArchived?: string) {
    return this.fees.listFeeGroups(includeArchived === "1" || includeArchived === "true");
  }

  @Get("fees/groups/:id")
  @Roles("admin", "accountant")
  getFeeGroup(@Param("id") id: string) {
    return this.fees.getFeeGroup(id);
  }

  @Post("fees/groups")
  @Roles("admin")
  createFeeGroup(@Body() dto: CreateFeeGroupDto) {
    return this.fees.createFeeGroup(dto);
  }

  @Patch("fees/groups/:id")
  @Roles("admin")
  updateFeeGroup(@Param("id") id: string, @Body() dto: UpdateFeeGroupDto) {
    return this.fees.updateFeeGroup(id, dto);
  }

  @Post("fees/groups/:id/clone")
  @Roles("admin")
  cloneFeeGroup(@Param("id") id: string, @Body() dto: CloneFeeGroupDto) {
    return this.fees.cloneFeeGroup(id, dto.name);
  }

  @Post("fees/groups/:id/archive")
  @Roles("admin")
  archiveFeeGroup(@Param("id") id: string, @Body() dto: ArchiveFeeGroupDto) {
    return this.fees.archiveFeeGroup(id, dto.archived);
  }

  @Delete("fees/groups/:id")
  @Roles("admin")
  deleteFeeGroup(@Param("id") id: string) {
    return this.fees.deleteFeeGroup(id);
  }

  // ============================ Fee Assignments (group) ============================

  @Get("fees/assign/students")
  @Roles("admin")
  assignRoster(@Query("classId") classId: string, @Query("groupId") groupId?: string) {
    return this.fees.assignRoster(classId, groupId);
  }

  @Post("fees/assign/group")
  @Roles("admin")
  assignGroup(@Body() dto: AssignGroupDto) {
    return this.fees.assignGroup(dto.groupId, dto.studentIds, dto.demandDate);
  }

  @Post("fees/assign/unassign")
  @Roles("admin")
  unassignGroup(@Body() dto: UnassignGroupDto) {
    return this.fees.unassignGroup(dto.groupId, dto.studentIds);
  }

  // ============================ Fee Challans ============================

  @Get("fees/challans")
  @Roles("admin", "accountant")
  listChallans(
    @CurrentUser() actor: AuthUser,
    @Query("studentId") studentId?: string,
    @Query("status") status?: string,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.fees.listChallans(actor, { studentId, status, page, pageSize });
  }

  @Get("fees/challans/:id")
  @Roles("admin", "accountant")
  getChallan(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fees.getChallan(actor, id);
  }

  @Post("fees/challans")
  @Roles("admin", "accountant")
  generateChallan(@CurrentUser() actor: AuthUser, @Body() dto: GenerateChallanDto) {
    return this.fees.generateChallan(actor, dto);
  }

  @Get("fees/challans/:id/pdf")
  @Roles("admin", "accountant")
  async challanPdf(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const data = await this.fees.challanForPdf(actor, id);
    streamChallanPdf(res, { schoolName: SCHOOL_NAME, ...data });
  }

  @Post("fees/challans/:id/send")
  @Roles("admin", "accountant")
  sendChallan(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fees.sendChallan(actor, id);
  }

  @Patch("fees/challans/:id/cancel")
  @Roles("admin", "accountant")
  cancelChallan(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.fees.cancelChallan(actor, id);
  }

  // ==================== Transactions: refunds + cashier-wise ====================

  @Post("payments/:id/refund")
  @Roles("admin", "accountant")
  refundPayment(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.fees.refundPayment(actor, id, dto);
  }

  @Get("fees/transactions/cashiers")
  @Roles("admin", "accountant")
  cashierCollection(
    @CurrentUser() actor: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.fees.cashierCollection(actor, from, to);
  }

  // ============================ Reports ============================

  @Get("fees/reports/collection")
  @Roles("admin", "accountant")
  collectionReport(
    @CurrentUser() actor: AuthUser,
    @Query("groupBy") groupBy?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.fees.collectionReport(actor, { groupBy, from, to });
  }

  @Get("fees/reports/fee-groups")
  @Roles("admin", "accountant")
  feeGroupReport(@CurrentUser() actor: AuthUser) {
    return this.fees.feeGroupReport(actor);
  }

  // ============================ Concessions ============================

  @Get("fees/concessions")
  @Roles("admin", "accountant")
  listConcessions(@CurrentUser() actor: AuthUser, @Query("status") status?: string) {
    return this.fees.listConcessions(actor, status);
  }

  @Post("fees/concessions")
  @Roles("admin", "accountant")
  requestConcession(@CurrentUser() actor: AuthUser, @Body() dto: RequestConcessionDto) {
    return this.fees.requestConcession(actor, dto);
  }

  @Patch("fees/concessions/:id/approve")
  @Roles("admin")
  approveConcession(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: ReviewConcessionDto,
  ) {
    return this.fees.reviewConcession(actor, id, true, dto.note);
  }

  @Patch("fees/concessions/:id/reject")
  @Roles("admin")
  rejectConcession(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: ReviewConcessionDto,
  ) {
    return this.fees.reviewConcession(actor, id, false, dto.note);
  }

  // ============================ Carry Forward ============================

  @Get("fees/carry-forward/preview")
  @Roles("admin")
  carryForwardPreview(@CurrentUser() actor: AuthUser, @Query("classId") classId: string) {
    return this.fees.carryForwardPreview(actor, classId);
  }

  @Post("fees/carry-forward/execute")
  @Roles("admin")
  carryForwardExecute(@CurrentUser() actor: AuthUser, @Body() dto: CarryForwardDto) {
    return this.fees.carryForwardExecute(actor, dto);
  }
}
