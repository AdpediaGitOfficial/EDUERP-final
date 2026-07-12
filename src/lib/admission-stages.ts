// Shared admission workflow stage metadata (mirrors the API's STAGES order).
export const ADMISSION_STAGES = [
  "draft",
  "submitted",
  "under_review",
  "document_verification",
  "parent_verification",
  "fee_assignment",
  "class_allocation",
  "approved",
  "admitted",
] as const;

export type AdmissionStage = (typeof ADMISSION_STAGES)[number] | "rejected";

export const STAGE_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  document_verification: "Document Verification",
  parent_verification: "Parent Verification",
  fee_assignment: "Fee Assignment",
  class_allocation: "Class & Section",
  approved: "Approved",
  admitted: "Admitted",
  rejected: "Rejected",
};

export function stageBadgeClass(stage: string): string {
  if (stage === "admitted") return "bg-emerald-100 text-emerald-800";
  if (stage === "approved") return "bg-teal-100 text-teal-800";
  if (stage === "rejected") return "bg-red-100 text-red-800";
  if (stage === "draft") return "bg-muted text-muted-foreground";
  return "bg-blue-100 text-blue-800";
}
