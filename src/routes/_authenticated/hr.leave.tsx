import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { badgeClass, fmtDate, niceLabel } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/hr/leave")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { data: requests, isLoading, isError, refetch } = useQuery({
    queryKey: ["hr-leave-requests"],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>("/hr/leave-requests?pageSize=200");
      // Map the API's camelCase back to the fields this table renders.
      return res.rows.map((r) => ({
        id: r.id,
        leave_type: r.leaveType,
        start_date: r.startDate,
        end_date: r.endDate,
        days: r.days,
        status: r.status,
        staff: { full_name: r.staffName, employee_code: r.employeeCode, department: r.department },
      }));
    },
  });
  const { data: balances } = useQuery({
    queryKey: ["hr-leave-balances"],
    queryFn: async () => apiGet<any[]>("/hr/leave-balances"),
  });
  const decide = useMutation({
    mutationFn: async (v: { id: string; status: "approved" | "rejected" }) =>
      apiFetch(`/hr/leave-requests/${v.id}/decision`, {
        method: "PATCH",
        body: JSON.stringify({ status: v.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-leave-requests"] }),
  });
  return (
    <>
      <PageHeader title="Leave Management" subtitle="Requests and yearly balances by staff." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b font-medium">Leave requests</div>
          {isError ? (
            <QueryError onRetry={() => refetch()} />
          ) : isLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Staff</th>
                <th className="p-3">Type</th>
                <th className="p-3">Dates</th>
                <th className="p-3">Days</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(requests ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{r.staff?.full_name}</div>
                    <div className="text-xs text-muted-foreground">{r.staff?.department}</div>
                  </td>
                  <td className="p-3">{niceLabel(r.leave_type)}</td>
                  <td className="p-3">
                    {fmtDate(r.start_date)} → {fmtDate(r.end_date)}
                  </td>
                  <td className="p-3">{r.days}</td>
                  <td className="p-3">
                    <Badge className={badgeClass(r.status)}>{niceLabel(r.status)}</Badge>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {r.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => decide.mutate({ id: r.id, status: "approved" })}
                        >
                          Approve
                        </Button>{" "}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => decide.mutate({ id: r.id, status: "rejected" })}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </Card>
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b font-medium">Leave balances</div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Staff</th>
                <th className="p-3">Type</th>
                <th className="p-3">Allotted</th>
                <th className="p-3">Used</th>
                <th className="p-3">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {(balances ?? []).map((b: any) => (
                <tr key={b.id} className="border-t">
                  <td className="p-3">{b.staff?.full_name}</td>
                  <td className="p-3">{niceLabel(b.leave_type)}</td>
                  <td className="p-3">{b.allotted}</td>
                  <td className="p-3">{b.used}</td>
                  <td className="p-3 font-medium">{b.allotted - b.used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
