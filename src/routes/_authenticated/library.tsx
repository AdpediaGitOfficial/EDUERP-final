import { RequireRole } from "@/components/require-role";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useConfirm } from "@/components/confirm-dialog";
import { EmptyRow } from "@/components/empty-state";
import { apiFetch, apiGet } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { BookOpen, Plus, Search, Check, ChevronsUpDown, User, GraduationCap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { format, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/library")({
  component: () => (
    <RequireRole roles={["admin", "teacher"]}>
      <Page />
    </RequireRole>
  ),
});

const FINE_PER_DAY = 5; // ₹ per overdue day suggestion

type Borrower = {
  kind: "student" | "teacher";
  id: string;
  name: string;
  ident: string; // ADM-... or EMP-...
  meta: string; // class-section or "Teacher"
};

function loanStatus(l: any): "returned" | "overdue" | "active" {
  if (l.returned_at) return "returned";
  if (l.due_at && new Date(l.due_at) < new Date(new Date().toDateString())) return "overdue";
  return "active";
}

function borrowerFromLoan(l: any): Borrower | null {
  if (l.borrower_type === "teacher" && l.teachers) {
    const t = l.teachers;
    const emp = t.staff?.employee_code || `TCH-${String(t.id).slice(0, 6)}`;
    return {
      kind: "teacher",
      id: t.id,
      name: t.full_name || "Teacher",
      ident: emp,
      meta: t.subject || "Teacher",
    };
  }
  if (l.borrower_type === "student" && l.students) {
    const s = l.students;
    const cls = s.classes
      ? `${s.classes.name}${s.classes.section ? "-" + s.classes.section : ""}`
      : "—";
    return {
      kind: "student",
      id: s.id,
      name: s.profiles?.full_name || "Student",
      ident: s.admission_no || "—",
      meta: cls,
    };
  }
  return null;
}

function BorrowerCell({ b }: { b: Borrower | null }) {
  if (!b) return <span className="text-muted-foreground">Unknown</span>;
  const inner = <span className="font-medium hover:underline">{b.name}</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        {b.kind === "teacher" ? (
          <Link to="/teachers/$teacherId" params={{ teacherId: b.id }}>
            {inner}
          </Link>
        ) : (
          inner
        )}
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0",
            b.kind === "teacher"
              ? "border-indigo-300 text-indigo-700"
              : "border-emerald-300 text-emerald-700",
          )}
        >
          {b.kind === "teacher" ? "Teacher" : "Student"}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground">
        {b.meta} · <span className="font-mono">{b.ident}</span>
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: "returned" | "overdue" | "active" }) {
  const map = {
    returned: "bg-slate-100 text-slate-700",
    overdue: "bg-red-100 text-red-900",
    active: "bg-amber-100 text-amber-900",
  } as const;
  const label = { returned: "Returned", overdue: "Overdue", active: "Borrowed" }[s];
  return <Badge className={cn("border-0", map[s])}>{label}</Badge>;
}

