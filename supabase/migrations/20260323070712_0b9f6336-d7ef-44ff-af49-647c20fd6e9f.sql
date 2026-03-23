-- Add phone_number and user_id columns to students table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students(user_id);
