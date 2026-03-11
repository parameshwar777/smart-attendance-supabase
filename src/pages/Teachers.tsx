import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  createTeacherAccount,
  deleteTeacherAccount,
  updateTeacherAccount,
} from "@/services/teacherAdminService";
import {
  UserPlus,
  Users,
  Mail,
  BookOpen,
  Loader2,
  Trash2,
  Edit,
  Search,
} from "lucide-react";

interface Teacher {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  created_at: string;
  subjects: {
    id: string;
    name: string;
    code: string;
    section: {
      name: string;
      year: {
        name: string;
        department: {
          name: string;
          code: string;
        };
      };
    };
  }[];
}

interface Subject {
  id: string;
  name: string;
  code: string;
  section_id: string;
  teacher_id: string | null;
  section: {
    name: string;
    year: {
      name: string;
      department: {
        name: string;
        code: string;
      };
    };
  };
}

export default function Teachers() {
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [teacherToEdit, setTeacherToEdit] = useState<Teacher | null>(null);
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
  });

  const [editFormData, setEditFormData] = useState({
    fullName: "",
    email: "",
    password: "",
  });

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  useEffect(() => {
    fetchTeachers();
    fetchSubjects();
  }, []);

  const fetchTeachers = async () => {
    setLoading(true);
    try {
      // Get all users with teacher role
      const { data: teacherRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "teacher");

      if (rolesError) throw rolesError;

      if (!teacherRoles || teacherRoles.length === 0) {
        setTeachers([]);
        return;
      }

      const teacherUserIds = teacherRoles.map(r => r.user_id);

      // Get profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", teacherUserIds);

      if (profilesError) throw profilesError;

      // Get subjects assigned to each teacher
      const { data: subjectsData, error: subjectsError } = await supabase
        .from("subjects")
        .select(`
          id,
          name,
          code,
          teacher_id,
          sections!inner (
            name,
            years!inner (
              name,
              departments!inner (
                name,
                code
              )
            )
          )
        `)
        .in("teacher_id", teacherUserIds);

      // Map profiles to teachers with their subjects
      const teachersList: Teacher[] = (profiles || []).map(profile => ({
        id: profile.id,
        user_id: profile.user_id,
        full_name: profile.full_name,
        email: profile.email,
        created_at: profile.created_at,
        subjects: (subjectsData || [])
          .filter(s => s.teacher_id === profile.user_id)
          .map(s => ({
            id: s.id,
            name: s.name,
            code: s.code,
            section: {
              name: (s.sections as any).name,
              year: {
                name: (s.sections as any).years.name,
                department: {
                  name: (s.sections as any).years.departments.name,
                  code: (s.sections as any).years.departments.code,
                },
              },
            },
          })),
      }));

      setTeachers(teachersList);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch teachers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from("subjects")
        .select(`
          id,
          name,
          code,
          section_id,
          teacher_id,
          sections!inner (
            name,
            years!inner (
              name,
              departments!inner (
                name,
                code
              )
            )
          )
        `)
        .order("name");

      if (error) throw error;

      const mappedSubjects: Subject[] = (data || []).map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        section_id: s.section_id,
        teacher_id: s.teacher_id,
        section: {
          name: (s.sections as any).name,
          year: {
            name: (s.sections as any).years.name,
            department: {
              name: (s.sections as any).years.departments.name,
              code: (s.sections as any).years.departments.code,
            },
          },
        },
      }));

      setSubjects(mappedSubjects);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch subjects",
        variant: "destructive",
      });
    }
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await createTeacherAccount({
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
      });

      const created = Boolean((result as { created?: boolean }).created);
      const message =
        typeof result.message === "string"
          ? result.message
          : `${formData.fullName} has been added as a teacher.`;

      toast({
        title: created ? "Teacher Created" : "Teacher Updated",
        description: message,
      });

      setFormData({ fullName: "", email: "", password: "" });
      setDialogOpen(false);
      fetchTeachers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create teacher",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignSubjects = async () => {
    if (!selectedTeacher) return;
    setIsSubmitting(true);

    try {
      // First, unassign all subjects from this teacher
      await supabase
        .from("subjects")
        .update({ teacher_id: null })
        .eq("teacher_id", selectedTeacher.user_id);

      // Then assign selected subjects
      if (selectedSubjects.length > 0) {
        const { error } = await supabase
          .from("subjects")
          .update({ teacher_id: selectedTeacher.user_id })
          .in("id", selectedSubjects);

        if (error) throw error;
      }

      toast({
        title: "Subjects Assigned",
        description: `Subjects have been updated for ${selectedTeacher.full_name}.`,
      });

      setAssignDialogOpen(false);
      setSelectedTeacher(null);
      setSelectedSubjects([]);
      fetchTeachers();
      fetchSubjects();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to assign subjects",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAssignDialog = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setSelectedSubjects(teacher.subjects.map(s => s.id));
    setAssignDialogOpen(true);
  };

  const openEditDialog = (teacher: Teacher) => {
    setTeacherToEdit(teacher);
    setEditFormData({
      fullName: teacher.full_name,
      email: teacher.email,
      password: "",
    });
    setEditDialogOpen(true);
  };

  const handleEditTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherToEdit) return;

    setIsSubmitting(true);

    try {
      const result = await updateTeacherAccount({
        userId: teacherToEdit.user_id,
        fullName: editFormData.fullName,
        email: editFormData.email,
        ...(editFormData.password ? { password: editFormData.password } : {}),
      });

      toast({
        title: "Teacher Updated",
        description:
          typeof result.message === "string"
            ? result.message
            : `${editFormData.fullName} has been updated successfully.`,
      });

      setEditDialogOpen(false);
      setTeacherToEdit(null);
      setEditFormData({ fullName: "", email: "", password: "" });
      fetchTeachers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update teacher",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTeacher = async () => {
    if (!teacherToDelete) return;

    setIsSubmitting(true);

    try {
      const result = await deleteTeacherAccount({ userId: teacherToDelete.user_id });

      toast({
        title: "Teacher Deleted",
        description:
          typeof result.message === "string"
            ? result.message
            : `${teacherToDelete.full_name} has been deleted.`,
      });

      setTeacherToDelete(null);
      fetchTeachers();
      fetchSubjects();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete teacher",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTeachers = teachers.filter(
    teacher =>
      teacher.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      teacher.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Teachers</h1>
            <p className="text-muted-foreground">
              Manage teacher accounts and subject assignments
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" />
                Add Teacher
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Teacher Account</DialogTitle>
                <DialogDescription>
                  Create a new teacher account with email and password
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateTeacher} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    placeholder="John Smith"
                    value={formData.fullName}
                    onChange={(e) =>
                      setFormData({ ...formData, fullName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="teacher@university.edu"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min 6 characters"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    minLength={6}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Create Teacher
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search teachers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Teachers Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              All Teachers ({filteredTeachers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTeachers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No teachers found</p>
                <p className="text-sm">Create a teacher account to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Assigned Subjects</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTeachers.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell className="font-medium">
                        {teacher.full_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-4 w-4" />
                          {teacher.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {teacher.subjects.length === 0 ? (
                            <span className="text-muted-foreground text-sm">
                              No subjects assigned
                            </span>
                          ) : (
                            teacher.subjects.slice(0, 3).map((subject) => (
                              <Badge key={subject.id} variant="secondary">
                                {subject.code}
                              </Badge>
                            ))
                          )}
                          {teacher.subjects.length > 3 && (
                            <Badge variant="outline">
                              +{teacher.subjects.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAssignDialog(teacher)}
                          >
                            <BookOpen className="h-4 w-4 mr-2" />
                            Assign Subjects
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openEditDialog(teacher)}
                            aria-label={`Edit ${teacher.full_name}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setTeacherToDelete(teacher)}
                            className="text-destructive"
                            aria-label={`Delete ${teacher.full_name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Assign Subjects Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Assign Subjects</DialogTitle>
              <DialogDescription>
                {selectedTeacher
                  ? `Select subjects to assign to ${selectedTeacher.full_name}`
                  : "Select a teacher first"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {subjects.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No subjects available. Create subjects first.
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {subjects.map((subject) => (
                    <label
                      key={subject.id}
                      className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedSubjects.includes(subject.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedSubjects([...selectedSubjects, subject.id]);
                          } else {
                            setSelectedSubjects(
                              selectedSubjects.filter((id) => id !== subject.id)
                            );
                          }
                        }}
                      />
                      <div className="flex-1">
                        <p className="font-medium">
                          {subject.name} ({subject.code})
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {subject.section.year.department.name} → {subject.section.year.name} → Section {subject.section.name}
                        </p>
                        {subject.teacher_id && subject.teacher_id !== selectedTeacher?.user_id && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            Currently assigned to another teacher
                          </Badge>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAssignDialogOpen(false);
                    setSelectedTeacher(null);
                    setSelectedSubjects([]);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleAssignSubjects} disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Save Assignments
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Teacher Dialog */}
        <Dialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) {
              setTeacherToEdit(null);
              setEditFormData({ fullName: "", email: "", password: "" });
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Teacher Account</DialogTitle>
              <DialogDescription>
                Update teacher details. Leave password blank to keep it unchanged.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditTeacher} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-fullName">Full Name</Label>
                <Input
                  id="edit-fullName"
                  value={editFormData.fullName}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, fullName: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editFormData.email}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, email: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">New Password (Optional)</Label>
                <Input
                  id="edit-password"
                  type="password"
                  placeholder="Leave empty to keep existing password"
                  value={editFormData.password}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, password: e.target.value })
                  }
                  minLength={6}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Teacher Confirmation */}
        <AlertDialog open={Boolean(teacherToDelete)} onOpenChange={(open) => !open && setTeacherToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Teacher Account?</AlertDialogTitle>
              <AlertDialogDescription>
                {teacherToDelete
                  ? `This will permanently remove ${teacherToDelete.full_name} and unassign all linked subjects.`
                  : "This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTeacher} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </DashboardLayout>
  );
}
