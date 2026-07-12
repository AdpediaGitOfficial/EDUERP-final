import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { badgeClass, daysUntil, fmtDate, niceLabel } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/hr/documents")({ component: Page });

function Page() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["hr-docs"],
    queryFn: () => apiGet<any[]>("/hr/documents"),
  });
  return (
    <>
      <PageHeader title="Document Vault" subtitle="Personnel documents with expiry tracking." />
      <Card className="rounded-2xl overflow-hidden">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Staff</th>
              <th className="p-3">Type</th>
              <th className="p-3">Title</th>
              <th className="p-3">Uploaded</th>
              <th className="p-3">Expiry</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((d: any) => {
              const days = daysUntil(d.expiry_date);
              return (
                <tr key={d.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{d.staff?.full_name}</div>
                    <div className="text-xs text-muted-foreground">{d.staff?.employee_code}</div>
                  </td>
                  <td className="p-3">{niceLabel(d.doc_type)}</td>
                  <td className="p-3">{d.title}</td>
                  <td className="p-3">{fmtDate(d.uploaded_at)}</td>
                  <td className="p-3">
                    {d.expiry_date ? (
                      <>
                        <span>{fmtDate(d.expiry_date)}</span>{" "}
                        {days !== null && days <= 30 && (
                          <Badge className={badgeClass(days < 0 ? "rejected" : "pending")}>
                            {days < 0 ? "Expired" : "Renewal due"}
                          </Badge>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </Card>
    </>
  );
}
