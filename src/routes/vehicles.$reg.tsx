import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFleetData, type Vehicle } from "@/lib/fleet-data";
import { exportVehiclePdf } from "@/lib/pdf-export";
import { UKPlate, StatusBadge, Pill, daysUntil, T, EditVehicleModal, regSlug } from "@/routes/index";
import { NotFoundPanel } from "@/components/not-found-panel";

export const Route = createFileRoute("/vehicles/$reg")({
  head: ({ params }) => ({
    meta: [
      { title: `${(params as { reg: string }).reg} — Vehicle Profile | Virtual Car Hire` },
      { name: "description", content: "Vehicle profile, MOT and PCO expiry, mileage and full service history for this VCH fleet vehicle." },
      { property: "og:title", content: `${(params as { reg: string }).reg} — Vehicle Profile` },
      { property: "og:description", content: "Vehicle profile, MOT and PCO expiry, mileage and service history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VehicleDetailPage,
});

const STATUS_OPTIONS: Vehicle["status"][] = ["Active", "In Service", "Rented", "Off Road"];

function VehicleDetailPage() {
  if (typeof window === "undefined") return null;

  const navigate = useNavigate();
  const { reg } = useParams({ from: "/vehicles/$reg" });
  const [authed, setAuthed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/login" });
      else setAuthed(true);
    });
  }, [navigate]);

  const { vehicles, services, loading, saveVehicle, deleteVehicle } = useFleetData();
  const target = regSlug(reg ?? "");
  const vehicle = vehicles.find((v) => regSlug(v.registration) === target);
  const id = vehicle?.id;
  const vServices = services.filter((s) => (id && s.vehicle_id === id) || (vehicle && regSlug(s.registration) === target));
  const totalSpend = vServices.reduce((a, s) => a + (s.cost || 0), 0);

  const updateStatus = async (status: Vehicle["status"]) => {
    if (!vehicle || status === vehicle.status) { setStatusOpen(false); return; }
    setSavingStatus(true);
    setStatusError(null);
    try {
      await saveVehicle({ ...vehicle, status }, false);
      setStatusOpen(false);
    } catch (error: any) {
      setStatusError(error?.message ?? "Could not update vehicle status");
    } finally {
      setSavingStatus(false);
    }
  };

  if (!authed) return null;

  return (
    <div className="min-h-screen text-[#e7eaf0]" style={{ background: T.bg }}>
      <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <button onClick={() => navigate({ to: "/vehicles" })} className="inline-flex items-center gap-2 text-sm text-[#aeb8c9] transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6a00]/60">
            <span className="text-xl leading-none">←</span> Back to Fleet
          </button>
          <div className="hidden min-w-0 max-w-sm flex-1 items-center rounded-xl border px-3 py-2 sm:flex" style={{ borderColor: T.border, background: "rgba(255,255,255,0.025)" }}>
            <span className="mr-2 text-[#8b95a8]">⌕</span><span className="truncate text-sm text-[#7d8799]">Search anything…</span><span className="ml-auto rounded border px-1.5 py-0.5 text-[10px] text-[#8b95a8]" style={{ borderColor: T.borderSoft }}>⌘ K</span>
          </div>
          <div className="hidden items-center gap-2 text-[#aeb8c9] sm:flex"><span className="rounded-xl p-2">♧</span><span className="rounded-xl p-2">♧</span><span className="rounded-xl p-2">▣</span></div>
        </div>

        {loading ? (
          <div className="rounded-2xl border p-12 text-center text-sm text-[#8b95a8]" style={{ borderColor: T.border, background: T.panel }}>Loading vehicle…</div>
        ) : !vehicle ? (
          <NotFoundPanel code="404" title="No vehicle found for that registration" subtitle={`We couldn't find "${target}" in your fleet. Check the plate and try again.`} showVehiclesLink />
        ) : (
          <>
            <section className="overflow-hidden rounded-2xl border" style={{ borderColor: T.border, background: T.panel }}>
              <div className="relative px-5 py-6 sm:px-9 sm:py-8" style={{ background: "linear-gradient(115deg, rgba(255,106,0,0.19), rgba(255,106,0,0.04) 38%, transparent 72%)" }}>
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff6a00]">Vehicle Profile</div>
                    <h1 className="mt-2 text-3xl font-extrabold uppercase leading-none tracking-tight sm:text-4xl">{vehicle.make}</h1>
                    <div className="mt-3 text-lg text-[#c5cbd6]">{vehicle.model} <span className="text-[#7d8799]">•</span> {vehicle.year}</div>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button onClick={() => exportVehiclePdf(vehicle, vServices)} className="inline-flex items-center gap-2 rounded-lg bg-[#ff6a00] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/10 transition hover:bg-[#e05d00] active:scale-[0.98]">↓ &nbsp;Export PDF</button>
                      <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold text-[#e7eaf0] transition hover:bg-white/[0.06] active:scale-[0.98]" style={{ borderColor: T.border }}>✎ &nbsp;Edit Vehicle</button>
                      <button onClick={async () => { if (!confirm(`Delete ${vehicle.registration}? This cannot be undone.`)) return; await deleteVehicle(vehicle.id); navigate({ to: "/vehicles" }); }} className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 active:scale-[0.98]">▣ &nbsp;Delete</button>
                    </div>
                  </div>
                  <div className="relative flex flex-col items-end gap-3">
                    <UKPlate reg={vehicle.registration} size="lg" />
                    <div className="relative">
                      <button onClick={() => setStatusOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={statusOpen} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6a00]/60" style={{ borderColor: T.border, background: "rgba(255,255,255,0.035)" }}>
                        <StatusBadge status={vehicle.status} /> <span className="text-[#8b95a8]">{savingStatus ? "…" : "⌄"}</span>
                      </button>
                      {statusOpen && <div className="absolute right-0 top-full z-30 mt-2 w-40 overflow-hidden rounded-xl border p-1 shadow-2xl" style={{ borderColor: T.border, background: "rgba(12,16,27,0.98)" }} role="listbox">{STATUS_OPTIONS.map((status) => <button key={status} onClick={() => void updateStatus(status)} className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-white/[0.08]" role="option" aria-selected={vehicle.status === status}><StatusBadge status={status} /></button>)}</div>}
                    </div>
                    {statusError && <div className="max-w-48 text-right text-xs text-red-300">{statusError}</div>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 border-t md:grid-cols-4" style={{ borderColor: T.border }}>
                <Stat label="Current Mileage" value={`${vehicle.current_mileage.toLocaleString()} mi`} icon="◴" />
                <Stat label="Fuel Type" value={vehicle.fuel_type} icon="⛽" />
                <Stat label="Services Logged" value={String(vServices.length)} icon="⌁" />
                <Stat label="Total Spend" value={`£${totalSpend.toFixed(2)}`} icon="£" accent />
              </div>
            </section>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              <DateCard label="Next MOT" date={vehicle.next_mot_date} icon="▣" accent="blue" />
              <DateCard label="Next Service" date={vehicle.next_service_date} icon="⌁" accent="orange" />
              <DateCard label="PCO License Expiry" date={vehicle.insurance_expiry} icon="♢" accent="blue" />
            </div>

            {vehicle.notes && <div className="mt-5 rounded-2xl border p-5" style={{ borderColor: T.border, background: T.panel }}><div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#8b95a8]">Notes</div><p className="whitespace-pre-wrap text-sm text-[#c5cbd6]">{vehicle.notes}</p></div>}

            <section className="mt-5 overflow-hidden rounded-2xl border" style={{ borderColor: T.border, background: T.panel }}>
              <div className="flex items-center justify-between border-b px-5 py-5 sm:px-7" style={{ borderColor: T.border }}><h2 className="flex items-center gap-2 text-lg font-bold"><span className="text-[#ff6a00]">⌁</span> Service History</h2><span className="text-sm text-[#aeb8c9]">{vServices.length} records</span></div>
              {vServices.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center gap-4 p-8 text-center text-sm text-[#aeb8c9]"><span className="flex h-14 w-14 items-center justify-center rounded-full border text-2xl text-[#8b95a8]" style={{ borderColor: T.border }}>▱</span><span>No service records for this vehicle yet.</span></div> : <div className="divide-y" style={{ borderColor: T.borderSoft }}>{vServices.map((s) => <div key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-7"><div className="w-28 text-sm text-[#8b95a8]">{s.service_date}</div><div className="min-w-40 flex-1"><div className="text-sm font-semibold">{s.service_type}</div><div className="text-xs text-[#8b95a8]">{s.garage || "—"} · {s.mileage.toLocaleString()} mi</div>{s.description && <div className="mt-1 text-xs text-[#8b95a8]">{s.description}</div>}</div><div className="text-base font-bold text-[#ff6a00]">£{s.cost.toFixed(2)}</div></div>)}</div>}
            </section>
          </>
        )}
      </div>
      {vehicle && editing && <EditVehicleModal vehicle={vehicle} onClose={() => setEditing(false)} onSave={async (v) => { await saveVehicle(v, false); setEditing(false); }} />}
    </div>
  );
}

function Stat({ label, value, icon, accent }: { label: string; value: string; icon: string; accent?: boolean }) {
  return <div className="flex items-center gap-3 border-r p-4 last:border-r-0 sm:p-5" style={{ borderColor: T.border, background: "rgba(255,255,255,0.012)" }}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg ${accent ? "border-orange-500/30 bg-orange-500/10 text-[#ff8a3d]" : "border-white/10 bg-white/[0.04] text-[#c5cbd6]"}`}>{icon}</span><span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[0.13em] text-[#8b95a8]">{label}</span><span className={`mt-1 block truncate text-lg font-bold ${accent ? "text-[#f0a06e]" : "text-[#f1f3f7]"}`}>{value}</span></span></div>;
}

function DateCard({ label, date, icon, accent }: { label: string; date: string; icon: string; accent: "blue" | "orange" }) {
  const has = !!date;
  const expired = has && daysUntil(date) === "Expired";
  return <div className="flex items-center gap-3 rounded-2xl border p-4 sm:p-5" style={{ borderColor: T.border, background: T.panel }}><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-xl ${accent === "orange" ? "border-orange-500/30 bg-orange-500/10 text-[#ff8a3d]" : "border-blue-500/25 bg-blue-500/10 text-blue-300"}`}>{icon}</span><span className="min-w-0 flex-1"><span className="block text-[11px] font-bold uppercase tracking-[0.13em] text-[#8b95a8]">{label}</span><span className={`mt-1 block truncate text-lg font-bold ${expired ? "text-red-400" : "text-[#f1f3f7]"}`}>{has ? date : "—"}</span></span>{has && <Pill label="" value={daysUntil(date)} />}</div>;
}
