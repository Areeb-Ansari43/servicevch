import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) navigate({ to: "/" });
    });
    return () => { cancelled = true; };
  }, [navigate]);

  const submitCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null);
    if (!email.trim() || !password) { setError("Email and password are required."); return; }
    setLoading(true);
    try {
      await requestLoginCode({ data: { email: email.trim(), password } });
      setStage("otp");
      setInfo("A 6-digit verification code has been emailed to the authorised account.");
    } catch (err: any) {
      setError(err?.message?.includes("Invalid credentials") ? "Invalid credentials." : (err?.message ?? "Sign-in failed."));
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code."); return; }
    setLoading(true);
    try {
      const res = await verifyLoginCode({ data: { code } });
      const { error: vErr } = await supabase.auth.verifyOtp({
        token_hash: res.token_hash,
        type: "magiclink",
      });
      if (vErr) throw new Error(vErr.message);
      navigate({ to: "/" });
    } catch (err: any) {
      setError(err?.message ?? "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0b0d12] via-[#11141b] to-[#0b0d12] px-4">
      <div className="w-full max-w-md">
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
          <form onSubmit={submitCreds} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl backdrop-blur md:p-8">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} autoComplete="email" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputCls} autoComplete="current-password" />
            </div>

            {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e05d00] disabled:opacity-60">
              {loading ? "Sending code…" : "Continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitOtp} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl backdrop-blur md:p-8">
            <div className="rounded-md border border-[#ff6a00]/30 bg-[#ff6a00]/10 px-3 py-2 text-xs text-orange-200">
              {info ?? "Enter the code we sent to your inbox."}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">6-digit code</label>
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className={inputCls + " text-center text-2xl tracking-[0.6em]"}
                autoFocus
              />
            </div>

            {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e05d00] disabled:opacity-60">
              {loading ? "Verifying…" : "Verify & Sign In"}
            </button>
            <button
              type="button"
              onClick={() => { setStage("creds"); setCode(""); setError(null); setInfo(null); }}
              className="w-full text-center text-xs font-medium text-slate-400 hover:text-white"
            >
              ← Use a different email
            </button>
          </form>
        )}

        <PoweredBy />
        <p className="mt-2 text-center text-[11px] text-slate-600">
          © {new Date().getFullYear()} Virtual Car Hire · Fleet Tracker
        </p>
      </div>
    </div>
  );
}
