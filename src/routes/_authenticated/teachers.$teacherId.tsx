import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { badgeClass, fmtDate, fmtDateTime, money, niceLabel, downloadCsv } from "@/lib/module-util";
import { Download, Printer, Mail, Phone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/teachers/$teacherId")({
  component: () => (
    <RequireRole roles={["admin", "hr"]}>
      <TeacherDetailPage />
    </RequireRole>
  ),
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground truncate">{label}</div>
      <div className="font-medium break-words">{value ?? "—"}</div>
    </div>
  );
}

function Empty({ colSpan, msg }: { colSpan: number; msg: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-6 text-center text-muted-foreground text-sm">
        {msg}
      </td>
    </tr>
  );
}

function TeacherDetailPage() {
  const { teacherId } = Route.useParams();

  const { data: teacher } = useQuery({
    queryKey: ["teacher", teacherId],
    queryFn: async () =>
      (await supabase.from("teachers").select("*").eq("id", teacherId).maybeSingle()).data,
  });

  const staffId = teacher?.staff_id ?? null;

  const { data: staff } = useQuery({
    enabled: !!staffId,
    queryKey: ["teacher-staff", staffId],
    queryFn: async () =>
      (await supabase.from("staff").select("*").eq("id", staffId!).maybeSingle()).data,
  });

  const profileId = staff?.profile_id ?? null;

  const { data: qualifications } = useQuery({
    queryKey: ["teacher-quals", teacherId],
    queryFn: async () =>
      (
        await supabase
          .from("teacher_qualifications")
          .select("*")
          .eq("teacher_id", teacherId)
          .order("year", { ascending: false })
      ).data ?? [],
  });
  const { data: experience } = useQuery({
    queryKey: ["teacher-exp", teacherId],
    queryFn: async () =>
      (
        await supabase
          .from("teacher_experience")
          .select("*")
          .eq("teacher_id", teacherId)
          .order("start_date", { ascending: false })
      ).data ?? [],
  });
  const { data: classes } = useQuery({
    enabled: !!profileId,
    queryKey: ["teacher-classes", profileId],
    queryFn: async () =>
      (
        await supabase
          .from("teacher_classes")
          .select("id, class_id, classes(id,name,section,academic_year)")
          .eq("teacher_id", profileId!)
      ).data ?? [],
  });
  const classIds = (classes ?? []).map((c: any) => c.class_id);
  const { data: timetable } = useQuery({
    enabled: !!profileId,
    queryKey: ["teacher-timetable", profileId],
    queryFn: async () =>
      (
        await supabase
          .from("timetable")
          .select("*, classes(name,section), subjects(name,code)")
          .eq("teacher_id", profileId!)
          .order("day_of_week")
      ).data ?? [],
  });
  const { data: homework } = useQuery({
    enabled: !!profileId,
    queryKey: ["teacher-homework", profileId],
    queryFn: async () =>
      (
        await supabase
          .from("homework")
          .select("*, classes(name,section), subjects(name)")
          .eq("teacher_id", profileId!)
          .order("assigned_date", { ascending: false })
      ).data ?? [],
  });
  const { data: exams } = useQuery({
    enabled: classIds.length > 0,
    queryKey: ["teacher-exams", classIds.join(",")],
    queryFn: async () =>
      (
        await supabase
          .from("exams")
          .select("*, classes(name,section), subjects(name), exam_results(id,marks_obtained,grade)")
          .in("class_id", classIds)
          .order("exam_date", { ascending: false })
      ).data ?? [],
  });
  const { data: attendance } = useQuery({
    queryKey: ["teacher-att", teacherId],
    queryFn: async () =>
      (
        await supabase
          .from("teacher_attendance")
          .select("*")
          .eq("teacher_id", teacherId)
          .order("date", { ascending: false })
          .limit(60)
      ).data ?? [],
  });
  const { data: reviews } = useQuery({
    queryKey: ["teacher-reviews", teacherId],
    queryFn: async () =>
      (
        await supabase
          .from("teacher_performance_reviews")
          .select("*, profiles!teacher_performance_reviews_reviewer_id_fkey(full_name)")
          .eq("teacher_id", teacherId)
          .order("period", { ascending: false })
      ).data ?? [],
  });

  // Staff-scoped data
  const { data: payroll } = useQuery({
    enabled: !!staffId,
    queryKey: ["teacher-payroll", staffId],
    queryFn: async () =>
      (
        await supabase
          .from("payroll_runs")
          .select("*")
          .eq("staff_id", staffId!)
          .order("month", { ascending: false })
      ).data ?? [],
  });
  const { data: leaves } = useQuery({
    enabled: !!staffId,
    queryKey: ["teacher-leaves", staffId],
    queryFn: async () =>
      (
        await supabase
          .from("leave_requests")
          .select("*")
          .eq("staff_id", staffId!)
          .order("start_date", { ascending: false })
      ).data ?? [],
  });
  const { data: docs } = useQuery({
    enabled: !!staffId,
    queryKey: ["teacher-docs", staffId],
    queryFn: async () =>
      (
        await supabase
          .from("staff_documents")
          .select("*")
          .eq("staff_id", staffId!)
          .order("uploaded_at", { ascending: false })
      ).data ?? [],
  });
  const { data: history } = useQuery({
    enabled: !!staffId,
    queryKey: ["teacher-history", staffId],
    queryFn: async () =>
      (
        await supabase
          .from("staff_employment_history")
          .select("*")
          .eq("staff_id", staffId!)
          .order("effective_date", { ascending: false })
      ).data ?? [],
  });
  const { data: assets } = useQuery({
    enabled: !!profileId,
    queryKey: ["teacher-assets", profileId],
    queryFn: async () =>
      (
        await supabase
          .from("assets")
          .select("id,asset_code,name,category,status,condition,updated_at")
          .eq("assigned_to_profile_id", profileId!)
      ).data ?? [],
  });
  const { data: training } = useQuery({
    enabled: !!staffId,
    queryKey: ["teacher-training", staffId],
    queryFn: async () =>
      (
        await supabase
          .from("training_attendance")
          .select("*, training_programs(name,start_date,end_date,provider)")
          .eq("staff_id", staffId!)
      ).data ?? [],
  });
  const { data: announcements } = useQuery({
    enabled: !!profileId,
    queryKey: ["teacher-announcements", profileId],
    queryFn: async () =>
      (
        await supabase
          .from("announcements")
          .select("id,title,body,audience,created_at,class_id")
          .eq("author_id", profileId!)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  if (!teacher) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">Loading teacher…</div>
      </AppShell>
    );
  }

  const attStats = (() => {
    const list = attendance ?? [];
    const total = list.length || 1;
    const p = list.filter((a: any) => a.status === "present").length;
    const a = list.filter((a: any) => a.status === "absent").length;
    const l = list.filter((a: any) => a.status === "late").length;
    return { p, a, l, pct: Math.round((p / total) * 100) };
  })();

  const leaveBalance = (() => {
    const list = leaves ?? [];
    const approved = list.filter((l: any) => l.status === "approved");
    const used = approved.reduce((s: number, l: any) => s + (l.days ?? 0), 0);
    const pending = list.filter((l: any) => l.status === "pending").length;
    return { used, pending, total: 24, remaining: Math.max(0, 24 - used) };
  })();

  return (
    <AppShell>
      <div className="mb-4">
        <Link to="/teachers" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to teachers
        </Link>
      </div>
      <PageHeader
        title={teacher.full_name}
        subtitle={`${staff?.designation ?? "Teacher"} · ${staff?.department ?? teacher.subject} · ${staff?.employee_code ?? teacher.id.slice(0, 8)}`}
        action={
          <div className="flex items-center gap-2">
            <Badge className={badgeClass(teacher.status)}>{niceLabel(teacher.status)}</Badge>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="size-4 mr-1" />
              Print
            </Button>
          </div>
        }
      />

      {/* Overview header card */}
      <Card className="rounded-2xl p-4 sm:p-6 mb-6 flex flex-col md:flex-row gap-6">
        <div className="flex items-center gap-4 min-w-0">
          {staff?.photo_url ? (
            <img
              src={staff.photo_url}
              alt={teacher.full_name}
              className="size-20 sm:size-24 rounded-2xl object-cover shrink-0"
            />
          ) : (
            <div className="size-20 sm:size-24 shrink-0 rounded-2xl bg-primary/10 text-primary grid place-items-center text-2xl font-semibold">
              {initials(teacher.full_name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold truncate">{teacher.full_name}</div>
            <div className="text-sm text-muted-foreground truncate">
              {staff?.designation ?? "Teacher"}
            </div>
            <div className="text-xs text-muted-foreground mt-1 truncate">
              Code · {staff?.employee_code ?? teacher.id.slice(0, 8)}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                <Mail className="size-3 shrink-0" />{" "}
                <span className="truncate">{teacher.email}</span>
              </span>
              {teacher.phone && (
                <span className="inline-flex items-center gap-1 shrink-0">
                  <Phone className="size-3" /> {teacher.phone}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 min-w-0 text-sm">
          <Field label="Subject" value={<Badge variant="secondary">{teacher.subject}</Badge>} />
          <Field label="Experience" value={`${teacher.experience_years} yrs`} />
          <Field label="Joined" value={fmtDate(teacher.joined_date)} />
          <Field label="Qualification" value={teacher.qualification} />
          <Field label="Classes" value={(classes ?? []).length} />
          <Field label="Attendance" value={`${attStats.pct}%`} />
          <Field label="Leaves used" value={`${leaveBalance.used}/${leaveBalance.total}`} />
          <Field label="Rating" value={reviews?.[0]?.rating ? `${reviews[0].rating}/5` : "—"} />
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="timetable">Timetable</TabsTrigger>
          <TabsTrigger value="academics">Academics</TabsTrigger>
          <TabsTrigger value="homework">Homework</TabsTrigger>
          <TabsTrigger value="exams">Exams</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="communication">Communication</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="pt-4">
          <Card className="p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <Field label="Employee ID" value={staff?.employee_code ?? "—"} />
            <Field label="Staff Code" value={teacher.id.slice(0, 8)} />
            <Field label="Full name" value={teacher.full_name} />
            <Field label="Designation" value={staff?.designation ?? "Teacher"} />
            <Field label="Department" value={staff?.department ?? "—"} />
            <Field label="Qualification" value={teacher.qualification ?? "—"} />
            <Field label="Experience" value={`${teacher.experience_years} yrs`} />
            <Field
              label="Employment status"
              value={
                <Badge className={badgeClass(teacher.status)}>{niceLabel(teacher.status)}</Badge>
              }
            />
            <Field label="Joining date" value={fmtDate(teacher.joined_date)} />
            <Field label="Email" value={teacher.email} />
            <Field label="Phone" value={teacher.phone ?? "—"} />
            <Field
              label="Reporting manager"
              value={staff?.reporting_manager_id ? staff.reporting_manager_id.slice(0, 8) : "—"}
            />
          </Card>
        </TabsContent>

        {/* PERSONAL */}
        <TabsContent value="personal" className="pt-4">
          <Card className="p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <Field label="Date of birth" value={fmtDate(staff?.dob)} />
            <Field label="Blood group" value={staff?.blood_group ?? "—"} />
            <Field label="Address" value={staff?.address ?? "—"} />
            <Field
              label="Emergency contact"
              value={
                staff?.emergency_contact
                  ? `${(staff.emergency_contact as any).name} · ${(staff.emergency_contact as any).phone}`
                  : "—"
              }
            />
            <Field
              label="Medical info"
              value={staff?.medical_info ? JSON.stringify(staff.medical_info) : "—"}
            />
            <Field label="Skills" value={(staff?.skills ?? []).join(", ") || "—"} />
          </Card>
        </TabsContent>

        {/* EMPLOYMENT */}
        <TabsContent value="employment" className="pt-4 space-y-4">
          <Card className="p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <Field label="Department" value={staff?.department ?? "—"} />
            <Field label="Designation" value={staff?.designation ?? "—"} />
            <Field label="Employment type" value={staff ? niceLabel(staff.employment_type) : "—"} />
            <Field
              label="Confirmation"
              value={staff ? niceLabel(staff.confirmation_status) : "—"}
            />
            <Field label="Probation end" value={fmtDate(staff?.probation_end_date)} />
            <Field label="Join date" value={fmtDate(staff?.join_date)} />
          </Card>
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b font-medium text-sm">Promotion & transfer history</div>
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
                      <td className="p-3 text-xs text-muted-foreground">{h.notes ?? "—"}</td>
                    </tr>
                  ))}
                  {(history ?? []).length === 0 && <Empty colSpan={5} msg="No history records." />}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b font-medium text-sm">Prior experience</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Employer</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">From</th>
                    <th className="p-3">To</th>
                  </tr>
                </thead>
                <tbody>
                  {(experience ?? []).map((e: any) => (
                    <tr key={e.id} className="border-t">
                      <td className="p-3">{e.employer}</td>
                      <td className="p-3">{e.role ?? "—"}</td>
                      <td className="p-3">{fmtDate(e.start_date)}</td>
                      <td className="p-3">{fmtDate(e.end_date)}</td>
                    </tr>
                  ))}
                  {(experience ?? []).length === 0 && (
                    <Empty colSpan={4} msg="No prior experience recorded." />
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b font-medium text-sm">Qualifications</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Degree</th>
                    <th className="p-3">Institution</th>
                    <th className="p-3">Year</th>
                    <th className="p-3">Certification</th>
                  </tr>
                </thead>
                <tbody>
                  {(qualifications ?? []).map((q: any) => (
                    <tr key={q.id} className="border-t">
                      <td className="p-3">{q.degree}</td>
                      <td className="p-3">{q.institution ?? "—"}</td>
                      <td className="p-3">{q.year ?? "—"}</td>
                      <td className="p-3">{q.certification ?? "—"}</td>
                    </tr>
                  ))}
                  {(qualifications ?? []).length === 0 && (
                    <Empty colSpan={4} msg="No qualifications recorded." />
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* PAYROLL */}
        <TabsContent value="payroll" className="pt-4 space-y-4">
          <Card className="p-6 rounded-2xl grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Field label="Latest month" value={payroll?.[0] ? fmtDate(payroll[0].month) : "—"} />
            <Field label="Latest net" value={payroll?.[0] ? money(payroll[0].net_salary) : "—"} />
            <Field
              label="Bank"
              value={staff?.bank_details ? `${(staff.bank_details as any).bank}` : "—"}
            />
            <Field
              label="Account"
              value={staff?.bank_details ? `${(staff.bank_details as any).account}` : "—"}
            />
          </Card>
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-medium text-sm">Payroll history</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadCsv(payroll ?? [], `payroll-${teacher.full_name}`)}
              >
                <Download className="size-4 mr-1" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Month</th>
                    <th className="p-3">Base</th>
                    <th className="p-3">Allowances</th>
                    <th className="p-3">Deductions</th>
                    <th className="p-3">Overtime</th>
                    <th className="p-3">Net</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(payroll ?? []).map((p: any) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-3">{fmtDate(p.month)}</td>
                      <td className="p-3">{money(p.base_salary)}</td>
                      <td className="p-3">{money(p.allowances)}</td>
                      <td className="p-3">{money(p.deductions)}</td>
                      <td className="p-3">{money((p as any).overtime ?? 0)}</td>
                      <td className="p-3 font-medium">{money(p.net_salary)}</td>
                      <td className="p-3">
                        <Badge className={badgeClass(p.status)}>{niceLabel(p.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                  {(payroll ?? []).length === 0 && <Empty colSpan={7} msg="No payroll records." />}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ATTENDANCE */}
        <TabsContent value="attendance" className="pt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold text-emerald-600">{attStats.p}</div>
              <div className="text-xs text-muted-foreground">Present</div>
            </Card>
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold text-red-600">{attStats.a}</div>
              <div className="text-xs text-muted-foreground">Absent</div>
            </Card>
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold text-amber-600">{attStats.l}</div>
              <div className="text-xs text-muted-foreground">Late</div>
            </Card>
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold">{attStats.pct}%</div>
              <div className="text-xs text-muted-foreground">Attendance rate</div>
            </Card>
          </div>
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-medium text-sm">Daily attendance (last 60)</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadCsv(attendance ?? [], `attendance-${teacher.full_name}`)}
              >
                <Download className="size-4 mr-1" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Date</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(attendance ?? []).map((a: any) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3">{fmtDate(a.date)}</td>
                      <td className="p-3">
                        <Badge className={badgeClass(a.status)}>{niceLabel(a.status)}</Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{a.notes ?? "—"}</td>
                    </tr>
                  ))}
                  {(attendance ?? []).length === 0 && (
                    <Empty colSpan={3} msg="No attendance records." />
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* LEAVE */}
        <TabsContent value="leave" className="pt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold">{leaveBalance.remaining}</div>
              <div className="text-xs text-muted-foreground">Balance remaining</div>
            </Card>
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold">{leaveBalance.used}</div>
              <div className="text-xs text-muted-foreground">Days used</div>
            </Card>
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold text-amber-600">{leaveBalance.pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </Card>
            <Card className="p-5 rounded-2xl">
              <div className="text-2xl font-semibold">{leaveBalance.total}</div>
              <div className="text-xs text-muted-foreground">Annual entitlement</div>
            </Card>
          </div>
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
                  {(leaves ?? []).map((l: any) => (
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
                  {(leaves ?? []).length === 0 && <Empty colSpan={5} msg="No leave records." />}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TIMETABLE */}
        <TabsContent value="timetable" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b font-medium text-sm">Weekly timetable</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Day</th>
                    <th className="p-3">Time</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Room</th>
                  </tr>
                </thead>
                <tbody>
                  {(timetable ?? []).map((t: any) => (
                    <tr key={t.id} className="border-t">
                      <td className="p-3">{DAYS[t.day_of_week] ?? t.day_of_week}</td>
                      <td className="p-3">
                        {t.start_time?.slice(0, 5)} – {t.end_time?.slice(0, 5)}
                      </td>
                      <td className="p-3">
                        {t.classes
                          ? `${t.classes.name}${t.classes.section ? " · " + t.classes.section : ""}`
                          : "—"}
                      </td>
                      <td className="p-3">{t.subjects?.name ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{t.room ?? "—"}</td>
                    </tr>
                  ))}
                  {(timetable ?? []).length === 0 && (
                    <Empty colSpan={5} msg="No timetable entries." />
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ACADEMICS: classes + subjects + class-teacher */}
        <TabsContent value="academics" className="pt-4 space-y-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b font-medium text-sm">Assigned classes & sections</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Class</th>
                    <th className="p-3">Section</th>
                    <th className="p-3">Academic year</th>
                  </tr>
                </thead>
                <tbody>
                  {(classes ?? []).map((c: any) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-3">{c.classes?.name ?? "—"}</td>
                      <td className="p-3">{c.classes?.section ?? "—"}</td>
                      <td className="p-3">{c.classes?.academic_year ?? "—"}</td>
                    </tr>
                  ))}
                  {(classes ?? []).length === 0 && <Empty colSpan={3} msg="No classes assigned." />}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="p-6 rounded-2xl text-sm">
            <div className="text-xs text-muted-foreground mb-1">Primary teaching subject</div>
            <Badge variant="secondary" className="text-base">
              {teacher.subject}
            </Badge>
          </Card>
        </TabsContent>

        {/* HOMEWORK */}
        <TabsContent value="homework" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-medium text-sm">Homework & assignments</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadCsv(
                    (homework ?? []).map((h: any) => ({
                      title: h.title,
                      class: h.classes?.name,
                      subject: h.subjects?.name,
                      assigned: h.assigned_date,
                      due: h.due_date,
                      status: h.status,
                    })),
                    `homework-${teacher.full_name}`,
                  )
                }
              >
                <Download className="size-4 mr-1" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Title</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Assigned</th>
                    <th className="p-3">Due</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(homework ?? []).map((h: any) => (
                    <tr key={h.id} className="border-t">
                      <td className="p-3">{h.title}</td>
                      <td className="p-3">{h.classes?.name ?? "—"}</td>
                      <td className="p-3">{h.subjects?.name ?? "—"}</td>
                      <td className="p-3">{fmtDate(h.assigned_date)}</td>
                      <td className="p-3">{fmtDate(h.due_date)}</td>
                      <td className="p-3">
                        <Badge className={badgeClass(h.status)}>{niceLabel(h.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                  {(homework ?? []).length === 0 && (
                    <Empty colSpan={6} msg="No homework assigned yet." />
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* EXAMS */}
        <TabsContent value="exams" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b font-medium text-sm">Exams for assigned classes</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Exam</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Max</th>
                    <th className="p-3">Results</th>
                  </tr>
                </thead>
                <tbody>
                  {(exams ?? []).map((e: any) => {
                    const results = e.exam_results ?? [];
                    const avg = results.length
                      ? Math.round(
                          results.reduce((s: number, r: any) => s + (r.marks_obtained ?? 0), 0) /
                            results.length,
                        )
                      : 0;
                    return (
                      <tr key={e.id} className="border-t">
                        <td className="p-3">{e.name}</td>
                        <td className="p-3">{e.classes?.name ?? "—"}</td>
                        <td className="p-3">{e.subjects?.name ?? "—"}</td>
                        <td className="p-3">{fmtDate(e.exam_date)}</td>
                        <td className="p-3">{e.max_marks}</td>
                        <td className="p-3 text-muted-foreground">
                          {results.length ? `${results.length} scored · avg ${avg}` : "Pending"}
                        </td>
                      </tr>
                    );
                  })}
                  {(exams ?? []).length === 0 && (
                    <Empty colSpan={6} msg="No exams for assigned classes." />
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* PERFORMANCE */}
        <TabsContent value="performance" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b font-medium text-sm">Performance reviews</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Period</th>
                    <th className="p-3">Rating</th>
                    <th className="p-3">Reviewer</th>
                    <th className="p-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(reviews ?? []).map((r: any) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">{r.period}</td>
                      <td className="p-3 font-medium">{r.rating}/5</td>
                      <td className="p-3">{r.profiles?.full_name ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{r.notes ?? "—"}</td>
                    </tr>
                  ))}
                  {(reviews ?? []).length === 0 && <Empty colSpan={4} msg="No reviews yet." />}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* DOCUMENTS */}
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
                  {(docs ?? []).map((d: any) => (
                    <tr key={d.id} className="border-t">
                      <td className="p-3">{niceLabel(d.doc_type)}</td>
                      <td className="p-3">{d.title}</td>
                      <td className="p-3">{fmtDate(d.uploaded_at)}</td>
                      <td className="p-3">{d.expiry_date ? fmtDate(d.expiry_date) : "—"}</td>
                    </tr>
                  ))}
                  {(docs ?? []).length === 0 && <Empty colSpan={4} msg="No documents uploaded." />}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ASSETS */}
        <TabsContent value="assets" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Code</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Assigned</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {(assets ?? []).map((a: any) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3 font-mono text-xs">{a.asset_code}</td>
                      <td className="p-3">{a.name}</td>
                      <td className="p-3">{a.category ?? "—"}</td>
                      <td className="p-3">{fmtDate(a.updated_at)}</td>
                      <td className="p-3">{niceLabel(a.status ?? "—")}</td>
                      <td className="p-3">{niceLabel(a.condition ?? "—")}</td>
                    </tr>
                  ))}
                  {(assets ?? []).length === 0 && <Empty colSpan={6} msg="No assets allocated." />}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TRAINING */}
        <TabsContent value="training" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Program</th>
                    <th className="p-3">Provider</th>
                    <th className="p-3">From</th>
                    <th className="p-3">To</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(training ?? []).map((t: any) => (
                    <tr key={t.id} className="border-t">
                      <td className="p-3">{t.training_programs?.name ?? "—"}</td>
                      <td className="p-3">{t.training_programs?.provider ?? "—"}</td>
                      <td className="p-3">{fmtDate(t.training_programs?.start_date)}</td>
                      <td className="p-3">{fmtDate(t.training_programs?.end_date)}</td>
                      <td className="p-3">
                        <Badge className={badgeClass(t.status ?? "pending")}>
                          {niceLabel(t.status ?? "pending")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {(training ?? []).length === 0 && (
                    <Empty colSpan={5} msg="No training records." />
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* COMMUNICATION */}
        <TabsContent value="communication" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b font-medium text-sm">Announcements authored</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Title</th>
                    <th className="p-3">Audience</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(announcements ?? []).map((a: any) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3">{a.title}</td>
                      <td className="p-3">{niceLabel(a.audience)}</td>
                      <td className="p-3">{fmtDateTime(a.created_at)}</td>
                    </tr>
                  ))}
                  {(announcements ?? []).length === 0 && (
                    <Empty colSpan={3} msg="No announcements sent." />
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ACTIVITY LOGS */}
        <TabsContent value="activity" className="pt-4">
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b font-medium text-sm">Recent audit trail</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">When</th>
                    <th className="p-3">Event</th>
                    <th className="p-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...(history ?? []).map((h: any) => ({
                      ts: h.effective_date,
                      event: niceLabel(h.event_type),
                      detail: `${h.from_value ?? "—"} → ${h.to_value ?? "—"}`,
                    })),
                    ...(attendance ?? []).slice(0, 20).map((a: any) => ({
                      ts: a.date,
                      event: `Attendance · ${niceLabel(a.status)}`,
                      detail: a.notes ?? "",
                    })),
                    ...(payroll ?? []).map((p: any) => ({
                      ts: p.month,
                      event: `Payroll ${niceLabel(p.status)}`,
                      detail: money(p.net_salary),
                    })),
                  ]
                    .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""))
                    .slice(0, 40)
                    .map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-3">{fmtDate(row.ts)}</td>
                        <td className="p-3">{row.event}</td>
                        <td className="p-3 text-xs text-muted-foreground">{row.detail}</td>
                      </tr>
                    ))}
                  {(history ?? []).length + (attendance ?? []).length + (payroll ?? []).length ===
                    0 && <Empty colSpan={3} msg="No activity yet." />}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