function BorrowerCombobox({
  borrowers,
  value,
  onChange,
}: {
  borrowers: Borrower[];
  value: Borrower | null;
  onChange: (b: Borrower) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" className="w-full justify-between">
          {value ? `${value.name} · ${value.ident}` : "Search student or teacher…"}
          <ChevronsUpDown className="ml-2 size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[380px]" align="start">
        <Command
          filter={(v, s) => {
            // v is the concatenated searchable value we set on each item
            return v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Name, admission #, employee code, class…" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup heading="Students">
              {borrowers
                .filter((b) => b.kind === "student")
                .slice(0, 200)
                .map((b) => (
                  <CommandItem
                    key={"s-" + b.id}
                    value={`${b.name} ${b.ident} ${b.meta} student`}
                    onSelect={() => {
                      onChange(b);
                      setOpen(false);
                    }}
                  >
                    <GraduationCap className="mr-2 size-4 text-emerald-600" />
                    <div className="flex-1">
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.meta} · <span className="font-mono">{b.ident}</span>
                      </div>
                    </div>
                    {value?.id === b.id && value.kind === "student" && <Check className="size-4" />}
                  </CommandItem>
                ))}
            </CommandGroup>
            <CommandGroup heading="Teachers">
              {borrowers
                .filter((b) => b.kind === "teacher")
                .map((b) => (
                  <CommandItem
                    key={"t-" + b.id}
                    value={`${b.name} ${b.ident} ${b.meta} teacher`}
                    onSelect={() => {
                      onChange(b);
                      setOpen(false);
                    }}
                  >
                    <User className="mr-2 size-4 text-indigo-600" />
                    <div className="flex-1">
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.meta} · <span className="font-mono">{b.ident}</span>
                      </div>
                    </div>
                    {value?.id === b.id && value.kind === "teacher" && <Check className="size-4" />}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Page() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("catalog");

  const { data: books } = useQuery({
    queryKey: ["library-books"],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>("/library/books?pageSize=500");
      return res.rows;
    },
  });

  const { data: loans } = useQuery({
    queryKey: ["library-loans"],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>("/library/loans?pageSize=500");
      // Reshape the API's flat rows into the nested structure this page renders.
      return res.rows.map((l) => ({
        id: l.id,
        issued_at: l.issuedAt,
        due_at: l.dueAt,
        returned_at: l.returnedAt,
        borrower_type: l.borrowerType,
        fine_amount: l.fineAmount,
        fine_status: l.fineStatus,
        fine_settled_at: l.fineSettledAt,
        library_books: { id: l.bookId, title: l.bookTitle },
        students:
          l.borrowerType === "student"
            ? {
                id: l.studentId,
                admission_no: l.admissionNo,
                profiles: { full_name: l.borrowerName },
                classes: l.className ? { name: l.className, section: "" } : null,
              }
            : null,
        teachers:
          l.borrowerType === "teacher"
            ? {
                id: l.teacherId,
                full_name: l.borrowerName,
                subject: l.subject,
                staff: { employee_code: l.employeeCode },
              }
            : null,
      }));
    },
  });

  const { data: students } = useQuery({
    queryKey: ["library-borrower-students"],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>("/students?pageSize=500");
      return res.rows.map((s) => ({
        id: s.id,
        admission_no: s.admissionNo,
        profiles: { full_name: s.fullName },
        classes: s.class ? { name: s.class.name, section: s.class.section } : null,
      }));
    },
  });

  const { data: teachers } = useQuery({
    queryKey: ["library-borrower-teachers"],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>("/teachers?pageSize=500");
      return res.rows.map((t) => ({
        id: t.id,
        full_name: t.fullName,
        subject: t.subject,
        staff: { employee_code: t.employeeCode ?? null },
      }));
    },
  });

  const borrowers: Borrower[] = useMemo(() => {
    const out: Borrower[] = [];
    for (const s of (students ?? []) as any[]) {
      out.push({
        kind: "student",
        id: s.id,
        name: s.profiles?.full_name || "Student",
        ident: s.admission_no || "—",
        meta: s.classes
          ? `${s.classes.name}${s.classes.section ? "-" + s.classes.section : ""}`
          : "—",
      });
    }
    for (const t of (teachers ?? []) as any[]) {
      out.push({
        kind: "teacher",
        id: t.id,
        name: t.full_name || "Teacher",
        ident: t.staff?.employee_code || `TCH-${String(t.id).slice(0, 6)}`,
        meta: t.subject || "Teacher",
      });
    }
    return out;
  }, [students, teachers]);

  const totals = useMemo(() => {
    const titles = (books ?? []).length;
    let total = 0,
      avail = 0;
    for (const b of books ?? []) {
      total += b.total_copies;
      avail += b.available_copies;
    }
    const active = (loans ?? []).filter((l: any) => !l.returned_at).length;
    const overdue = (loans ?? []).filter((l: any) => loanStatus(l) === "overdue").length;
    const pendingFines = (loans ?? []).filter(
      (l: any) => Number(l.fine_amount) > 0 && l.fine_status === "pending",
    ).length;
    return { titles, total, avail, active, overdue, pendingFines };
  }, [books, loans]);

  return (
    <AppShell>
      <PageHeader
        title="Library"
        subtitle="Catalog, circulation, and fines."
        action={
          <div className="flex gap-2">
            <IssueBookDialog
              books={books ?? []}
              borrowers={borrowers}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["library-loans"] });
                qc.invalidateQueries({ queryKey: ["library-books"] });
              }}
            />
            <AddBookDialog onDone={() => qc.invalidateQueries({ queryKey: ["library-books"] })} />
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Titles</div>
          <div className="text-2xl font-semibold">{totals.titles}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Copies avail.</div>
          <div className="text-2xl font-semibold text-emerald-600">
            {totals.avail}
            <span className="text-sm text-muted-foreground"> / {totals.total}</span>
          </div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Active loans</div>
          <div className="text-2xl font-semibold text-amber-600">{totals.active}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Overdue</div>
          <div className="text-2xl font-semibold text-red-600">{totals.overdue}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Pending fines</div>
          <div className="text-2xl font-semibold">{totals.pendingFines}</div>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="circulation">Circulation</TabsTrigger>
          <TabsTrigger value="fines">Fines</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-4">
          <CatalogTab books={books ?? []} />
        </TabsContent>
        <TabsContent value="circulation" className="mt-4">
          <CirculationTab
            loans={loans ?? []}
            onChange={() => qc.invalidateQueries({ queryKey: ["library-loans"] })}
          />
        </TabsContent>
        <TabsContent value="fines" className="mt-4">
          <FinesTab
            loans={loans ?? []}
            onChange={() => qc.invalidateQueries({ queryKey: ["library-loans"] })}
          />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function CatalogTab({ books }: { books: any[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return books.filter(
      (b) =>
        !t ||
        (b.title || "").toLowerCase().includes(t) ||
        (b.author || "").toLowerCase().includes(t) ||
        (b.isbn || "").toLowerCase().includes(t) ||
        (b.category || "").toLowerCase().includes(t),
    );
  }, [books, q]);
  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="p-4 border-b flex items-center gap-3">
        <BookOpen className="size-4 text-muted-foreground" />
        <div className="font-medium">Catalog</div>
        <div className="ml-auto relative w-72 max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title, author, ISBN, category…"
            className="pl-9"
          />
        </div>
      </div>
      <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground sticky top-0">
            <tr>
              <th className="p-3">Title</th>
              <th className="p-3">Author</th>
              <th className="p-3">Category</th>
              <th className="p-3">ISBN</th>
              <th className="p-3">Avail / Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} className="border-t hover:bg-muted/40">
                <td className="p-3 font-medium">{b.title}</td>
                <td className="p-3">{b.author || "—"}</td>
                <td className="p-3">{b.category || "—"}</td>
                <td className="p-3 font-mono text-xs">{b.isbn || "—"}</td>
                <td className="p-3 font-mono text-xs">
                  {b.available_copies} / {b.total_copies}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <EmptyRow
                colSpan={5}
                title="No books match"
                hint="Try a different search or add a new book."
              />
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function borrowerMatchesQuery(b: Borrower | null, q: string) {
  if (!q) return true;
  if (!b) return false;
  const t = q.toLowerCase();
  return (
    b.name.toLowerCase().includes(t) ||
    b.ident.toLowerCase().includes(t) ||
    b.meta.toLowerCase().includes(t)
  );
}

