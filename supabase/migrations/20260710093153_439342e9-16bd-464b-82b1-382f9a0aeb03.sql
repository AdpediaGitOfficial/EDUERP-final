
DO $$
DECLARE
  old_teacher uuid := '11111111-1111-1111-1111-111111111008';
  new_teacher uuid := '84811e91-6898-4137-ba75-4e39c1adc162'; -- teacher@greenwood.test
  new_student_profile uuid := '2c78cd09-8d64-433d-a860-607e32a27cb0'; -- student@greenwood.test
  new_parent uuid := 'a494bbda-3b91-405d-a7cf-eef93e6386e9'; -- parent@greenwood.test
  target_student uuid := '06d681b5-ce57-4d36-99d3-41ae4c6b4d69'; -- Anika Singh, Grade 8A
  old_student_profile uuid;
BEGIN
  ------------------------------------------------------------------
  -- 1) TEACHER: repoint every reference from Anjali Nair's UUID to
  --    teacher@greenwood.test's auth/profile UUID.
  ------------------------------------------------------------------
  -- Remove any pre-existing teacher row on the target UUID to avoid PK collision
  DELETE FROM public.teachers WHERE id = new_teacher;

  UPDATE public.teacher_classes    SET teacher_id = new_teacher WHERE teacher_id = old_teacher;
  UPDATE public.homework           SET teacher_id = new_teacher WHERE teacher_id = old_teacher;
  UPDATE public.progress_notes     SET teacher_id = new_teacher WHERE teacher_id = old_teacher;
  UPDATE public.timetable          SET teacher_id = new_teacher WHERE teacher_id = old_teacher;
  UPDATE public.attendance         SET marked_by  = new_teacher WHERE marked_by  = old_teacher;
  UPDATE public.announcements      SET author_id  = new_teacher WHERE author_id  = old_teacher;
  UPDATE public.broadcasts         SET sender_id  = new_teacher WHERE sender_id  = old_teacher;
  UPDATE public.complaint_messages SET sender_id  = new_teacher WHERE sender_id  = old_teacher;
  UPDATE public.complaints         SET raised_by  = new_teacher WHERE raised_by  = old_teacher;
  UPDATE public.holidays           SET created_by = new_teacher WHERE created_by = old_teacher;

  -- Move the teachers row itself: update the PK to the demo auth uid.
  UPDATE public.teachers
     SET id = new_teacher,
         email = 'teacher@greenwood.test'
   WHERE id = old_teacher;

  -- Roles: force teacher@greenwood.test to be a teacher.
  DELETE FROM public.user_roles WHERE user_id = new_teacher;
  INSERT INTO public.user_roles (user_id, role) VALUES (new_teacher, 'teacher');

  -- Cosmetic: reflect the identity on the profile.
  UPDATE public.profiles
     SET full_name = 'Anjali Nair'
   WHERE id = new_teacher;

  ------------------------------------------------------------------
  -- 2) STUDENT: attach student@greenwood.test to the existing
  --    Anika Singh student record (Grade 8A - taught by Anjali).
  ------------------------------------------------------------------
  SELECT profile_id INTO old_student_profile FROM public.students WHERE id = target_student;

  -- Free up target profile from any student row it currently owns.
  DELETE FROM public.students WHERE profile_id = new_student_profile;

  UPDATE public.students SET profile_id = new_student_profile WHERE id = target_student;

  DELETE FROM public.user_roles WHERE user_id = new_student_profile;
  INSERT INTO public.user_roles (user_id, role) VALUES (new_student_profile, 'student');

  UPDATE public.profiles
     SET full_name = 'Anika Singh'
   WHERE id = new_student_profile;

  ------------------------------------------------------------------
  -- 3) PARENT: link parent@greenwood.test to Anika Singh, replacing
  --    any placeholder links that pointed to empty students.
  ------------------------------------------------------------------
  DELETE FROM public.parent_student WHERE parent_id = new_parent;
  INSERT INTO public.parent_student (parent_id, student_id, relationship)
    VALUES (new_parent, target_student, 'mother');

  DELETE FROM public.user_roles WHERE user_id = new_parent;
  INSERT INTO public.user_roles (user_id, role) VALUES (new_parent, 'parent');

  UPDATE public.profiles
     SET full_name = 'Priya Singh'
   WHERE id = new_parent;
END $$;
