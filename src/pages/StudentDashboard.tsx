import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
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
} from "recharts";
import {
  GraduationCap,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock,
  Activity,
} from "lucide-react";
import { SubjectMapping } from "@/components/student/SubjectMapping";

interface AttendanceRecord {
  id: string;
  status: string;
  created_at: string;
  class: {
    class_date: string;
    start_time: string;
    end_time: string;
    subject: {
      name: string;
      code: string;
    };
  };
}

interface SubjectStats {
  name: string;
  code: string;
  total: number;
  attended: number;
  percentage: number;
}

const CHART_COLORS = {
  present: "hsl(142, 76%, 36%)",
  absent: "hsl(0, 84%, 60%)",
  late: "hsl(38, 92%, 50%)",
  primary: "hsl(250, 89%, 64%)",
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const [studentData, setStudentData] = useState<any>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [subjectStats, setSubjectStats] = useState<SubjectStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [overallStats, setOverallStats] = useState({
    totalClasses: 0,
    attended: 0,
    missed: 0,
    percentage: 0,
  });

  useEffect(() => {
    if (user) fetchStudentData();
  }, [user]);

  const fetchStudentData = async () => {
    try {
      // Get student record linked to this auth user
      const { data: student } = await supabase
        .from("students")
        .select(`
          id, full_name, roll_number, email, phone_number,
          sections (
            name,
            years (
              name,
              departments (name, code)
            )
          )
        `)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!student) {
        setLoading(false);
        return;
      }

      setStudentData(student);

      // Get all attendance records for this student
      const { data: attendance } = await supabase
        .from("attendance")
        .select(`
          id, status, created_at,
          classes (
            class_date, start_time, end_time,
            subjects (name, code)
          )
        `)
        .eq("student_id", student.id)
        .order("created_at", { ascending: false });

      const records = (attendance || []).map((a: any) => ({
        id: a.id,
        status: a.status,
        created_at: a.created_at,
        class: {
          class_date: a.classes?.class_date || "",
          start_time: a.classes?.start_time || "",
          end_time: a.classes?.end_time || "",
          subject: {
            name: a.classes?.subjects?.name || "Unknown",
            code: a.classes?.subjects?.code || "",
          },
        },
      }));

      setAttendanceRecords(records);

      // Calculate overall stats
      const totalClasses = records.length;
      const attended = records.filter((r) => r.status === "present").length;
      const missed = totalClasses - attended;
      const percentage = totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0;
      setOverallStats({ totalClasses, attended, missed, percentage });

      // Calculate per-subject stats
      const subjectMap = new Map<string, { name: string; code: string; total: number; attended: number }>();
      for (const r of records) {
        const key = r.class.subject.code;
        const existing = subjectMap.get(key) || { name: r.class.subject.name, code: key, total: 0, attended: 0 };
        existing.total++;
        if (r.status === "present") existing.attended++;
        subjectMap.set(key, existing);
      }
      setSubjectStats(
        Array.from(subjectMap.values()).map((s) => ({
          ...s,
          percentage: s.total > 0 ? Math.round((s.attended / s.total) * 100) : 0,
        }))
      );
    } catch (error) {
      console.error("Error fetching student data:", error);
    } finally {
      setLoading(false);
    }
  };

  const pieData = [
    { name: "Present", value: overallStats.attended, color: CHART_COLORS.present },
    { name: "Absent", value: overallStats.missed, color: CHART_COLORS.absent },
  ].filter((d) => d.value > 0);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!studentData) {
    return (
      <DashboardLayout>
        <div className="text-center py-20 text-muted-foreground">
          <GraduationCap className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-semibold mb-2">No Student Record Found</h2>
          <p>Your account is not linked to any student record. Please contact your teacher.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        {/* Header */}
        <motion.div variants={itemVariants} className="space-y-1">
          <h1 className="text-3xl font-display font-bold">
            Welcome, {studentData.full_name}
          </h1>
          <p className="text-muted-foreground">
            {studentData.roll_number} · {(studentData as any).sections?.years?.departments?.name} · {(studentData as any).sections?.years?.name} · Section {(studentData as any).sections?.name}
          </p>
        </motion.div>

        {/* Stats Cards */}
        <motion.div variants={itemVariants} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Classes" value={overallStats.totalClasses} icon={Calendar} variant="default" />
          <StatCard title="Classes Attended" value={overallStats.attended} icon={CheckCircle2} variant="success" />
          <StatCard title="Classes Missed" value={overallStats.missed} icon={AlertTriangle} variant="danger" />
          <StatCard
            title="Attendance %"
            value={`${overallStats.percentage}%`}
            icon={overallStats.percentage >= 80 ? TrendingUp : TrendingDown}
            variant={overallStats.percentage >= 80 ? "success" : overallStats.percentage >= 70 ? "warning" : "danger"}
          />
        </motion.div>

        {/* Charts Row */}
        <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-2">
          {/* Overall Pie */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Overall Attendance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">No data yet</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Subject-wise Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                Subject-wise Attendance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                {subjectStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={subjectStats}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="code" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v: number) => [`${v}%`, "Attendance"]} />
                      <Bar dataKey="percentage" name="Attendance" radius={[4, 4, 0, 0]}>
                        {subjectStats.map((s, i) => (
                          <Cell
                            key={i}
                            fill={s.percentage >= 80 ? CHART_COLORS.present : s.percentage >= 70 ? CHART_COLORS.late : CHART_COLORS.absent}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">No data yet</div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Subject-wise Table */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Subject-wise Breakdown</CardTitle>
              <CardDescription>Your attendance in each subject</CardDescription>
            </CardHeader>
            <CardContent>
              {subjectStats.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No attendance records yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Attended</TableHead>
                      <TableHead className="text-center">Attendance %</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subjectStats.map((s) => (
                      <TableRow key={s.code}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{s.name}</p>
                            <p className="text-sm text-muted-foreground">{s.code}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{s.total}</TableCell>
                        <TableCell className="text-center">{s.attended}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3 justify-center">
                            <Progress value={s.percentage} className="h-2 w-20" />
                            <span className="text-sm font-medium">{s.percentage}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge variant={s.percentage >= 80 ? "safe" : s.percentage >= 70 ? "warning" : "risk"}>
                            {s.percentage >= 80 ? "Safe" : s.percentage >= 70 ? "Warning" : "At Risk"}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Attendance History */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Recent Attendance History
              </CardTitle>
              <CardDescription>Your last 20 attendance records</CardDescription>
            </CardHeader>
            <CardContent>
              {attendanceRecords.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No attendance records yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceRecords.slice(0, 20).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          {r.class.class_date
                            ? new Date(r.class.class_date).toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{r.class.subject.name}</span>
                          <span className="text-muted-foreground ml-2 text-sm">({r.class.subject.code})</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.class.start_time} - {r.class.end_time}
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge variant={r.status === "present" ? "safe" : "risk"}>
                            {r.status === "present" ? "Present" : "Absent"}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}
