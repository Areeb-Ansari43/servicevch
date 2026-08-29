import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestLoginCode, verifyLoginCode } from "@/lib/auth-otp.functions";

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
  component: LoginPage,
});

function PoweredBy() {
  return (
    <p className="mt-6 text-center text-xs text-slate-400/80">
      Powered by{" "}
      <a
        href="https://virtualcarhire.pages.dev/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-[#ff8a3d] hover:text-[#ffab74]"
      >
        Virtual Car Hire
      </a>
    </p>
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
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const submittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) navigate({ to: "/" });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (stage === "otp") setTimeout(() => boxRefs.current[0]?.focus(), 260);
  }, [stage]);

  const submitCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      await requestLoginCode({ data: { email: email.trim(), password } });
      setStage("otp");
      setInfo("We emailed a 6-digit verification code to the authorised account.");
    } catch (err: any) {
      setError(
        err?.message?.includes("Invalid credentials")
          ? "Invalid credentials."
          : (err?.message ?? "Sign-in failed."),
      );
    } finally {
      setLoading(false);
    }
  };

  const verify = async (code: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setError(null);
    setLoading(true);
    try {
      const res = await verifyLoginCode({ data: { code } });
      const { error: vErr } = await supabase.auth.verifyOtp({
        token_hash: res.token_hash,
        type: "magiclink",
      });
      if (vErr) throw new Error(vErr.message);
      setFeedback("success");
      setTimeout(() => navigate({ to: "/" }), 640);
    } catch (err: any) {
      setFeedback("error");
      setError(err?.message ?? "Verification failed.");
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
    "w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[15px] text-white placeholder:text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl transition-all focus:border-[#ff8a3d]/60 focus:bg-white/[0.09] focus:outline-none focus:ring-4 focus:ring-[#ff6a00]/15";

  const glassCard =
    "relative overflow-hidden rounded-[28px] border border-white/12 bg-white/[0.055] p-7 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-3xl md:p-9";

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{
        background: "radial-gradient(120% 90% at 50% -10%, #17161d 0%, #0a0b10 55%, #06070a 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(46rem 32rem at 8% -8%, rgba(255,106,0,0.22), transparent 62%), radial-gradient(40rem 30rem at 100% 4%, rgba(56,189,248,0.16), transparent 62%), radial-gradient(38rem 28rem at 50% 110%, rgba(168,85,247,0.14), transparent 60%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
        aria-hidden
      />

      <main className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] border border-white/20 bg-gradient-to-br from-[#ff7a1a] to-[#ff9d52] text-white shadow-[0_18px_40px_-12px_rgba(255,106,0,0.7),inset_0_1px_0_rgba(255,255,255,0.5)]">
            <img
              src="/whatsapp/virtual-car-hire-welcome.jpg"
              alt="Virtual Car Hire Logo"
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="bg-gradient-to-b from-white to-white/65 bg-clip-text text-[28px] font-bold tracking-tight text-transparent">
            Virtual Car Hire
          </h1>
          <p className="mt-1 text-sm text-slate-400">Fleet Tracker — Authorised access only</p>
        </div>

        {stage === "creds" ? (
          <form onSubmit={submitCreds} className={`${glassCard} space-y-5`}>
            <div
              className="pointer-events-none absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-white/50 to-transparent"
              aria-hidden
            />
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputCls}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
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

            {error && (
              <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-xs text-red-200 backdrop-blur-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full overflow-hidden rounded-full bg-gradient-to-b from-[#ff8226] to-[#f05f00] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_-14px_rgba(255,106,0,0.85),inset_0_1px_0_rgba(255,255,255,0.4)] transition-all hover:brightness-110 active:scale-[0.985] disabled:opacity-60"
            >
              {loading ? "Sending code…" : "Continue"}
            </button>

            <p className="text-center text-[11px] text-slate-500">
              Protected by two-step verification
            </p>
          </form>
        ) : (
          <div className={`${glassCard} space-y-6`}>
            <div
              className="pointer-events-none absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-white/50 to-transparent"
              aria-hidden
            />
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white">Enter your verification code</h2>
              <p className="mt-1.5 text-xs text-slate-400">
                {info ?? "Enter the 6-digit code we emailed you."}
              </p>
            </div>

            <div
              className={`flex justify-center gap-2.5 ${feedback === "error" ? "vch-otp-error" : ""}`}
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
                  autoComplete="one-time-code"
                  maxLength={6}
                  aria-label={`Digit ${i + 1}`}
                  className={`vch-otp-box h-15 w-11 rounded-2xl border bg-white/[0.07] py-3.5 text-center text-xl font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-2xl focus:border-[#ff8a3d]/70 focus:outline-none focus:ring-4 focus:ring-[#ff6a00]/15 ${
                    !d && feedback === "none" ? "vch-otp-empty" : ""
                  } ${feedback === "success" ? "vch-otp-success" : ""} ${
                    feedback === "error" ? "border-red-500/70 text-red-200" : "border-white/15"
                  }`}
                  style={{
                    animationDelay:
                      feedback === "success"
                        ? `${i * 55}ms`
                        : feedback === "none"
                          ? `${i * 40}ms`
                          : "0ms",
                  }}
                />
              ))}
            </div>

            {error && (
              <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-center text-xs text-red-200">
                {error}
              </div>
            )}
            {loading && <div className="text-center text-xs text-slate-400">Verifying…</div>}

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
              className="w-full text-center text-xs font-medium text-slate-400 transition-colors hover:text-white"
            >
              ← Use a different email
            </button>
          </div>
        )}

        <PoweredBy />
        <p className="mt-2 text-center text-[11px] text-slate-600">
          © 2026 Virtual Car Hire · Fleet Tracker
        </p>
      </main>
    </div>
  );
}
