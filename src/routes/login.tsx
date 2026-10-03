import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestLoginCode, verifyLoginCode } from "@/lib/auth-otp.functions";
import { WEBSITE_BASE_URL } from "@/lib/domain-config";
import { RouteErrorBoundary } from "@/components/error-boundary";
import { BrandLogo } from "@/components/brand-logo";

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

  const inputCls =
    "w-full rounded-2xl border border-white/10 bg-[#141A24] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 transition-all focus:border-[#ff8a3d]/60 focus:bg-[#1A2230] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/20";

  const glassCard =
    "relative overflow-hidden rounded-3xl border border-white/10 bg-[#0E131B]/90 p-6 md:p-8 shadow-2xl backdrop-blur-2xl";

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#0A0B10] text-white flex flex-col justify-between p-4 sm:p-6 lg:p-8 select-none dark">
      {/* Background Gradients & Glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(46rem 32rem at 8% -8%, rgba(255,106,0,0.18), transparent 62%), radial-gradient(40rem 30rem at 100% 4%, rgba(56,189,248,0.12), transparent 62%)",
        }}
        aria-hidden
      />

      {/* Main Content Layout */}
      <div className="relative z-10 grid h-full w-full grid-cols-1 lg:grid-cols-[1fr_minmax(380px,32vw)_1fr] gap-6 items-center">
        {/* Left Column: Text Block & Car Image */}
        <div className="flex h-full flex-col justify-between pt-2 pb-4 pointer-events-none">
          {/* Top-left Branding Text Block */}
          <div className="pointer-events-auto space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-gradient-to-br from-[#ff7a1a] to-[#ff9d52] p-1 shadow-lg">
                <BrandLogo className="h-full w-full" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Virtual Car Hire
                </h1>
                <p className="text-xs text-slate-400">Fleet Management & Operations</p>
              </div>
            </div>
          </div>

          {/* Car Image at Bottom Left: Roofline at ~44% down viewport, bleeding off left edge */}
          <div className="relative hidden sm:block w-[130%] -ml-[15%] pointer-events-none">
            <img
              src="/login-bg-car.jpg"
              alt="Fleet Vehicle"
              className="w-full object-cover opacity-85 mix-blend-lighten"
              style={{
                maskImage: "linear-gradient(to top, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
                WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
              }}
            />
          </div>
        </div>

        {/* Center/Right Column: Login Card (w-full lg:w-[32vw]) */}
        <div className="flex flex-col justify-center items-center w-full">
          <div className="w-full max-w-sm lg:max-w-none">
            {stage === "creds" ? (
              <form onSubmit={submitCreds} className={`${glassCard} space-y-4`}>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-white">Sign In</h2>
                  <p className="text-xs text-slate-400">Authorised portal access only</p>
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="areeb@fa-ibi.co.uk"
                      className={inputCls}
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={inputCls}
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-2.5 text-xs text-red-200">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-[#ff7a1a] to-[#ff9d52] py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                >
                  {loading ? "Sending code…" : "Sign In"}
                </button>

                <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
                  <a
                    href="https://wa.me/447721502779"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#ff8a3d] hover:underline"
                  >
                    Contact support
                  </a>
                  <a
                    href={WEBSITE_BASE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-slate-300"
                  >
                    Main Website →
                  </a>
                </div>
              </form>
            ) : (
              <div className={`${glassCard} space-y-5`}>
                {feedback === "success" ? (
                  <div className="py-6 flex flex-col items-center justify-center space-y-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                      <svg
                        className="h-8 w-8 stroke-current"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <h2 className="text-base font-bold text-white">Verification Successful!</h2>
                    <p className="text-xs text-emerald-300">Logging you in...</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <h2 className="text-lg font-bold text-white">Verification Code</h2>
                      <p className="mt-1 text-xs text-slate-400">
                        {info ?? "Enter the 6-digit code sent to your email."}
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
                          className="h-12 w-10 rounded-xl border border-white/15 bg-[#141A24] text-center text-lg font-semibold text-white focus:border-[#ff8a3d] focus:outline-none"
                        />
                      ))}
                    </div>

                    {error && (
                      <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-2 text-center text-xs text-red-200">
                        {error}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs">
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
                        className="text-slate-400 hover:text-white"
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        disabled={resendCooldown > 0 || loading}
                        onClick={handleResendCode}
                        className="text-[#ff8a3d] hover:underline disabled:text-slate-500"
                      >
                        {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend code"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Spacing placeholder */}
        <div className="hidden lg:block" />
      </div>

      {/* Footer */}
      <footer className="relative z-10 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-white/5">
        <p>© 2026 Virtual Car Hire</p>
        <p>Fleet Management Portal</p>
      </footer>
    </div>
  );
}
