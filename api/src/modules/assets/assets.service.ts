import {
  BadRequestException,
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
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   assets: a_admin_all -> admin ALL; a_read_staff -> admin|teacher read
 *   asset_categories: ac_read -> admin|teacher read; ac_write -> admin write
 *   asset_vendors: av_read -> admin|teacher read; av_write -> admin write
 *   asset_amc: amc_admin -> admin only
 *   asset_maintenance: am_admin -> admin only
 *   asset_allocations: aa_admin -> admin only
 */
@Injectable()
export class AssetsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private assertRead(actor: AuthUser) {
    if (!actor.roles.some((r) => r === "admin" || r === "teacher")) throw new ForbiddenException();
  }

  private assertAdmin(actor: AuthUser) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
  }

  private num(v: Prisma.Decimal | number | null | undefined): number {
    if (v == null) return 0;
    return typeof v === "number" ? v : Number(v);
  }

  // ---- Dashboard -----------------------------------------------------------
  async dashboard(actor: AuthUser) {
    this.assertRead(actor);
    const [assets, allocs, maints] = await Promise.all([
      this.prisma.assets.findMany({
        select: {
          status: true,
          category: true,
          current_value: true,
          purchase_price: true,
          category_id: true,
        },
      }),
      this.prisma.asset_allocations.findMany({
        orderBy: { created_at: "desc" },
        take: 10,
        select: {
          id: true,
          assignee_label: true,
          allocated_at: true,
          returned_at: true,
          return_condition: true,
          assets: { select: { name: true } },
        },
      }),
      this.prisma.asset_maintenance.findMany({
        orderBy: { created_at: "desc" },
        take: 10,
        select: {
          id: true,
          type: true,
          status: true,
          scheduled_for: true,
          completed_at: true,
          assets: { select: { name: true } },
        },
      }),
    ]);

    const stats = { total: 0, in_use: 0, available: 0, repair: 0, retired: 0, disposed: 0 };
    const catCount = new Map<string, number>();
    for (const a of assets) {
      stats.total++;
      if (a.status in stats) (stats as Record<string, number>)[a.status]++;
      const key = a.category || "Uncategorized";
      catCount.set(key, (catCount.get(key) ?? 0) + 1);
    }
    const topCategories = [...catCount.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const activity: { when: string; text: string; kind: string }[] = [];
    for (const a of allocs) {
      const name = a.assets?.name ?? "Asset";
      const when = (a.returned_at ?? a.allocated_at) as Date | null;
      activity.push({
        when: when ? when.toISOString() : "",
        text: a.returned_at
          ? `${name} returned (${a.return_condition ?? "good"})`
          : `${name} allocated to ${a.assignee_label}`,
        kind: a.returned_at ? "return" : "allocate",
      });
    }
    for (const m of maints) {
      const name = m.assets?.name ?? "Asset";
      const when = (m.completed_at ?? m.scheduled_for) as Date | null;
      activity.push({
        when: when ? when.toISOString() : "",
        text:
          m.status === "completed"
            ? `${name} — maintenance completed`
            : `${name} — maintenance scheduled`,
        kind: "maint",
      });
    }
    const recentActivity = activity
      .filter((i) => i.when)
      .sort((a, b) => (a.when < b.when ? 1 : -1))
      .slice(0, 10);

    return { stats, topCategories, recentActivity };
  }

  // ---- Registry ------------------------------------------------------------
  private assetRow(a: {
    id: string;
    name: string;
    asset_code: string | null;
    category: string | null;
    category_id: string | null;
    status: string;
    condition: string;
    location: string | null;
    assigned_to_label: string | null;
    purchase_date: Date | null;
    purchase_price: Prisma.Decimal | null;
    current_value: Prisma.Decimal | null;
    asset_categories?: { name: string } | null;
  }) {
    return {
      id: a.id,
      name: a.name,
      asset_code: a.asset_code,
      category_id: a.category_id,
      category: a.category,
      categoryName: a.asset_categories?.name ?? a.category ?? null,
      status: a.status,
      condition: a.condition,
      location: a.location,
      assigned_to_label: a.assigned_to_label,
      purchase_date: a.purchase_date ? a.purchase_date.toISOString().slice(0, 10) : null,
      purchase_price: a.purchase_price == null ? null : this.num(a.purchase_price),
      current_value: a.current_value == null ? null : this.num(a.current_value),
    };
  }

  async listAssets(actor: AuthUser, q?: string, status?: string) {
    this.assertRead(actor);
    const where: Prisma.assetsWhereInput = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { asset_code: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.assets.findMany({
      where,
      orderBy: { asset_code: "asc" },
      include: { asset_categories: { select: { name: true } } },
    });
    return rows.map((a) => this.assetRow(a));
  }

  async getAsset(actor: AuthUser, id: string) {
    this.assertRead(actor);
    const a = await this.prisma.assets.findUnique({
      where: { id },
      include: {
        asset_categories: { select: { name: true } },
        asset_vendors: { select: { name: true } },
      },
    });
    if (!a) throw new NotFoundException();
    return {
      id: a.id,
      name: a.name,
      asset_code: a.asset_code,
      status: a.status,
      condition: a.condition,
      category: a.category,
      categoryName: a.asset_categories?.name ?? a.category ?? null,
      vendorName: a.asset_vendors?.name ?? null,
      location: a.location,
      assigned_to_label: a.assigned_to_label,
      notes: a.notes,
      purchase_date: a.purchase_date ? a.purchase_date.toISOString().slice(0, 10) : null,
      purchase_price: a.purchase_price == null ? null : this.num(a.purchase_price),
      current_value: a.current_value == null ? null : this.num(a.current_value),
      warranty_expiry: a.warranty_expiry ? a.warranty_expiry.toISOString().slice(0, 10) : null,
      useful_life_years: a.useful_life_years,
      invoice_ref: a.invoice_ref,
      qr_value: a.qr_value ?? a.asset_code ?? a.id,
      barcode_value: a.barcode_value ?? a.asset_code ?? a.id,
    };
  }

  private async nextAssetCode(): Promise<string> {
    const rows = await this.prisma.assets.findMany({
      where: { asset_code: { startsWith: "AST-" } },
      select: { asset_code: true },
    });
    let max = 0;
    for (const r of rows) {
      const m = /AST-(\d+)/.exec(r.asset_code ?? "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `AST-${String(max + 1).padStart(4, "0")}`;
  }

  async createAsset(
    actor: AuthUser,
    input: {
      name: string;
      category_id?: string | null;
      vendor_id?: string | null;
      purchase_date?: string | null;
      purchase_price?: number | null;
      current_value?: number | null;
      warranty_expiry?: string | null;
      useful_life_years?: number | null;
      invoice_ref?: string | null;
      location?: string | null;
      status?: string | null;
      barcode_value?: string | null;
    },
  ) {
    this.assertAdmin(actor);
    const code = await this.nextAssetCode();
    let categoryName: string | null = null;
    if (input.category_id) {
      const cat = await this.prisma.asset_categories.findUnique({
        where: { id: input.category_id },
        select: { name: true },
      });
      categoryName = cat?.name ?? null;
    }
    const price = input.purchase_price ?? null;
    const created = await this.prisma.assets.create({
      data: {
        name: input.name,
        category_id: input.category_id || null,
        category: categoryName,
        vendor_id: input.vendor_id || null,
        purchase_date: input.purchase_date ? new Date(input.purchase_date) : null,
        purchase_price: price,
        current_value: input.current_value ?? price,
        warranty_expiry: input.warranty_expiry ? new Date(input.warranty_expiry) : null,
        useful_life_years: input.useful_life_years ?? 5,
        invoice_ref: input.invoice_ref || null,
        location: input.location || null,
        status: input.status || "available",
        condition: "good",
        asset_code: code,
        qr_value: code,
        barcode_value: input.barcode_value || code,
      },
      include: { asset_categories: { select: { name: true } } },
    });
    return this.assetRow(created);
  }

  async updateAsset(
    actor: AuthUser,
    id: string,
    input: {
      name?: string;
      category_id?: string | null;
      vendor_id?: string | null;
      location?: string | null;
      status?: string | null;
      condition?: string | null;
      notes?: string | null;
      current_value?: number | null;
    },
  ) {
    this.assertAdmin(actor);
    const exists = await this.prisma.assets.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();
    let categoryPatch: { category_id: string | null; category: string | null } | undefined;
    if (input.category_id !== undefined) {
      const cat = input.category_id
        ? await this.prisma.asset_categories.findUnique({
            where: { id: input.category_id },
            select: { name: true },
          })
        : null;
      categoryPatch = { category_id: input.category_id || null, category: cat?.name ?? null };
    }
    const updated = await this.prisma.assets.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(categoryPatch ?? {}),
        ...(input.vendor_id !== undefined ? { vendor_id: input.vendor_id || null } : {}),
        ...(input.location !== undefined ? { location: input.location || null } : {}),
        ...(input.status !== undefined ? { status: input.status || "available" } : {}),
        ...(input.condition !== undefined ? { condition: input.condition || "good" } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.current_value !== undefined ? { current_value: input.current_value } : {}),
      },
      include: { asset_categories: { select: { name: true } } },
    });
    return this.assetRow(updated);
  }

  // ---- Categories ----------------------------------------------------------
  async listCategories(actor: AuthUser) {
    this.assertRead(actor);
    const [cats, assets] = await Promise.all([
      this.prisma.asset_categories.findMany({ orderBy: { name: "asc" } }),
      this.prisma.assets.findMany({
        select: { category_id: true, current_value: true, purchase_price: true },
      }),
    ]);
    const agg = new Map<string, { count: number; value: number }>();
    for (const a of assets) {
      if (!a.category_id) continue;
      const cur = agg.get(a.category_id) ?? { count: 0, value: 0 };
      cur.count++;
      cur.value += this.num(a.current_value ?? a.purchase_price);
      agg.set(a.category_id, cur);
    }
    return cats.map((c) => {
      const s = agg.get(c.id) ?? { count: 0, value: 0 };
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        assetCount: s.count,
        totalValue: s.value,
      };
    });
  }

  async createCategory(actor: AuthUser, input: { name: string; description?: string | null }) {
    this.assertAdmin(actor);
    const created = await this.prisma.asset_categories.create({
      data: { name: input.name, description: input.description || null },
    });
    return { id: created.id };
  }

  async updateCategory(
    actor: AuthUser,
    id: string,
    input: { name?: string; description?: string | null },
  ) {
    this.assertAdmin(actor);
    const exists = await this.prisma.asset_categories.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();
    await this.prisma.asset_categories.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
      },
    });
    return { id };
  }

  async deleteCategory(actor: AuthUser, id: string) {
    this.assertAdmin(actor);
    const exists = await this.prisma.asset_categories.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();
    // Assets keep their name/category text but lose the FK link.
    await this.prisma.assets.updateMany({
      where: { category_id: id },
      data: { category_id: null },
    });
    await this.prisma.asset_categories.delete({ where: { id } });
    return { ok: true };
  }

  // ---- Vendors -------------------------------------------------------------
  async listVendors(actor: AuthUser) {
    this.assertRead(actor);
    const [vendors, assets, amcs] = await Promise.all([
      this.prisma.asset_vendors.findMany({ orderBy: { name: "asc" } }),
      this.prisma.assets.findMany({
        select: {
          id: true,
          name: true,
          vendor_id: true,
          purchase_date: true,
          purchase_price: true,
          current_value: true,
        },
      }),
      this.prisma.asset_amc.findMany({
        select: {
          id: true,
          vendor_id: true,
          end_date: true,
          coverage: true,
          asset_id: true,
          assets: { select: { name: true } },
        },
      }),
    ]);

    const assetsByVendor = new Map<string, typeof assets>();
    for (const a of assets) {
      if (!a.vendor_id) continue;
      const list = assetsByVendor.get(a.vendor_id) ?? [];
      list.push(a);
      assetsByVendor.set(a.vendor_id, list);
    }
    const amcsByVendor = new Map<string, typeof amcs>();
    for (const c of amcs) {
      if (!c.vendor_id) continue;
      const list = amcsByVendor.get(c.vendor_id) ?? [];
      list.push(c);
      amcsByVendor.set(c.vendor_id, list);
    }

    return vendors.map((v) => {
      const va = assetsByVendor.get(v.id) ?? [];
      const vc = amcsByVendor.get(v.id) ?? [];
      return {
        id: v.id,
        name: v.name,
        contact_name: v.contact_name,
        email: v.email,
        phone: v.phone,
        category_hint: v.category_hint,
        assetCount: va.length,
        amcCount: vc.length,
        assets: va.slice(0, 8).map((a) => ({
          id: a.id,
          name: a.name,
          purchase_price: a.purchase_price == null ? null : this.num(a.purchase_price),
        })),
        amcs: vc.map((c) => ({
          id: c.id,
          assetName: c.assets?.name ?? null,
          end_date: c.end_date ? c.end_date.toISOString().slice(0, 10) : null,
          coverage: c.coverage,
        })),
      };
    });
  }

  private vendorData(input: {
    name?: string;
    contact_name?: string | null;
    email?: string | null;
    phone?: string | null;
    category_hint?: string | null;
  }) {
    return {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.contact_name !== undefined ? { contact_name: input.contact_name || null } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.category_hint !== undefined ? { category_hint: input.category_hint || null } : {}),
    };
  }

  async createVendor(
    actor: AuthUser,
    input: {
      name: string;
      contact_name?: string | null;
      email?: string | null;
      phone?: string | null;
      category_hint?: string | null;
    },
  ) {
    this.assertAdmin(actor);
    if (!input.name?.trim()) throw new BadRequestException("name required");
    const created = await this.prisma.asset_vendors.create({
      data: this.vendorData(input) as Prisma.asset_vendorsCreateInput,
    });
    return { id: created.id };
  }

  async updateVendor(
    actor: AuthUser,
    id: string,
    input: {
      name?: string;
      contact_name?: string | null;
      email?: string | null;
      phone?: string | null;
      category_hint?: string | null;
    },
  ) {
    this.assertAdmin(actor);
    const exists = await this.prisma.asset_vendors.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();
    await this.prisma.asset_vendors.update({ where: { id }, data: this.vendorData(input) });
    return { id };
  }

  // ---- Allocations (asset_allocations: aa_admin -> admin only) --------------
  private daysBetween(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / (24 * 3600 * 1000));
  }

  async listAllocations(actor: AuthUser, opts: { assetId?: string; active?: boolean } = {}) {
    this.assertAdmin(actor);
    const rows = await this.prisma.asset_allocations.findMany({
      where: {
        ...(opts.assetId ? { asset_id: opts.assetId } : {}),
        ...(opts.active ? { returned_at: null } : {}),
      },
      orderBy: { allocated_at: "desc" },
      take: 500,
      include: { assets: { select: { name: true, asset_code: true } } },
    });
    // Enhancement: flag overdue active allocations (expected return date passed).
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return rows.map((a) => {
      const overdue =
        !a.returned_at && a.expected_return_at != null && a.expected_return_at < today;
      return {
        id: a.id,
        asset_id: a.asset_id,
        assetName: a.assets?.name ?? null,
        assetCode: a.assets?.asset_code ?? null,
        assignee_label: a.assignee_label,
        allocated_at: a.allocated_at ? a.allocated_at.toISOString().slice(0, 10) : null,
        expected_return_at: a.expected_return_at
          ? a.expected_return_at.toISOString().slice(0, 10)
          : null,
        returned_at: a.returned_at ? a.returned_at.toISOString().slice(0, 10) : null,
        return_condition: a.return_condition,
        notes: a.notes,
        days: a.allocated_at ? this.daysBetween(a.allocated_at, today) : 0,
        overdue,
        overdueDays:
          overdue && a.expected_return_at ? this.daysBetween(a.expected_return_at, today) : 0,
      };
    });
  }

  async allocate(
    actor: AuthUser,
    input: {
      assetId: string;
      assigneeLabel: string;
      allocatedAt?: string | null;
      expectedReturnAt?: string | null;
      notes?: string | null;
    },
  ) {
    this.assertAdmin(actor);
    if (!input.assetId) throw new BadRequestException("assetId required");
    if (!input.assigneeLabel?.trim()) throw new BadRequestException("assigneeLabel required");
    const asset = await this.prisma.assets.findUnique({ where: { id: input.assetId } });
    if (!asset) throw new NotFoundException("asset not found");
    if (asset.status !== "available")
      throw new ConflictException("asset is not available for allocation");
    const [alloc] = await this.prisma.$transaction([
      this.prisma.asset_allocations.create({
        data: {
          asset_id: input.assetId,
          assignee_label: input.assigneeLabel,
          allocated_at: input.allocatedAt ? new Date(input.allocatedAt) : new Date(),
          expected_return_at: input.expectedReturnAt ? new Date(input.expectedReturnAt) : null,
          notes: input.notes || null,
        },
      }),
      this.prisma.assets.update({
        where: { id: input.assetId },
        data: { status: "in_use", assigned_to_label: input.assigneeLabel },
      }),
    ]);
    return { id: alloc.id };
  }

  async returnAllocation(actor: AuthUser, id: string, condition: string) {
    this.assertAdmin(actor);
    const alloc = await this.prisma.asset_allocations.findUnique({ where: { id } });
    if (!alloc) throw new NotFoundException();
    if (alloc.returned_at) throw new ConflictException("already returned");
    const newStatus =
      condition === "damaged" || condition === "needs_repair" ? "repair" : "available";
    await this.prisma.$transaction([
      this.prisma.asset_allocations.update({
        where: { id },
        data: { returned_at: new Date(), return_condition: condition },
      }),
      this.prisma.assets.update({
        where: { id: alloc.asset_id },
        data: { status: newStatus, assigned_to_label: null },
      }),
    ]);
    return { ok: true, status: newStatus };
  }

  // ---- Maintenance (asset_maintenance: am_admin -> admin only) --------------
  private maintenanceRow(m: {
    id: string;
    asset_id: string;
    type: string;
    status: string;
    scheduled_for: Date | null;
    completed_at: Date | null;
    cost: Prisma.Decimal | null;
    performed_by: string | null;
    notes: string | null;
    assets?: { name: string; asset_code: string | null } | null;
  }) {
    return {
      id: m.id,
      asset_id: m.asset_id,
      assetName: m.assets?.name ?? null,
      assetCode: m.assets?.asset_code ?? null,
      type: m.type,
      status: m.status,
      scheduled_for: m.scheduled_for ? m.scheduled_for.toISOString().slice(0, 10) : null,
      completed_at: m.completed_at ? m.completed_at.toISOString().slice(0, 10) : null,
      cost: m.cost == null ? null : this.num(m.cost),
      performed_by: m.performed_by,
      notes: m.notes,
    };
  }

  async listMaintenance(
    actor: AuthUser,
    opts: { status?: string; assetId?: string; limit?: number } = {},
  ) {
    this.assertAdmin(actor);
    const rows = await this.prisma.asset_maintenance.findMany({
      where: {
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.assetId ? { asset_id: opts.assetId } : {}),
      },
      orderBy:
        opts.status === "completed"
          ? { completed_at: "desc" }
          : opts.status === "scheduled"
            ? { scheduled_for: "asc" }
            : { created_at: "desc" },
      take: Math.min(opts.limit ?? 500, 500),
      include: { assets: { select: { name: true, asset_code: true } } },
    });
    return rows.map((m) => this.maintenanceRow(m));
  }

  async createMaintenance(
    actor: AuthUser,
    input: {
      assetId: string;
      type?: string | null;
      cost?: number | null;
      performedBy?: string | null;
      notes?: string | null;
      completedAt?: string | null;
      scheduledFor?: string | null;
      status?: string | null;
    },
  ) {
    this.assertAdmin(actor);
    if (!input.assetId) throw new BadRequestException("assetId required");
    const asset = await this.prisma.assets.findUnique({ where: { id: input.assetId } });
    if (!asset) throw new NotFoundException("asset not found");
    const status = input.status ?? (input.scheduledFor ? "scheduled" : "completed");
    const created = await this.prisma.asset_maintenance.create({
      data: {
        asset_id: input.assetId,
        type: input.type || "general",
        cost: input.cost ?? 0,
        performed_by: input.performedBy || null,
        notes: input.notes || null,
        status,
        completed_at:
          status === "completed"
            ? input.completedAt
              ? new Date(input.completedAt)
              : new Date()
            : null,
        scheduled_for: input.scheduledFor ? new Date(input.scheduledFor) : null,
      },
      include: { assets: { select: { name: true, asset_code: true } } },
    });
    return this.maintenanceRow(created);
  }

  async completeMaintenance(actor: AuthUser, id: string, cost?: number | null) {
    this.assertAdmin(actor);
    const m = await this.prisma.asset_maintenance.findUnique({ where: { id } });
    if (!m) throw new NotFoundException();
    if (m.status === "completed") throw new ConflictException("already completed");
    const updated = await this.prisma.asset_maintenance.update({
      where: { id },
      data: {
        status: "completed",
        completed_at: new Date(),
        ...(cost != null ? { cost } : {}),
      },
      include: { assets: { select: { name: true, asset_code: true } } },
    });
    return this.maintenanceRow(updated);
  }

  // ---- AMC contracts (asset_amc: amc_admin -> admin only) ------------------
  async listAmc(actor: AuthUser, assetId?: string) {
    this.assertAdmin(actor);
    const rows = await this.prisma.asset_amc.findMany({
      where: assetId ? { asset_id: assetId } : {},
      orderBy: { end_date: "asc" },
      include: {
        assets: { select: { name: true, asset_code: true } },
        asset_vendors: { select: { name: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      asset_id: a.asset_id,
      assetName: a.assets?.name ?? null,
      assetCode: a.assets?.asset_code ?? null,
      vendorName: a.asset_vendors?.name ?? null,
      coverage: a.coverage,
      start_date: a.start_date ? a.start_date.toISOString().slice(0, 10) : null,
      end_date: a.end_date ? a.end_date.toISOString().slice(0, 10) : null,
    }));
  }
}
