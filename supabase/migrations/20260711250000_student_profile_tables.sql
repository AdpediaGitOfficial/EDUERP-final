-- Student profile detail tables. These EXTEND the student record with the pieces
-- that had no home before: medical (1:1), hostel/boarding (1:1), disciplinary
-- incidents (many), documents (many), and an append-only activity log (many).
-- Admin + reception maintain them; parents/teachers read within their scope.
-- Everything is additive — no existing table is altered.

-- ---------------------------------------------------------------------------
-- Medical (one row per student)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_medical (
  student_id              uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  blood_group             text,
  allergies               text,
  chronic_conditions      text,
  medications             text,
  disabilities            text,
  physician_name          text,
  physician_phone         text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  insurance_provider      text,
  insurance_number        text,
  notes                   text,
  updated_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Hostel / boarding (one row per student)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_hostel (
  student_id     uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  is_resident    boolean NOT NULL DEFAULT false,
  hostel_block   text,
  room_no        text,
  bed_no         text,
  warden_name    text,
  warden_phone   text,
  check_in_date  date,
  check_out_date date,
  notes          text,
  updated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Disciplinary incidents (many per student)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_disciplinary (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  incident_date date NOT NULL DEFAULT CURRENT_DATE,
  category      text NOT NULL DEFAULT 'general',
  severity      text NOT NULL DEFAULT 'minor',
  description   text NOT NULL,
  action_taken  text,
  status        text NOT NULL DEFAULT 'open',
  reported_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_disciplinary_severity_chk CHECK (severity IN ('minor', 'moderate', 'major')),
  CONSTRAINT student_disciplinary_status_chk   CHECK (status IN ('open', 'resolved'))
);
CREATE INDEX IF NOT EXISTS idx_student_disciplinary_student
  ON public.student_disciplinary (student_id, incident_date DESC);

-- ---------------------------------------------------------------------------
-- Documents (many per student) — mirrors staff_documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  doc_type    text NOT NULL DEFAULT 'other',
  title       text NOT NULL,
  file_url    text,
  issued_date date,
  expiry_date date,
  verified    boolean NOT NULL DEFAULT false,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_documents_student
  ON public.student_documents (student_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Activity log (append-only, many per student). A durable per-student timeline
-- that mutations across the app write to (profile edits, disciplinary actions,
-- document uploads, admissions, etc.).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  description text NOT NULL,
  meta        jsonb,
  actor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_activity_student
  ON public.student_activity_log (student_id, created_at DESC);
