import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { SisService } from "./sis.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class CategoryDto {
  @IsString() @MinLength(1) @MaxLength(60) name: string;
}

class HouseDto {
  @IsString() @MinLength(1) @MaxLength(60) name: string;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
}

class CustomFieldDto {
  @IsString() @MinLength(1) @MaxLength(80) label: string;
  @IsOptional() @IsIn(["text", "dropdown"]) fieldType?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) options?: string[];
  @IsOptional() @IsInt() sortOrder?: number;
}

class CustomFieldUpdateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) label?: string;
  @IsOptional() @IsIn(["text", "dropdown"]) fieldType?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) options?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

@UseGuards(JwtAuthGuard)
@Controller("sis")
export class SisController {
  constructor(@Inject(SisService) private readonly sis: SisService) {}

  // ---- categories ----
  @Get("categories")
  listCategories(@CurrentUser() actor: AuthUser) {
    return this.sis.listCategories(actor);
  }

  @Post("categories")
  createCategory(@CurrentUser() actor: AuthUser, @Body() dto: CategoryDto) {
    return this.sis.createCategory(actor, dto.name);
  }

  @Patch("categories/:id")
  updateCategory(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: CategoryDto,
  ) {
    return this.sis.updateCategory(actor, id, dto.name);
  }

  @Delete("categories/:id")
  deleteCategory(@CurrentUser() actor: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.sis.deleteCategory(actor, id);
  }

  // ---- houses ----
  @Get("houses")
  listHouses(@CurrentUser() actor: AuthUser) {
    return this.sis.listHouses(actor);
  }

  @Post("houses")
  createHouse(@CurrentUser() actor: AuthUser, @Body() dto: HouseDto) {
    return this.sis.createHouse(actor, dto.name, dto.color);
  }

  @Patch("houses/:id")
  updateHouse(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: HouseDto,
  ) {
    return this.sis.updateHouse(actor, id, dto.name, dto.color);
  }

  @Delete("houses/:id")
  deleteHouse(@CurrentUser() actor: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.sis.deleteHouse(actor, id);
  }

  // ---- custom fields ----
  @Get("custom-fields")
  listCustomFields(
    @CurrentUser() actor: AuthUser,
    @Query("includeInactive") includeInactive?: string,
  ) {
    return this.sis.listCustomFields(actor, includeInactive === "true");
  }

  @Post("custom-fields")
  createCustomField(@CurrentUser() actor: AuthUser, @Body() dto: CustomFieldDto) {
    return this.sis.createCustomField(actor, dto);
  }

  @Patch("custom-fields/:id")
  updateCustomField(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: CustomFieldUpdateDto,
  ) {
    return this.sis.updateCustomField(actor, id, dto);
  }

  @Delete("custom-fields/:id")
  deleteCustomField(@CurrentUser() actor: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.sis.deleteCustomField(actor, id);
  }
}
