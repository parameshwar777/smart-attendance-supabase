
-- Allow anonymous/public users to read departments, years, sections for signup
CREATE POLICY "Public can read departments" ON public.departments FOR SELECT TO anon USING (true);
CREATE POLICY "Public can read years" ON public.years FOR SELECT TO anon USING (true);
CREATE POLICY "Public can read sections" ON public.sections FOR SELECT TO anon USING (true);

-- Create student_subjects mapping table
CREATE TABLE public.student_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, subject_id)
);

ALTER TABLE public.student_subjects ENABLE ROW LEVEL SECURITY;

-- Students can read/manage their own mappings
CREATE POLICY "Students can read own subject mappings" ON public.student_subjects FOR SELECT TO authenticated USING (
  student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
);
CREATE POLICY "Students can insert own subject mappings" ON public.student_subjects FOR INSERT TO authenticated WITH CHECK (
  student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
);
CREATE POLICY "Students can delete own subject mappings" ON public.student_subjects FOR DELETE TO authenticated USING (
  student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
);

-- Teachers can read mappings for their subjects
CREATE POLICY "Teachers can read subject mappings" ON public.student_subjects FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'teacher') AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
);

-- Admins can manage all
CREATE POLICY "Admins can manage subject mappings" ON public.student_subjects FOR ALL TO authenticated USING (
  has_role(auth.uid(), 'admin')
) WITH CHECK (has_role(auth.uid(), 'admin'));
