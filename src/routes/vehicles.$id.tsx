import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFleetData } from "@/lib/fleet-data";
import { exportVehiclePdf } from "@/lib/pdf-export";
import { UKPlate, StatusBadge, Pill, daysUntil, T } from "@/routes/index";

export const Route = createFileRoute("/vehicles/$id")({
  head: () => ({
    meta: [{ title: "Vehicle Detail — Virtual Car Hire" }],
  }),
  component: VehicleDetailPage,
});

function VehicleDetailPage() {
  if (typeof window === "undefined") return null;

  const navigate = useNavigate();
  const { id } = useParams({ from: "/vehicles/$id" });
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/login" });
      else setAuthed(true);
    });
  }, [navigate]);

  const { vehicles, services, loading } = useFleetData();
  const vehicle = vehicles.find((v) => v.id === id);
  const vServices = services.filter((s) => s.vehicle_id === id || (vehicle && s.registration === vehicle.registration));
  const totalSpend = vServices.reduce((a, s) => a + (s.cost || 0), 0);

  if (!authed) return null;

  return (
    <div className="min-h-screen text-[#e7eaf0]" style={{ background: T.bg }}>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <button onClick={() => navigate({ to: "/" })} className="mb-6 inline-flex items-center gap-2 text-sm text-[#8b95a8] hover:text-white">
          ← Back to Fleet
        </button>

        {loading || !vehicle ? (
          <div className="rounded-xl border p-12 text-center text-sm text-[#8b95a8]" style={{ borderColor: T.border, background: T.panel }}>
            {loading ? "Loading vehicle…" : "Vehicle not found."}
          </div>
        ) : (
          <>
            {/* Hero */}
            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: T.border, background: T.panel }}>
              <div className="px-8 py-8" style={{ background: "linear-gradient(135deg, rgba(255,106,0,0.15), transparent)" }}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff6a00]">Vehicle Profile</div>
                    <h1 className="mt-2 text-4xl font-bold uppercase leading-tight">{vehicle.make}</h1>
                    <div className="mt-1 text-lg text-[#c5cbd6]">{vehicle.model} · {vehicle.year}</div>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <UKPlate reg={vehicle.registration} size="lg" />
                    <StatusBadge status={vehicle.status} />
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    onClick={() => exportVehiclePdf(vehicle, vServices)}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#ff6a00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export PDF
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-px border-t md:grid-cols-4" style={{ borderColor: T.border, background: T.border }}>
                <Stat label="Current Mileage" value={`${vehicle.current_mileage.toLocaleString()} mi`} />
                <Stat label="Fuel Type" value={vehicle.fuel_type} />
                <Stat label="Services Logged" value={String(vServices.length)} />
                <Stat label="Total Spend" value={`£${totalSpend.toFixed(2)}`} accent />
              </div>
            </div>

            {/* Health dates */}
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <DateCard label="Next MOT" date={vehicle.next_mot_date} />
              <DateCard label="Next Service" date={vehicle.next_service_date} />
              <DateCard label="Insurance Expiry" date={vehicle.insurance_expiry} />
            </div>

            {vehicle.notes && (
              <div className="mt-6 rounded-xl border p-5" style={{ borderColor: T.border, background: T.panel }}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#8b95a8]">Notes</div>
                <p className="whitespace-pre-wrap text-sm text-[#c5cbd6]">{vehicle.notes}</p>
              </div>
            )}

            {/* Service history */}
            <div className="mt-6 rounded-xl border" style={{ borderColor: T.border, background: T.panel }}>
              <div className="flex items-center justify-between border-b p-5" style={{ borderColor: T.border }}>
                <h2 className="text-lg font-bold">Service History</h2>
                <span className="text-sm text-[#8b95a8]">{vServices.length} records</span>
              </div>
              {vServices.length === 0 ? (
                <div className="p-10 text-center text-sm text-[#8b95a8]">No service records for this vehicle yet.</div>
              ) : (
                <div className="divide-y" style={{ borderColor: T.borderSoft }}>
                  {vServices.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-4 p-4" style={{ borderColor: T.borderSoft }}>
                      <div className="w-28 text-sm text-[#8b95a8]">{s.service_date}</div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold">{s.service_type}</div>
                        <div className="text-xs text-[#8b95a8]">{s.garage || "—"} · {s.mileage.toLocaleString()} mi</div>
                        {s.description && <div className="mt-1 text-xs text-[#8b95a8]">{s.description}</div>}
                      </div>
                      <div className="text-base font-bold text-[#ff6a00]">£{s.cost.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="p-5" style={{ background: T.panel }}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8b95a8]">{label}</div>
      <div className={`mt-1 text-xl font-bold ${accent ? "text-[#ff6a00]" : ""}`}>{value}</div>
    </div>
  );
}

function DateCard({ label, date }: { label: string; date: string }) {
  const has = !!date;
  const expired = has && daysUntil(date) === "Expired";
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: T.border, background: T.panel }}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8b95a8]">{label}</div>
        {has && <Pill label="" value={daysUntil(date)} />}
      </div>
      <div className={`text-lg font-bold ${expired ? "text-red-400" : ""}`}>{has ? date : "—"}</div>
    </div>
  );
}
