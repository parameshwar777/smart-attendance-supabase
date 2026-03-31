import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { student_id, password } = await req.json();

    if (!student_id || !password) {
      return new Response(
        JSON.stringify({ error: "student_id and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get student details
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, roll_number, full_name, email, user_id")
      .eq("id", student_id)
      .single();

    if (studentError || !student) {
      return new Response(
        JSON.stringify({ error: "Student not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (student.user_id) {
      return new Response(
        JSON.stringify({ error: "Student already has a login account" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate email from roll number
    const studentEmail = `${student.roll_number.toLowerCase()}@attendance.edu`;

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: studentEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name: student.full_name },
    });

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = authData.user.id;

    // Assign student role
    await supabase.from("user_roles").insert({
      user_id: newUserId,
      role: "student",
    });

    // Link student record to auth user
    await supabase
      .from("students")
      .update({ user_id: newUserId, email: studentEmail })
      .eq("id", student_id);

    return new Response(
      JSON.stringify({
        success: true,
        email: studentEmail,
        message: `Login created for ${student.full_name}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
