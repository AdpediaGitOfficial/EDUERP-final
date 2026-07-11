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

@UseGuards(JwtAuthGuard)
@Controller("assets")
export class AssetsController {
  constructor(@Inject(AssetsService) private readonly assets: AssetsService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() actor: AuthUser) {
    return this.assets.dashboard(actor);
  }

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query("q") q?: string) {
    return this.assets.listAssets(actor, q);
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

  @Get("allocations")
  allocations(@CurrentUser() actor: AuthUser, @Query("assetId") assetId?: string) {
    return this.assets.listAllocations(actor, assetId);
  }
}
