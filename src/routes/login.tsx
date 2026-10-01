import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestLoginCode, verifyLoginCode } from "@/lib/auth-otp.functions";
import { WEBSITE_BASE_URL } from "@/lib/domain-config";
import { RouteErrorBoundary } from "@/components/error-boundary";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Virtual Car Hire Fleet Tracker" },
      { name: "description", content: "Secure two-step sign in to the VCH Fleet Tracker." },
      { property: "og:title", content: "Sign In — VCH Fleet Tracker" },
      { property: "og:description", content: "Secure two-step sign in to the VCH Fleet Tracker." },
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
      setInfo("We emailed a 6-digit verification code to the authorised account.");
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

  return (
    <div className="min-h-screen bg-[#0A0D14] text-white flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#F97316] selection:text-white">
      {/* Top Header Bar */}
      <header className="w-full max-w-7xl mx-auto flex items-center justify-between pb-6">
        <div className="flex items-center gap-3">
          <img
            src="/vch-logo.png"
            alt="Virtual Car Hire Logo"
            className="h-9 w-auto object-contain"
          />
          <span className="font-bold text-white text-lg tracking-tight">Virtual Car Hire</span>
        </div>
        <div className="hidden md:block text-xs text-white/70 font-medium">
          Authorised Fleet Staff Access
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="w-full max-w-7xl mx-auto flex-1 flex items-center my-4">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

          {/* LEFT: Car Photo with Simple Dark Overlay (Desktop only) */}
          <div className="hidden lg:block lg:col-span-5 h-[560px] relative rounded-2xl overflow-hidden border border-white/10 shadow-lg group">
            <img
              src="/whatsapp/virtual-car-hire-welcome.jpg"
              alt="Virtual Car Hire Fleet Vehicle"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Simple dark overlay for text legibility, not heavy gradient */}
            <div className="absolute inset-0 bg-black/45" />

            <div className="absolute bottom-6 left-6 right-6 p-6 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 text-white">
              <div className="text-xs font-bold uppercase tracking-wider text-[#F97316] mb-1">
                Virtual Car Hire Fleet
              </div>
              <div className="text-base font-bold text-white">
                PCO & EV Rental Specialists
              </div>
              <p className="text-xs text-white/80 mt-1 leading-relaxed">
                London's premier vehicle hire platform. Track rentals, MOT compliance, and driver balances in real time.
              </p>
            </div>
          </div>

          {/* CENTER: Login Card (Off-White #F7F5F2) */}
          <div className="lg:col-span-4 w-full max-w-md mx-auto">
            {/* Mobile Logo Header */}
            <div className="flex flex-col items-center mb-6 lg:hidden">
              <img src="/vch-logo.png" alt="Virtual Car Hire Logo" className="h-12 w-auto mb-2" />
              <h1 className="text-xl font-bold text-white">Virtual Car Hire</h1>
              <p className="text-xs text-white/70">Fleet Tracker</p>
            </div>

            <div className="bg-[#F7F5F2] text-[#14161B] rounded-2xl border border-[#E5E2DC] p-6 sm:p-8 shadow-xl relative overflow-hidden">
              {/* Dark Header Area for Logo inside Card */}
              <div className="bg-[#0B0E17] text-white -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 p-6 mb-6 flex items-center justify-between border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-[#F97316]/20 border border-[#F97316]/40 flex items-center justify-center text-[#F97316]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white leading-none">Sign In to Dashboard</h2>
                    <p className="text-[11px] text-white/60 mt-1">Enter your credentials below</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-[#F97316]/20 text-[#F97316] px-2 py-0.5 rounded border border-[#F97316]/30">
                  Staff
                </span>
              </div>

              {stage === "creds" ? (
                <form onSubmit={submitCreds} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-[#4A4D55] mb-1.5">
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@virtual-carhire.co.uk"
                      required
                      autoComplete="email"
                      className="w-full rounded-lg border border-[#D9D6D0] bg-white px-3.5 py-2.5 text-sm text-[#14161B] placeholder-[#9CA3AF] transition-colors focus:outline-none focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]"
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-[#4A4D55] mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoComplete="current-password"
                        className="w-full rounded-lg border border-[#D9D6D0] bg-white px-3.5 py-2.5 text-sm text-[#14161B] placeholder-[#9CA3AF] transition-colors focus:outline-none focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316] pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#6B7280] hover:text-[#14161B] transition-colors"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-[#4A4D55]">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-[#D9D6D0] text-[#F97316] focus:ring-[#F97316] h-4 w-4"
                      />
                      <span>Remember me</span>
                    </label>

                    <a
                      href="mailto:support@virtual-carhire.co.uk?subject=Password%20Reset%20Request"
                      className="font-medium text-[#F97316] hover:underline"
                    >
                      Forgot password?
                    </a>
                  </div>

                  {error && (
                    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-800">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white font-bold py-2.5 px-4 text-sm transition-colors shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Sending verification code…</span>
                      </>
                    ) : (
                      <span>Continue to Verification →</span>
                    )}
                  </button>

                  <div className="pt-2 text-center border-t border-[#E5E2DC]">
                    <a
                      href="mailto:support@virtual-carhire.co.uk"
                      className="text-xs font-semibold text-[#6B7280] hover:text-[#14161B] transition-colors inline-flex items-center gap-1"
                    >
                      Need help? Contact support
                    </a>
                  </div>
                </form>
              ) : (
                <div className="space-y-5">
                  {feedback === "success" ? (
                    <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 border border-emerald-300">
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <h3 className="text-base font-bold text-[#14161B]">Verification Successful</h3>
                      <p className="text-xs text-[#6B7280]">Logging you in to Virtual Car Hire…</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-center">
                        <h3 className="text-base font-bold text-[#14161B]">Enter 6-Digit Code</h3>
                        <p className="mt-1 text-xs text-[#6B7280]">
                          {info ?? "We sent a 6-digit code to your email address."}
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
                            autoComplete="one-time-code"
                            maxLength={6}
                            aria-label={`Digit ${i + 1}`}
                            className={`h-12 w-10 text-center text-lg font-bold rounded-lg border bg-white transition-all focus:outline-none focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316] ${
                              feedback === "error" ? "border-red-500 text-red-600 bg-red-50" : "border-[#D9D6D0] text-[#14161B]"
                            }`}
                          />
                        ))}
                      </div>

                      {error && (
                        <div className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-center text-xs font-semibold text-red-800">
                          {error}
                        </div>
                      )}

                      {loading && <div className="text-center text-xs text-[#6B7280]">Verifying code…</div>}

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
                          className="font-medium text-[#6B7280] hover:text-[#14161B] transition-colors"
                        >
                          ← Different email
                        </button>

                        <button
                          type="button"
                          disabled={resendCooldown > 0 || loading}
                          onClick={handleResendCode}
                          className="font-bold text-[#F97316] hover:underline disabled:text-[#9CA3AF] transition-colors"
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

          {/* RIGHT: Three Feature Points (Pure white headlines, plain line icons with thin orange accents) */}
          <div className="hidden lg:block lg:col-span-3 space-y-6 text-white pl-2">
            <div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight leading-snug">
                Smarter fleet <span className="text-[#F97316]">management.</span>
              </h2>
              <div className="h-0.5 w-12 bg-[#F97316] mt-3" />
            </div>

            <div className="space-y-5 pt-2">
              {/* Feature 1 */}
              <div className="flex items-start gap-3.5">
                <div className="mt-1 text-[#F97316] shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Live MOT & PCO Alerts</h3>
                  <p className="text-xs text-white/70 mt-0.5 leading-relaxed">
                    Automated expiry tracking and reminders across all fleet vehicles.
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="flex items-start gap-3.5">
                <div className="mt-1 text-[#F97316] shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Rent & Statement Generation</h3>
                  <p className="text-xs text-white/70 mt-0.5 leading-relaxed">
                    Itemised driver balances, weekly rent schedules, and PDF export.
                  </p>
                </div>
              </div>

              {/* Feature 3 (ONCE - No duplicate) */}
              <div className="flex items-start gap-3.5">
                <div className="mt-1 text-[#F97316] shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Secure Environment</h3>
                  <p className="text-xs text-white/70 mt-0.5 leading-relaxed">
                    Two-step authentication and encrypted Supabase session tokens.
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer (Pure white text) */}
      <footer className="w-full max-w-7xl mx-auto pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-xs text-white gap-2">
        <div>© {new Date().getFullYear()} Virtual Car Hire Ltd. All rights reserved.</div>
        <div>
          Powered by{" "}
          <a
            href={WEBSITE_BASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-[#F97316] hover:underline"
          >
            Virtual Car Hire
          </a>
        </div>
      </footer>
    </div>
  );
}
