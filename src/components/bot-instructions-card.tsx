import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SYSTEM_PROMPT, runAgentTurn, type FleetVehicleItem, type LeadContext } from "@/lib/ai-agent";

type SettingHistory = {
  id: string;
  key: string;
  value: string;
  updated_by: string | null;
  updated_at: string;
};

type VehicleWarning = {
  id: string;
  make: string;
  model: string;
  reg: string;
  reason: string;
};

export function BotInstructionsAdminCard({
  vehicles = [],
  toast,
}: {
  vehicles?: any[];
  toast: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const [prompt, setPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [history, setHistory] = useState<SettingHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Simulator Test State inside card
  const [testInput, setTestInput] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testMessages, setTestMessages] = useState<Array<{ sender: string; text: string }>>([]);
  const [testContext, setTestContext] = useState<LeadContext>({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      setUserEmail(userData?.user?.email || "staff_admin");

      const { data: settingData } = await supabase
        .from("bot_settings" as any)
        .select("value")
        .eq("key", "system_prompt")
        .maybeSingle();

      if (settingData?.value?.trim()) {
        setPrompt(settingData.value);
      } else {
        setPrompt(DEFAULT_SYSTEM_PROMPT);
      }

      const { data: histData } = await supabase
        .from("bot_settings_history" as any)
        .select("*")
        .eq("key", "system_prompt")
        .order("updated_at", { ascending: false })
        .limit(20);

      if (histData) {
        setHistory(histData as SettingHistory[]);
      }
    } catch (err: any) {
      toast("Could not load bot settings: " + (err.message || String(err)), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (newVal?: string) => {
    const valToSave = newVal ?? prompt;
    if (!valToSave.trim()) {
      toast("Prompt cannot be empty", "error");
      return;
    }
    setSaving(true);
    try {
      const { error: upsertErr } = await supabase
        .from("bot_settings" as any)
        .upsert({
          key: "system_prompt",
          value: valToSave,
          updated_by: userEmail,
          updated_at: new Date().toISOString(),
        });

      if (upsertErr) throw upsertErr;

      await supabase.from("bot_settings_history" as any).insert({
        key: "system_prompt",
        value: valToSave,
        updated_by: userEmail,
        updated_at: new Date().toISOString(),
      });

      setPrompt(valToSave);
      toast("Bot instructions saved successfully", "success");
      loadSettings();
    } catch (err: any) {
      toast("Failed to save bot settings: " + (err.message || String(err)), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    if (confirm("Reset WhatsApp assistant instructions to default prompt?")) {
      await handleSave(DEFAULT_SYSTEM_PROMPT);
    }
  };

  const handleRunTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testInput.trim() || testBusy) return;
    const input = testInput.trim();
    setTestInput("");

    const updatedHistory = [...testMessages, { sender: "customer", text: input }];
    setTestMessages(updatedHistory);
    setTestBusy(true);

    try {
      const fleetItems: FleetVehicleItem[] = (vehicles || []).map((v) => ({
        id: v.id || v.reg,
        make: v.make || "Vehicle",
        model: v.model || "",
        year: v.year || 2023,
        fuel_type: v.fuel_type || "Petrol",
        weekly_rent: Number(v.weekly_rent || v.weekly_price) || 0,
        monthly_mileage_allowance: Number(v.monthly_mileage_allowance) || 2500,
        status: v.status || "available",
        registration: v.reg,
        default_deposit: Number(v.default_deposit) || 500,
      }));

      const res = await runAgentTurn({
        history: updatedHistory.map((m) => ({
          sender: m.sender === "agent" ? "ai_agent" : "customer",
          content: m.text,
        })),
        latest: input,
        context: testContext,
        fleet: fleetItems,
        customSystemPrompt: prompt,
      });

      setTestContext(res.updatedContext);
      setTestMessages((prev) => [...prev, { sender: "agent", text: res.reply }]);
    } catch (err: any) {
      setTestMessages((prev) => [...prev, { sender: "agent", text: `[Error: ${err.message}]` }]);
    } finally {
      setTestBusy(false);
    }
  };

  // Find vehicle warnings (missing price, missing fuel, or price of 0)
  const vehicleWarnings: VehicleWarning[] = (vehicles || []).reduce((acc: VehicleWarning[], v) => {
    const price = Number(v.weekly_rent ?? v.weekly_price ?? 0);
    const fuel = String(v.fuel_type || "").trim();
    const reasons: string[] = [];

    if (!price || price === 0) reasons.push("Missing or £0 weekly price");
    if (!fuel) reasons.push("Missing fuel type");

    if (reasons.length > 0) {
      acc.push({
        id: v.id || v.reg,
        make: v.make || "Unknown",
        model: v.model || "Unknown",
        reg: v.reg || "N/A",
        reason: reasons.join(", "),
      });
    }
    return acc;
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            🤖 WhatsApp Bot Instructions
          </h2>
          <p className="text-xs text-[#8b95a8] mt-1">
            Edit live System Prompt for LLM agent. Changes apply instantly without redeployment.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleResetDefault}
            disabled={saving || loading}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-50"
          >
            Reset to default
          </button>
          <button
            onClick={() => handleSave()}
            disabled={saving || loading}
            className="rounded-lg bg-[#ff6a00] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Vehicle Data Warning Box */}
      {vehicleWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 space-y-2">
          <div className="font-bold flex items-center gap-1.5 text-amber-300">
            ⚠️ Fleet Vehicle Data Warnings ({vehicleWarnings.length})
          </div>
          <p className="text-[11px] text-amber-200/80">
            The following vehicles have missing required facts and may return unconfirmed details to customers:
          </p>
          <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
            {vehicleWarnings.map((w) => (
              <div key={w.id} className="flex items-center justify-between border-b border-amber-500/15 py-1">
                <span className="font-mono font-semibold">{w.make} {w.model} ({w.reg})</span>
                <span className="text-[11px] text-amber-400">{w.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Text Area for Live Prompt */}
      <div>
        <label className="block text-xs font-semibold text-[#8b95a8] mb-2">
          System Prompt Instructions
        </label>
        {loading ? (
          <div className="h-48 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-[#8b95a8]">
            Loading instructions…
          </div>
        ) : (
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={14}
            className="w-full rounded-xl border border-white/15 bg-[#0b0f19] p-4 font-mono text-xs text-slate-200 focus:border-[#ff6a00] focus:outline-none leading-relaxed"
            placeholder="Type custom bot system instructions..."
          />
        )}
      </div>

      {/* Embedded Test Simulator Box */}
      <div className="rounded-xl border border-white/10 bg-[#0b0d12] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-white flex items-center gap-1.5">
            🧪 Prompt Test Simulator
          </div>
          <button
            type="button"
            onClick={() => {
              setTestMessages([]);
              setTestContext({});
            }}
            className="text-[11px] text-[#8b95a8] hover:text-white"
          >
            Clear Test Chat
          </button>
        </div>

        <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg border border-white/10 bg-black/40 p-3">
          {testMessages.length === 0 ? (
            <div className="text-[11px] italic text-[#8b95a8]">
              Test how the LLM agent responds using your current prompt text above without sending WhatsApp messages.
            </div>
          ) : (
            testMessages.map((m, idx) => (
              <div
                key={idx}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  m.sender === "customer"
                    ? "ml-auto bg-[#ff6a00] text-white"
                    : "border border-white/10 bg-white/5 text-slate-200"
                }`}
              >
                {m.text}
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleRunTest} className="flex gap-2">
          <input
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="Type a test customer message..."
            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white focus:border-[#ff6a00] focus:outline-none"
          />
          <button
            type="submit"
            disabled={testBusy || !testInput.trim()}
            className="rounded-lg bg-[#ff6a00] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50"
          >
            {testBusy ? "..." : "Run Test"}
          </button>
        </form>
      </div>

      {/* Version History Table */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#8b95a8] mb-3">
          Version History (Last 20 Saves)
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-[#8b95a8]">No previous prompt revisions recorded yet.</p>
        ) : (
          <div className="max-h-40 overflow-y-auto border border-white/10 rounded-xl divide-y divide-white/5">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <div>
                  <span className="font-semibold text-slate-200">
                    {new Date(h.updated_at).toLocaleString("en-GB")}
                  </span>
                  <span className="ml-2 text-[11px] text-[#8b95a8]">
                    by {h.updated_by || "Staff Admin"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setPrompt(h.value);
                    toast("Restored prompt revision to editor", "info");
                  }}
                  className="text-[11px] text-[#ff6a00] hover:underline"
                >
                  Restore to Editor
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
