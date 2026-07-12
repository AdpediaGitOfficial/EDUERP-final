-- Classrooms / rooms master. Today "room" is free text on classes.room and
-- timetable.room; this adds a real room entity so capacity, type and facilities
-- can be modelled and utilisation tracked. Additive — the free-text columns are
-- left as-is and matched by room number. Idempotent.

CREATE TABLE IF NOT EXISTS public.classrooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number   text NOT NULL UNIQUE,
  name          text,
  capacity      int NOT NULL DEFAULT 40,
  floor         text,
  building      text,
  room_type     text NOT NULL DEFAULT 'classroom',  -- classroom|lab|library|sports|auditorium|activity
  is_smart      boolean NOT NULL DEFAULT false,
  has_projector boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Backfill from the distinct room strings already used on classes/timetable so
-- the master reflects reality on day one.
INSERT INTO public.classrooms (room_number, room_type)
SELECT DISTINCT room,
       CASE WHEN room ILIKE '%lab%' THEN 'lab'
            WHEN room ILIKE '%libr%' THEN 'library'
            WHEN room ILIKE '%audi%' THEN 'auditorium'
            ELSE 'classroom' END
FROM (
  SELECT room FROM public.classes WHERE room IS NOT NULL AND room <> ''
  UNION
  SELECT room FROM public.timetable WHERE room IS NOT NULL AND room <> ''
) r
WHERE NOT EXISTS (SELECT 1 FROM public.classrooms c WHERE c.room_number = r.room);

CREATE INDEX IF NOT EXISTS idx_classrooms_active ON public.classrooms (is_active);
