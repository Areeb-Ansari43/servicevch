import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Virtual Car Hire Fleet Tracker" },
      { name: "description", content: "Sign in to the VCH Fleet Tracker." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem("vch10_auth") === "1") {
      navigate({ to: "/" });
    }
  }, [navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      window.localStorage.setItem("vch10_auth", "1");
      window.localStorage.setItem("vch10_user", email.trim());
      navigate({ to: "/" });
    }, 350);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff6a00] to-[#ff8a3d] text-white shadow-lg shadow-orange-500/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
              <path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm18 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
              <path d="M3 17v-5l2-5h14l2 5v5"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#0f172a]">Virtual Car Hire</h1>
          <p className="text-sm text-[#475569]">Fleet Tracker — Sign in to continue</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm md:p-8">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#475569]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@vch.co.uk"
              className="w-full rounded-lg border border-[#e2e8f0] bg-white px-4 py-2.5 text-sm focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/20"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#475569]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-[#e2e8f0] bg-white px-4 py-2.5 text-sm focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/20"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e05d00] disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>

          <div className="flex items-center justify-between text-xs text-[#475569]">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" className="rounded border-[#cbd5e1] text-[#ff6a00] focus:ring-[#ff6a00]" defaultChecked />
              Keep me signed in
            </label>
            <a href="#" className="font-medium text-[#ff6a00] hover:text-[#e05d00]">Forgot password?</a>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-[#475569]">
          © {new Date().getFullYear()} Virtual Car Hire · Fleet Tracker
        </p>
      </div>
    </div>
  );
}
