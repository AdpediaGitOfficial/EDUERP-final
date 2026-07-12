import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { apiFetch, apiGet, apiPost } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import {
  UserPlus,
  ClipboardCheck,
  BookOpenCheck,
  Mail,
  Phone,
  Eye,
  FileEdit,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  MessageSquare,
  Bus,
  GraduationCap,
  AlertTriangle,
  Plus,
  Star,
  Columns3,
  Upload,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/students/")({
  component: StudentsPage,
});

/**
 * Parents reach /students too (nav "My Children"); the API scopes GET /students
 * to their linked children, so they get a focused card view instead of the
 * full admin directory.
 */
function ParentChildrenList() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: children } = useQuery({
    queryKey: ["children", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>("/students?pageSize=50");
      return res.rows;
    },
  });

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const adm = String(fd.get("adm")).trim();
    try {
      await apiFetch("/students/link-parent", {
        method: "POST",
        body: JSON.stringify({ admissionNo: adm, parentId: user.id }),
      });
    } catch (err) {
      return toast.error(err instanceof Error ? err.message : "Could not link");
    }
    toast.success("Linked to child");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["children"] });
  };

  return (
    <AppShell>
      <PageHeader
        title="My Children"
        subtitle="Students linked to your account."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Link a child
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Link a child by admission number</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Admission number</Label>
                  <Input name="adm" required placeholder="ADM-2026-001" />
                </div>
                <Button type="submit" className="w-full">
                  Link
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(children ?? []).map((s: any) => (
          <Card key={s.id} className="p-5 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl bg-stat-indigo text-stat-indigo-foreground grid place-items-center">
                <GraduationCap className="size-5" />
              </div>
              <div>
                <div className="font-display font-semibold">{s.fullName}</div>
                <div className="text-xs text-muted-foreground">{s.admissionNo}</div>
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              {s.class ? `${s.class.name}${s.class.section ? ` · ${s.class.section}` : ""}` : "No class yet"}
            </div>
            <div className="mt-4 flex gap-2">
              <Link to="/students/$studentId/report" params={{ studentId: s.id }}>
                <Button size="sm">View full report</Button>
              </Link>
              <Link to="/students/$studentId" params={{ studentId: s.id }}>
                <Button variant="outline" size="sm">
                  Details
                </Button>
              </Link>
              <Link to="/fees">
                <Button variant="outline" size="sm">
                  Fees
                </Button>
              </Link>
            </div>
          </Card>
        ))}
        {(children ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No children linked yet.</p>
        )}
      </div>
    </AppShell>
  );
}

function StudentsPage() {
  const { user } = useCurrentUser();
  if (!user) return null;
  if (user.primaryRole === "parent") return <ParentChildrenList />;
  return <AdminStudentsList />;
}

