import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CollegeHeader } from "@/components/layout/CollegeHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  GraduationCap, Eye, EyeOff, Loader2, Camera, CameraOff, Trash2, AlertCircle, Save, User,
} from "lucide-react";

interface CapturedImage {
  id: number;
  dataUrl: string;
}

export default function StudentSignup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [formData, setFormData] = useState({
    fullName: "",
    rollNumber: "",
    email: "",
    phoneNumber: "",
    password: "",
    departmentId: "",
    yearId: "",
    sectionId: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [departments, setDepartments] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);

  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    if (formData.departmentId) fetchYears(formData.departmentId);
  }, [formData.departmentId]);

  useEffect(() => {
    if (formData.yearId) fetchSections(formData.yearId);
  }, [formData.yearId]);

  useEffect(() => {
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, [stream]);

  useEffect(() => {
    if (!isCameraActive || !stream || !videoRef.current) return;
    const v = videoRef.current;
    v.srcObject = stream;
    const play = async () => { try { await v.play(); } catch {} };
    if (v.readyState >= 1) play();
    else v.onloadedmetadata = () => play();
  }, [isCameraActive, stream]);

  const fetchDepartments = async () => {
    const { data } = await supabase.from("departments").select("*").order("name");
    setDepartments(data || []);
  };
  const fetchYears = async (deptId: string) => {
    const { data } = await supabase.from("years").select("*").eq("department_id", deptId).order("year_number");
    setYears(data || []);
    setFormData(p => ({ ...p, yearId: "", sectionId: "" }));
  };
  const fetchSections = async (yearId: string) => {
    const { data } = await supabase.from("sections").select("*").eq("year_id", yearId).order("name");
    setSections(data || []);
    setFormData(p => ({ ...p, sectionId: "" }));
  };

  const startCamera = async () => {
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: 640, height: 480, facingMode: { ideal: "user" } } });
      setStream(ms);
      setIsCameraActive(true);
    } catch {
      toast({ title: "Camera Error", description: "Unable to access camera.", variant: "destructive" });
    }
  };
  const stopCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setStream(null);
    setIsCameraActive(false);
  };

  const captureImage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current, canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      setCapturedImages(prev => [...prev, { id: Date.now(), dataUrl: canvas.toDataURL("image/jpeg", 0.8) }]);
      setIsCapturing(true);
      setTimeout(() => setIsCapturing(false), 150);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.rollNumber || !formData.sectionId || !formData.password) {
      toast({ title: "Missing Information", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    if (formData.password.length < 6) {
      toast({ title: "Weak Password", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // 1. Create student + auth account via edge function (handles RLS bypass)
      const { data: result, error: fnErr } = await supabase.functions.invoke("register-student", {
        body: {
          full_name: formData.fullName,
          roll_number: formData.rollNumber,
          email: formData.email || null,
          phone_number: formData.phoneNumber || null,
          section_id: formData.sectionId,
          password: formData.password,
          face_registered: capturedImages.length >= 5,
        },
      });

      if (fnErr) throw fnErr;
      if (result?.error) throw new Error(result.error);

      const studentId = result.student_id;

      // 2. If face images captured, call face training API
      if (capturedImages.length >= 5 && studentId) {
        try {
          const baseUrl = import.meta.env.VITE_FACE_API_URL || "http://localhost:8000";
          await fetch(`${baseUrl}/api/face-training`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              student_id: studentId,
              roll_number: formData.rollNumber,
              images: capturedImages.map(img => img.dataUrl),
            }),
          });
        } catch {
          // Face training API might not be available
        }
      }

      toast({
        title: "Registration Successful!",
        description: `Account created for ${formData.fullName}. Login email: ${authResult?.email}`,
      });

      navigate("/login");
    } catch (error: any) {
      toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <CollegeHeader />

      <main className="flex-1 flex items-start justify-center p-4 sm:p-6 pt-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-4xl">
          <Card className="border-0 shadow-xl">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl font-display flex items-center justify-center gap-2">
                <GraduationCap className="h-6 w-6" />
                Student Registration
              </CardTitle>
              <CardDescription>Register yourself, select your department & section, and train your face</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-2">
                {/* Personal Info */}
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2"><User className="h-4 w-4" /> Personal Details</h3>
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input placeholder="Your full name" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Roll Number *</Label>
                    <Input placeholder="e.g. 2024CS001" value={formData.rollNumber} onChange={e => setFormData({ ...formData, rollNumber: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Email (Optional)</Label>
                    <Input type="email" placeholder="your@email.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>WhatsApp Number (Optional)</Label>
                    <Input type="tel" placeholder="919876543210" value={formData.phoneNumber} onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Password *</Label>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} placeholder="Min 6 characters" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} required className="pr-10" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Academic Info */}
                  <h3 className="font-semibold pt-2">Academic Details</h3>
                  <div className="space-y-2">
                    <Label>Department *</Label>
                    <Select value={formData.departmentId} onValueChange={v => setFormData({ ...formData, departmentId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                      <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.code})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Year *</Label>
                      <Select value={formData.yearId} onValueChange={v => setFormData({ ...formData, yearId: v })} disabled={!formData.departmentId}>
                        <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                        <SelectContent>{years.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Section *</Label>
                      <Select value={formData.sectionId} onValueChange={v => setFormData({ ...formData, sectionId: v })} disabled={!formData.yearId}>
                        <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
                        <SelectContent>{sections.map(s => <SelectItem key={s.id} value={s.id}>Section {s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Face Capture */}
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2"><Camera className="h-4 w-4" /> Face Training (Optional)</h3>
                  <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                    {isCameraActive ? (
                      <>
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        <AnimatePresence>
                          {isCapturing && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-white" />}
                        </AnimatePresence>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-36 h-36 border-4 border-accent border-dashed rounded-full opacity-50" />
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                        <CameraOff className="h-10 w-10 mb-2 opacity-50" />
                        <p className="text-sm">Camera is off</p>
                      </div>
                    )}
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="flex gap-2">
                    {!isCameraActive ? (
                      <Button type="button" onClick={startCamera} className="flex-1 gap-2" variant="outline"><Camera className="h-4 w-4" /> Start Camera</Button>
                    ) : (
                      <>
                        <Button type="button" onClick={captureImage} className="flex-1 gap-2" disabled={capturedImages.length >= 10}><Camera className="h-4 w-4" /> Capture ({capturedImages.length}/10)</Button>
                        <Button type="button" variant="outline" onClick={stopCamera}><CameraOff className="h-4 w-4" /></Button>
                      </>
                    )}
                  </div>
                  {capturedImages.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Captured ({capturedImages.length})</p>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setCapturedImages([])} className="text-destructive"><Trash2 className="h-3 w-3 mr-1" /> Clear</Button>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {capturedImages.map(img => (
                          <div key={img.id} className="relative aspect-square group">
                            <img src={img.dataUrl} alt="Face" className="w-full h-full object-cover rounded" />
                            <button type="button" onClick={() => setCapturedImages(p => p.filter(i => i.id !== img.id))} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                              <Trash2 className="h-3 w-3 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground space-y-1">
                    <div className="flex items-start gap-2"><AlertCircle className="h-3.5 w-3.5 mt-0.5" /><span>Capture 5-10 clear face images for best recognition</span></div>
                    <p className="pl-5">• Ensure good lighting and face visibility</p>
                    <p className="pl-5">• Your teacher can also train your face later</p>
                  </div>
                </div>

                {/* Submit */}
                <div className="md:col-span-2">
                  <Button type="submit" size="lg" className="w-full gap-2" disabled={loading}>
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Registering...</> : <><Save className="h-4 w-4" /> Register & Create Account</>}
                  </Button>
                  <p className="text-center text-sm text-muted-foreground mt-4">
                    Already have an account?{" "}
                    <Link to="/login" className="font-medium text-accent hover:underline">Sign in</Link>
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
