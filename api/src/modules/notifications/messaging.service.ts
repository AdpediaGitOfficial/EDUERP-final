import { Injectable, Logger } from "@nestjs/common";

export interface ShortMessage {
  to: string; // phone number in E.164 or local format
  body: string;
}

/**
 * Swappable SMS / WhatsApp provider. No gateway is wired in this environment, so
 * the default implementation logs the message and reports it undelivered (an
 * honest no-op). To go live, replace the bodies with a real transport (Twilio,
 * Gupshup, Meta WhatsApp Cloud API) — the call sites (NotificationsService) do
 * not change.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger("MessagingService");

  async sendSms(msg: ShortMessage): Promise<{ delivered: boolean }> {
    this.logger.log(`sms → ${msg.to} :: ${msg.body.slice(0, 80)}`);
    return { delivered: false };
  }

  async sendWhatsapp(msg: ShortMessage): Promise<{ delivered: boolean }> {
    this.logger.log(`whatsapp → ${msg.to} :: ${msg.body.slice(0, 80)}`);
    return { delivered: false };
  }
}
