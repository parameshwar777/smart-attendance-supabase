
-- Drop ALL existing restrictive policies on user_roles
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

-- Recreate as PERMISSIVE (default)
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Drop ALL existing restrictive policies on profiles
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Drop ALL existing restrictive policies on attendance
DROP POLICY IF EXISTS "Authenticated users can read attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can manage attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins can manage attendance" ON public.attendance;

CREATE POLICY "Authenticated users can read attendance" ON public.attendance
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers can manage attendance" ON public.attendance
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins can manage attendance" ON public.attendance
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Drop ALL existing restrictive policies on classes
DROP POLICY IF EXISTS "Authenticated users can read classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can manage own classes" ON public.classes;
DROP POLICY IF EXISTS "Admins can manage classes" ON public.classes;

CREATE POLICY "Authenticated users can read classes" ON public.classes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers can manage own classes" ON public.classes
  FOR ALL TO authenticated USING (teacher_id = auth.uid());
CREATE POLICY "Admins can manage classes" ON public.classes
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Drop ALL existing restrictive policies on departments
DROP POLICY IF EXISTS "Authenticated users can read departments" ON public.departments;
DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;

CREATE POLICY "Authenticated users can read departments" ON public.departments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage departments" ON public.departments
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Drop ALL existing restrictive policies on sections
DROP POLICY IF EXISTS "Authenticated users can read sections" ON public.sections;
DROP POLICY IF EXISTS "Admins can manage sections" ON public.sections;

CREATE POLICY "Authenticated users can read sections" ON public.sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage sections" ON public.sections
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Drop ALL existing restrictive policies on students
DROP POLICY IF EXISTS "Authenticated users can read students" ON public.students;
DROP POLICY IF EXISTS "Teachers can manage students" ON public.students;
DROP POLICY IF EXISTS "Admins can manage students" ON public.students;

CREATE POLICY "Authenticated users can read students" ON public.students
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers can manage students" ON public.students
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Admins can manage students" ON public.students
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Drop ALL existing restrictive policies on subjects
DROP POLICY IF EXISTS "Authenticated users can read subjects" ON public.subjects;
DROP POLICY IF EXISTS "Teachers can update their subjects" ON public.subjects;
DROP POLICY IF EXISTS "Admins can manage subjects" ON public.subjects;

CREATE POLICY "Authenticated users can read subjects" ON public.subjects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Teachers can update their subjects" ON public.subjects
  FOR UPDATE TO authenticated USING (teacher_id = auth.uid());
CREATE POLICY "Admins can manage subjects" ON public.subjects
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Drop ALL existing restrictive policies on years
DROP POLICY IF EXISTS "Authenticated users can read years" ON public.years;
DROP POLICY IF EXISTS "Admins can manage years" ON public.years;

CREATE POLICY "Authenticated users can read years" ON public.years
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage years" ON public.years
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
