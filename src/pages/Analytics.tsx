import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  CheckCircle2,
  Search,
  GraduationCap,
  PieChart as PieChartIcon,
  Activity,
  MessageSquare,
  Loader2,
  ExternalLink,
  BookOpen,
} from "lucide-react";

interface SubjectSummary {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  sectionName: string;
  totalClasses: number;
  students: StudentSubjectAttendance[];
  averageAttendance: number;
}

interface StudentSubjectAttendance {
  studentId: string;
  fullName: string;
  rollNumber: string;
  phoneNumber: string | null;
  totalClasses: number;
  attended: number;
  missed: number;
  percentage: number;
  riskLevel: "safe" | "warning" | "risk";
  classesNeededFor80: number;
}

const CHART_COLORS = {
  safe: "hsl(142, 76%, 36%)",
  warning: "hsl(38, 92%, 50%)",
  risk: "hsl(0, 84%, 60%)",
  primary: "hsl(250, 89%, 64%)",
  secondary: "hsl(215, 20%, 65%)",
};

const PIE_COLORS = [CHART_COLORS.safe, CHART_COLORS.warning, CHART_COLORS.risk];

export default function Analytics() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [subjectSummaries, setSubjectSummaries] = useState<SubjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [whatsappLinks, setWhatsappLinks] = useState<{ name: string; rollNumber: string; phone: string; percentage: number; url: string }[]>([]);
  const [showWhatsappDialog, setShowWhatsappDialog] = useState(false);
  const [loadingLinks, setLoadingLinks] = useState(false);

  useEffect(() => {
    if (user) fetchAnalytics();
  }, [user, role]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // Fetch subjects based on role
      let subjectsQuery = supabase
        .from("subjects")
        .select(`
          id, name, code, section_id, teacher_id,
          sections (name)
        `);

      if (role === "teacher") {
        subjectsQuery = subjectsQuery.eq("teacher_id", user!.id);
      }

      const { data: subjects } = await subjectsQuery;

      if (!subjects || subjects.length === 0) {
        setSubjectSummaries([]);
        setLoading(false);
        return;
      }

      const summaries: SubjectSummary[] = [];

      for (const subject of subjects) {
        // Get completed classes for this subject
        const { data: classes } = await supabase
          .from("classes")
          .select("id")
          .eq("subject_id", subject.id)
          .eq("status", "completed");

        const classIds = (classes || []).map((c: any) => c.id);
        const totalClasses = classIds.length;

        if (totalClasses === 0) continue;

        // Get students in this subject's section
        const { data: studentsData } = await supabase
          .from("students")
          .select("id, full_name, roll_number, phone_number")
          .eq("section_id", subject.section_id);

        if (!studentsData || studentsData.length === 0) continue;

        const studentAttendances: StudentSubjectAttendance[] = [];

        for (const student of studentsData) {
          // Count present attendance for this student in this subject's classes
          const { count: attendedCount } = await supabase
            .from("attendance")
            .select("*", { count: "exact", head: true })
            .eq("student_id", student.id)
            .eq("status", "present")
            .in("class_id", classIds);

          const attended = attendedCount || 0;
          const missed = totalClasses - attended;
          const percentage = Math.round((attended / totalClasses) * 100);

          let classesNeeded = 0;
          if (percentage < 80) {
            classesNeeded = Math.ceil((0.8 * totalClasses - attended) / 0.2);
            if (classesNeeded < 0) classesNeeded = 0;
          }

          const riskLevel: "safe" | "warning" | "risk" =
            percentage >= 80 ? "safe" :
            percentage >= 70 ? "warning" : "risk";

          studentAttendances.push({
            studentId: student.id,
            fullName: student.full_name,
            rollNumber: student.roll_number,
            phoneNumber: student.phone_number,
            totalClasses,
            attended,
            missed,
            percentage,
            riskLevel,
            classesNeededFor80: classesNeeded,
          });
        }

        const avgAttendance = studentAttendances.length > 0
          ? Math.round(studentAttendances.reduce((acc, s) => acc + s.percentage, 0) / studentAttendances.length)
          : 0;

        summaries.push({
          subjectId: subject.id,
          subjectName: subject.name,
          subjectCode: subject.code,
          sectionName: (subject as any).sections?.name || "",
          totalClasses,
          students: studentAttendances,
          averageAttendance: avgAttendance,
        });
      }

      setSubjectSummaries(summaries);
    } catch (err) {
      console.error("Error fetching analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  // Aggregate all students across subjects (for overall view)
  const getAllStudents = (): StudentSubjectAttendance[] => {
    if (selectedSubject !== "all") {
      const found = subjectSummaries.find(s => s.subjectId === selectedSubject);
      return found?.students || [];
    }
    // For "all", aggregate per student across all subjects
    const studentMap = new Map<string, { fullName: string; rollNumber: string; phoneNumber: string | null; totalClasses: number; attended: number }>();
    for (const subj of subjectSummaries) {
      for (const s of subj.students) {
        const existing = studentMap.get(s.studentId) || { fullName: s.fullName, rollNumber: s.rollNumber, phoneNumber: s.phoneNumber, totalClasses: 0, attended: 0 };
        existing.totalClasses += s.totalClasses;
        existing.attended += s.attended;
        studentMap.set(s.studentId, existing);
      }
    }
    return Array.from(studentMap.entries()).map(([studentId, data]) => {
      const missed = data.totalClasses - data.attended;
      const percentage = data.totalClasses > 0 ? Math.round((data.attended / data.totalClasses) * 100) : 0;
      let classesNeeded = 0;
      if (percentage < 80 && data.totalClasses > 0) {
        classesNeeded = Math.ceil((0.8 * data.totalClasses - data.attended) / 0.2);
        if (classesNeeded < 0) classesNeeded = 0;
      }
      return {
        studentId,
        fullName: data.fullName,
        rollNumber: data.rollNumber,
        phoneNumber: data.phoneNumber,
        totalClasses: data.totalClasses,
        attended: data.attended,
        missed,
        percentage,
        riskLevel: (percentage >= 80 ? "safe" : percentage >= 70 ? "warning" : "risk") as "safe" | "warning" | "risk",
        classesNeededFor80: classesNeeded,
      };
    });
  };

  const allStudents = getAllStudents();

  const filteredStudents = allStudents.filter((student) => {
    const matchesSearch =
      student.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.rollNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRisk = riskFilter === "all" || student.riskLevel === riskFilter;
    return matchesSearch && matchesRisk;
  });

  const stats = {
    totalStudents: allStudents.length,
    safeStudents: allStudents.filter(s => s.riskLevel === "safe").length,
    warningStudents: allStudents.filter(s => s.riskLevel === "warning").length,
    riskStudents: allStudents.filter(s => s.riskLevel === "risk").length,
    averageAttendance: allStudents.length > 0
      ? Math.round(allStudents.reduce((acc, s) => acc + s.percentage, 0) / allStudents.length)
      : 0,
  };

  const riskDistributionData = [
    { name: "Safe (≥80%)", value: stats.safeStudents, color: CHART_COLORS.safe },
    { name: "Warning (70-79%)", value: stats.warningStudents, color: CHART_COLORS.warning },
    { name: "At Risk (<70%)", value: stats.riskStudents, color: CHART_COLORS.risk },
  ].filter(item => item.value > 0);

  const attendanceDistributionData = [
    { range: "0-50%", count: allStudents.filter(s => s.percentage <= 50).length },
    { range: "51-60%", count: allStudents.filter(s => s.percentage > 50 && s.percentage <= 60).length },
    { range: "61-70%", count: allStudents.filter(s => s.percentage > 60 && s.percentage <= 70).length },
    { range: "71-80%", count: allStudents.filter(s => s.percentage > 70 && s.percentage <= 80).length },
    { range: "81-90%", count: allStudents.filter(s => s.percentage > 80 && s.percentage <= 90).length },
    { range: "91-100%", count: allStudents.filter(s => s.percentage > 90).length },
  ];

  const handleWhatsappAlert = () => {
    const lowStudents = filteredStudents.filter((s) => s.percentage < 80 && s.phoneNumber);
    if (lowStudents.length === 0) {
      toast({ title: "No students to alert", description: "No students below 80% with phone numbers found.", variant: "destructive" });
      return;
    }

    const links = lowStudents.map((s) => {
      const message = encodeURIComponent(
        `Dear ${s.fullName} (${s.rollNumber}), your attendance is ${s.percentage}% which is below 80%. Please attend classes regularly to avoid academic issues. - AI Attendance System`
      );
      const phone = s.phoneNumber!.replace(/[^0-9]/g, "");
      return {
        name: s.fullName,
        rollNumber: s.rollNumber,
        phone: s.phoneNumber!,
        percentage: s.percentage,
        url: `https://web.whatsapp.com/send?phone=${phone}&text=${message}`,
      };
    });

    setWhatsappLinks(links);
    setShowWhatsappDialog(true);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
          <p className="font-medium text-sm">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}{entry.name === "Percentage" ? "%" : ""}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <DashboardLayout>
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={itemVariants}>
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <Activity className="h-8 w-8 text-primary" />
            {role === "admin" ? "Admin Analytics Dashboard" : "Subject Analytics"}
          </h1>
          <p className="text-muted-foreground">
            {role === "admin"
              ? "Comprehensive subject-wise attendance analytics across all departments"
              : "Attendance analytics for your assigned subjects"}
          </p>
        </motion.div>

        {/* Subject Filter */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder="Select Subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subjects (Overall)</SelectItem>
                    {subjectSummaries.map((s) => (
                      <SelectItem key={s.subjectId} value={s.subjectId}>
                        {s.subjectName} ({s.subjectCode}) - Sec {s.sectionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or roll number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={riskFilter} onValueChange={setRiskFilter}>
                  <SelectTrigger className="w-full sm:w-36">
                    <SelectValue placeholder="Risk Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="safe">Safe</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="risk">At Risk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stats Overview */}
        <motion.div variants={itemVariants} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard title="Total Students" value={stats.totalStudents} icon={Users} variant="default" />
          <StatCard title="Average Attendance" value={`${stats.averageAttendance}%`} icon={TrendingUp} variant="accent" />
          <StatCard title="Safe (≥80%)" value={stats.safeStudents} icon={CheckCircle2} variant="success" />
          <StatCard title="Warning (70-79%)" value={stats.warningStudents} icon={AlertTriangle} variant="warning" />
          <StatCard title="At Risk (<70%)" value={stats.riskStudents} icon={TrendingDown} variant="danger" />
        </motion.div>

        {/* Subject-wise Summary Cards (Admin only or when viewing all) */}
        {role === "admin" && selectedSubject === "all" && subjectSummaries.length > 0 && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Subject-wise Attendance Summary
                </CardTitle>
                <CardDescription>
                  Attendance breakdown per subject across all sections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead className="text-center">Section</TableHead>
                      <TableHead className="text-center">Total Classes</TableHead>
                      <TableHead className="text-center">Students</TableHead>
                      <TableHead className="text-center">Avg Attendance</TableHead>
                      <TableHead className="text-center">Below 80%</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subjectSummaries.map((subj) => {
                      const belowThreshold = subj.students.filter(s => s.percentage < 80).length;
                      return (
                        <TableRow key={subj.subjectId}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{subj.subjectName}</p>
                              <p className="text-sm text-muted-foreground">{subj.subjectCode}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{subj.sectionName}</TableCell>
                          <TableCell className="text-center">{subj.totalClasses}</TableCell>
                          <TableCell className="text-center">{subj.students.length}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3 justify-center">
                              <Progress value={subj.averageAttendance} className="h-2 w-20" />
                              <span className="text-sm font-medium">{subj.averageAttendance}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {belowThreshold > 0 ? (
                              <span className="text-destructive font-medium">{belowThreshold}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <StatusBadge variant={subj.averageAttendance >= 80 ? "safe" : subj.averageAttendance >= 70 ? "warning" : "risk"}>
                              {subj.averageAttendance >= 80 ? "Good" : subj.averageAttendance >= 70 ? "Warning" : "Poor"}
                            </StatusBadge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Charts Row */}
        <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-2">
          {/* Subject-wise Bar Chart */}
          {selectedSubject === "all" && subjectSummaries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Subject-wise Average Attendance
                </CardTitle>
                <CardDescription>Average attendance percentage per subject</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={subjectSummaries.map(s => ({ name: s.subjectCode, percentage: s.averageAttendance }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="percentage" name="Percentage" radius={[4, 4, 0, 0]}>
                        {subjectSummaries.map((s, i) => (
                          <Cell key={i} fill={s.averageAttendance >= 80 ? CHART_COLORS.safe : s.averageAttendance >= 70 ? CHART_COLORS.warning : CHART_COLORS.risk} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Risk Distribution Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <PieChartIcon className="h-5 w-5 text-primary" />
                Student Risk Distribution
              </CardTitle>
              <CardDescription>
                {selectedSubject === "all" ? "Overall across all subjects" : "For selected subject"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                {riskDistributionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={riskDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        labelLine={{ stroke: "hsl(var(--muted-foreground))" }}
                      >
                        {riskDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [`${value} students`, "Count"]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">No data available</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Attendance Distribution */}
          {selectedSubject !== "all" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Attendance Distribution
                </CardTitle>
                <CardDescription>Students in each attendance range</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendanceDistributionData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                        {attendanceDistributionData.map((_, index) => (
                          <Cell key={index} fill={index <= 2 ? CHART_COLORS.risk : index === 3 ? CHART_COLORS.warning : CHART_COLORS.safe} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Overall Semester Stats (Admin) */}
        {role === "admin" && selectedSubject === "all" && (
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Attendance Distribution (Overall)
                </CardTitle>
                <CardDescription>Number of students in each attendance percentage range across all subjects</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendanceDistributionData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                        {attendanceDistributionData.map((_, index) => (
                          <Cell key={index} fill={index <= 2 ? CHART_COLORS.risk : index === 3 ? CHART_COLORS.warning : CHART_COLORS.safe} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Students Table */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Student Attendance Details
                  {selectedSubject !== "all" && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      — {subjectSummaries.find(s => s.subjectId === selectedSubject)?.subjectName}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {selectedSubject === "all"
                    ? "Overall attendance across all subjects (total classes vs attended)"
                    : "Detailed breakdown for selected subject"}
                </CardDescription>
              </div>
              {(role === "teacher" || role === "admin") && (
                <Button
                  onClick={handleWhatsappAlert}
                  disabled={loadingLinks}
                  className="gap-2 bg-[hsl(142,70%,40%)] hover:bg-[hsl(142,70%,35%)] text-white"
                >
                  {loadingLinks ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Loading...</>
                  ) : (
                    <><MessageSquare className="h-4 w-4" />WhatsApp &lt;80%</>
                  )}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No students found</p>
                  <p className="text-sm">Try adjusting your filters or select a subject</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead className="text-center">Total Classes</TableHead>
                        <TableHead className="text-center">Attended</TableHead>
                        <TableHead className="text-center">Missed</TableHead>
                        <TableHead className="text-center">Attendance %</TableHead>
                        <TableHead className="text-center">Classes for 80%</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.map((student) => (
                        <TableRow key={student.studentId}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{student.fullName}</p>
                              <p className="text-sm text-muted-foreground">{student.rollNumber}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{student.totalClasses}</TableCell>
                          <TableCell className="text-center text-success">{student.attended}</TableCell>
                          <TableCell className="text-center text-danger">{student.missed}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Progress value={student.percentage} className="h-2 w-20" />
                              <span className="text-sm font-medium w-12 text-right">{student.percentage}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {student.riskLevel === "safe" ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className="font-medium text-warning">+{student.classesNeededFor80}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <StatusBadge variant={student.riskLevel}>
                              {student.riskLevel === "safe" && "Safe"}
                              {student.riskLevel === "warning" && "Warning"}
                              {student.riskLevel === "risk" && "At Risk"}
                            </StatusBadge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* WhatsApp Links Dialog */}
      <Dialog open={showWhatsappDialog} onOpenChange={setShowWhatsappDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[hsl(142,70%,40%)]" />
              WhatsApp Alert Links
            </DialogTitle>
            <DialogDescription>
              Click "Send All" to open each student's WhatsApp chat, or click individual "Send" buttons.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <Button
              className="w-full gap-2 bg-[hsl(142,70%,40%)] hover:bg-[hsl(142,70%,35%)] text-white"
              onClick={() => {
                whatsappLinks.forEach((link, index) => {
                  setTimeout(() => {
                    window.open(link.url, "_blank");
                  }, index * 1200);
                });
                toast({
                  title: "Opening WhatsApp chats",
                  description: `Opening ${whatsappLinks.length} chats. Please allow popups if prompted.`,
                });
              }}
            >
              <MessageSquare className="h-4 w-4" />
              Send All ({whatsappLinks.length} students)
            </Button>
            <div className="space-y-3">
              {whatsappLinks.map((link, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                  <div>
                    <p className="font-medium text-sm">{link.name}</p>
                    <p className="text-xs text-muted-foreground">{link.rollNumber} • {link.phone} • {link.percentage}%</p>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1 bg-[hsl(142,70%,40%)] hover:bg-[hsl(142,70%,35%)] text-white"
                    onClick={() => window.open(link.url, "_blank")}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Send
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
