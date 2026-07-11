import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { FinanceService } from "./finance.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
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

class CreateExpenseDto {
  @IsString()
  @MinLength(2)
  category: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  expenseDate: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  vendor?: string;
}

class ReconcileDto {
  @IsUUID()
  paymentId: string;

  @IsString()
  @MinLength(1)
  bankRef: string;
}

@UseGuards(JwtAuthGuard)
@Controller("finance")
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly finance: FinanceService) {}

  @Get("dashboard")
  dashboard(
    @CurrentUser() actor: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.finance.dashboard(actor, from, to);
  }

  @Get("reconciliation/payments")
  reconPayments(
    @CurrentUser() actor: AuthUser,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.finance.paymentsForReconciliation(actor, limit ?? 50);
  }

  @Get("reconciliation")
  reconciliations(@CurrentUser() actor: AuthUser) {
    return this.finance.listReconciliations(actor);
  }

  @Post("reconciliation")
  reconcile(@CurrentUser() actor: AuthUser, @Body() dto: ReconcileDto) {
    return this.finance.reconcile(actor, dto.paymentId, dto.bankRef);
  }

  @Delete("reconciliation/:paymentId")
  unreconcile(@CurrentUser() actor: AuthUser, @Param("paymentId") paymentId: string) {
    return this.finance.unreconcile(actor, paymentId);
  }

  @Get("expenses")
  expenses(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query("status") status?: string,
  ) {
    return this.finance.listExpenses(actor, page ?? 1, Math.min(pageSize ?? 50, 200), status);
  }

  @Post("expenses")
  createExpense(@CurrentUser() actor: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.finance.createExpense(actor, dto);
  }

  @Get("ledger")
  ledger(
    @CurrentUser() actor: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.finance.ledger(actor, from, to, Math.min(limit ?? 200, 1000));
  }
}
