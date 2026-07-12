-- Fix next_roll_no(): Postgres lpad() TRUNCATES when the input is longer than
-- the target width, so lpad('100', 2, '0') -> '10' and lpad('778', 2, '0') ->
-- '77'. That means once a class reaches a 3-digit roll (100+ students, or a
-- manually entered roll like "777"), the auto roll generator returns a
-- truncated value that collides with an existing roll forever. Pad to a MINIMUM
-- of two digits without ever truncating longer numbers.
CREATE OR REPLACE FUNCTION public.next_roll_no(p_class uuid)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  mx  int;
  nxt text;
BEGIN
  SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(roll_no, '\D', '', 'g'), '') AS int)), 0)
    INTO mx
    FROM public.students
   WHERE class_id = p_class;
  nxt := (mx + 1)::text;
  -- Zero-pad only short numbers; never shorten a 3+ digit roll.
  IF length(nxt) < 2 THEN
    nxt := lpad(nxt, 2, '0');
  END IF;
  RETURN nxt;
END;
$function$;
