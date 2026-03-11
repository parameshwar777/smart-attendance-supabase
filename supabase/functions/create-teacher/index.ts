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

  if (roleError || !isAdmin) throw new Error("Only admins can create teachers");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createAdminClient();
    await requireAdmin(supabaseAdmin, req);

    const body = await req.json().catch(() => null);
    const email = body?.email?.trim()?.toLowerCase();
    const password = body?.password;
    const fullName = body?.fullName?.trim();

    if (!email || !password || !fullName) {
      throw new Error("Missing required fields");
    }

    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    let userId: string | null = null;
    let created = false;

    // Check if user already exists first
    const { data: existingUserData } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUserData?.users?.find(
      (u) => u.email?.toLowerCase() === email
    );

    if (existingUser) {
      // User exists — update their account
      userId = existingUser.id;

      const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (updateUserError) {
        throw updateUserError;
      }
    } else {
      // Create new user
      const { data: createdUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError) {
        throw new Error(
          typeof createError === "object" && createError !== null && "message" in createError
            ? (createError as { message: string }).message
            : String(createError)
        );
      }

      userId = createdUserData.user?.id ?? null;
      created = true;
    }

    if (!userId) {
      throw new Error("Failed to resolve teacher account");
    }

    const { error: profileUpsertError } = await supabaseAdmin.from("profiles").upsert(
      {
        user_id: userId,
        full_name: fullName,
        email,
      },
      { onConflict: "user_id" }
    );

    if (profileUpsertError) {
      throw profileUpsertError;
    }

    const { error: roleError } = await supabaseAdmin.from("user_roles").upsert(
      { user_id: userId, role: "teacher" },
      { onConflict: "user_id,role" }
    );

    if (roleError) {
      throw roleError;
    }

    return new Response(
      JSON.stringify({
        user_id: userId,
        created,
        message: created
          ? "Teacher account created successfully"
          : "Existing account updated and assigned teacher role",
      }),
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
