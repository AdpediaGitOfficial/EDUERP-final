import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { fmtDate, niceLabel } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/ess/documents")({ component: Page });

function Page() {
  const { data } = useQuery({
    queryKey: ["ess-documents"],
    queryFn: () => apiGet<any[]>("/ess/documents"),
  });
  return (
    <>
      <PageHeader title="My Documents" subtitle="Personal documents on record." />
      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Type</th>
              <th className="p-3">Title</th>
              <th className="p-3">Uploaded</th>
              <th className="p-3">Expiry</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((d: any) => (
              <tr key={d.id} className="border-t">
                <td className="p-3">{niceLabel(d.doc_type)}</td>
                <td className="p-3">{d.title}</td>
                <td className="p-3">{fmtDate(d.uploaded_at)}</td>
                <td className="p-3">{fmtDate(d.expiry_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
