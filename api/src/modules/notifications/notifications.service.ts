import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/database/prisma.service";
import { EmailService } from "./email.service";

/**
 * In-app + email notifications. In-app delivery reuses the existing
 * broadcasts / broadcast_recipients tables (the same inbox the Communication
 * module renders), so a fee notice shows up alongside every other message.
 * Email delivery is delegated to the swappable EmailService.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  /**
   * Send an in-app broadcast to a set of users and (best-effort) an email each.
   * Returns the created broadcast id. Never throws into the caller's main flow —
   * a notification failure must not roll back the fee/payment it accompanies.
   */
  async notify(params: {
    senderId: string;
    userIds: string[];
    subject: string;
    body: string;
  }): Promise<{ broadcastId: string | null; recipients: number }> {
    const requested = Array.from(new Set(params.userIds)).filter(Boolean);
    if (requested.length === 0) return { broadcastId: null, recipients: 0 };
    // broadcast_recipients.user_id references auth.users — only real accounts can
    // receive an in-app message. Seed-only parent profiles (no login) are skipped
    // so one such recipient can't roll back the whole broadcast.
    const accounts = await this.prisma.users.findMany({
      where: { id: { in: requested } },
      select: { id: true },
    });
    const userIds = accounts.map((u) => u.id);
    if (userIds.length === 0) return { broadcastId: null, recipients: 0 };
    try {
      const broadcast = await this.prisma.broadcasts.create({
        data: {
          sender_id: params.senderId,
          // broadcasts_audience_type_check allows all_parents | all_staff | class | user.
          // A targeted notice to specific users is audience_type='user'.
          audience_type: "user",
          audience_ref: userIds.length === 1 ? userIds[0] : null,
          subject: params.subject,
          body: params.body,
          broadcast_recipients: {
            create: userIds.map((user_id) => ({ user_id })),
          },
        },
      });

      // Email side (swappable stub). Look up addresses from profiles.
      const profiles = await this.prisma.profiles.findMany({
        where: { id: { in: userIds } },
        select: { email: true },
      });
      await Promise.all(
        profiles
          .filter((p) => p.email)
          .map((p) =>
            this.email.send({ to: p.email!, subject: params.subject, body: params.body }),
          ),
      );
      return { broadcastId: broadcast.id, recipients: userIds.length };
    } catch {
      return { broadcastId: null, recipients: 0 };
    }
  }

  /** Resolve the parent user ids linked to a set of students. */
  async parentUserIdsForStudents(studentIds: string[]): Promise<string[]> {
    if (studentIds.length === 0) return [];
    const links = await this.prisma.parent_student.findMany({
      where: { student_id: { in: studentIds } },
      select: { parent_id: true },
    });
    return Array.from(new Set(links.map((l) => l.parent_id)));
  }

  private inr(n: number) {
    return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /** "New fee due" notice to the linked parents when an invoice is created. */
  async notifyFeeDue(params: {
    senderId: string;
    studentIds: string[];
    title: string;
    amount: number;
    dueDate: string;
  }) {
    const userIds = await this.parentUserIdsForStudents(params.studentIds);
    const due = new Date(params.dueDate).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return this.notify({
      senderId: params.senderId,
      userIds,
      subject: `New fee due: ${params.title}`,
      body: `A new fee of ${this.inr(params.amount)} (${params.title}) has been added to your child's account and is due by ${due}. You can pay online from the Fees tab.`,
    });
  }

  /** Payment confirmation to the paying parent, with the receipt number. */
  async notifyPaymentConfirmed(params: {
    senderId: string;
    parentUserId: string;
    amount: number;
    receiptNo: string;
    title: string | null;
  }) {
    return this.notify({
      senderId: params.senderId,
      userIds: [params.parentUserId],
      subject: `Payment received — receipt ${params.receiptNo}`,
      body: `We've received your payment of ${this.inr(params.amount)}${
        params.title ? ` for ${params.title}` : ""
      }. Receipt ${params.receiptNo} is available to download from the Fees tab.`,
    });
  }
}
