-- Promotion engine: a register of promote/detain decisions moving students from
-- one class-section (and session) to the next. New domain — additive. Idempotent.

CREATE TABLE IF NOT EXISTS public.promotion_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      uuid NOT NULL,                     -- groups one promotion run
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  to_class_id   uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  from_session  text,
  to_session    text,
  result        text NOT NULL DEFAULT 'promoted',  -- promoted|detained|passed_out
  notes         text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotion_records_batch ON public.promotion_records (batch_id);
CREATE INDEX IF NOT EXISTS idx_promotion_records_student ON public.promotion_records (student_id);
CREATE INDEX IF NOT EXISTS idx_promotion_records_session ON public.promotion_records (from_session);
