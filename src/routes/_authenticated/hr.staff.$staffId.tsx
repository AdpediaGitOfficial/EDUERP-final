import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { badgeClass, fmtDate, money, niceLabel } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/hr/staff/$staffId")({ component: Page });

function Page() {
  const { staffId } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["staff-detail", staffId],
    queryFn: () =>
      apiGet<{
        staff: any;
        payroll: any[];
        leaves: any[];
        documents: any[];
        history: any[];
        assets: any[];
        expenses: any[];
      }>(`/hr/staff/${staffId}`),
  });
  const staff = data?.staff;
  const payroll = data?.payroll;
  const leaves = data?.leaves;
  const docs = data?.documents;
  const history = data?.history;
  const assets = data?.assets;
  const expenses = data?.expenses;

  if (!staff) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  return (
    <>
      <div className="mb-4">
        <Link to="/hr/staff" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to staff directory
        </Link>
      </div>
      <PageHeader
        title={staff.full_name}
        subtitle={`${staff.designation} · ${staff.department} · ${staff.employee_code}`}
        action={<Badge className={badgeClass(staff.status)}>{niceLabel(staff.status)}</Badge>}
      />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">Employment</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <Card className="p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <Field label="Email" value={staff.email} />
            <Field label="Phone" value={staff.phone} />
            <Field label="Employment" value={niceLabel(staff.employment_type)} />
            <Field label="Join date" value={fmtDate(staff.join_date)} />
            <Field label="Address" value={staff.address ?? "—"} />
            <Field label="Date of birth" value={fmtDate(staff.dob)} />
            <Field label="Blood group" value={staff.blood_group} />
            <Field
              label="Experience"
              value={staff.experience_years ? `${staff.experience_years} yrs` : "—"}
            />
            <Field label="Confirmation" value={niceLabel(staff.confirmation_status ?? "—")} />
            <Field
              label="Emergency contact"
              value={
                staff.emergency_contact
                  ? `${(staff.emergency_contact as any).name} · ${(staff.emergency_contact as any).phone}`
                  : "—"
              }
            />
            <Field
              label="Bank"
              value={
                staff.bank_details
                  ? `${(staff.bank_details as any).bank} · ${(staff.bank_details as any).account}`
                  : "—"
              }
            />
            <Field label="Skills" value={(staff.skills ?? []).join(", ") || "—"} />
          </Card>
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Date</th>
                    <th className="p-3">Event</th>
                    <th className="p-3">From</th>
                    <th className="p-3">To</th>
                    <th className="p-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(history ?? []).map((h: any) => (
                    <tr key={h.id} className="border-t">
                      <td className="p-3">{fmtDate(h.effective_date)}</td>
                      <td className="p-3">{niceLabel(h.event_type)}</td>
                      <td className="p-3">{h.from_value ?? "—"}</td>
                      <td className="p-3">{h.to_value ?? "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{h.notes}</td>
                    </tr>
                  ))}
                  {(history ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        No history records.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="payroll" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Month</th>
                    <th className="p-3">Base</th>
                    <th className="p-3">Allowances</th>
                    <th className="p-3">Deductions</th>
                    <th className="p-3">Net</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll?.map((p: any) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-3">{fmtDate(p.month)}</td>
                      <td className="p-3">{money(p.base_salary)}</td>
                      <td className="p-3">{money(p.allowances)}</td>
                      <td className="p-3">{money(p.deductions)}</td>
                      <td className="p-3 font-medium">{money(p.net_salary)}</td>
                      <td className="p-3">
                        <Badge className={badgeClass(p.status)}>{niceLabel(p.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                  {(!payroll || payroll.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        No payroll records.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="leave" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Type</th>
                    <th className="p-3">Dates</th>
                    <th className="p-3">Days</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves?.map((l: any) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-3">{niceLabel(l.leave_type)}</td>
                      <td className="p-3">
                        {fmtDate(l.start_date)} → {fmtDate(l.end_date)}
                      </td>
                      <td className="p-3">{l.days}</td>
                      <td className="p-3">
                        <Badge className={badgeClass(l.status)}>{niceLabel(l.status)}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{l.reason ?? "—"}</td>
                    </tr>
                  ))}
                  {(!leaves || leaves.length === 0) && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        No leave records.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="assets" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Code</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {(assets ?? []).map((a: any) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3 font-mono text-xs">{a.asset_code}</td>
                      <td className="p-3">{a.name}</td>
                      <td className="p-3">{niceLabel(a.status)}</td>
                      <td className="p-3">{niceLabel(a.condition ?? "—")}</td>
                    </tr>
                  ))}
                  {(assets ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No assets allocated.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="expenses" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(expenses ?? []).map((e: any) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-3">{fmtDate(e.claim_date)}</td>
                      <td className="p-3">{niceLabel(e.category)}</td>
                      <td className="p-3">{money(e.amount)}</td>
                      <td className="p-3">
                        <Badge className={badgeClass(e.status)}>{niceLabel(e.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                  {(expenses ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No expense claims.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="documents" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Type</th>
                    <th className="p-3">Title</th>
                    <th className="p-3">Uploaded</th>
                    <th className="p-3">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {docs?.map((d: any) => (
                    <tr key={d.id} className="border-t">
                      <td className="p-3">{niceLabel(d.doc_type)}</td>
                      <td className="p-3">{d.title}</td>
                      <td className="p-3">{fmtDate(d.uploaded_at)}</td>
                      <td className="p-3">{d.expiry_date ? fmtDate(d.expiry_date) : "—"}</td>
                    </tr>
                  ))}
                  {(!docs || docs.length === 0) && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No documents.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}
