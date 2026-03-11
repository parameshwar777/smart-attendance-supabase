INSERT INTO public.user_roles (user_id, role)
VALUES ('1e002cc1-ee2c-4d66-9267-cb699a17e828', 'teacher')
ON CONFLICT (user_id, role) DO NOTHING;