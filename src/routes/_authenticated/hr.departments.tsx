import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { useConfirm } from "@/components/confirm-dialog";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { money } from "@/lib/module-util";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/departments")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: depts, isLoading, isError, refetch } = useQuery({
    queryKey: ["depts"],
    queryFn: () => apiGet<any[]>("/hr/departments"),
  });
  const { data: staff } = useQuery({
    queryKey: ["staff-by-dept"],
    queryFn: () => apiGet<any[]>("/hr/staff"),
  });
  const { data: desigs } = useQuery({
    queryKey: ["desigs"],
    queryFn: () => apiGet<any[]>("/hr/designations"),
  });

  const countBy = (name: string) => (staff ?? []).filter((s: any) => s.department === name).length;

  const [deptOpen, setDeptOpen] = useState(false);
  const [deptForm, setDeptForm] = useState<any>({
    id: null,
    name: "",
    code: "",
    budget: 0,
    description: "",
  });
  const [desigOpen, setDesigOpen] = useState(false);
  const [desigForm, setDesigForm] = useState<any>({
    id: null,
    title: "",
    level: 1,
    salary_grade: "G1",
    min_pay: 0,
    max_pay: 0,
  });

  const write = async (path: string, method: string, body?: any) => {
    const res = await apiFetch(path, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res || !res.ok) {
      const b = res ? await res.json().catch(() => null) : null;
      throw new Error(b?.message ?? "Request failed");
    }
  };

  const saveDept = useMutation({
    mutationFn: async () => {
      const payload = {
        name: deptForm.name,
        // New departments get a system-assigned code; keep the existing code on edit.
        code: deptForm.code.trim() || undefined,
        budget: Number(deptForm.budget) || 0,
        description: deptForm.description,
      };
      await (deptForm.id
        ? write(`/hr/departments/${deptForm.id}`, "PATCH", payload)
        : write("/hr/departments", "POST", payload));
    },
    onSuccess: () => {
      toast.success("Saved");
      setDeptOpen(false);
      qc.invalidateQueries({ queryKey: ["depts"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const delDept = useMutation({
    mutationFn: (id: string) => write(`/hr/departments/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["depts"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const saveDesig = useMutation({
    mutationFn: async () => {
      const payload = {
        title: desigForm.title,
        level: Number(desigForm.level),
        salary_grade: desigForm.salary_grade,
        min_pay: Number(desigForm.min_pay),
        max_pay: Number(desigForm.max_pay),
      };
      await (desigForm.id
        ? write(`/hr/designations/${desigForm.id}`, "PATCH", payload)
        : write("/hr/designations", "POST", payload));
    },
    onSuccess: () => {
      toast.success("Saved");
      setDesigOpen(false);
      qc.invalidateQueries({ queryKey: ["desigs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const delDesig = useMutation({
    mutationFn: (id: string) => write(`/hr/designations/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["desigs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Departments & Designations"
        subtitle="Organizational structure and hierarchy."
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDesigForm({
                  id: null,
                  title: "",
                  level: 1,
                  salary_grade: "G1",
                  min_pay: 0,
                  max_pay: 0,
                });
                setDesigOpen(true);
              }}
            >
              <Plus className="size-4 mr-1" />
              Designation
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDeptForm({ id: null, name: "", code: "", budget: 0, description: "" });
                setDeptOpen(true);
              }}
            >
              <Plus className="size-4 mr-1" />
              Department
            </Button>
          </div>
        }
      />
      <h3 className="text-sm font-semibold mb-3">Departments</h3>
      {isError ? (
        <Card className="rounded-2xl mb-8">
          <QueryError onRetry={() => refetch()} />
        </Card>
      ) : isLoading ? (
        <Card className="rounded-2xl overflow-hidden mb-8">
          <TableSkeleton rows={6} cols={3} />
        </Card>
      ) : (
      <div className="grid md:grid-cols-3 gap-3 mb-8">
        {(depts ?? []).map((d: any) => (
          <Card key={d.id} className="p-4 rounded-2xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{d.name}</div>
                <div className="text-xs text-muted-foreground">Code {d.code}</div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setDeptForm({
                      id: d.id,
                      name: d.name,
                      code: d.code,
                      budget: d.budget ?? 0,
                      description: d.description ?? "",
                    });
                    setDeptOpen(true);
                  }}
                  aria-label={`Edit department ${d.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete department ${d.name}`}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Delete "${d.name}"?`,
                        description:
                          "The department will be removed. Staff records are not deleted but lose this department link.",
                        confirmText: "Delete",
                        destructive: true,
                      })
                    )
                      delDept.mutate(d.id);
                  }}
                >
                  <Trash2 className="size-4 text-red-600" />
                </Button>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Headcount</div>
                <div className="font-semibold">{countBy(d.name)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Budget</div>
                <div className="font-semibold">{money(d.budget)}</div>
              </div>
            </div>
            {d.description && (
              <div className="mt-2 text-xs text-muted-foreground">{d.description}</div>
            )}
          </Card>
        ))}
      </div>
      )}

      <h3 className="text-sm font-semibold mb-3">Designations & Salary Grades</h3>
      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Title</th>
              <th className="p-3">Level</th>
              <th className="p-3">Grade</th>
              <th className="p-3">Salary Band</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(desigs ?? []).map((d: any) => (
              <tr key={d.id} className="border-t">
                <td className="p-3 font-medium">{d.title}</td>
                <td className="p-3">L{d.level}</td>
                <td className="p-3">{d.salary_grade}</td>
                <td className="p-3">
                  {money(d.min_pay)} – {money(d.max_pay)}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setDesigForm({
                        id: d.id,
                        title: d.title,
                        level: d.level,
                        salary_grade: d.salary_grade,
                        min_pay: d.min_pay,
                        max_pay: d.max_pay,
                      });
                      setDesigOpen(true);
                    }}
                    aria-label={`Edit designation ${d.title}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete designation ${d.title}`}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Delete "${d.title}"?`,
                          description: "This designation / salary grade will be removed.",
                          confirmText: "Delete",
                          destructive: true,
                        })
                      )
                        delDesig.mutate(d.id);
                    }}
                  >
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={deptOpen} onOpenChange={setDeptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deptForm.id ? "Edit department" : "New department"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div>
              <Label>Name</Label>
              <Input
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Code</Label>
              <Input
                value={deptForm.code}
                readOnly
                tabIndex={-1}
                placeholder={deptForm.id ? "" : "Auto-generated"}
                aria-label="Department code (auto-generated)"
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
              {!deptForm.id && (
                <p className="text-xs text-muted-foreground mt-1">
                  Assigned automatically from the name on save.
                </p>
              )}
            </div>
            <div>
              <Label>Annual budget</Label>
              <Input
                type="number"
                value={deptForm.budget}
                onChange={(e) => setDeptForm({ ...deptForm, budget: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={deptForm.description}
                onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveDept.mutate()} disabled={!deptForm.name || !deptForm.code}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={desigOpen} onOpenChange={setDesigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{desigForm.id ? "Edit designation" : "New designation"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <Label>Title</Label>
              <Input
                value={desigForm.title}
                onChange={(e) => setDesigForm({ ...desigForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Level</Label>
              <Input
                type="number"
                value={desigForm.level}
                onChange={(e) => setDesigForm({ ...desigForm, level: e.target.value })}
              />
            </div>
            <div>
              <Label>Salary grade</Label>
              <Input
                value={desigForm.salary_grade}
                onChange={(e) => setDesigForm({ ...desigForm, salary_grade: e.target.value })}
              />
            </div>
            <div>
              <Label>Min pay</Label>
              <Input
                type="number"
                value={desigForm.min_pay}
                onChange={(e) => setDesigForm({ ...desigForm, min_pay: e.target.value })}
              />
            </div>
            <div>
              <Label>Max pay</Label>
              <Input
                type="number"
                value={desigForm.max_pay}
                onChange={(e) => setDesigForm({ ...desigForm, max_pay: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDesigOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveDesig.mutate()} disabled={!desigForm.title}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
