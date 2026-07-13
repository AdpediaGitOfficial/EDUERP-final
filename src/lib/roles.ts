export type AppRole =
  "admin" | "teacher" | "student" | "parent" | "hr" | "accountant" | "reception" | "fleet_manager";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrator",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
  hr: "HR",
  accountant: "Accountant",
  reception: "Reception",
  fleet_manager: "Fleet Manager",
};

export const ROLE_PRIORITY: AppRole[] = [
  "admin",
  "hr",
  "accountant",
  "reception",
  "fleet_manager",
  "teacher",
  "student",
  "parent",
];

export function pickPrimaryRole(roles: AppRole[]): AppRole | null {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return null;
}

/**
 * Students and parents are provisioned by Student Admission — together with the
 * student's enrolment, guardians and fee ledger — so they must NOT be created or
 * assigned from the generic Users admin, which would leave orphan accounts.
 */
export const ADMISSION_MANAGED_ROLES: AppRole[] = ["student", "parent"];

/** Roles an admin may assign from the Users screen (everything except the above). */
export const CREATABLE_ROLES: AppRole[] = [
  "admin",
  "teacher",
  "hr",
  "accountant",
  "reception",
  "fleet_manager",
];

export const isAdmissionManagedRole = (r: AppRole) => ADMISSION_MANAGED_ROLES.includes(r);
