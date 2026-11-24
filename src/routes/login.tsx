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
    console.info("[Login] Verifying OTP code for:", email.trim());
    try {
      const res = await verifyLoginCode({ data: { email: email.trim(), code: code.trim() } });
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
    <div className="vch-login relative min-h-dvh w-full overflow-x-hidden font-sans bg-[#07090D] text-white flex flex-col justify-between">
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

        /* Entrance: each part of the card rises in, one after another */
        @keyframes vchRise {
          from { opacity: 0; transform: translateY(14px); filter: blur(4px); }
          to { opacity: 1; transform: none; filter: none; }
        }
        .vch-rise { animation: vchRise 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards; animation-delay: calc(var(--i, 0) * 70ms + 120ms); }

        /* Background car: a very slow drift / zoom */
        @keyframes vchKen { from { transform: scale(1.04) translate3d(0,0,0); } to { transform: scale(1.12) translate3d(-1.5%, -1%, 0); } }
        .vch-ken { animation: vchKen 26s ease-in-out infinite alternate; will-change: transform; }

        /* Soft orange glow drifting behind the card */
        @keyframes vchOrb {
          0% { transform: translate3d(-10%, -6%, 0) scale(1); opacity: .55; }
          50% { transform: translate3d(8%, 6%, 0) scale(1.15); opacity: .8; }
          100% { transform: translate3d(-10%, -6%, 0) scale(1); opacity: .55; }
        }
        .vch-orb { animation: vchOrb 14s ease-in-out infinite; }

        /* Logo floats gently */
        @keyframes vchFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .vch-float { animation: vchFloat 5s ease-in-out infinite; }

        /* Sheen across the Continue button */
        @keyframes vchSheen { 0% { transform: translateX(-120%) skewX(-20deg); } 60%, 100% { transform: translateX(260%) skewX(-20deg); } }
        .vch-sheen::after {
          content: ""; position: absolute; inset: 0 auto 0 0; width: 40%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent);
          animation: vchSheen 3.6s ease-in-out 1.2s infinite;
        }

        /* Card border catches the light */
        @property --vch-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
        @keyframes vchSpin { to { --vch-angle: 360deg; } }
        .vch-card-ring { position: relative; isolation: isolate; }
        .vch-card-ring::before {
          content: ""; position: absolute; inset: -1.5px; border-radius: inherit; z-index: -1; padding: 1.5px;
          background: conic-gradient(from var(--vch-angle), rgba(255,106,0,0) 0deg, rgba(255,138,61,.75) 60deg, rgba(255,106,0,0) 140deg, rgba(255,255,255,.08) 220deg, rgba(255,106,0,0) 360deg);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
          animation: vchSpin 7s linear infinite;
        }

        /* Inputs glow softly when focused */
        .vch-field:focus { box-shadow: 0 0 0 4px rgba(255,106,0,.14); }

        /* OTP boxes pop as they fill */
        @keyframes vchPop { 0% { transform: scale(.9); } 60% { transform: scale(1.06); } 100% { transform: scale(1); } }
        .vch-otp-filled { animation: vchPop .22s ease-out; border-color: rgba(255,106,0,.7) !important; }

        /* Short screens (phones on their side): tighter, scrollable */
        @media (max-height: 560px) {
          .vch-login .vch-hide-short { display: none !important; }
          .vch-login .vch-card { padding: 16px 20px !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-shake, .animate-light-sweep, .animate-card-spring, .vch-rise, .vch-ken, .vch-orb, .vch-float, .vch-otp-filled {
            animation: none !important;
            transform: none !important;
            opacity: 1 !important;
            filter: none !important;
          }
          .vch-sheen::after, .vch-card-ring::before { animation: none !important; }
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
            <BrandLogo size={120} className="animate-pulse" />
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
        <div className="vch-login-bg-car vch-ken w-full h-full" />
        <div className="vch-orb absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,106,0,0.22),transparent_65%)] blur-2xl" />

        {/* Subtle dark overlay (35% opacity) to keep text readable + right/top dark gradients */}
        <div className="absolute inset-0 bg-[#07090D]/35" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent 35% to-[#07090D] 85%" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#07090D]/80 via-transparent 25% to-transparent" />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-10 shrink-0 flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 sm:px-6 lg:px-12">
        <div className="hidden lg:flex items-center gap-3">
          <BrandLogo size={56} />
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[12px] font-medium text-slate-200">Secure sign-in</span>
        </div>
      </header>

      {/* Main Responsive Grid Layout */}
      <main className="relative z-10 flex-1 grid w-full px-4 py-2 sm:py-3 sm:px-6 lg:px-12 grid-cols-1 lg:grid-cols-[1fr_minmax(440px,32vw)_1fr] gap-4 lg:gap-8 items-center">
        {/* Left Column (Desktop) - Aligned with Header Logo */}
        <div className="hidden lg:flex flex-col justify-between h-full py-2 min-h-0">
          <div className="space-y-[1.5vh] my-auto vch-rise" style={{ ["--i" as any]: 1 }}>
            <span className="text-[clamp(10px,1.2vh,12px)] font-bold tracking-[0.2em] text-[#ff6a00] uppercase block">
              DRIVE ▪ MANAGE ▪ GROW
            </span>
            <p className="text-[clamp(32px,3.8vh,50px)] font-extrabold tracking-tight leading-[1.12] text-white">
              Smarter fleet <br />
              <span className="text-[#ff6a00]">management.</span>
            </p>
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
            className={`vch-card vch-card-ring w-full max-w-[460px] rounded-[24px] border border-white/10 bg-[#0E131B]/80 backdrop-blur-xl p-5 sm:p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] space-y-4 sm:space-y-5 animate-card-spring transition-all duration-300 ${
              isRouting ? "opacity-0 scale-95" : "opacity-100"
            }`}
          >
            {/* Logo and title */}
            <div className="flex flex-col items-center text-center vch-rise" style={{ ["--i" as any]: 0 }}>
              <div className="vch-float -my-3 sm:-my-2">
                <BrandLogo size={76} className="mx-auto" />
              </div>
              <h1 className="mt-1 text-[24px] sm:text-[28px] font-bold text-white tracking-tight leading-tight">
                {stage === "otp" ? "Check your email" : "Welcome back"}
              </h1>
              <p className="mt-1 text-[13px] text-slate-400 font-medium">
                {stage === "otp" ? "One more step to keep your fleet secure" : "Sign in to Fleet Operations"}
              </p>
            </div>

            {info && stage === "creds" && (
              <div role="status" className="vch-rise rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[13px] font-medium text-emerald-200">
                {info}
              </div>
            )}

            {stage === "creds" ? (
              <form onSubmit={submitCreds} noValidate className={`space-y-3.5 sm:space-y-4 ${isShaking ? "animate-shake" : ""}`}>
                {/* Email Field */}
                <div className="space-y-1.5 vch-rise" style={{ ["--i" as any]: 1 }}>
                  <label htmlFor="login-email" className="block text-[13px] font-semibold text-white">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="login-email"
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.co.uk"
                      aria-invalid={Boolean(error) && !email.trim()}
                      className="vch-field w-full h-[52px] rounded-xl border border-white/15 bg-[#141A24] pl-11 pr-10 text-[16px] font-medium text-white placeholder-slate-500 focus:border-[#ff6a00] focus:outline-none transition-[border-color,box-shadow] duration-200"
                      autoComplete="username email"
                    />
                    {isValidEmail && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400 animate-in fade-in zoom-in duration-200">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-1.5 vch-rise" style={{ ["--i" as any]: 2 }}>
                  <label htmlFor="login-password" className="block text-[13px] font-semibold text-white">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      className="vch-field w-full h-[52px] rounded-xl border border-white/15 bg-[#141A24] pl-11 pr-14 text-[16px] font-medium text-white placeholder-slate-500 focus:border-[#ff6a00] focus:outline-none transition-[border-color,box-shadow] duration-200"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-lg text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ff6a00] transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between gap-3 text-[13px] vch-rise" style={{ ["--i" as any]: 3 }}>
                  <label className="flex min-h-[44px] items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div
                        className={`h-5 w-5 rounded-md border peer-focus-visible:ring-2 peer-focus-visible:ring-[#ff6a00] transition-colors flex items-center justify-center ${
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
                    className="min-h-[44px] px-1 text-[#ff8a3d] underline-offset-4 hover:underline hover:text-[#ffa366] font-semibold transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Inline Error Message */}
                {error && (
                  <div role="alert" className="vch-rise rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[13px] font-medium text-red-200">
                    {error}
                  </div>
                )}

                {/* Continue Button */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{ ["--i" as any]: 4 }}
                  className="vch-rise vch-sheen group relative w-full h-[52px] rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff8a3d] text-[16px] font-bold text-white shadow-lg shadow-[#ff6a00]/25 hover:shadow-[#ff6a00]/40 hover:from-[#f05f00] hover:to-[#ff7a1a] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
                <div className="space-y-3 pt-1 vch-rise" style={{ ["--i" as any]: 5 }}>
                  <div className="flex items-center gap-3 text-[12px] text-slate-400 font-medium">
                    <span className="h-px flex-1 bg-white/10" />
                    Need help?
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  <a
                    href="https://wa.me/447721502779?text=Hi%2C%20I%20need%20help%20with%20the%20Virtual%20Car%20Hire%20CRM"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full h-12 rounded-xl border border-white/10 bg-[#141A24]/60 hover:bg-[#141A24] hover:border-white/20 text-[14px] font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer text-center"
                  >
                    <Headphones className="h-4 w-4 text-[#ff6a00]" />
                    <span>Contact support on WhatsApp</span>
                  </a>
                </div>
              </form>
            ) : (
              /* OTP Verification Stage */
              <div className="space-y-4">
                {feedback === "success" ? (
                  <div role="status" className="py-6 flex flex-col items-center justify-center space-y-2 vch-rise">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 vch-otp-filled">
                      <Check className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white">Welcome back!</h3>
                    <p className="text-xs text-emerald-300 font-medium">Authentication successful.</p>
                  </div>
                ) : (
                  <>
                    <div className="text-center space-y-1 vch-rise" style={{ ["--i" as any]: 1 }}>
                      <h2 className="text-base font-bold text-white">Enter the 6-digit code</h2>
                      <p className="text-[13px] text-slate-400">
                        {info ?? "We emailed a verification code to your email."}
                      </p>
                    </div>

                    <div
                      role="group"
                      aria-label="6-digit verification code"
                      className={`flex justify-center gap-1.5 sm:gap-2 vch-rise ${isShaking ? "animate-shake" : ""}`}
                      style={{ ["--i" as any]: 2 }}
                    >
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
                          pattern="[0-9]*"
                          autoComplete={i === 0 ? "one-time-code" : "off"}
                          aria-label={`Digit ${i + 1} of 6`}
                          maxLength={6}
                          className={`vch-field h-14 w-full max-w-[52px] min-w-0 flex-1 rounded-xl border border-white/15 bg-[#141A24] text-center text-[22px] font-bold text-white focus:border-[#ff6a00] focus:outline-none transition-[border-color,box-shadow] ${d ? "vch-otp-filled" : ""}`}
                        />
                      ))}
                    </div>

                    {error && (
                      <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center text-[13px] font-medium text-red-200">
                        {error}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[13px] pt-1 vch-rise" style={{ ["--i" as any]: 3 }}>
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
                        className="min-h-[44px] px-1 text-slate-400 hover:text-white font-medium transition-colors cursor-pointer"
                      >
                        ← Different email
                      </button>

                      <button
                        type="button"
                        disabled={resendCooldown > 0 || loading}
                        onClick={handleResendCode}
                        className="min-h-[44px] px-1 text-[#ff8a3d] hover:text-[#ffa366] disabled:text-slate-500 font-bold transition-colors cursor-pointer"
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
        <div className="hidden lg:flex flex-col justify-center space-y-[2.5vh] pl-4 min-h-0 vch-rise" style={{ ["--i" as any]: 3 }}>
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
      <footer className="vch-hide-short relative z-10 shrink-0 px-4 pb-[max(10px,env(safe-area-inset-bottom))] pt-0 sm:pt-2 sm:px-6 lg:px-12 flex justify-center lg:justify-end">
        <p className="text-[11px] sm:text-[12px] font-medium text-slate-400 text-center">
          © 2026 Virtual Car Hire · Fleet Operations Platform
        </p>
      </footer>

      {/* Forgot Password Modal */}
      {isForgotModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsForgotModalOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setIsForgotModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] border border-white/15 bg-[#0E131B] p-6 pb-[max(24px,env(safe-area-inset-bottom))] md:p-8 shadow-2xl space-y-6 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 id="reset-title" className="text-xl font-bold text-white">Reset password</h3>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                aria-label="Close"
                className="grid h-11 w-11 place-items-center text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Enter your registered email address below. We will send you a password reset link to create a new password.
            </p>

            <form onSubmit={handleSendResetLink} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="reset-email" className="block text-[13px] font-semibold text-white">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    id="reset-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoFocus
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@company.co.uk"
                    required
                    className="vch-field w-full h-12 rounded-xl border border-white/15 bg-[#141A24] pl-10 pr-4 text-[16px] text-white placeholder-slate-500 focus:border-[#ff6a00] focus:outline-none focus:ring-1 focus:ring-[#ff6a00]"
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
