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
