import { supabase } from "@/integrations/supabase/client";

interface CreateTeacherInput {
  email: string;
  password: string;
  fullName: string;
}

interface UpdateTeacherInput {
  userId: string;
  email: string;
  fullName: string;
  password?: string;
}

interface DeleteTeacherInput {
  userId: string;
}

interface TeacherFunctionResponse {
  message?: string;
  error?: string;
  [key: string]: unknown;
}

const parseFunctionError = async (error: unknown): Promise<Error> => {
  const fallbackMessage = error instanceof Error ? error.message : "Request failed";

  const maybeContext = (error as { context?: Response })?.context;
  if (!maybeContext) {
    return new Error(fallbackMessage);
  }

  try {
    const payload = (await maybeContext.json()) as TeacherFunctionResponse;
    return new Error(payload.error || payload.message || fallbackMessage);
  } catch {
    return new Error(fallbackMessage);
  }
};

const invokeTeacherAdminFunction = async <T>(
  functionName: string,
  body: object
): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    throw await parseFunctionError(error);
  }

  return (data || {}) as T;
};

export const createTeacherAccount = (payload: CreateTeacherInput) =>
  invokeTeacherAdminFunction<TeacherFunctionResponse>("create-teacher", payload);

export const updateTeacherAccount = (payload: UpdateTeacherInput) =>
  invokeTeacherAdminFunction<TeacherFunctionResponse>("update-teacher", payload);

export const deleteTeacherAccount = (payload: DeleteTeacherInput) =>
  invokeTeacherAdminFunction<TeacherFunctionResponse>("delete-teacher", payload);
