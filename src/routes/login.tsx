import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requestLoginCode, verifyLoginCode } from "@/lib/auth-otp.functions";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Virtual Car Hire Fleet Tracker" },
      { name: "description", content: "Sign in to the VCH Fleet Tracker." },
    ],
  }),
  component: LoginPage,
});

function PoweredBy() {
  return (
    <p className="mt-6 text-center text-xs text-slate-400">
      Powered by{" "}
      <a
        href="https://virtualcarhire.pages.dev/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-[#ff6a00] hover:text-[#ff8a3d]"
      >
        Virtual Car Hire
      </a>
    </p>
  );
}

function LoginPage() {
  if (typeof window === "undefined") return null;

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
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    if (stage === "otp") setTimeout(() => boxRefs.current[0]?.focus(), 260);
  }, [stage]);

  const submitCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null);
    if (!email.trim() || !password) { setError("Email and password are required."); return; }
    setLoading(true);
    try {
      await requestLoginCode({ data: { email: email.trim(), password } });
      setStage("otp");
      setInfo("We emailed a 6-digit verification code to the authorised account.");
    } catch (err: any) {
      setError(err?.message?.includes("Invalid credentials") ? "Invalid credentials." : (err?.message ?? "Sign-in failed."));
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
      setDigits((d) => { const n = [...d]; n[i] = ""; return n; });
      return;
    }
    setDigits((d) => {
      const n = [...d];
      // Support paste of the full code into any box.
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
      setDigits((d) => { const n = [...d]; n[i - 1] = ""; return n; });
      boxRefs.current[i - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && i > 0) boxRefs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) boxRefs.current[i + 1]?.focus();
  };

  const inputCls =
    "w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 backdrop-blur-xl focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30";

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4" style={{ background: "linear-gradient(160deg,#0b0d12,#11141b 55%,#0b0d12)" }}>
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(60rem 40rem at 12% -10%, rgba(255,106,0,0.18), transparent 60%), radial-gradient(50rem 36rem at 95% 0%, rgba(56,189,248,0.15), transparent 60%)",
        }}
        aria-hidden
      />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff6a00] to-[#ff8a3d] text-white shadow-lg shadow-orange-500/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm18 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
              <path d="M3 17v-5l2-5h14l2 5v5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Virtual Car Hire</h1>
          <p className="text-sm text-slate-400">Fleet Tracker — Authorised access only</p>
        </div>

        {stage === "creds" ? (
          <form onSubmit={submitCreds} className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl md:p-8">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} autoComplete="email" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputCls} autoComplete="current-password" />
            </div>

            {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

            <button type="submit" disabled={loading} className="w-full rounded-full bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e05d00] disabled:opacity-60">
              {loading ? "Sending code…" : "Continue"}
            </button>
          </form>
        ) : (
          <div className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl md:p-8">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white">Enter your verification code</h2>
              <p className="mt-1 text-xs text-slate-400">{info ?? "Enter the 6-digit code we emailed you."}</p>
            </div>

            <div className={`flex justify-center gap-2.5 ${feedback === "error" ? "vch-otp-error" : ""}`}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { boxRefs.current[i] = el; }}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  aria-label={`Digit ${i + 1}`}
                  className={`vch-otp-box h-14 w-11 rounded-2xl border bg-white/[0.06] text-center text-xl font-semibold text-white backdrop-blur-xl focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 ${
                    !d && feedback === "none" ? "vch-otp-empty" : ""
                  } ${feedback === "success" ? "vch-otp-success" : ""} ${
                    feedback === "error" ? "border-red-500/70 text-red-200" : "border-white/15"
                  }`}
                  style={{
                    animationDelay:
                      feedback === "success" ? `${i * 55}ms` : feedback === "none" ? `${i * 40}ms` : "0ms",
                  }}
                />
              ))}
            </div>

            {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs text-red-300">{error}</div>}
            {loading && <div className="text-center text-xs text-slate-400">Verifying…</div>}

            <button
              type="button"
              onClick={() => { setStage("creds"); setDigits(["", "", "", "", "", ""]); setError(null); setInfo(null); setFeedback("none"); submittedRef.current = false; }}
              className="w-full text-center text-xs font-medium text-slate-400 hover:text-white"
            >
              ← Use a different email
            </button>
          </div>
        )}

        <PoweredBy />
        <p className="mt-2 text-center text-[11px] text-slate-600">
          © {new Date().getFullYear()} Virtual Car Hire · Fleet Tracker
        </p>
      </div>
    </div>
  );
}

