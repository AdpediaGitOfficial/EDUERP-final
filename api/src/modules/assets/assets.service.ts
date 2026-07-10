import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   assets: a_admin_all -> admin ALL; a_read_staff -> admin|teacher read
 *   asset_allocations: aa_admin -> admin only
 */
@Injectable()
export class AssetsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAssets(actor: AuthUser, page = 1, pageSize = 50, q?: string) {
    if (!actor.roles.some((r) => r === "admin" || r === "teacher")) throw new ForbiddenException();
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { asset_tag: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.assets.count({ where }),
      this.prisma.assets.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, rows };
  }

  async listAllocations(actor: AuthUser, assetId?: string) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    return this.prisma.asset_allocations.findMany({
      where: assetId ? { asset_id: assetId } : {},
      orderBy: { allocated_at: "desc" },
      take: 500,
    });
  }
}
