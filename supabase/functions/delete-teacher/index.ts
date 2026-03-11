import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
};

const createAdminClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

const requireAdmin = async (supabaseAdmin: ReturnType<typeof createAdminClient>, req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user: caller },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !caller) throw new Error("Unauthorized");

  const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc("has_role", {
    _user_id: caller.id,
    _role: "admin",
  });

  if (roleError || !isAdmin) throw new Error("Only admins can delete teachers");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createAdminClient();
    await requireAdmin(supabaseAdmin, req);

    const body = await req.json().catch(() => null);
    const userId = body?.userId?.trim();

    if (!userId) {
      throw new Error("Missing teacher user id");
    }

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (rolesError) {
      throw rolesError;
    }

    if (!roles?.some((item) => item.role === "teacher")) {
      throw new Error("Teacher role not found for this account");
    }

    if (roles.some((item) => item.role === "admin")) {
      throw new Error("Cannot delete an admin account");
    }

    const { error: unassignSubjectsError } = await supabaseAdmin
      .from("subjects")
      .update({ teacher_id: null })
      .eq("teacher_id", userId);

    if (unassignSubjectsError) {
      throw unassignSubjectsError;
    }

    const { error: deleteRolesError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    if (deleteRolesError) {
      throw deleteRolesError;
    }

    const { error: deleteProfileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("user_id", userId);

    if (deleteProfileError) {
      throw deleteProfileError;
    }

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      throw deleteUserError;
    }

    return new Response(
      JSON.stringify({ message: "Teacher deleted successfully" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: getErrorMessage(error) }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
