import { Injectable, Logger } from "@nestjs/common";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * Swappable email provider. No SMTP is wired in this environment, so the default
 * implementation logs the message (and records nothing external). To go live,
 * replace the body of `send` with a real transport (nodemailer / SES / Resend)
 * — the call sites (NotificationsService) don't change.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger("EmailService");

  async send(msg: EmailMessage): Promise<{ delivered: boolean }> {
    // Real transport goes here. For now this is an honest no-op that logs intent
    // so the notification flow is fully exercised without faking a delivery.
    this.logger.log(`email → ${msg.to} :: ${msg.subject}`);
    return { delivered: false };
  }
}
