import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { AssetsService } from "./assets.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class CreateAssetDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() category_id?: string | null;
  @IsOptional() @IsString() vendor_id?: string | null;
  @IsOptional() @IsString() purchase_date?: string | null;
  @IsOptional() @IsNumber() @Min(0) purchase_price?: number | null;
  @IsOptional() @IsNumber() @Min(0) current_value?: number | null;
  @IsOptional() @IsString() warranty_expiry?: string | null;
  @IsOptional() @IsNumber() @Min(0) useful_life_years?: number | null;
  @IsOptional() @IsString() invoice_ref?: string | null;
  @IsOptional() @IsString() location?: string | null;
  @IsOptional() @IsString() status?: string | null;
  @IsOptional() @IsString() barcode_value?: string | null;
}

class UpdateAssetDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() category_id?: string | null;
  @IsOptional() @IsString() vendor_id?: string | null;
  @IsOptional() @IsString() location?: string | null;
  @IsOptional() @IsString() status?: string | null;
  @IsOptional() @IsString() condition?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsNumber() @Min(0) current_value?: number | null;
}

class CategoryDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() description?: string | null;
}

class UpdateCategoryDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() description?: string | null;
}

class VendorDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() contact_name?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() category_hint?: string | null;
}

class UpdateVendorDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() contact_name?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() category_hint?: string | null;
}

class AllocateDto {
  @IsString() assetId!: string;
  @IsString() @MaxLength(200) assigneeLabel!: string;
  @IsOptional() @IsString() allocatedAt?: string | null;
  @IsOptional() @IsString() expectedReturnAt?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

class ReturnDto {
  @IsString() condition!: string;
}

class MaintenanceDto {
  @IsString() assetId!: string;
  @IsOptional() @IsString() type?: string | null;
  @IsOptional() @IsNumber() @Min(0) cost?: number | null;
  @IsOptional() @IsString() performedBy?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() completedAt?: string | null;
  @IsOptional() @IsString() scheduledFor?: string | null;
  @IsOptional() @IsString() status?: string | null;
}

class CompleteMaintenanceDto {
  @IsOptional() @IsNumber() @Min(0) cost?: number | null;
}

@UseGuards(JwtAuthGuard)
@Controller("assets")
export class AssetsController {
  constructor(@Inject(AssetsService) private readonly assets: AssetsService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() actor: AuthUser) {
    return this.assets.dashboard(actor);
  }

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query("q") q?: string, @Query("status") status?: string) {
    return this.assets.listAssets(actor, q, status);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateAssetDto) {
    return this.assets.createAsset(actor, dto);
  }

  @Get("categories")
  categories(@CurrentUser() actor: AuthUser) {
    return this.assets.listCategories(actor);
  }

  @Post("categories")
  createCategory(@CurrentUser() actor: AuthUser, @Body() dto: CategoryDto) {
    return this.assets.createCategory(actor, dto);
  }

  @Patch("categories/:id")
  updateCategory(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.assets.updateCategory(actor, id, dto);
  }

  @Delete("categories/:id")
  deleteCategory(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.assets.deleteCategory(actor, id);
  }

  @Get("vendors")
  vendors(@CurrentUser() actor: AuthUser) {
    return this.assets.listVendors(actor);
  }

  @Post("vendors")
  createVendor(@CurrentUser() actor: AuthUser, @Body() dto: VendorDto) {
    return this.assets.createVendor(actor, dto);
  }

  @Patch("vendors/:id")
  updateVendor(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.assets.updateVendor(actor, id, dto);
  }

  // ---- Allocations (admin only) --------------------------------------------
  @Get("allocations")
  allocations(
    @CurrentUser() actor: AuthUser,
    @Query("assetId") assetId?: string,
    @Query("active") active?: string,
  ) {
    return this.assets.listAllocations(actor, { assetId, active: active === "true" });
  }

  @Post("allocations")
  allocate(@CurrentUser() actor: AuthUser, @Body() dto: AllocateDto) {
    return this.assets.allocate(actor, dto);
  }

  @Post("allocations/:id/return")
  returnAllocation(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: ReturnDto,
  ) {
    return this.assets.returnAllocation(actor, id, dto.condition);
  }

  // ---- Maintenance (admin only) --------------------------------------------
  @Get("maintenance")
  maintenance(
    @CurrentUser() actor: AuthUser,
    @Query("status") status?: string,
    @Query("assetId") assetId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.assets.listMaintenance(actor, {
      status,
      assetId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post("maintenance")
  createMaintenance(@CurrentUser() actor: AuthUser, @Body() dto: MaintenanceDto) {
    return this.assets.createMaintenance(actor, dto);
  }

  @Post("maintenance/:id/complete")
  completeMaintenance(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: CompleteMaintenanceDto,
  ) {
    return this.assets.completeMaintenance(actor, id, dto.cost);
  }

  // ---- AMC contracts (admin only) ------------------------------------------
  @Get("amc")
  amc(@CurrentUser() actor: AuthUser, @Query("assetId") assetId?: string) {
    return this.assets.listAmc(actor, assetId);
  }

  // ---- Single asset detail (admin|teacher). Declared last so the literal
  //      routes above (dashboard/categories/vendors/allocations/...) win. -----
  @Get(":id")
  getOne(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.assets.getAsset(actor, id);
  }

  @Patch(":id")
  update(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: UpdateAssetDto) {
    return this.assets.updateAsset(actor, id, dto);
  }

  @Get(":id/allocations")
  assetAllocations(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.assets.listAllocations(actor, { assetId: id });
  }

  @Get(":id/maintenance")
  assetMaintenance(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.assets.listMaintenance(actor, { assetId: id });
  }

  @Get(":id/amc")
  assetAmc(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.assets.listAmc(actor, id);
  }
}
