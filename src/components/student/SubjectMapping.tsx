import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Check, X } from "lucide-react";

interface SubjectOption {
  id: string;
  name: string;
  code: string;
  teacherName: string | null;
  sectionName: string;
  mapped: boolean;
}

export function SubjectMapping() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    try {
      // Get student record
      const { data: student } = await supabase
        .from("students")
        .select("id, section_id")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!student) {
        setLoading(false);
        return;
      }
      setStudentId(student.id);

      // Get section info to find department
      const { data: section } = await supabase
        .from("sections")
        .select("year_id, years(department_id)")
        .eq("id", student.section_id)
        .maybeSingle();

      const deptId = (section as any)?.years?.department_id;
      if (!deptId) { setLoading(false); return; }

      // Get all sections in the same department
      const { data: allYears } = await supabase
        .from("years")
        .select("id")
        .eq("department_id", deptId);

      const yearIds = (allYears || []).map(y => y.id);

      const { data: allSections } = await supabase
        .from("sections")
        .select("id, name")
        .in("year_id", yearIds);

      const sectionIds = (allSections || []).map(s => s.id);
      const sectionMap = Object.fromEntries((allSections || []).map(s => [s.id, s.name]));

      // Get all subjects in those sections
      const { data: allSubjects } = await supabase
        .from("subjects")
        .select("id, name, code, section_id, teacher_id")
        .in("section_id", sectionIds)
        .order("name");

      // Get teacher names
      const teacherIds = [...new Set((allSubjects || []).filter(s => s.teacher_id).map(s => s.teacher_id!))];
      let teacherMap: Record<string, string> = {};
      if (teacherIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", teacherIds);
        teacherMap = Object.fromEntries((profiles || []).map(p => [p.user_id, p.full_name]));
      }

      // Get existing mappings
      const { data: mappings } = await supabase
        .from("student_subjects")
        .select("subject_id")
        .eq("student_id", student.id);

      const mappedIds = new Set((mappings || []).map(m => m.subject_id));

      setSubjects((allSubjects || []).map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        teacherName: s.teacher_id ? (teacherMap[s.teacher_id] || "Unknown") : null,
        sectionName: sectionMap[s.section_id] || "",
        mapped: mappedIds.has(s.id),
      })));
    } catch (err) {
      console.error("Error loading subjects:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSubject = (subjectId: string) => {
    setSubjects(prev => prev.map(s =>
      s.id === subjectId ? { ...s, mapped: !s.mapped } : s
    ));
    setPendingChanges(prev => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  };

  const saveChanges = async () => {
    if (!studentId) return;
    setSaving(true);
    try {
      // Get current DB state
      const { data: existing } = await supabase
        .from("student_subjects")
        .select("subject_id")
        .eq("student_id", studentId);
      const existingIds = new Set((existing || []).map(e => e.subject_id));

      const desiredIds = new Set(subjects.filter(s => s.mapped).map(s => s.id));

      // Subjects to add
      const toAdd = [...desiredIds].filter(id => !existingIds.has(id));
      // Subjects to remove
      const toRemove = [...existingIds].filter(id => !desiredIds.has(id));

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("student_subjects")
          .insert(toAdd.map(subject_id => ({ student_id: studentId, subject_id })));
        if (error) throw error;
      }

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("student_subjects")
          .delete()
          .eq("student_id", studentId)
          .in("subject_id", toRemove);
        if (error) throw error;
      }

      setPendingChanges(new Set());
      toast({ title: "Subjects Updated", description: `You are now mapped to ${desiredIds.size} subject(s).` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!studentId) return null;

  const mappedCount = subjects.filter(s => s.mapped).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              My Subjects
            </CardTitle>
            <CardDescription>
              Select the subjects you are enrolled in ({mappedCount} selected)
            </CardDescription>
          </div>
          {pendingChanges.size > 0 && (
            <Button onClick={saveChanges} disabled={saving} size="sm" className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save Changes
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {subjects.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            No subjects available in your department yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {subjects.map(subject => (
              <label
                key={subject.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  subject.mapped
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <Checkbox
                  checked={subject.mapped}
                  onCheckedChange={() => toggleSubject(subject.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{subject.name}</p>
                  <p className="text-xs text-muted-foreground">{subject.code}</p>
                  {subject.teacherName && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {subject.teacherName}
                    </Badge>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
