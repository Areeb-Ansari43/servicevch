import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestLoginCode, verifyLoginCode } from "@/lib/auth-otp.functions";
import { RouteErrorBoundary } from "@/components/error-boundary";
import { BrandLogo } from "@/components/brand-logo";
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
  X,
  Loader2,
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
  const [showSplash, setShowSplash] = useState(false);
  const [splashPhase, setSplashPhase] = useState<"logo" | "text" | "fade" | "done">("done");
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
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [lightSweep, setLightSweep] = useState(false);
  const [isRouting, setIsRouting] = useState(false);

  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const submittedRef = useRef(false);

  // Email validation check
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Splash screen once per session
  useEffect(() => {
    if (typeof window !== "undefined") {
      const splashSeen = sessionStorage.getItem("vch_splash_shown");
      if (!splashSeen) {
        setShowSplash(true);
        setSplashPhase("logo");
        sessionStorage.setItem("vch_splash_shown", "true");

        const timer1 = setTimeout(() => setSplashPhase("text"), 400);
        const timer2 = setTimeout(() => setSplashPhase("fade"), 1100);
        const timer3 = setTimeout(() => {
          setSplashPhase("done");
          setShowSplash(false);
        }, 1400);

        return () => {
          clearTimeout(timer1);
          clearTimeout(timer2);
          clearTimeout(timer3);
        };
      }
    }
  }, []);

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

  const triggerErrorShake = (msg: string) => {
    setError(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 450);
  };

  const submitCreds = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      triggerErrorShake("Email and password are required.");
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
      triggerErrorShake(
        err?.message?.includes("Invalid credentials")
          ? "Invalid credentials. Please check your email and password."
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
      console.info("[Login] Session established successfully, playing transition...");
      setFeedback("success");

      // Light sweep and navigation transition
      setTimeout(() => setLightSweep(true), 300);
      setTimeout(() => setIsRouting(true), 550);
      setTimeout(() => navigate({ to: "/" }), 800);
    } catch (err: any) {
      console.error("[Login] Verification failed:", err);
      setFeedback("error");
      triggerErrorShake(err?.message ?? "Verification failed. Check your code or request a new one.");
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

  const handleSendResetLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotSubmitted(true);
    setTimeout(() => {
      setForgotSubmitted(false);
      setIsForgotModalOpen(false);
      setForgotEmail("");
      setInfo("Password reset link sent to your email address.");
    }, 1200);
  };

  return (
    <div className="relative h-dvh min-h-dvh w-full overflow-hidden font-sans bg-[#07090D] text-white flex flex-col justify-between select-none">
      {/* CSS Animations, Responsive Background Image & Micro-interactions */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-4px); }
          40%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
        @keyframes lightSweep {
          0% { transform: translateX(-100%); opacity: 0; }
          50% { opacity: 0.8; }
          100% { transform: translateX(200%); opacity: 0; }
        }
        .animate-light-sweep {
          animation: lightSweep 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes cardSpring {
          0% { opacity: 0; transform: scale(0.97) translateY(15px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-card-spring {
          animation: cardSpring 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* Responsive Full-Page Background Car Positioning */
        .vch-login-bg-car {
          background-image: url('/login-bg-car.jpg');
          background-position: left bottom;
          background-repeat: no-repeat;
          background-size: auto 100%;
          -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0) 88%);
          mask-image: linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 35%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0) 88%);
        }
        @media (max-aspect-ratio: 3/2) {
          .vch-login-bg-car {
            background-size: cover;
          }
        }
        @media (max-width: 768px) {
          .vch-login-bg-car {
            background-image: url('/login-bg-car-mobile.jpg');
            background-size: cover;
            -webkit-mask-image: none;
            mask-image: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-shake, .animate-light-sweep, .animate-card-spring {
            animation: none !important;
            transform: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* Splash Screen */}
      {showSplash && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#07090D] transition-opacity duration-300 ${
            splashPhase === "fade" ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className="relative flex flex-col items-center gap-4">
            <BrandLogo className="h-16 w-auto animate-pulse" />
            <div
              className={`flex flex-col items-center text-center transition-all duration-500 ${
                splashPhase === "logo" ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
              }`}
            >
              <h1 className="text-xl font-bold tracking-tight text-white">Virtual Car Hire</h1>
              <p className="text-xs text-slate-400 font-medium">Fleet Operations Platform</p>
            </div>
          </div>
        </div>
      )}

      {/* Light sweep overlay during sign-in completion */}
      {lightSweep && (
        <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden">
          <div className="h-full w-1/2 bg-gradient-to-r from-transparent via-[#ff6a00]/25 to-transparent skew-x-12 animate-light-sweep" />
        </div>
      )}

      {/* Full-Viewport Background Car Image (fixed inset-0 behind everything) */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="vch-login-bg-car w-full h-full" />

        {/* Subtle dark overlay (35% opacity) to keep text readable + right/top dark gradients */}
        <div className="absolute inset-0 bg-[#07090D]/35" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent 35% to-[#07090D] 85%" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#07090D]/80 via-transparent 25% to-transparent" />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-10 shrink-0 flex items-center justify-between px-6 py-[1.5vh] lg:px-12">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-[clamp(28px,3.5vh,36px)] w-auto" />
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[clamp(11px,1.3vh,13px)] font-medium text-slate-300">Secure environment</span>
        </div>
      </header>

      {/* Main Responsive Grid Layout */}
      <main className="relative z-10 flex-1 min-h-0 my-auto grid w-full px-6 lg:px-12 grid-cols-1 lg:grid-cols-[1fr_minmax(460px,32vw)_1fr] gap-4 lg:gap-8 items-center">
        {/* Left Column (Desktop) - Aligned with Header Logo */}
        <div className="hidden lg:flex flex-col justify-between h-full py-2 min-h-0">
          <div className="space-y-[1.5vh] my-auto">
            <span className="text-[clamp(10px,1.2vh,12px)] font-bold tracking-[0.2em] text-[#ff6a00] uppercase block">
              DRIVE ▪ MANAGE ▪ GROW
            </span>
            <h1 className="text-[clamp(32px,3.8vh,50px)] font-extrabold tracking-tight leading-[1.12] text-white">
              Smarter fleet <br />
              <span className="text-[#ff6a00]">management.</span>
            </h1>
            <p className="text-slate-300 text-[clamp(12px,1.5vh,15px)] leading-relaxed max-w-sm">
              Everything you need to keep your fleet moving, in one place.
            </p>
          </div>

          <div className="border-l-2 border-[#ff6a00] pl-4 py-1 space-y-0.5 mb-2">
            <p className="text-[clamp(12px,1.4vh,14px)] font-semibold text-white">Trusted by operators nationwide</p>
            <p className="text-[clamp(10px,1.2vh,12px)] text-slate-400">More vehicles. Less admin. Greater control.</p>
          </div>
        </div>

        {/* Center Main Card Column */}
        <div className="flex justify-center items-center w-full min-h-0 max-h-full py-1">
          <div
            className={`w-full max-w-[640px] sm:min-w-[460px] rounded-[20px] border-[1.5px] border-white/16 bg-[#0E131B]/90 p-[clamp(16px,2.5vh,36px)] shadow-2xl space-y-[clamp(10px,1.8vh,22px)] max-h-full overflow-y-auto sm:overflow-visible animate-card-spring transition-all duration-300 ${
              isRouting ? "opacity-0 scale-95" : "opacity-100"
            }`}
          >
            {/* Logo Mark and Title inside Card */}
            <div className="flex flex-col items-center text-center space-y-[0.5vh]">
              <BrandLogo className="h-[clamp(44px,6vh,72px)] w-auto mx-auto" />
              <h2 className="text-[clamp(22px,3vh,30px)] font-bold text-white tracking-tight leading-tight pt-1">
                Virtual Car Hire
              </h2>
              <p className="text-[clamp(11px,1.4vh,13px)] text-slate-400 font-medium">Fleet Operations Platform</p>
            </div>

            {info && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[clamp(10px,1.3vh,12px)] font-medium text-emerald-200">
                {info}
              </div>
            )}

            {stage === "creds" ? (
              <form onSubmit={submitCreds} className={`space-y-[clamp(10px,1.6vh,20px)] ${isShaking ? "animate-shake" : ""}`}>
                {/* Email Field */}
                <div className="space-y-[0.5vh]">
                  <label className="block text-[clamp(11px,1.4vh,13px)] font-semibold text-white">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="areeb@fa-ibi.co.uk"
                      className="w-full h-[clamp(40px,5vh,52px)] rounded-xl border border-white/15 bg-[#141A24] pl-11 pr-10 text-xs sm:text-sm font-medium text-white placeholder-slate-500 focus:border-[#ff6a00] focus:outline-none focus:ring-1 focus:ring-[#ff6a00] transition-colors"
                      autoComplete="email"
                    />
                    {isValidEmail && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400 animate-in fade-in zoom-in duration-200">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-[0.5vh]">
                  <label className="block text-[clamp(11px,1.4vh,13px)] font-semibold text-white">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-[clamp(40px,5vh,52px)] rounded-xl border border-white/15 bg-[#141A24] pl-11 pr-11 text-xs sm:text-sm font-medium text-white placeholder-slate-500 focus:border-[#ff6a00] focus:outline-none focus:ring-1 focus:ring-[#ff6a00] transition-colors"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors p-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between text-[clamp(11px,1.4vh,13px)] pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`h-4 w-4 rounded border transition-colors flex items-center justify-center ${
                          rememberMe
                            ? "bg-[#ff6a00] border-[#ff6a00]"
                            : "bg-[#141A24] border-white/20 group-hover:border-white/40"
                        }`}
                      >
                        {rememberMe && <Check className="h-3 w-3 text-white stroke-[3]" />}
                      </div>
                    </div>
                    <span className="text-slate-300 font-medium">Remember me</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setIsForgotModalOpen(true);
                    }}
                    className="text-[#ff6a00] underline hover:text-[#ff8a3d] font-semibold transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Inline Error Message */}
                {error && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-xs font-medium text-red-200">
                    {error}
                  </div>
                )}

                {/* Continue Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full h-[clamp(40px,5vh,52px)] rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff8a3d] text-[clamp(13px,1.6vh,16px)] font-bold text-white shadow-lg shadow-[#ff6a00]/20 hover:from-[#f05f00] hover:to-[#ff7a1a] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer overflow-hidden"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Signing in...</span>
                    </div>
                  ) : (
                    <>
                      <span>Continue</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </>
                  )}
                </button>

                {/* Support Section with WhatsApp Link */}
                <div className="space-y-[1vh] pt-1">
                  <div className="relative flex items-center justify-center">
                    <div className="w-full border-t border-white/10" />
                    <span className="absolute bg-[#0E131B] px-3 text-[clamp(10px,1.2vh,12px)] text-slate-400 font-medium">
                      Need help?
                    </span>
                  </div>

                  <a
                    href="https://wa.me/447721502779?text=Hi%2C%20I%20need%20help%20with%20the%20Virtual%20Car%20Hire%20CRM"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full h-[clamp(36px,4.5vh,44px)] rounded-xl border border-white/10 bg-[#141A24]/60 hover:bg-[#141A24] text-[clamp(11px,1.4vh,13px)] font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer text-center"
                  >
                    <Headphones className="h-3.5 w-3.5 text-[#ff6a00]" />
                    <span>Contact support</span>
                  </a>
                </div>
              </form>
            ) : (
              /* OTP Verification Stage */
              <div className="space-y-4">
                {feedback === "success" ? (
                  <div className="py-6 flex flex-col items-center justify-center space-y-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                      <Check className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Welcome back!</h3>
                    <p className="text-xs text-emerald-300 font-medium">Authentication successful.</p>
                  </div>
                ) : (
                  <>
                    <div className="text-center space-y-1">
                      <h3 className="text-base font-bold text-white">Enter 6-Digit Code</h3>
                      <p className="text-xs text-slate-400">
                        {info ?? "We emailed a verification code to your email."}
                      </p>
                    </div>

                    <div className={`flex justify-center gap-2 ${isShaking ? "animate-shake" : ""}`}>
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
                          className="h-12 w-10 sm:w-11 rounded-xl border border-white/15 bg-[#141A24] text-center text-lg font-bold text-white focus:border-[#ff6a00] focus:outline-none focus:ring-1 focus:ring-[#ff6a00] transition-colors"
                        />
                      ))}
                    </div>

                    {error && (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-center text-xs font-medium text-red-200">
                        {error}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-1">
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
                        className="text-slate-400 hover:text-white font-medium transition-colors cursor-pointer"
                      >
                        ← Different email
                      </button>

                      <button
                        type="button"
                        disabled={resendCooldown > 0 || loading}
                        onClick={handleResendCode}
                        className="text-[#ff6a00] hover:text-[#ff8a3d] disabled:text-slate-500 font-bold transition-colors cursor-pointer"
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
        <div className="hidden lg:flex flex-col justify-center space-y-[2.5vh] pl-4 min-h-0">
          {/* Feature 1 */}
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-[#141A24] border border-white/10 flex items-center justify-center text-[#ff6a00]">
              <Activity className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <h3 className="font-semibold text-white text-[clamp(13px,1.6vh,16px)]">Track Your Fleet</h3>
              <p className="text-slate-400 text-[clamp(10px,1.3vh,12px)] leading-relaxed">
                Real-time visibility over all vehicles, allocations, and driver activity.
              </p>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-[#141A24] border border-white/10 flex items-center justify-center text-[#ff6a00]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <h3 className="font-semibold text-white text-[clamp(13px,1.6vh,16px)]">Stay Compliant</h3>
              <p className="text-slate-400 text-[clamp(10px,1.3vh,12px)] leading-relaxed">
                Automated MOT, PCO, and driver licence expiration alerts.
              </p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-[#141A24] border border-white/10 flex items-center justify-center text-[#ff6a00]">
              <Zap className="h-4 w-4" />
            </div>
            <div className="space-y-0.5">
              <h3 className="font-semibold text-white text-[clamp(13px,1.6vh,16px)]">Save Time</h3>
              <p className="text-slate-400 text-[clamp(10px,1.3vh,12px)] leading-relaxed">
                Streamlined rent tracking, automated messaging, and quick billing.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 shrink-0 px-6 py-[1.2vh] lg:px-12 flex justify-end">
        <p className="text-[clamp(10px,1.2vh,12px)] font-medium text-slate-400">
          © 2026 Virtual Car Hire · Fleet Operations Platform
        </p>
      </footer>

      {/* Forgot Password Modal */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full sm:max-w-md rounded-t-[20px] sm:rounded-[20px] border border-white/16 bg-[#0E131B] p-6 md:p-8 shadow-2xl space-y-6 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Reset Password</h3>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Enter your registered email address below. We will send you a password reset link to create a new password.
            </p>

            <form onSubmit={handleSendResetLink} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-white">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="areeb@fa-ibi.co.uk"
                    required
                    className="w-full h-12 rounded-xl border border-white/15 bg-[#141A24] pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-[#ff6a00] focus:outline-none focus:ring-1 focus:ring-[#ff6a00]"
                  />
                </div>
              </div>

              {forgotSubmitted ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs text-emerald-200 font-medium">
                  Reset link sent! Check your inbox.
                </div>
              ) : (
                <button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff8a3d] font-semibold text-sm text-white shadow-lg shadow-[#ff6a00]/20 hover:from-[#f05f00] hover:to-[#ff7a1a] transition-all cursor-pointer"
                >
                  Send reset link
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
