import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Download, Plus, Pencil, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { badgeClass, downloadCsv, fmtDate, niceLabel } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/hr/staff/")({ component: Page });

type StaffRow = any;

const EMPTY = {
  employee_code: "",
  full_name: "",
  email: "",
  phone: "",
  department: "",
  designation: "",
  employment_type: "full_time",
  join_date: new Date().toISOString().slice(0, 10),
  status: "active",
  confirmation_status: "probation",
};

function Page() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);

  const { data } = useQuery({
    queryKey: ["hr-staff-list"],
    queryFn: () => apiGet<any[]>("/hr/staff"),
  });
  const { data: depts } = useQuery({
    queryKey: ["depts-simple"],
    queryFn: () => apiGet<any[]>("/hr/departments"),
  });
  const { data: desigs } = useQuery({
    queryKey: ["desigs-simple"],
    queryFn: () => apiGet<any[]>("/hr/designations"),
  });
  const { data: employmentTypes } = useQuery({
    queryKey: ["hr-employment-types"],
    queryFn: () => apiGet<{ id: string; name: string; code: string }[]>("/hr/employment-types"),
  });

  const filtered = (data ?? []).filter((s: any) => {
    if (deptFilter !== "all" && s.department !== deptFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (!q) return true;
    const t = q.toLowerCase();
    return (
      s.full_name.toLowerCase().includes(t) ||
      s.employee_code.toLowerCase().includes(t) ||
      (s.department ?? "").toLowerCase().includes(t) ||
      (s.designation ?? "").toLowerCase().includes(t)
    );
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = editing
        ? await apiFetch(`/hr/staff/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify(form),
          })
        : await apiFetch("/hr/staff", { method: "POST", body: JSON.stringify(form) });
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => null) : null;
        throw new Error(body?.message ?? "Could not save employee");
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Employee updated" : "Employee added");
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      qc.invalidateQueries({ queryKey: ["hr-staff-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async (s: StaffRow) => {
      const next = s.status === "active" ? "inactive" : "active";
      const res = await apiFetch(`/hr/staff/${s.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => null) : null;
        throw new Error(body?.message ?? "Could not update status");
      }
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["hr-staff-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (s: StaffRow) => {
    setEditing(s);
    setForm({
      employee_code: s.employee_code,
      full_name: s.full_name,
      email: s.email ?? "",
      phone: s.phone ?? "",
      department: s.department,
      designation: s.designation,
      employment_type: s.employment_type,
      join_date: s.join_date,
      status: s.status,
      confirmation_status: s.confirmation_status ?? "probation",
    });
    setOpen(true);
  };

  const exportCsv = () =>
    downloadCsv(
      filtered.map((s: any) => ({
        code: s.employee_code,
        name: s.full_name,
        email: s.email,
        phone: s.phone,
        department: s.department,
        designation: s.designation,
        join_date: s.join_date,
        status: s.status,
      })),
      `staff-${new Date().toISOString().slice(0, 10)}`,
    );

  const deptNames = Array.from(
    new Set([
      ...(depts ?? []).map((d: any) => d.name),
      ...(data ?? []).map((s: any) => s.department),
    ]),
  );

  return (
    <>
      <PageHeader
        title="Staff Directory"
        subtitle="All employees across departments."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="size-4 mr-1" />
              Export CSV
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="size-4 mr-1" />
              Add employee
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Search by name, code, department or designation…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {deptNames.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_leave">On leave</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3 font-medium">Code</th>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Department</th>
                <th className="p-3 font-medium">Designation</th>
                <th className="p-3 font-medium">Join date</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any) => (
                <tr key={s.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{s.employee_code}</td>
                  <td className="p-3">
                    <Link
                      to="/hr/staff/$staffId"
                      params={{ staffId: s.id }}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {s.full_name}
                    </Link>
                  </td>
                  <td className="p-3">{s.department}</td>
                  <td className="p-3">{s.designation}</td>
                  <td className="p-3">{fmtDate(s.join_date)}</td>
                  <td className="p-3">
                    <Badge className={badgeClass(s.status)}>{niceLabel(s.status)}</Badge>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(s)}
                      title="Edit"
                      aria-label={`Edit ${s.full_name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => toggleStatus.mutate(s)}
                      title={s.status === "active" ? "Deactivate" : "Reactivate"}
                      aria-label={`${s.status === "active" ? "Deactivate" : "Reactivate"} ${s.full_name}`}
                    >
                      {s.status === "active" ? (
                        <UserX className="size-4 text-red-600" />
                      ) : (
                        <UserCheck className="size-4 text-emerald-600" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <EmptyRow
                  colSpan={7}
                  title="No staff match your search"
                  hint="Try a different name, department, or status."
                />
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit employee" : "Add employee"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <Label>Employee code</Label>
              <Input
                value={form.employee_code}
                onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
              />
            </div>
            <div>
              <Label>Full name</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Department</Label>
              <Select
                value={form.department}
                onValueChange={(v) => setForm({ ...form, department: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {deptNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Designation</Label>
              <Select
                value={form.designation}
                onValueChange={(v) => setForm({ ...form, designation: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {(desigs ?? []).map((d: any) => (
                    <SelectItem key={d.title} value={d.title}>
                      {d.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Employment type</Label>
              <Select
                value={form.employment_type}
                onValueChange={(v) => setForm({ ...form, employment_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(employmentTypes ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.code}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Join date</Label>
              <Input
                type="date"
                value={form.join_date}
                onChange={(e) => setForm({ ...form, join_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_leave">On leave</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Confirmation</Label>
              <Select
                value={form.confirmation_status}
                onValueChange={(v) => setForm({ ...form, confirmation_status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="probation">Probation</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="notice">Notice</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={
                !form.employee_code || !form.full_name || !form.department || !form.designation
              }
            >
              {editing ? "Save changes" : "Create employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
