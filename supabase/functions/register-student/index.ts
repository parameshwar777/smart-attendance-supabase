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

    const { full_name, roll_number, email, phone_number, section_id, password, face_registered } = await req.json();

    if (!full_name || !roll_number || !section_id || !password) {
      return new Response(
        JSON.stringify({ error: "full_name, roll_number, section_id, and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if roll number already exists
    const { data: existing } = await supabase
      .from("students")
      .select("id, user_id")
      .eq("roll_number", roll_number)
      .maybeSingle();

    if (existing?.user_id) {
      return new Response(
        JSON.stringify({ error: "This roll number already has an account" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate email from roll number
    const studentEmail = `${roll_number.toLowerCase()}@attendance.edu`;

    // Create auth user first
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: studentEmail,
      password: password,
      email_confirm: true,
      user_metadata: { full_name },
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

    let studentId: string;

    if (existing) {
      // Update existing student record
      await supabase
        .from("students")
        .update({
          full_name,
          email: studentEmail,
          phone_number: phone_number || null,
          user_id: newUserId,
          face_registered: face_registered || false,
        })
        .eq("id", existing.id);
      studentId = existing.id;
    } else {
      // Create new student record
      const { data: newStudent, error: studentError } = await supabase
        .from("students")
        .insert({
          full_name,
          roll_number,
          email: studentEmail,
          phone_number: phone_number || null,
          section_id,
          user_id: newUserId,
          face_registered: face_registered || false,
        })
        .select()
        .single();

      if (studentError) {
        return new Response(
          JSON.stringify({ error: studentError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      studentId = newStudent.id;
    }

    return new Response(
      JSON.stringify({
        success: true,
        student_id: studentId,
        email: studentEmail,
        message: `Account created for ${full_name}`,
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
