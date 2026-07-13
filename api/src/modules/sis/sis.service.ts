import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * SIS master data: student categories (General/SC/ST/OBC…) and admission
 * custom-field definitions. Both are admin-managed reference data that the
 * admission wizard and student profile read from. Kept in one small module so
 * the two related masters live together.
 */
@Injectable()
export class SisService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private requireAdmin(actor: AuthUser) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException("Admin only");
  }

  // ------------------------------------------------------ categories ---

  /** Categories are readable by desk staff (the wizard needs them); writes are admin. */
  async listCategories(actor: AuthUser) {
    if (!actor.roles.some((r) => r === "admin" || r === "reception"))
      throw new ForbiddenException("Admin or reception only");
    const rows = await this.prisma.student_categories.findMany({ orderBy: { name: "asc" } });
    return rows.map((c) => ({ id: c.id, name: c.name }));
  }

  async createCategory(actor: AuthUser, name: string) {
    this.requireAdmin(actor);
    const clean = name.trim();
    if (!clean) throw new ConflictException("Name is required");
    await this.assertCategoryNameFree(clean, null);
    const row = await this.prisma.student_categories.create({ data: { name: clean } });
    return { id: row.id, name: row.name };
  }

  async updateCategory(actor: AuthUser, id: string, name: string) {
    this.requireAdmin(actor);
    const clean = name.trim();
    if (!clean) throw new ConflictException("Name is required");
    const existing = await this.prisma.student_categories.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Category not found");
    await this.assertCategoryNameFree(clean, id);
    const row = await this.prisma.student_categories.update({
      where: { id },
      data: { name: clean, updated_at: new Date() },
    });
    return { id: row.id, name: row.name };
  }

  async deleteCategory(actor: AuthUser, id: string) {
    this.requireAdmin(actor);
    const inUse = await this.prisma.student_details.count({ where: { category_id: id } });
    if (inUse > 0)
      throw new ConflictException(
        `This category is assigned to ${inUse} student(s); reassign them before deleting.`,
      );
    await this.prisma.student_categories.delete({ where: { id } });
    return { ok: true };
  }

  private async assertCategoryNameFree(name: string, exceptId: string | null) {
    const clash = await this.prisma.student_categories.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException("A category with that name already exists");
  }

  // --------------------------------------------------- custom fields ---

  /** Active field definitions the admission wizard renders (desk-readable). */
  async listCustomFields(actor: AuthUser, includeInactive = false) {
    if (!actor.roles.some((r) => r === "admin" || r === "reception"))
      throw new ForbiddenException("Admin or reception only");
    const rows = await this.prisma.student_custom_fields.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    });
    return rows.map((f) => ({
      id: f.id,
      label: f.label,
      fieldType: f.field_type,
      options: (f.options as string[]) ?? [],
      active: f.active,
      sortOrder: f.sort_order,
    }));
  }

  async createCustomField(
    actor: AuthUser,
    input: { label: string; fieldType?: string; options?: string[]; sortOrder?: number },
  ) {
    this.requireAdmin(actor);
    const label = input.label.trim();
    if (!label) throw new ConflictException("Label is required");
    const type = input.fieldType === "dropdown" ? "dropdown" : "text";
    const options =
      type === "dropdown" ? (input.options ?? []).map((o) => o.trim()).filter(Boolean) : [];
    const row = await this.prisma.student_custom_fields.create({
      data: {
        label,
        field_type: type,
        options: options as Prisma.InputJsonValue,
        sort_order: input.sortOrder ?? 0,
      },
    });
    return this.shapeField(row);
  }

  async updateCustomField(
    actor: AuthUser,
    id: string,
    input: {
      label?: string;
      fieldType?: string;
      options?: string[];
      active?: boolean;
      sortOrder?: number;
    },
  ) {
    this.requireAdmin(actor);
    const existing = await this.prisma.student_custom_fields.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Field not found");
    const data: Prisma.student_custom_fieldsUpdateInput = { updated_at: new Date() };
    if (input.label !== undefined) data.label = input.label.trim();
    if (input.fieldType !== undefined)
      data.field_type = input.fieldType === "dropdown" ? "dropdown" : "text";
    if (input.options !== undefined)
      data.options = input.options.map((o) => o.trim()).filter(Boolean) as Prisma.InputJsonValue;
    if (input.active !== undefined) data.active = input.active;
    if (input.sortOrder !== undefined) data.sort_order = input.sortOrder;
    const row = await this.prisma.student_custom_fields.update({ where: { id }, data });
    return this.shapeField(row);
  }

  async deleteCustomField(actor: AuthUser, id: string) {
    this.requireAdmin(actor);
    await this.prisma.student_custom_fields.delete({ where: { id } });
    return { ok: true };
  }

  private shapeField(f: {
    id: string;
    label: string;
    field_type: string;
    options: unknown;
    active: boolean;
    sort_order: number;
  }) {
    return {
      id: f.id,
      label: f.label,
      fieldType: f.field_type,
      options: (f.options as string[]) ?? [],
      active: f.active,
      sortOrder: f.sort_order,
    };
  }
}
