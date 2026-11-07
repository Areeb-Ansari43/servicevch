import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_BOT_CATALOG,
  getBotCatalogFromDb,
  evaluateFleetAvailability,
  type BotCatalogEntry,
  type CrmVehicle,
} from "@/lib/bot-catalog";

export function BotFleetDataAdminCard({
  vehicles = [],
  toast,
}: {
  vehicles?: any[];
  toast: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const [catalog, setCatalog] = useState<BotCatalogEntry[]>(DEFAULT_BOT_CATALOG);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<BotCatalogEntry | null>(null);

  const crmVehicles: CrmVehicle[] = (vehicles || []).map((v) => ({
    id: v.id,
    reg: v.reg,
    make: v.make,
    model: v.model,
    year: v.year,
    fuel_type: v.fuel_type,
    status: v.status,
    next_mot_date: v.next_mot_date,
    pco_expiry_date: v.pco_expiry_date,
  }));

  const { summaries, unmatchedCatalog, unmatchedCrmVehicles } = evaluateFleetAvailability(
    catalog,
    crmVehicles,
  );

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const data = await getBotCatalogFromDb();
      setCatalog(data);
    } catch (err: any) {
      toast("Failed to load catalog: " + (err.message || String(err)), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEntry = async (entry: BotCatalogEntry) => {
    setSavingId(entry.display_name);
    try {
      const { error } = await supabase.from("bot_fleet_catalog" as any).upsert({
        display_name: entry.display_name,
        make: entry.make,
        model: entry.model,
        weekly_rent: Number(entry.weekly_rent),
        monthly_miles: Number(entry.monthly_miles),
        deposit: entry.deposit != null ? Number(entry.deposit) : null,
        minimum_term_weeks: Number(entry.minimum_term_weeks),
        year_label: entry.year_label,
        fuel_type: entry.fuel_type || null,
        fuel_group: entry.fuel_group || null,
        crm_year_min: entry.crm_year_min,
        crm_year_max: entry.crm_year_max,
        crm_regs: entry.crm_regs,
        active: entry.active,
        notes: entry.notes || null,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;
      toast(`Saved ${entry.display_name}`, "success");
      setEditingEntry(null);
      await loadCatalog();
    } catch (err: any) {
      toast("Error saving catalog car: " + (err.message || String(err)), "error");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            🚗 Bot Fleet Catalogue & Availability
          </h2>
          <p className="text-xs text-[#8b95a8] mt-1">
            Source of truth for what the bot sells, linked to live CRM rentable vehicles.
          </p>
        </div>
      </div>

      {/* Fleet Availability Preview Section */}
      <div className="rounded-xl border border-white/10 bg-[#0b0f19] p-4 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
          Live Fleet Availability Preview
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead>
              <tr className="border-b border-white/10 text-[11px] text-[#8b95a8]">
                <th className="py-2 pr-3">Catalogue Car</th>
                <th className="py-2 px-3">Rent / Deposit</th>
                <th className="py-2 px-3">Fuel / Year</th>
                <th className="py-2 px-3">CRM Matched</th>
                <th className="py-2 px-3">Rentable Now</th>
                <th className="py-2 pl-3">Status / Exclusions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {summaries.map((s) => (
                <tr key={s.catalog.display_name} className="hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3 font-semibold text-white">
                    {s.catalog.display_name}
                  </td>
                  <td className="py-2.5 px-3">
                    £{s.catalog.weekly_rent}/wk · {s.catalog.deposit ? `£${s.catalog.deposit}` : "TBC"}
                  </td>
                  <td className="py-2.5 px-3">
                    {s.catalog.fuel_type || "TBC"} · {s.catalog.year_label}
                  </td>
                  <td className="py-2.5 px-3">
                    {s.matchedVehicles.length} cars
                  </td>
                  <td className="py-2.5 px-3 font-bold">
                    {s.rentableVehicles.length > 0 ? (
                      <span className="text-emerald-400">
                        {s.rentableVehicles.length} available ({s.rentableVehicles.map((r) => r.reg).join(", ")})
                      </span>
                    ) : (
                      <span className="text-rose-400">0 available</span>
                    )}
                  </td>
                  <td className="py-2.5 pl-3 text-[11px] text-[#8b95a8]">
                    {s.exclusionReasons.length > 0 ? (
                      <span>
                        Excluded: {s.exclusionReasons.map((e) => `${e.reg} (${e.reason})`).join(", ")}
                      </span>
                    ) : s.rentableVehicles.length > 0 ? (
                      <span className="text-emerald-400/80">All rentable</span>
                    ) : (
                      <span>No matching cars in CRM</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Unmatched Warnings */}
        {(unmatchedCatalog.length > 0 || unmatchedCrmVehicles.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-[11px]">
            {unmatchedCatalog.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-amber-200">
                <span className="font-bold">⚠️ Catalogue with 0 CRM matches:</span>
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                  {unmatchedCatalog.map((c) => (
                    <li key={c.display_name}>{c.display_name}</li>
                  ))}
                </ul>
              </div>
            )}
            {unmatchedCrmVehicles.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-[#8b95a8]">
                <span className="font-bold text-slate-300">ℹ️ CRM vehicles unmatched to catalogue:</span>
                <p className="mt-1">
                  {unmatchedCrmVehicles.map((v) => `${v.make} ${v.model} (${v.reg})`).join(", ")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Catalogue Editor Grid */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#8b95a8] mb-3">
          Manage Catalogue Models & Specs (Staff Only)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {catalog.map((entry) => (
            <div
              key={entry.display_name}
              className="rounded-xl border border-white/10 bg-[#0b0d12] p-4 text-xs space-y-2 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{entry.display_name}</span>
                  <span className="text-[#ff6a00] font-semibold">£{entry.weekly_rent}/wk</span>
                </div>
                <div className="text-[11px] text-[#8b95a8] mt-1 space-y-0.5">
                  <div>Deposit: {entry.deposit != null ? `£${entry.deposit}` : "TBC (Team confirms)"}</div>
                  <div>Fuel: {entry.fuel_type || "TBC (Team confirms)"}</div>
                  <div>Term: {entry.minimum_term_weeks} wks · {entry.monthly_miles} miles/mo</div>
                  <div>Years: {entry.year_label}</div>
                  {entry.notes && <div className="text-amber-300/80 italic">{entry.notes}</div>}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingEntry(entry)}
                className="w-full rounded-lg border border-white/15 bg-white/5 py-1.5 text-center text-xs font-semibold text-slate-200 hover:bg-white/10"
              >
                Edit Model Details
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f172a] p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white">Edit {editingEntry.display_name}</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#8b95a8] mb-1">Weekly Rent (£)</label>
                <input
                  type="number"
                  value={editingEntry.weekly_rent}
                  onChange={(e) =>
                    setEditingEntry({ ...editingEntry, weekly_rent: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-white/15 bg-[#0b0f19] px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[#8b95a8] mb-1">Deposit (£, leave blank for TBC)</label>
                <input
                  type="number"
                  value={editingEntry.deposit ?? ""}
                  placeholder="e.g. 500 or blank"
                  onChange={(e) =>
                    setEditingEntry({
                      ...editingEntry,
                      deposit: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded-lg border border-white/15 bg-[#0b0f19] px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[#8b95a8] mb-1">Fuel Type (e.g. Plug-in-Hybrid, Electric, Diesel)</label>
                <input
                  type="text"
                  value={editingEntry.fuel_type ?? ""}
                  placeholder="e.g. Plug-in-Hybrid"
                  onChange={(e) =>
                    setEditingEntry({
                      ...editingEntry,
                      fuel_type: e.target.value || null,
                      fuel_group: e.target.value?.toLowerCase().includes("plug")
                        ? "plug_in_hybrid"
                        : e.target.value?.toLowerCase().includes("hybrid")
                          ? "hybrid"
                          : e.target.value?.toLowerCase().includes("electric")
                            ? "electric"
                            : e.target.value?.toLowerCase().includes("diesel")
                              ? "diesel"
                              : "petrol",
                    })
                  }
                  className="w-full rounded-lg border border-white/15 bg-[#0b0f19] px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[#8b95a8] mb-1">Minimum Term (weeks)</label>
                <input
                  type="number"
                  value={editingEntry.minimum_term_weeks}
                  onChange={(e) =>
                    setEditingEntry({
                      ...editingEntry,
                      minimum_term_weeks: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-white/15 bg-[#0b0f19] px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#8b95a8] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingId === editingEntry.display_name}
                onClick={() => handleSaveEntry(editingEntry)}
                className="rounded-lg bg-[#ff6a00] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#e05d00]"
              >
                {savingId === editingEntry.display_name ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