function CirculationTab({ loans, onChange }: { loans: any[]; onChange: () => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const rows = useMemo(() => {
    return loans
      .map((l) => ({ ...l, _borrower: borrowerFromLoan(l), _status: loanStatus(l) }))
      .filter((l) => status === "all" || l._status === status)
      .filter((l) => borrowerMatchesQuery(l._borrower, q));
  }, [loans, q, status]);

  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="p-4 border-b flex flex-wrap items-center gap-3">
        <div className="font-medium">Circulation</div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Borrowed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Borrower: name, ID, or class…"
              className="pl-9"
            />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Book</th>
              <th className="p-3">Borrower</th>
              <th className="p-3">Issued</th>
              <th className="p-3">Due</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className="p-3 font-medium">{l.library_books?.title}</td>
                <td className="p-3">
                  <BorrowerCell b={l._borrower} />
                </td>
                <td className="p-3 text-muted-foreground">
                  {format(new Date(l.issued_at), "dd MMM yyyy")}
                </td>
                <td className="p-3 text-muted-foreground">
                  {l.due_at ? format(new Date(l.due_at), "dd MMM yyyy") : "—"}
                </td>
                <td className="p-3">
                  <StatusBadge s={l._status} />
                </td>
                <td className="p-3 text-right">
                  {l._status !== "returned" && <ReturnAction loan={l} onDone={onChange} />}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <EmptyRow colSpan={6} title="No loans match" hint="Issued books will appear here." />
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FinesTab({ loans, onChange }: { loans: any[]; onChange: () => void }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"pending" | "history" | "all">("pending");

  const rows = useMemo(() => {
    return loans
      .filter((l) => Number(l.fine_amount) > 0) // fix: only real fines
      .map((l) => ({ ...l, _borrower: borrowerFromLoan(l), _status: loanStatus(l) }))
      .filter((l) => {
        if (view === "pending") return l.fine_status === "pending";
        if (view === "history") return l.fine_status === "paid" || l.fine_status === "waived";
        return true;
      })
      .filter((l) => borrowerMatchesQuery(l._borrower, q))
      .sort(
        (a, b) => (a.fine_status === "pending" ? -1 : 1) - (b.fine_status === "pending" ? -1 : 1),
      );
  }, [loans, q, view]);

  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="p-4 border-b flex flex-wrap items-center gap-3">
        <div className="font-medium">Fines</div>
        <Tabs value={view} onValueChange={(v) => setView(v as any)}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="history">Paid / Waived</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Borrower: name, ID, or class…"
            className="pl-9"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Book</th>
              <th className="p-3">Borrower</th>
              <th className="p-3">Due</th>
              <th className="p-3">Fine</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className="p-3 font-medium">{l.library_books?.title}</td>
                <td className="p-3">
                  <BorrowerCell b={l._borrower} />
                </td>
                <td className="p-3 text-muted-foreground">
                  {l.due_at ? format(new Date(l.due_at), "dd MMM yyyy") : "—"}
                </td>
                <td className="p-3 font-mono">₹{Number(l.fine_amount).toFixed(2)}</td>
                <td className="p-3">
                  <Badge
                    className={cn(
                      "border-0",
                      l.fine_status === "pending"
                        ? "bg-amber-100 text-amber-900"
                        : l.fine_status === "paid"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-700",
                    )}
                  >
                    {l.fine_status.charAt(0).toUpperCase() + l.fine_status.slice(1)}
                  </Badge>
                </td>
                <td className="p-3 text-right">
                  {l.fine_status === "pending" && <FineAction loan={l} onDone={onChange} />}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <EmptyRow
                colSpan={6}
                title="No fines to show"
                hint="Overdue-return fines will be listed here."
              />
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReturnAction({ loan, onDone }: { loan: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const daysLate = loan.due_at
    ? Math.max(0, differenceInCalendarDays(new Date(), new Date(loan.due_at)))
    : 0;
  const suggested = daysLate * FINE_PER_DAY;
  const [fine, setFine] = useState<string>(String(suggested));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const amt = Number(fine) || 0;
    try {
      // The API restores a catalogue copy + records the fine in one transaction.
      await apiFetch(`/library/loans/${loan.id}/return`, {
        method: "POST",
        body: JSON.stringify({ fineAmount: amt }),
      });
    } catch (err) {
      setSaving(false);
      return toast.error(err instanceof Error ? err.message : "Could not return");
    }
    setSaving(false);
    toast.success("Book returned");
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Return
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return book</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">Book:</span>{" "}
            <span className="font-medium">{loan.library_books?.title}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Days late:</span> {daysLate}
          </div>
          <div className="space-y-1.5">
            <Label>Fine amount (₹)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={fine}
              onChange={(e) => setFine(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Suggested: ₹{suggested} at ₹{FINE_PER_DAY}/day. Set 0 for no fine.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Confirm return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FineAction({ loan, onDone }: { loan: any; onDone: () => void }) {
  const confirm = useConfirm();
  const settle = async (status: "paid" | "waived") => {
    try {
      await apiFetch(`/library/loans/${loan.id}/fine`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      return toast.error(err instanceof Error ? err.message : "Could not update fine");
    }
    toast.success(status === "paid" ? "Marked as paid" : "Fine waived");
    onDone();
  };
  return (
    <div className="inline-flex gap-2">
      <Button size="sm" variant="outline" onClick={() => settle("paid")}>
        Mark paid
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          if (
            await confirm({
              title: "Waive this fine?",
              description:
                "The outstanding fine will be cleared without payment. This can't be undone.",
              confirmText: "Waive fine",
              destructive: true,
            })
          )
            settle("waived");
        }}
      >
        Waive
      </Button>
    </div>
  );
}

function AddBookDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const copies = Number(fd.get("copies") || 1);
    try {
      await apiFetch("/library/books", {
        method: "POST",
        body: JSON.stringify({
          title: String(fd.get("title") || ""),
          author: String(fd.get("author") || "") || undefined,
          isbn: String(fd.get("isbn") || "") || undefined,
          category: String(fd.get("category") || "") || undefined,
          copies,
        }),
      });
    } catch (err) {
      return toast.error(err instanceof Error ? err.message : "Could not add book");
    }
    toast.success("Book added");
    setOpen(false);
    onDone();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="size-4" /> New book
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add book</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input name="title" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Author</Label>
              <Input name="author" />
            </div>
            <div className="space-y-1.5">
              <Label>ISBN</Label>
              <Input name="isbn" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input name="category" placeholder="Fiction, Science…" />
            </div>
            <div className="space-y-1.5">
              <Label>Copies</Label>
              <Input name="copies" type="number" min={1} defaultValue={1} />
            </div>
          </div>
          <Button type="submit" className="w-full">
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IssueBookDialog({
  books,
  borrowers,
  onDone,
}: {
  books: any[];
  borrowers: Borrower[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [bookId, setBookId] = useState<string>("");
  const [dueAt, setDueAt] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [saving, setSaving] = useState(false);

  const availableBooks = books.filter((b) => b.available_copies > 0);

  const submit = async () => {
    if (!borrower) return toast.error("Select a borrower");
    if (!bookId) return toast.error("Select a book");
    setSaving(true);
    try {
      // The API decrements available copies in the same transaction.
      await apiFetch("/library/loans", {
        method: "POST",
        body: JSON.stringify({
          bookId,
          borrowerType: borrower.kind,
          borrowerId: borrower.id,
          dueAt,
        }),
      });
    } catch (err) {
      setSaving(false);
      return toast.error(err instanceof Error ? err.message : "Could not issue book");
    }
    setSaving(false);
    toast.success("Book issued");
    setOpen(false);
    setBorrower(null);
    setBookId("");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Issue book
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue book</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Borrower</Label>
            <BorrowerCombobox borrowers={borrowers} value={borrower} onChange={setBorrower} />
            {borrower && (
              <p className="text-xs text-muted-foreground">
                {borrower.kind === "teacher" ? "Teacher" : "Student"} · {borrower.meta} ·{" "}
                <span className="font-mono">{borrower.ident}</span>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Book</Label>
            <Select value={bookId} onValueChange={setBookId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an available book" />
              </SelectTrigger>
              <SelectContent>
                {availableBooks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.title}{" "}
                    <span className="text-muted-foreground">
                      · {b.available_copies}/{b.total_copies}
                    </span>
                  </SelectItem>
                ))}
                {availableBooks.length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground">No copies available.</div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