function AdminStudentsList() {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const isTeacher = user?.primaryRole === "teacher";
  const isAdmin = user?.primaryRole === "admin";
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: assignedClassIds } = useQuery({
    enabled: !!user && isTeacher,
    queryKey: ["teacher-class-ids", user?.id],
    queryFn: async () => {
      const rows = await apiGet<{ classId: string }[]>(`/teachers/${user!.id}/classes`);
      return rows.map((r) => r.classId);
    },
  });

  const { data: classes } = useQuery({
    enabled: !!user,
    queryKey: ["all-classes", isTeacher ? assignedClassIds : "all"],
    queryFn: async () => {
      const all = await apiGet<any[]>("/classes");
      const rows = all.map((c) => ({ id: c.id, name: c.name, section: c.section }));
      if (isTeacher) {
        const set = new Set(assignedClassIds ?? []);
        return rows.filter((c) => set.has(c.id));
      }
      return rows;
    },
  });
  const { data: students } = useQuery({
    enabled: !!user && (!isTeacher || !!assignedClassIds),
    queryKey: ["students-list", isTeacher ? assignedClassIds : "all"],
    queryFn: async () => {
      if (isTeacher && (!assignedClassIds || assignedClassIds.length === 0)) return [];
      const res = await apiGet<{ rows: any[] }>("/students?pageSize=200");
      return res.rows.map((s) => ({
        id: s.id,
        admission_no: s.admissionNo,
        roll_no: s.rollNo,
        admission_date: s.admissionDate,
        gender: s.gender,
        profile_id: s.profile_id ?? null,
        class_id: s.class?.id ?? null,
        profiles: { full_name: s.fullName, email: s.email },
        classes: s.class ? { name: s.class.name, section: s.class.section } : null,
      }));
    },
  });

  const studentIds = useMemo(() => (students ?? []).map((s: any) => s.id), [students]);

  const { data: teacherExtras } = useQuery({
    enabled: isTeacher && studentIds.length > 0,
    queryKey: ["students-extras", studentIds.join(",")],
    queryFn: async () => {
      const res = await apiFetch("/students/row-extras", {
        method: "POST",
        body: JSON.stringify({ ids: studentIds }),
      });
      const data = res
        ? await res.json()
        : { attendance: {}, fees: {}, performance: {}, parent: {} };
      const attMap: Record<string, { total: number; present: number }> = data.attendance ?? {};
      const perfMap: Record<string, { got: number; max: number }> = data.performance ?? {};
      const feeMap: Record<string, string> = data.fees ?? {};
      const parentMap: Record<
        string,
        { name: string; phone: string | null; email: string | null; rel: string }
      > = data.parent ?? {};
      return { attMap, perfMap, feeMap, parentMap };
    },
  });

  const feeBadge = (s?: string) => {
    if (!s) return <Badge variant="secondary">—</Badge>;
    if (s === "paid")
      return <Badge className="bg-emerald-100 text-emerald-700 border-0">Paid</Badge>;
    if (s === "partial")
      return <Badge className="bg-amber-100 text-amber-700 border-0">Partial</Badge>;
    return <Badge className="bg-red-100 text-red-700 border-0">Pending</Badge>;
  };
  const perfLabel = (pct: number | null) => {
    if (pct == null) return { label: "—", cls: "text-muted-foreground" };
    if (pct >= 85) return { label: `${pct}% · A`, cls: "text-emerald-600" };
    if (pct >= 70) return { label: `${pct}% · B`, cls: "text-sky-600" };
    if (pct >= 55) return { label: `${pct}% · C`, cls: "text-amber-600" };
    return { label: `${pct}% · D`, cls: "text-red-600" };
  };
  const initials = (n?: string) =>
    (n ?? "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fullName = String(fd.get("fullName") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const rollNo = String(fd.get("roll") || "").trim();
    if (!fullName || !email) return toast.error("Name and email are required");
    if (!/^[\p{L}][\p{L}\s'.-]*\s+[\p{L}][\p{L}\s'.-]*$/u.test(fullName))
      return toast.error("Enter a real first and last name (e.g. Aarav Kumar)");
    setSaving(true);
    try {
      const res = await apiPost<{ admissionNo: string; tempPassword: string }>("/students/admit", {
        fullName,
        email,
        classId: classId || null,
        rollNo: rollNo || null,
        gender: (gender as "male" | "female" | "other") || null,
      });
      toast.success(
        `Admitted ${fullName} (${res.admissionNo}). Temp password: ${res.tempPassword}`,
      );
      setOpen(false);
      setClassId("");
      setGender("");
      qc.invalidateQueries({ queryKey: ["students-list"] });
      qc.invalidateQueries({ queryKey: ["admin-students"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to admit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Students"
        subtitle={
          isTeacher ? "Students in your assigned classes." : "Admitted students in the school."
        }
        action={
          isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="size-4" /> Admit student
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Admit student</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Full name</Label>
                      <Input name="fullName" required placeholder="e.g. Aarav Kumar" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <Input name="email" type="email" required placeholder="student@example.com" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Class</Label>
                    <Select value={classId} onValueChange={setClassId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a class" />
                      </SelectTrigger>
                      <SelectContent>
                        {(classes ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                            {c.section && ` · ${c.section}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Gender</Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Roll #</Label>
                      <Input name="roll" placeholder="01" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Admission number is auto-generated (<code>ADM-YYYY-#####</code>). A student
                    login is created and a temp password is shown after admission — share it with
                    the family.
                  </p>
                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? "Admitting…" : "Admit student"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />
      {isTeacher ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card className="rounded-2xl p-4">
              <div className="text-xs text-muted-foreground">Total Assigned</div>
              <div className="font-display text-2xl font-semibold">{(students ?? []).length}</div>
            </Card>
            {(classes ?? []).map((c: any) => {
              const cnt = (students ?? []).filter((s: any) => s.class_id === c.id).length;
              return (
                <Card key={c.id} className="rounded-2xl p-4">
                  <div className="text-xs text-muted-foreground">
                    {c.name}
                    {c.section && ` · ${c.section}`}
                  </div>
                  <div className="font-display text-2xl font-semibold">
                    {cnt}{" "}
                    <span className="text-xs font-normal text-muted-foreground">students</span>
                  </div>
                </Card>
              );
            })}
          </div>
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-muted-foreground text-left">
                  <tr>
                    <th className="p-3 font-medium">Roll</th>
                    <th className="p-3 font-medium">Student</th>
                    <th className="p-3 font-medium">Gender</th>
                    <th className="p-3 font-medium">Grade & Section</th>
                    <th className="p-3 font-medium">Attendance</th>
                    <th className="p-3 font-medium">Performance</th>
                    <th className="p-3 font-medium">Parent</th>
                    <th className="p-3 font-medium">Fee</th>
                    <th className="p-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(students ?? []).map((s: any) => {
                    const att = teacherExtras?.attMap[s.id];
                    const attPct =
                      att && att.total ? Math.round((att.present / att.total) * 100) : null;
                    const perf = teacherExtras?.perfMap[s.id];
                    const perfPct =
                      perf && perf.max ? Math.round((perf.got / perf.max) * 100) : null;
                    const pl = perfLabel(perfPct);
                    const parent = teacherExtras?.parentMap[s.id];
                    return (
                      <tr key={s.id} className="border-t hover:bg-muted/40">
                        <td className="p-3 font-medium text-muted-foreground">
                          {s.roll_no || "—"}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-8">
                              <AvatarFallback className="text-xs">
                                {initials(s.profiles?.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{s.profiles?.full_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {s.admission_no || "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 capitalize text-muted-foreground">{s.gender ?? "—"}</td>
                        <td className="p-3">
                          {s.classes?.name}
                          {s.classes?.section && ` · ${s.classes.section}`}
                        </td>
                        <td className="p-3">
                          {attPct == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={
                                attPct >= 90
                                  ? "text-emerald-600 font-medium"
                                  : attPct >= 75
                                    ? "text-amber-600 font-medium"
                                    : "text-red-600 font-medium"
                              }
                            >
                              {attPct}%
                            </span>
                          )}
                        </td>
                        <td className={`p-3 font-medium ${pl.cls}`}>{pl.label}</td>
                        <td className="p-3">
                          {parent ? (
                            <div>
                              <div className="text-sm">
                                {parent.name}{" "}
                                <span className="text-[10px] uppercase text-muted-foreground">
                                  · {parent.rel}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="size-3" /> {parent.phone ?? "—"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">{feeBadge(teacherExtras?.feeMap[s.id])}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              asChild
                              size="icon"
                              variant="ghost"
                              title="View profile"
                              aria-label={`View profile of ${s.full_name}`}
                            >
                              <Link to="/students/$studentId" params={{ studentId: s.id }}>
                                <Eye className="size-4" />
                              </Link>
                            </Button>
                            <Button
                              asChild
                              size="icon"
                              variant="ghost"
                              title="Mark attendance"
                              aria-label={`Mark attendance for ${s.full_name}`}
                            >
                              <Link to="/attendance">
                                <ClipboardCheck className="size-4" />
                              </Link>
                            </Button>
                            <Button
                              asChild
                              size="icon"
                              variant="ghost"
                              title="Enter marks"
                              aria-label={`Enter marks for ${s.full_name}`}
                            >
                              <Link to="/gradebook">
                                <BookOpenCheck className="size-4" />
                              </Link>
                            </Button>
                            <Button
                              asChild
                              size="icon"
                              variant="ghost"
                              title="Assign homework"
                              aria-label={`Assign homework to ${s.full_name}`}
                            >
                              <Link to="/gradebook">
                                <FileEdit className="size-4" />
                              </Link>
                            </Button>
                            <Button
                              asChild
                              size="icon"
                              variant="ghost"
                              title="Message parent"
                              aria-label={`Message parent of ${s.full_name}`}
                              disabled={!parent?.email}
                            >
                              <a href={parent?.email ? `mailto:${parent.email}` : "#"}>
                                <Mail className="size-4" />
                              </a>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(students ?? []).length === 0 && (
                    <EmptyRow
                      colSpan={9}
                      icon={GraduationCap}
                      title="No students in your assigned classes"
                      hint="Students from the classes you teach will appear here."
                    />
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <AdminStudentsView />
      )}
    </AppShell>
  );
}

// ============================================================================
// Admin students view: server-side search / filter / sort / paginate + bulk
// ============================================================================
type SortKey = "name" | "admission_no" | "class" | "admission_date";
type SortDir = "asc" | "desc";

// Toggleable columns for the admin students table (Student + Class stay fixed).
const COL_DEFS = [
  { key: "admission_no", label: "Admission #" },
  { key: "gender", label: "Gender" },
  { key: "status", label: "Status" },
  { key: "attendance", label: "Attendance" },
  { key: "fee", label: "Fee" },
  { key: "admitted", label: "Admitted" },
] as const;
const DEFAULT_COLS: Record<string, boolean> = Object.fromEntries(
  COL_DEFS.map((c) => [c.key, true]),
);

function AdminStudentsView() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [grade, setGrade] = useState<string>("all");
  const [section, setSection] = useState<string>("all");
  const [gender, setGender] = useState<string>("all");
  const [status, setStatus] = useState<string>("active");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("admission_date");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Column visibility (persisted).
  const [cols, setCols] = useState<Record<string, boolean>>(() => {
    try {
      const s = localStorage.getItem("students-cols");
      if (s) return { ...DEFAULT_COLS, ...JSON.parse(s) };
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_COLS };
  });
  useEffect(() => {
    try {
      localStorage.setItem("students-cols", JSON.stringify(cols));
    } catch {
      /* ignore */
    }
  }, [cols]);

  // Saved filter presets (persisted).
  const [savedFilters, setSavedFilters] = useState<{ name: string; f: any }[]>(() => {
    try {
      const s = localStorage.getItem("students-saved-filters");
      if (s) return JSON.parse(s);
    } catch {
      /* ignore */
    }
    return [];
  });
  const persistSaved = (next: { name: string; f: any }[]) => {
    setSavedFilters(next);
    try {
      localStorage.setItem("students-saved-filters", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const applyFilter = (f: any) => {
    setQ(f.q ?? "");
    setGrade(f.grade ?? "all");
    setSection(f.section ?? "all");
    setGender(f.gender ?? "all");
    setStatus(f.status ?? "active");
    setFromDate(f.fromDate ?? "");
    setToDate(f.toDate ?? "");
    setSort(f.sort ?? "admission_date");
    setDir(f.dir ?? "desc");
  };
  const saveCurrentFilter = () => {
    const name = window.prompt("Save this filter set as:");
    if (!name?.trim()) return;
    const f = { q, grade, section, gender, status, fromDate, toDate, sort, dir };
    persistSaved([...savedFilters.filter((s) => s.name !== name.trim()), { name: name.trim(), f }]);
    toast.success(`Saved filter "${name.trim()}"`);
  };

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    setSelectAllMatching(false);
  }, [qDebounced, grade, section, gender, status, fromDate, toDate, pageSize]);

  const params = useMemo(
    () => ({
      p_q: qDebounced || null,
      p_grade_name: grade === "all" ? null : grade,
      p_section: section === "all" ? null : section,
      p_gender: gender === "all" ? null : gender,
      p_status: status === "all" ? null : status,
      p_from_date: fromDate || null,
      p_to_date: toDate || null,
      p_sort: sort,
      p_dir: dir,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    }),
    [qDebounced, grade, section, gender, status, fromDate, toDate, sort, dir, page, pageSize],
  );

  const { data: result, isFetching } = useQuery({
    queryKey: ["admin-students", params],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params.p_q) qs.set("q", params.p_q);
      if (params.p_grade_name) qs.set("gradeName", params.p_grade_name);
      if (params.p_section) qs.set("section", params.p_section);
      if (params.p_gender) qs.set("gender", params.p_gender);
      if (params.p_status) qs.set("status", params.p_status);
      if (params.p_from_date) qs.set("fromDate", params.p_from_date);
      if (params.p_to_date) qs.set("toDate", params.p_to_date);
      qs.set("sort", params.p_sort);
      qs.set("dir", params.p_dir);
      qs.set("limit", String(params.p_limit));
      qs.set("offset", String(params.p_offset));
      return apiGet<{ total: number; rows: any[] }>(`/students/search?${qs.toString()}`);
    },
  });
  const rows = result?.rows;

  const total = result?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rowIds = useMemo(() => (rows ?? []).map((r) => r.id), [rows]);

  // Per-row attendance & fee status for current page
  const { data: extras } = useQuery({
    enabled: rowIds.length > 0,
    queryKey: ["admin-students-extras", rowIds.join(",")],
    queryFn: async () => {
      const res = await apiFetch("/students/row-extras", {
        method: "POST",
        body: JSON.stringify({ ids: rowIds }),
      });
      const data = res ? await res.json() : { attendance: {}, fees: {} };
      return { attMap: data.attendance ?? {}, feeMap: data.fees ?? {} };
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["all-classes-admin"],
    queryFn: async () => {
      const all = await apiGet<any[]>("/classes");
      return all.map((c) => ({ id: c.id, name: c.name, section: c.section }));
    },
  });
  const { data: routes } = useQuery({
    queryKey: ["all-transport-routes"],
    queryFn: async () =>
      (await apiGet<any[]>("/fleet/routes")).map((r) => ({ id: r.id, name: r.name })),
  });

  const gradeOptions = useMemo(() => {
    const set = new Set<string>();
    (classes ?? []).forEach((c: any) => set.add(c.name));
    return Array.from(set).sort();
  }, [classes]);
  const sectionOptions = useMemo(() => {
    const set = new Set<string>();
    (classes ?? []).forEach((c: any) => c.section && set.add(c.section));
    return Array.from(set).sort();
  }, [classes]);

  const toggleSort = (k: SortKey) => {
    if (sort === k) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      setDir("asc");
    }
  };
  const sortIcon = (k: SortKey) =>
    sort !== k ? (
      <ArrowUpDown className="size-3 opacity-40" />
    ) : dir === "asc" ? (
      <ArrowUp className="size-3" />
    ) : (
      <ArrowDown className="size-3" />
    );

  const feeBadge = (s?: string) => {
    if (!s) return <Badge variant="secondary">—</Badge>;
    if (s === "paid")
      return <Badge className="bg-emerald-100 text-emerald-700 border-0">Paid</Badge>;
    if (s === "partial")
      return <Badge className="bg-amber-100 text-amber-700 border-0">Partial</Badge>;
    return <Badge className="bg-red-100 text-red-700 border-0">Pending</Badge>;
  };
  const statusBadge = (s: string) => {
    if (s === "alumni")
      return <Badge className="bg-slate-100 text-slate-700 border-0">Alumni</Badge>;
    if (s === "inactive")
      return <Badge className="bg-zinc-100 text-zinc-600 border-0">Inactive</Badge>;
    return <Badge className="bg-emerald-50 text-emerald-700 border-0">Active</Badge>;
  };
  const initials = (n?: string) =>
    (n ?? "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("");

  const toggleRow = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setSelectAllMatching(false);
  };
  const allPageChecked = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const togglePage = () => {
    setSelected((s) => {
      const n = new Set(s);
      if (allPageChecked) rowIds.forEach((id) => n.delete(id));
      else rowIds.forEach((id) => n.add(id));
      return n;
    });
    setSelectAllMatching(false);
  };

  const selectionCount = selectAllMatching ? total : selected.size;

  const searchQS = (limit: number, offset: number) => {
    const qs = new URLSearchParams();
    if (params.p_q) qs.set("q", params.p_q);
    if (params.p_grade_name) qs.set("gradeName", params.p_grade_name);
    if (params.p_section) qs.set("section", params.p_section);
    if (params.p_gender) qs.set("gender", params.p_gender);
    if (params.p_status) qs.set("status", params.p_status);
    if (params.p_from_date) qs.set("fromDate", params.p_from_date);
    if (params.p_to_date) qs.set("toDate", params.p_to_date);
    qs.set("sort", params.p_sort);
    qs.set("dir", params.p_dir);
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    return qs.toString();
  };

  const fetchAllMatching = async (): Promise<any[]> => {
    const out: any[] = [];
    const chunk = 200; // API page cap
    for (let offset = 0; offset < total; offset += chunk) {
      const res = await apiGet<{ rows: any[] }>(`/students/search?${searchQS(chunk, offset)}`);
      out.push(...res.rows);
    }
    return out;
  };

  const fetchAllMatchingIds = async (): Promise<string[]> =>
    (await fetchAllMatching()).map((r) => r.id);

  const exportSelected = async () => {
    const matching = await fetchAllMatching();
    const selectedSet = selectAllMatching ? null : selected;
    const allRows = (selectedSet ? matching.filter((r) => selectedSet.has(r.id)) : matching).map(
      (r) => ({
        admission_no: r.admission_no,
        roll_no: r.roll_no,
        admission_date: r.admission_date,
        gender: r.gender,
        status: r.status,
        profiles: { full_name: r.full_name, email: r.email },
        classes: r.class_name ? { name: r.class_name, section: r.class_section } : null,
      }),
    );
    if (!allRows.length) return toast.error("Select at least one student");
    const header = [
      "Admission #",
      "Full Name",
      "Email",
      "Class",
      "Section",
      "Roll #",
      "Gender",
      "Status",
      "Admitted",
    ];
    const csv = [header.join(",")]
      .concat(
        allRows.map((r: any) =>
          [
            r.admission_no,
            `"${(r.profiles?.full_name ?? "").replace(/"/g, '""')}"`,
            r.profiles?.email ?? "",
            r.classes?.name ?? "",
            r.classes?.section ?? "",
            r.roll_no ?? "",
            r.gender ?? "",
            r.status,
            r.admission_date,
          ].join(","),
        ),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${allRows.length} students`);
  };

  const messageParents = async () => {
    const ids = selectAllMatching ? await fetchAllMatchingIds() : Array.from(selected);
    if (!ids.length) return toast.error("Select at least one student");
    // Hand off to Communication module with pre-filled recipient list
    try {
      sessionStorage.setItem("bulk-message-student-ids", JSON.stringify(ids));
    } catch {
      /* sessionStorage unavailable — proceed without prefill */
    }
    navigate({ to: "/communication" });
  };

  const clearFilters = () => {
    setQ("");
    setGrade("all");
    setSection("all");
    setGender("all");
    setStatus("active");
    setFromDate("");
    setToDate("");
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, admission #, or class…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Grade</Label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grades</SelectItem>
                {gradeOptions.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Section</Label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {sectionOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="alumni">Alumni</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Admitted from</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <Button variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
          <div className="text-xs text-muted-foreground">
            {isFetching ? (
              "Loading…"
            ) : (
              <>
                Showing{" "}
                <span className="font-medium text-foreground">
                  {from.toLocaleString()}–{to.toLocaleString()}
                </span>{" "}
                of <span className="font-medium text-foreground">{total.toLocaleString()}</span>{" "}
                students
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {savedFilters.length > 0 && (
              <Select
                value=""
                onValueChange={(name) => {
                  const found = savedFilters.find((s) => s.name === name);
                  if (found) applyFilter(found.f);
                }}
              >
                <SelectTrigger className="w-[150px] h-9">
                  <SelectValue placeholder="Saved filters" />
                </SelectTrigger>
                <SelectContent>
                  {savedFilters.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" onClick={saveCurrentFilter}>
              <Star className="size-4" /> Save filter
            </Button>
            <Button size="sm" variant="outline" onClick={() => setColsOpen(true)}>
              <Columns3 className="size-4" /> Columns
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> Import
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDupOpen(true)}>
              <AlertTriangle className="size-4" /> Duplicates
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPromoteOpen(true)}>
              <GraduationCap className="size-4" /> Promote grade
            </Button>
          </div>
        </div>

        {selectionCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-accent">
            <span className="text-sm font-medium">{selectionCount.toLocaleString()} selected</span>
            {!selectAllMatching &&
              selected.size >= rowIds.length &&
              rowIds.length > 0 &&
              total > rowIds.length && (
                <Button size="sm" variant="link" onClick={() => setSelectAllMatching(true)}>
                  Select all {total.toLocaleString()} matching
                </Button>
              )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={exportSelected}>
                <Download className="size-4" /> Export CSV
              </Button>
              <Button size="sm" variant="outline" onClick={messageParents}>
                <MessageSquare className="size-4" /> Message parents
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRouteOpen(true)}>
                <Bus className="size-4" /> Assign route
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelected(new Set());
                  setSelectAllMatching(false);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-left">
              <tr>
                <th className="p-3 w-10">
                  <Checkbox
                    checked={allPageChecked}
                    onCheckedChange={togglePage}
                    aria-label="Select page"
                  />
                </th>
                <th className="p-3 font-medium">
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort("name")}
                  >
                    Student {sortIcon("name")}
                  </button>
                </th>
                {cols.admission_no && (
                  <th className="p-3 font-medium">
                    <button
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("admission_no")}
                    >
                      Admission # {sortIcon("admission_no")}
                    </button>
                  </th>
                )}
                <th className="p-3 font-medium">
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort("class")}
                  >
                    Class {sortIcon("class")}
                  </button>
                </th>
                {cols.gender && <th className="p-3 font-medium">Gender</th>}
                {cols.status && <th className="p-3 font-medium">Status</th>}
                {cols.attendance && <th className="p-3 font-medium">Attendance</th>}
                {cols.fee && <th className="p-3 font-medium">Fee</th>}
                {cols.admitted && (
                  <th className="p-3 font-medium">
                    <button
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("admission_date")}
                    >
                      Admitted {sortIcon("admission_date")}
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r: any) => {
                const att = extras?.attMap[r.id];
                const attPct =
                  att && att.total ? Math.round((att.present / att.total) * 100) : null;
                const isChecked = selectAllMatching || selected.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className="border-t hover:bg-muted/40 cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
                      navigate({ to: "/students/$studentId", params: { studentId: r.id } });
                    }}
                  >
                    <td className="p-3" data-no-nav onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleRow(r.id)}
                        disabled={selectAllMatching}
                        aria-label={`Select ${r.full_name}`}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="text-xs">
                            {initials(r.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{r.full_name}</div>
                          <div className="text-xs text-muted-foreground">{r.email ?? "—"}</div>
                        </div>
                      </div>
                    </td>
                    {cols.admission_no && (
                      <td className="p-3 font-mono text-xs">{r.admission_no}</td>
                    )}
                    <td className="p-3">
                      {r.class_name ?? "—"}
                      {r.class_section && ` · ${r.class_section}`}
                    </td>
                    {cols.gender && (
                      <td className="p-3 capitalize text-muted-foreground">{r.gender ?? "—"}</td>
                    )}
                    {cols.status && <td className="p-3">{statusBadge(r.status)}</td>}
                    {cols.attendance && (
                      <td className="p-3">
                        {attPct == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={
                              attPct >= 90
                                ? "text-emerald-600 font-medium"
                                : attPct >= 75
                                  ? "text-amber-600 font-medium"
                                  : "text-red-600 font-medium"
                            }
                          >
                            {attPct}%
                          </span>
                        )}
                      </td>
                    )}
                    {cols.fee && <td className="p-3">{feeBadge(extras?.feeMap[r.id])}</td>}
                    {cols.admitted && (
                      <td className="p-3 text-muted-foreground">
                        {new Date(r.admission_date).toLocaleDateString()}
                      </td>
                    )}
                  </tr>
                );
              })}
              {(rows ?? []).length === 0 && !isFetching && (
                <EmptyRow
                  colSpan={9}
                  icon={GraduationCap}
                  title="No students match these filters"
                  hint="Try clearing the grade or status filter, or adjust your search."
                />
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t bg-muted/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(1)}>
              First
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <span className="text-xs px-2">
              Page {page} of {pageCount}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pageCount}
              onClick={() => setPage(pageCount)}
            >
              Last
            </Button>
          </div>
        </div>
      </Card>

      <PromoteDialog
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        classes={classes ?? []}
        onDone={() => qc.invalidateQueries({ queryKey: ["admin-students"] })}
      />
      <AssignRouteDialog
        open={routeOpen}
        onOpenChange={setRouteOpen}
        routes={routes ?? []}
        selectionCount={selectionCount}
        getStudentIds={async () =>
          selectAllMatching ? await fetchAllMatchingIds() : Array.from(selected)
        }
        onDone={() => {
          setSelected(new Set());
          setSelectAllMatching(false);
        }}
      />
      <DuplicatesDialog open={dupOpen} onOpenChange={setDupOpen} />

      {/* Column visibility */}
      <Dialog open={colsOpen} onOpenChange={setColsOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Columns</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {COL_DEFS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={cols[c.key]}
                  onCheckedChange={(v) => setCols((prev) => ({ ...prev, [c.key]: !!v }))}
                />
                {c.label}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCols({ ...DEFAULT_COLS })}>
              Reset
            </Button>
            <Button onClick={() => setColsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportStudentsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        classes={classes ?? []}
        onDone={() => qc.invalidateQueries({ queryKey: ["admin-students"] })}
      />
    </div>
  );
}

/** Parse a simple CSV (comma-separated, optional double-quoted fields). */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim().length);
  if (!lines.length) return [];
  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

const IMPORT_TEMPLATE =
  "firstName,lastName,className,section,gender,dob,guardianName,guardianPhone,guardianEmail\n" +
  "Aarav,Sharma,Grade 1,A,male,2019-05-12,Rakesh Sharma,+91 90000 00001,rakesh.sharma@example.com\n";

function ImportStudentsDialog({
  open,
  onOpenChange,
  classes,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  classes: { id: string; name: string; section?: string | null }[];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{
    ok: number;
    failed: { row: number; name: string; error: string }[];
  } | null>(null);

  const downloadTemplate = () => {
    const blob = new Blob([IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const resolveClass = (name: string, section: string) => {
    const n = name.trim().toLowerCase();
    const s = section.trim().toLowerCase();
    return (
      classes.find(
        (c) => c.name.toLowerCase() === n && (c.section ?? "").toLowerCase() === s,
      ) ?? classes.find((c) => c.name.toLowerCase() === n)
    );
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setResults(null);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) {
        toast.error("The CSV has no data rows.");
        return;
      }
      let ok = 0;
      const failed: { row: number; name: string; error: string }[] = [];
      const stamp = Date.now();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const first = r.firstname || r.first || "";
        const name = `${first} ${r.lastname ?? ""}`.trim();
        const cls = resolveClass(r.classname || r.class || "", r.section || "");
        if (!first) {
          failed.push({ row: i + 2, name: name || "(blank)", error: "Missing first name" });
          continue;
        }
        if (!cls) {
          failed.push({
            row: i + 2,
            name,
            error: `Unknown class "${r.classname || r.class || ""} ${r.section || ""}"`.trim(),
          });
          continue;
        }
        const email =
          r.guardianemail?.trim() ||
          `import.${stamp}.${i}@parent.greenwood.test`;
        try {
          await apiPost("/admissions/admit", {
            classId: cls.id,
            firstName: first,
            lastName: r.lastname || undefined,
            gender: ["male", "female", "other"].includes((r.gender || "").toLowerCase())
              ? (r.gender || "").toLowerCase()
              : undefined,
            dob: r.dob || undefined,
            parentMode: "new",
            primaryGuardian: "father",
            father: { name: r.guardianname || `${name} (Guardian)`, phone: r.guardianphone || undefined },
            parentLoginEmail: email,
          });
          ok += 1;
        } catch (err) {
          failed.push({ row: i + 2, name, error: err instanceof Error ? err.message : "Failed" });
        }
      }
      setResults({ ok, failed });
      if (ok) {
        toast.success(`Imported ${ok} student${ok === 1 ? "" : "s"}.`);
        onDone();
      }
      if (!ok && failed.length) toast.error("No rows imported — see the errors below.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import students from CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Upload a CSV with columns{" "}
            <code className="text-xs">
              firstName, lastName, className, section, gender, dob, guardianName, guardianPhone,
              guardianEmail
            </code>
            . Each row creates a student (and a new parent account) via the standard admission flow,
            so admission and roll numbers are assigned automatically.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={downloadTemplate}>
              <Download className="size-4" /> Download template
            </Button>
            <label>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onFile}
                disabled={busy}
              />
              <Button size="sm" asChild disabled={busy}>
                <span>
                  <Upload className="size-4" /> {busy ? "Importing…" : "Choose CSV"}
                </span>
              </Button>
            </label>
          </div>
          {results && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="font-medium">
                {results.ok} imported · {results.failed.length} failed
              </div>
              {results.failed.length > 0 && (
                <div className="max-h-48 overflow-y-auto text-xs space-y-1">
                  {results.failed.map((f, i) => (
                    <div key={i} className="text-red-600">
                      Row {f.row} ({f.name}): {f.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromoteDialog({
  open,
  onOpenChange,
  classes,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  classes: any[];
  onDone: () => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!from) {
      setPreview([]);
      return;
    }
    apiGet<{ rows: any[] }>(`/students/search?classId=${from}&status=active&limit=200`)
      .then((res) =>
        setPreview(
          res.rows.map((s) => ({
            id: s.id,
            admission_no: s.admission_no,
            profiles: { full_name: s.full_name },
          })),
        ),
      )
      .catch(() => setPreview([]));
  }, [from]);

  const submit = async () => {
    if (!from || !to) return toast.error("Pick both classes");
    if (from === to) return toast.error("From and To must differ");
    setBusy(true);
    try {
      const res = await apiPost<{ moved: number }>("/students/promote", {
        fromClassId: from,
        toClassId: to,
        exclude: Array.from(excluded),
      });
      toast.success(`Promoted ${res.moved} students`);
      onDone();
      onOpenChange(false);
      setFrom("");
      setTo("");
      setExcluded(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promotion failed");
    } finally {
      setBusy(false);
    }
  };

  const classLabel = (c: any) => `${c.name}${c.section ? ` · ${c.section}` : ""}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk promote students</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>From class</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger>
                <SelectValue placeholder="Select current class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {classLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>To class</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger>
                <SelectValue placeholder="Select next class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {classLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {preview.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">
              {preview.length} active students will be promoted. Uncheck to hold back:
            </div>
            <div className="max-h-64 overflow-y-auto border rounded-lg p-2 space-y-1">
              {preview.map((s: any) => {
                const held = excluded.has(s.id);
                return (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={!held}
                      onCheckedChange={() =>
                        setExcluded((ex) => {
                          const n = new Set(ex);
                          if (held) n.delete(s.id);
                          else n.add(s.id);
                          return n;
                        })
                      }
                    />
                    <span className="font-mono text-xs text-muted-foreground w-32">
                      {s.admission_no}
                    </span>
                    <span>{s.profiles?.full_name}</span>
                  </label>
                );
              })}
            </div>
            <div className="text-xs text-muted-foreground">
              Holding back {excluded.size} student(s)
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !from || !to}>
            {busy ? "Promoting…" : `Promote ${preview.length - excluded.size} students`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignRouteDialog({
  open,
  onOpenChange,
  routes,
  selectionCount,
  getStudentIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  routes: any[];
  selectionCount: number;
  getStudentIds: () => Promise<string[]>;
  onDone: () => void;
}) {
  const [routeId, setRouteId] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!routeId) return toast.error("Pick a route");
    setBusy(true);
    try {
      const ids = await getStudentIds();
      if (!ids.length) throw new Error("No students selected");
      const res = await apiPost<{ assigned: number }>("/students/bulk-assign-route", {
        routeId,
        studentIds: ids,
      });
      toast.success(`Assigned ${res.assigned} students to route`);
      onDone();
      onOpenChange(false);
      setRouteId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign {selectionCount} students to a transport route</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Route</Label>
          <Select value={routeId} onValueChange={setRouteId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a route" />
            </SelectTrigger>
            <SelectContent>
              {routes.map((r: any) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !routeId}>
            {busy ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DuplicatesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: dups, isFetching } = useQuery({
    enabled: open,
    queryKey: ["student-duplicates"],
    queryFn: () => apiGet<any[]>("/students/duplicates"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Possible duplicate students</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {isFetching && <div className="text-sm text-muted-foreground p-4">Scanning…</div>}
          {!isFetching && (dups ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground p-4">No duplicates found by name.</div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-left">
              <tr>
                <th className="p-2 font-medium">Name</th>
                <th className="p-2 font-medium">Occurrences</th>
                <th className="p-2 font-medium">Student IDs</th>
              </tr>
            </thead>
            <tbody>
              {(dups ?? []).map((d: any, i: number) => (
                <tr key={i} className="border-t">
                  <td className="p-2 font-medium">{d.full_name}</td>
                  <td className="p-2">{d.count}</td>
                  <td className="p-2 text-xs font-mono text-muted-foreground truncate max-w-[240px]">
                    {(d.student_ids ?? []).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
