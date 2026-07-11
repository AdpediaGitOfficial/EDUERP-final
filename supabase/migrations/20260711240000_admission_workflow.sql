-- Full admission workflow on the EXISTING admission_enquiries table (not a second
-- system): a 9-stage pipeline with reviewer/rejection/timestamps, applicant +
-- allocation + fee + parent linkage, uploaded documents, and a stage-history log.

ALTER TABLE public.admission_enquiries
  ADD COLUMN IF NOT EXISTS stage             text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS applicant_dob     date,
  ADD COLUMN IF NOT EXISTS applicant_gender  text,
  ADD COLUMN IF NOT EXISTS applicant_address text,
  ADD COLUMN IF NOT EXISTS previous_school   text,
  ADD COLUMN IF NOT EXISTS blood_group       text,
  ADD COLUMN IF NOT EXISTS transport_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hostel_required    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS medical_notes     text,
  ADD COLUMN IF NOT EXISTS academic_year     text,
  ADD COLUMN IF NOT EXISTS class_id          uuid,
  ADD COLUMN IF NOT EXISTS section           text,
  ADD COLUMN IF NOT EXISTS fee_structure_id  uuid,
  ADD COLUMN IF NOT EXISTS parent_id         uuid,
  ADD COLUMN IF NOT EXISTS reviewer_id       uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason  text,
  ADD COLUMN IF NOT EXISTS submitted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at       timestamptz,
  ADD COLUMN IF NOT EXISTS admitted_at       timestamptz,
  ADD COLUMN IF NOT EXISTS documents         jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Foreign keys (best-effort; SET NULL so lookups can be reorganised freely).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ae_class_fk') THEN
    ALTER TABLE public.admission_enquiries
      ADD CONSTRAINT ae_class_fk FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ae_fee_fk') THEN
    ALTER TABLE public.admission_enquiries
      ADD CONSTRAINT ae_fee_fk FOREIGN KEY (fee_structure_id) REFERENCES public.fee_structures(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ae_parent_fk') THEN
    ALTER TABLE public.admission_enquiries
      ADD CONSTRAINT ae_parent_fk FOREIGN KEY (parent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admission_stage_check') THEN
    ALTER TABLE public.admission_enquiries
      ADD CONSTRAINT admission_stage_check CHECK (stage IN (
        'draft','submitted','under_review','document_verification','parent_verification',
        'fee_assignment','class_allocation','approved','admitted','rejected'));
  END IF;
END $$;

-- Seed the stage from the legacy enquiry status so existing rows are coherent.
UPDATE public.admission_enquiries SET stage = CASE status
  WHEN 'converted' THEN 'admitted'
  WHEN 'lost'      THEN 'rejected'
  WHEN 'follow_up' THEN 'under_review'
  ELSE 'submitted'
END
WHERE stage = 'draft';

CREATE INDEX IF NOT EXISTS idx_admission_enquiries_stage ON public.admission_enquiries (stage);

-- Stage-transition audit log.
CREATE TABLE IF NOT EXISTS public.admission_stage_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admission_enquiries(id) ON DELETE CASCADE,
  from_stage   text,
  to_stage     text NOT NULL,
  actor_id     uuid,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admission_stage_history_admission ON public.admission_stage_history (admission_id);
