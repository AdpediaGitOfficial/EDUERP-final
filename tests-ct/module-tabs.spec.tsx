import { test, expect } from "@playwright/experimental-ct-react";
import { ModuleTabs, type TabItem } from "@/components/module-tabs";

// A realistic, HR-sized nav (flat links + groups) — the case the overflow bar
// is meant to handle.
const NAV: TabItem[] = [
  { to: "/hr", label: "Dashboard", exact: true },
  { to: "/hr/attendance", label: "Attendance" },
  { to: "/hr/payroll", label: "Payroll" },
  {
    label: "People",
    items: [
      { to: "/hr/staff", label: "Staff" },
      { to: "/hr/recruitment", label: "Recruitment" },
      { to: "/hr/departments", label: "Departments" },
    ],
  },
  {
    label: "Time & Leave",
    items: [
      { to: "/hr/leave", label: "Leave" },
      { to: "/hr/shifts", label: "Shifts" },
      { to: "/hr/overtime", label: "Overtime" },
    ],
  },
  {
    label: "Compensation",
    items: [
      { to: "/hr/salary", label: "Salary" },
      { to: "/hr/loans", label: "Loans" },
    ],
  },
];
const TOTAL = 11;

test.describe("ModuleTabs — responsive overflow", () => {
  test("wide viewport shows tabs inline without clipping", async ({ mount, page }) => {
    await page.setViewportSize({ width: 1300, height: 200 });
    const c = await mount(<ModuleTabs items={NAV} />);
    const nav = c.locator("nav");
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await page.screenshot({ path: "test-results/tabs-wide.png" });
  });

  test("narrow viewport collapses the rest into More", async ({ mount, page }) => {
    await page.setViewportSize({ width: 680, height: 200 });
    const c = await mount(<ModuleTabs items={NAV} />);
    // "More" trigger appears...
    await expect(c.getByRole("button", { name: /More/ })).toBeVisible();
    // ...and not every tab is inline (some moved into the dropdown).
    await expect.poll(() => c.locator("nav a").count()).toBeLessThan(TOTAL);
    await page.screenshot({ path: "test-results/tabs-narrow.png" });
  });

  test("mobile viewport becomes a single Jump-to dropdown", async ({ mount, page }) => {
    await page.setViewportSize({ width: 400, height: 200 });
    const c = await mount(<ModuleTabs items={NAV} />);
    // Desktop overflow row is hidden below sm; a single dropdown button remains.
    await expect(c.locator("nav")).toBeHidden();
    await expect(c.getByRole("button", { name: /Dashboard/ })).toBeVisible();
    await page.screenshot({ path: "test-results/tabs-mobile.png" });
  });
});
