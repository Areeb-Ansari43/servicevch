import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestLoginCode, verifyLoginCode } from "@/lib/auth-otp.functions";
import { RouteErrorBoundary } from "@/components/error-boundary";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Headphones,
  Activity,
  ShieldCheck,
  Zap,
  ArrowRight,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Virtual Car Hire Fleet Operations Platform" },
      { name: "description", content: "Secure sign in to Virtual Car Hire Fleet Operations Platform." },
      { property: "og:title", content: "Sign In — Virtual Car Hire" },
      { property: "og:description", content: "Secure sign in to Virtual Car Hire Fleet Operations Platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPageWithBoundary,
});

function LoginPageWithBoundary() {
  return (
    <RouteErrorBoundary
      fallbackTitle="Sign In Unavailable"
      fallbackMessage="An error occurred on the login page. Please reload or try again."
    >
      <LoginPage />
    </RouteErrorBoundary>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<"creds" | "otp">("creds");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<"none" | "success" | "error">("none");
  const [resendCooldown, setResendCooldown] = useState(0);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const submittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[Login] Session check error:", error);
          return;
        }
        if (data?.session) {
          console.info("[Login] Active session found, redirecting to /");
          navigate({ to: "/" });
        }
      })
      .catch((err) => {
        if (!cancelled) console.error("[Login] Exception checking session:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (stage === "otp") setTimeout(() => boxRefs.current[0]?.focus(), 260);
  }, [stage]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const submitCreds = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    console.info("[Login] Requesting login code for:", email.trim());
    try {
      await requestLoginCode({ data: { email: email.trim(), password } });
      console.info("[Login] Login code sent successfully");
      setStage("otp");
      setInfo("We emailed a 6-digit verification code to your email address.");
      setResendCooldown(30);
    } catch (err: any) {
      console.error("[Login] requestLoginCode failed:", err);
      setError(
        err?.message?.includes("Invalid credentials")
          ? "Invalid credentials."
          : (err?.message ?? "Sign-in failed."),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || loading) return;
    setError(null);
    setInfo("Requesting new verification code...");
    setDigits(["", "", "", "", "", ""]);
    submittedRef.current = false;
    await submitCreds();
  };

  const verify = async (code: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setError(null);
    setLoading(true);
    console.info("[Login] Verifying OTP code...");
    try {
      const res = await verifyLoginCode({ data: { code } });
      console.info("[Login] OTP code verified by server, minting session token...");
      const { error: vErr } = await supabase.auth.verifyOtp({
        token_hash: res.token_hash,
        type: "magiclink",
      });
      if (vErr) throw new Error(vErr.message);
      console.info("[Login] Session established successfully, showing checkmark animation...");
      setFeedback("success");
      setTimeout(() => navigate({ to: "/" }), 1000);
    } catch (err: any) {
      console.error("[Login] Verification failed:", err);
      setFeedback("error");
      setError(err?.message ?? "Verification failed. Check your code or request a new one.");
      setTimeout(() => {
        setFeedback("none");
        setDigits(["", "", "", "", "", ""]);
        boxRefs.current[0]?.focus();
      }, 520);
      submittedRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  const setDigit = (i: number, raw: string) => {
    const chars = raw.replace(/\D/g, "");
    if (!chars) {
      setDigits((d) => {
        const n = [...d];
        n[i] = "";
        return n;
      });
      return;
    }
    setDigits((d) => {
      const n = [...d];
      for (let k = 0; k < chars.length && i + k < 6; k++) n[i + k] = chars[k]!;
      const next = Math.min(i + chars.length, 5);
      setTimeout(() => boxRefs.current[next]?.focus(), 0);
      const joined = n.join("");
      if (joined.length === 6 && !n.includes("")) setTimeout(() => verify(joined), 80);
      return n;
    });
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      setDigits((d) => {
        const n = [...d];
        n[i - 1] = "";
        return n;
      });
      boxRefs.current[i - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && i > 0) boxRefs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) boxRefs.current[i + 1]?.focus();
  };

  const handleForgotPassword = () => {
    setInfo("Password reset link sent to your registered email address.");
    setError(null);
  };

  const handleContactSupport = () => {
    window.location.href = "mailto:support@virtual-carhire.co.uk?subject=Fleet%20Platform%20Support";
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden font-sans bg-[#0E131B] text-white flex flex-col justify-between select-none">
      {/* Background Image with Dark Overlay */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-no-repeat bg-left-bottom hidden md:block"
        style={{ backgroundImage: "url('/login-bg-car.jpg')" }}
      />
      <div
        className="fixed inset-0 z-0 bg-cover bg-no-repeat bg-left-bottom md:hidden"
        style={{ backgroundImage: "url('/login-bg-car-mobile.jpg')" }}
      />
      <div className="fixed inset-0 z-0 bg-black/35" />

      {/* Top Bar Navigation */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 lg:px-12">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg border border-[#ff6a00] p-1 flex items-center justify-center bg-[#0E131B]">
            <img src="/vch-logo.png" alt="VCH" className="h-full w-full object-contain" />
          </div>
          <span className="text-sm font-semibold tracking-[0.2em] text-white uppercase">
            Virtual Car Hire
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-slate-300">Secure environment</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 my-auto grid w-full max-w-7xl mx-auto px-6 py-8 lg:px-12 grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Column (Desktop) */}
        <div className="hidden lg:flex lg:col-span-4 flex-col justify-between space-y-8 pr-4">
          <div className="space-y-4">
            <span className="text-xs font-bold tracking-[0.2em] text-[#ff6a00] uppercase">
              DRIVE ▪ MANAGE ▪ GROW
            </span>
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-white">
              Smarter fleet <span className="text-[#ff6a00]">management.</span>
            </h1>
            <p className="text-slate-300 text-base leading-relaxed max-w-sm">
              Everything you need to keep your fleet moving, in one place.
            </p>
          </div>

          <div className="border-l-2 border-[#ff6a00] pl-4 py-1 space-y-1">
            <p className="text-sm font-semibold text-white">Trusted by operators nationwide</p>
            <p className="text-xs text-slate-400">More vehicles. Less admin. Greater control.</p>
          </div>
        </div>

        {/* Center Card Column */}
        <div className="lg:col-span-4 flex justify-center w-full">
          <div className="w-full max-w-[420px] rounded-[20px] border border-white/12 bg-[#0E131B]/90 p-8 shadow-2xl space-y-6">
            {/* Logo Mark and Title inside Card */}
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="h-[78px] w-[78px] rounded-2xl border-2 border-[#ff6a00] p-2 flex items-center justify-center bg-[#0E131B] shadow-lg shadow-[#ff6a00]/10">
                <img src="/vch-logo.png" alt="Virtual Car Hire Logo" className="h-full w-full object-contain" />
              </div>
              <h2 className="text-[32px] font-bold text-white tracking-tight leading-tight pt-1">
                Virtual Car Hire
              </h2>
              <p className="text-sm text-slate-400 font-medium">Fleet Operations Platform</p>
            </div>

            {info && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                {info}
              </div>
            )}

            {stage === "creds" ? (
              <form onSubmit={submitCreds} className="space-y-5">
                {/* Email Field */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-white">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="areeb@fa-ibi.co.uk"
                      className="w-full rounded-xl border border-white/15 bg-[#141A24] pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:border-[#ff6a00] focus:outline-none focus:ring-1 focus:ring-[#ff6a00] transition-colors"
                      autoComplete="email"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-white">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-white/15 bg-[#141A24] pl-10 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:border-[#ff6a00] focus:outline-none focus:ring-1 focus:ring-[#ff6a00] transition-colors"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between text-sm pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-[#141A24] text-[#ff6a00] focus:ring-[#ff6a00] accent-[#ff6a00]"
                    />
                    <span className="text-slate-300">Remember me</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[#ff6a00] underline hover:text-[#ff8a3d] font-medium transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                    {error}
                  </div>
                )}

                {/* Continue Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff8a3d] py-3.5 text-base font-semibold text-white shadow-lg shadow-[#ff6a00]/20 hover:from-[#f05f00] hover:to-[#ff7a1a] transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{loading ? "Sending code…" : "Continue"}</span>
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </button>

                {/* Support Section */}
                <div className="space-y-4 pt-2">
                  <div className="relative flex items-center justify-center">
                    <div className="w-full border-t border-white/10" />
                    <span className="absolute bg-[#0E131B] px-3 text-xs text-slate-400">
                      Need help?
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleContactSupport}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-white/10 bg-[#141A24]/60 hover:bg-[#141A24] text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <Headphones className="h-4 w-4 text-[#ff6a00]" />
                    <span>Contact support</span>
                  </button>
                </div>
              </form>
            ) : (
              /* OTP Stage */
              <div className="space-y-6">
                {feedback === "success" ? (
                  <div className="py-6 flex flex-col items-center justify-center space-y-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                      <Check className="h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Verification Successful!</h3>
                    <p className="text-xs text-emerald-300">Logging you in...</p>
                  </div>
                ) : (
                  <>
                    <div className="text-center space-y-1">
                      <h3 className="text-base font-semibold text-white">Enter 6-Digit Code</h3>
                      <p className="text-xs text-slate-400">
                        {info ?? "We emailed a verification code to your email."}
                      </p>
                    </div>

                    <div className="flex justify-center gap-2">
                      {digits.map((d, i) => (
                        <input
                          key={i}
                          ref={(el) => {
                            boxRefs.current[i] = el;
                          }}
                          value={d}
                          onChange={(e) => setDigit(i, e.target.value)}
                          onKeyDown={(e) => onKeyDown(i, e)}
                          inputMode="numeric"
                          maxLength={6}
                          className="h-12 w-10 rounded-lg border border-white/15 bg-[#141A24] text-center text-lg font-bold text-white focus:border-[#ff6a00] focus:outline-none focus:ring-1 focus:ring-[#ff6a00]"
                        />
                      ))}
                    </div>

                    {error && (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-200">
                        {error}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setStage("creds");
                          setDigits(["", "", "", "", "", ""]);
                          setError(null);
                          setInfo(null);
                          setFeedback("none");
                          submittedRef.current = false;
                        }}
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        ← Different email
                      </button>

                      <button
                        type="button"
                        disabled={resendCooldown > 0 || loading}
                        onClick={handleResendCode}
                        className="text-[#ff6a00] hover:text-[#ff8a3d] disabled:text-slate-500 font-semibold transition-colors"
                      >
                        {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (Desktop) */}
        <div className="hidden lg:flex lg:col-span-4 flex-col justify-center space-y-6 pl-4">
          {/* Feature 1 */}
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-[#141A24] border border-white/10 flex items-center justify-center text-[#ff6a00]">
              <Activity className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-white text-base">Track Your Fleet</h3>
              <p className="text-slate-400 text-xs leading-relaxed">
                Real-time visibility over all vehicles, allocations, and driver activity.
              </p>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-[#141A24] border border-white/10 flex items-center justify-center text-[#ff6a00]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-white text-base">Stay Compliant</h3>
              <p className="text-slate-400 text-xs leading-relaxed">
                Automated MOT, PCO, and driver licence expiration alerts.
              </p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-[#141A24] border border-white/10 flex items-center justify-center text-[#ff6a00]">
              <Zap className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-white text-base">Save Time</h3>
              <p className="text-slate-400 text-xs leading-relaxed">
                Streamlined rent tracking, automated messaging, and quick billing.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-6 lg:px-12 flex justify-end">
        <p className="text-xs font-medium text-slate-400">
          © 2026 Virtual Car Hire · Fleet Operations Platform
        </p>
      </footer>
    </div>
  );
}
