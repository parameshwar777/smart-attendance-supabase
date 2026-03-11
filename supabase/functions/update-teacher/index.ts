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

  if (roleError || !isAdmin) throw new Error("Only admins can edit teachers");
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
    const fullName = body?.fullName?.trim();
    const email = body?.email?.trim()?.toLowerCase();
    const password = body?.password?.trim();

    if (!userId || !fullName || !email) {
      throw new Error("Missing required fields");
    }

    if (password && password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const { data: teacherRole, error: teacherRoleError } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "teacher")
      .maybeSingle();

    if (teacherRoleError || !teacherRole) {
      throw new Error("Teacher role not found for this account");
    }

    const updatePayload: Record<string, unknown> = {
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    };

    if (password) {
      updatePayload.password = password;
    }

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      updatePayload
    );

    if (updateAuthError) {
      throw updateAuthError;
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: fullName, email })
      .eq("user_id", userId);

    if (profileUpdateError) {
      throw profileUpdateError;
    }

    return new Response(
      JSON.stringify({ message: "Teacher updated successfully" }),
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
