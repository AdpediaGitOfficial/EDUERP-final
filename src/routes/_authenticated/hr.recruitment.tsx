import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { useConfirm } from "@/components/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { badgeClass, fmtDate, niceLabel } from "@/lib/module-util";
import { ChevronRight, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/recruitment")({ component: Page });

const STAGES = ["applied", "screening", "interview", "offer", "joined"] as const;

function Page() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: openings } = useQuery({
    queryKey: ["job-openings"],
    queryFn: () => apiGet<any[]>("/hr/recruitment/openings"),
  });
  const { data: candidates } = useQuery({
    queryKey: ["candidates"],
    queryFn: () => apiGet<any[]>("/hr/recruitment/candidates"),
  });

  const [openingOpen, setOpeningOpen] = useState(false);
  const [openingForm, setOpeningForm] = useState<any>({
    title: "",
    department: "",
    positions: 1,
    status: "open",
    opened_at: new Date().toISOString().slice(0, 10),
    closes_at: "",
    description: "",
  });
  const [candOpen, setCandOpen] = useState(false);
  const [candForm, setCandForm] = useState<any>({
    job_opening_id: "",
    name: "",
    email: "",
    phone: "",
    source: "referral",
    stage: "applied",
    rating: 3,
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

  const saveOpening = useMutation({
    mutationFn: () => write("/hr/recruitment/openings", "POST", openingForm),
    onSuccess: () => {
      toast.success("Opening created");
      setOpeningOpen(false);
      qc.invalidateQueries({ queryKey: ["job-openings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const closeOpening = useMutation({
    mutationFn: (id: string) => write(`/hr/recruitment/openings/${id}/close`, "PATCH"),
    onSuccess: () => {
      toast.success("Opening closed");
      qc.invalidateQueries({ queryKey: ["job-openings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const saveCand = useMutation({
    mutationFn: () => write("/hr/recruitment/candidates", "POST", candForm),
    onSuccess: () => {
      toast.success("Candidate added");
      setCandOpen(false);
      qc.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const moveStage = useMutation({
    mutationFn: (v: { id: string; stage: string }) =>
      write(`/hr/recruitment/candidates/${v.id}/stage`, "PATCH", { stage: v.stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates"] }),
    onError: (e: any) => toast.error(e.message),
  });
  const rejectCand = useMutation({
    mutationFn: (id: string) =>
      write(`/hr/recruitment/candidates/${id}/stage`, "PATCH", { stage: "rejected" }),
    onSuccess: () => {
      toast.success("Candidate rejected");
      qc.invalidateQueries({ queryKey: ["candidates"] });
    },
  });

  const nextStage = (s: string) => {
    const i = STAGES.indexOf(s as any);
    return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
  };

  return (
    <>
      <PageHeader
        title="Recruitment"
        subtitle="Open positions and candidate pipeline."
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCandForm({
                  job_opening_id: (openings ?? [])[0]?.id ?? "",
                  name: "",
                  email: "",
                  phone: "",
                  source: "referral",
                  stage: "applied",
                  rating: 3,
                });
                setCandOpen(true);
              }}
              disabled={!(openings ?? []).length}
            >
              <Plus className="size-4 mr-1" />
              Candidate
            </Button>
            <Button size="sm" onClick={() => setOpeningOpen(true)}>
              <Plus className="size-4 mr-1" />
              New opening
            </Button>
          </div>
        }
      />
      <div className="grid md:grid-cols-3 gap-3 mb-6">
        {(openings ?? []).map((o: any) => (
          <Card key={o.id} className="p-4 rounded-2xl">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-medium">{o.title}</div>
                <div className="text-xs text-muted-foreground">
                  {o.department} • {o.positions} position{o.positions > 1 ? "s" : ""}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Badge className={badgeClass(o.status === "open" ? "active" : "inactive")}>
                  {niceLabel(o.status)}
                </Badge>
                {o.status === "open" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Close opening ${o.title ?? ""}`.trim()}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Close this opening?",
                          description: `"${o.title}" will be marked closed and stop accepting applicants.`,
                          confirmText: "Close opening",
                        })
                      )
                        closeOpening.mutate(o.id);
                    }}
                    title="Close"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Opened {fmtDate(o.opened_at)} • Closes {fmtDate(o.closes_at)}
            </div>
            <div className="text-xs mt-2">{o.description}</div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {STAGES.map((stage) => (
          <Card key={stage} className="p-3 rounded-2xl bg-muted/30">
            <div className="text-xs font-semibold uppercase mb-3 text-muted-foreground">
              {niceLabel(stage)} • {(candidates ?? []).filter((c: any) => c.stage === stage).length}
            </div>
            <div className="space-y-2">
              {(candidates ?? [])
                .filter((c: any) => c.stage === stage)
                .map((c: any) => (
                  <div key={c.id} className="p-2 rounded-lg bg-background border">
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.job_opening?.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.source} • ★ {c.rating ?? "—"}
                    </div>
                    <div className="flex gap-1 mt-2">
                      {nextStage(c.stage) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => moveStage.mutate({ id: c.id, stage: nextStage(c.stage)! })}
                        >
                          Advance <ChevronRight className="size-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-600"
                        onClick={() => rejectCand.mutate(c.id)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={openingOpen} onOpenChange={setOpeningOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New job opening</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <Label>Title</Label>
              <Input
                value={openingForm.title}
                onChange={(e) => setOpeningForm({ ...openingForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Department</Label>
              <Input
                value={openingForm.department}
                onChange={(e) => setOpeningForm({ ...openingForm, department: e.target.value })}
              />
            </div>
            <div>
              <Label>Positions</Label>
              <Input
                type="number"
                min="1"
                value={openingForm.positions}
                onChange={(e) =>
                  setOpeningForm({ ...openingForm, positions: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Opens</Label>
              <Input
                type="date"
                value={openingForm.opened_at}
                onChange={(e) => setOpeningForm({ ...openingForm, opened_at: e.target.value })}
              />
            </div>
            <div>
              <Label>Closes</Label>
              <Input
                type="date"
                value={openingForm.closes_at}
                onChange={(e) => setOpeningForm({ ...openingForm, closes_at: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input
                value={openingForm.description}
                onChange={(e) => setOpeningForm({ ...openingForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpeningOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveOpening.mutate()}
              disabled={!openingForm.title || !openingForm.department}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={candOpen} onOpenChange={setCandOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add candidate</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <Label>Opening</Label>
              <Select
                value={candForm.job_opening_id}
                onValueChange={(v) => setCandForm({ ...candForm, job_opening_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(openings ?? [])
                    .filter((o: any) => o.status === "open")
                    .map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Name</Label>
              <Input
                value={candForm.name}
                onChange={(e) => setCandForm({ ...candForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={candForm.email}
                onChange={(e) => setCandForm({ ...candForm, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={candForm.phone}
                onChange={(e) => setCandForm({ ...candForm, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Source</Label>
              <Select
                value={candForm.source}
                onValueChange={(v) => setCandForm({ ...candForm, source: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="referral">Referral</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="portal">Job portal</SelectItem>
                  <SelectItem value="walk_in">Walk-in</SelectItem>
                  <SelectItem value="agency">Agency</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rating</Label>
              <Input
                type="number"
                min="1"
                max="5"
                value={candForm.rating}
                onChange={(e) => setCandForm({ ...candForm, rating: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCandOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveCand.mutate()}
              disabled={!candForm.name || !candForm.job_opening_id}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
