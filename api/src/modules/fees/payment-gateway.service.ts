import { Injectable } from "@nestjs/common";

export interface GatewayChargeInput {
  amount: number;
  method: "upi" | "card" | "netbanking" | "wallet";
  /** Instrument detail: VPA, masked card, bank, wallet name. */
  instrument?: string;
  /** Order reference the caller wants echoed back. */
  orderRef: string;
  /**
   * Demo-only: lets the sandbox checkout drive the outcome
   * (successful / pending / failed) so all three paths can be exercised.
   */
  simulateOutcome?: "successful" | "pending" | "failed";
}

export interface GatewayChargeResult {
  status: "successful" | "pending" | "failed";
  /** Gateway transaction id — the value stored on the payment's `reference`. */
  gatewayRef: string;
  method: string;
}

/**
 * Swappable payment-gateway boundary. This is a sandbox implementation — it does
 * NOT contact any real PSP and no money moves. To integrate a real gateway
 * (Razorpay / Stripe / PayU), replace `charge` with a call to that SDK and map
 * its response onto GatewayChargeResult; nothing else in the app changes.
 */
@Injectable()
export class PaymentGatewayService {
  async charge(input: GatewayChargeInput): Promise<GatewayChargeResult> {
    const status = input.simulateOutcome ?? "successful";
    // A realistic-looking, method-prefixed transaction reference.
    const stamp = input.orderRef
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 10)
      .toUpperCase();
    const suffix = Math.abs(hash(input.orderRef + input.instrument + input.amount))
      .toString(36)
      .slice(0, 8)
      .toUpperCase();
    const prefix =
      input.method === "upi"
        ? "UPI"
        : input.method === "card"
          ? "CARD"
          : input.method === "netbanking"
            ? "NB"
            : "WLT";
    const gatewayRef = `${prefix}-${stamp}-${suffix}`;
    return { status, gatewayRef, method: input.method };
  }
}

// Deterministic non-crypto hash (no Math.random / Date.now — safe & repeatable).
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
