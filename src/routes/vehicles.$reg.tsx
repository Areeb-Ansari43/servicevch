import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Gauge,
  IdCard,
  PoundSterling,
  Route as RouteIcon,
  ShieldCheck,
  Trash2,
  User,
  Users,
  Wrench,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFleetData, type DriverTrack, type Vehicle } from "@/lib/fleet-data";
import { carTermsFor } from "@/lib/fleet-sheet";
import { simplifyVehicleName, vehicleArtworkPath } from "@/lib/vehicle-display";
import { exportVehiclePdf } from "@/lib/pdf-export";
import { UKPlate, StatusBadge, daysUntil, T, EditVehicleModal, regSlug } from "@/routes/index";
import { NotFoundPanel } from "@/components/not-found-panel";
import { RouteErrorBoundary } from "@/components/error-boundary";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/vehicles/$reg")({
  head: ({ params }) => ({
    meta: [
      { title: `${(params as { reg: string }).reg} — Vehicle Profile | Virtual Car Hire` },
      {
        name: "description",
        content:
          "Vehicle profile, MOT and PCO expiry, mileage and full service history for this VCH fleet vehicle.",
      },
      { property: "og:title", content: `${(params as { reg: string }).reg} — Vehicle Profile` },
      {
        property: "og:description",
        content: "Vehicle profile, MOT and PCO expiry, mileage and service history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VehicleDetailPageWithBoundary,
});

function VehicleDetailPageWithBoundary() {
  return (
    <RouteErrorBoundary
      fallbackTitle="Vehicle Profile Error"
      fallbackMessage="An unexpected error occurred while loading this vehicle profile. Please try reloading."
    >
      <VehicleDetailPage />
    </RouteErrorBoundary>
  );
}

const STATUS_OPTIONS: Vehicle["status"][] = ["Active", "In Service", "Rented", "Off Road"];

function VehicleDetailPage() {
  if (typeof window === "undefined") return null;

  const navigate = useNavigate();
  const { reg } = useParams({ from: "/vehicles/$reg" });
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          console.error("[Auth] getSession error on vehicle detail:", error);
          setAuthError(error.message);
          navigate({ to: "/login" });
          return;
        }
        if (!data?.session) {
          navigate({ to: "/login" });
        } else {
          setAuthed(true);
        }
      })
      .catch((err) => {
        console.error("[Auth] getSession exception on vehicle detail:", err);
        setAuthError(err?.message ?? "Session validation failed");
        navigate({ to: "/login" });
      });
  }, [navigate]);

  const { vehicles, services, drivers, deletedDrivers, loading, saveVehicle, deleteVehicle } =
    useFleetData();
  const target = regSlug(reg ?? "");
  const vehicle = vehicles.find((v) => regSlug(v.registration) === target);
  const id = vehicle?.id;
  const vServices = services.filter(
    (s) => (id && s.vehicle_id === id) || (vehicle && regSlug(s.registration) === target),
  );
  const totalSpend = vServices.reduce((a, s) => a + (s.cost || 0), 0);

  // Drivers who have had this car: linked now (current or deleted), plus anyone the audit log
  // shows being given this reg before moving to another car.
  const [loggedDrivers, setLoggedDrivers] = useState<{ id: string; name: string; at: string }[]>(
    [],
  );
  useEffect(() => {
    if (!authed || !target) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase.from("audit_logs") as any)
          .select("target_id, details, created_at, action_type")
          .in("action_type", ["driver_created", "driver_edited"])
          .order("created_at", { ascending: true })
          .limit(1000);
        if (cancelled) return;
        const seen = new Map<string, { id: string; name: string; at: string }>();
        for (const row of (data ?? []) as any[]) {
          const r = String(row?.details?.reg ?? "")
            .replace(/\s+/g, "")
            .toUpperCase();
          if (r !== target || !row.target_id) continue;
          if (!seen.has(row.target_id))
            seen.set(row.target_id, {
              id: row.target_id,
              name: row.details?.driver_name ?? "Driver",
              at: row.created_at,
            });
        }
        setLoggedDrivers([...seen.values()]);
      } catch {
        // the history list still shows drivers linked to the car
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, target]);

  const history = useMemo(() => {
    const onCar = (d: DriverTrack) =>
      (id && d.vehicle_id === id) || regSlug(d.registration || "") === target;
    type Row = {
      id: string;
      name: string;
      from: string | null;
      to: string | null;
      rent: number | null;
      state: "current" | "previous" | "deleted";
      link: boolean;
    };
    const rows = new Map<string, Row>();
    for (const d of drivers.filter(onCar)) {
      const ended = d.status === "inactive";
      rows.set(d.id, {
        id: d.id,
        name: d.driver_name,
        from: d.start_date || null,
        to: null,
        rent: d.weekly_rent || null,
        state: ended ? "previous" : "current",
        link: true,
      });
    }
    for (const d of (deletedDrivers ?? []).filter(onCar)) {
      rows.set(d.id, {
        id: d.id,
        name: d.driver_name,
        from: d.start_date || null,
        to: d.deleted_at ?? null,
        rent: d.weekly_rent || null,
        state: "deleted",
        link: false,
      });
    }
    for (const l of loggedDrivers) {
      if (rows.has(l.id)) continue;
      const now = drivers.find((d) => d.id === l.id);
      rows.set(l.id, {
        id: l.id,
        name: now?.driver_name ?? l.name,
        from: l.at.slice(0, 10),
        to: null,
        rent: null,
        state: "previous",
        link: Boolean(now),
      });
    }
    const order = { current: 0, previous: 1, deleted: 2 } as const;
    return [...rows.values()].sort(
      (a, b) =>
        order[a.state] - order[b.state] || String(b.from ?? "").localeCompare(String(a.from ?? "")),
    );
  }, [drivers, deletedDrivers, loggedDrivers, id, target]);

  const updateStatus = async (status: Vehicle["status"]) => {
    if (!vehicle || status === vehicle.status) {
      setStatusOpen(false);
      return;
    }
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

  if (!authed) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center px-4 text-[#eef2f8]"
        style={{ background: T.bg }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center p-1 text-white shadow-lg">
            <BrandLogo size={48} />
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#ff8a3d]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#ff8a3d] border-t-transparent" />
            <span>Loading vehicle profile…</span>
          </div>
          {authError && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">
              {authError}.{" "}
              <a href="/login" className="font-semibold underline">
                Return to login
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  const terms = vehicle ? carTermsFor(vehicle) : null;
  const art = vehicle ? vehicleArtworkPath(vehicle) : null;
  const current = history.find((h) => h.state === "current");
  const fmt = (d?: string | null) =>
    d
      ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";

  return (
    <div className="min-h-screen text-[var(--vch-text)]" style={{ background: T.bg }}>
      <div className="mx-auto max-w-[1120px] px-4 py-5 sm:px-6 sm:py-8">
        <button
          onClick={() => navigate({ to: "/vehicles" })}
          className="vch-press mb-5 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--vch-text-muted)] transition-colors hover:text-[var(--vch-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6a00]/60"
        >
          <ArrowLeft className="h-4 w-4" /> Fleet
        </button>

        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <div className="vch-skeleton h-56 rounded-2xl" />
            <div className="grid gap-4 md:grid-cols-3">
              <div className="vch-skeleton h-24 rounded-2xl" />
              <div className="vch-skeleton h-24 rounded-2xl" />
              <div className="vch-skeleton h-24 rounded-2xl" />
            </div>
          </div>
        ) : !vehicle ? (
          <NotFoundPanel
            code="404"
            title="No vehicle found for that registration"
            subtitle={`We couldn't find "${target}" in your fleet. Check the plate and try again.`}
            showVehiclesLink
          />
        ) : (
          <div className="vch-stagger space-y-5">
            {/* Hero */}
            <section
              className="vch-card overflow-hidden rounded-2xl border"
              style={{ borderColor: T.border, background: T.panel }}
            >
              <div
                className="relative grid gap-6 p-5 sm:p-8 md:grid-cols-[1.1fr_1fr] md:items-center"
                style={{
                  background:
                    "radial-gradient(120% 120% at 100% 0%, var(--vch-accent-soft), transparent 60%)",
                }}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <UKPlate reg={vehicle.registration} size="lg" />
                    <div className="relative">
                      <button
                        onClick={() => setStatusOpen((open) => !open)}
                        aria-haspopup="listbox"
                        aria-expanded={statusOpen}
                        className="vch-press inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-semibold transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6a00]/60"
                        style={{ borderColor: T.border }}
                      >
                        <StatusBadge status={vehicle.status} />
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-[var(--vch-text-muted)] transition-transform ${statusOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {statusOpen && (
                        <div
                          className="vch-pop absolute left-0 top-full z-30 mt-2 w-40 origin-top-left overflow-hidden rounded-xl border p-1 shadow-2xl"
                          style={{ borderColor: T.border, background: "var(--vch-surface-2)" }}
                          role="listbox"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <button
                              key={status}
                              onClick={() => void updateStatus(status)}
                              className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-white/[0.08]"
                              role="option"
                              aria-selected={vehicle.status === status}
                            >
                              <StatusBadge status={status} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {statusError && <div className="mt-2 text-xs text-red-300">{statusError}</div>}
                  <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">
                    {simplifyVehicleName(vehicle)}
                  </h1>
                  <div className="mt-1.5 text-sm text-[var(--vch-text-muted)]">
                    {vehicle.make} {vehicle.model} · {vehicle.year} · {vehicle.fuel_type}
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <button
                      onClick={() => exportVehiclePdf(vehicle, vServices)}
                      className="vch-press inline-flex items-center gap-2 rounded-lg bg-[#ff6a00] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#e05d00]"
                    >
                      <Download className="h-4 w-4" /> Export PDF
                    </button>
                    <button
                      onClick={() => setEditing(true)}
                      className="vch-press inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white/[0.06]"
                      style={{ borderColor: T.border }}
                    >
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (
                          !confirm(
                            `Delete ${vehicle.registration}?\n\nThis also deletes its service records and the driver records linked to it. This cannot be undone.`,
                          )
                        )
                          return;
                        await deleteVehicle(vehicle.id);
                        navigate({ to: "/vehicles" });
                      }}
                      className="vch-press inline-flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  </div>
                </div>
                <div className="relative flex min-h-40 items-center justify-center">
                  {art ? (
                    <img
                      src={art}
                      alt={simplifyVehicleName(vehicle)}
                      className="vch-float-in max-h-56 w-full max-w-md object-contain drop-shadow-[0_24px_30px_rgba(0,0,0,0.45)]"
                    />
                  ) : (
                    <div
                      className="grid h-40 w-full max-w-sm place-items-center rounded-2xl border border-dashed"
                      style={{ borderColor: T.border }}
                    >
                      <RouteIcon className="h-10 w-10 text-[var(--vch-text-muted)]" />
                    </div>
                  )}
                </div>
              </div>
              <div
                className="grid grid-cols-2 border-t md:grid-cols-4"
                style={{ borderColor: T.border }}
              >
                <Stat
                  label="Mileage"
                  value={`${vehicle.current_mileage.toLocaleString("en-GB")} mi`}
                  icon={Gauge}
                />
                <Stat
                  label="Weekly rent"
                  value={terms?.weeklyRent ? `£${terms.weeklyRent}` : "—"}
                  icon={PoundSterling}
                  accent
                />
                <Stat
                  label="Monthly miles"
                  value={
                    terms?.monthlyAllowance
                      ? `${terms.monthlyAllowance.toLocaleString("en-GB")} mi`
                      : "—"
                  }
                  icon={RouteIcon}
                />
                <Stat
                  label="Service spend"
                  value={`£${totalSpend.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`}
                  icon={Wrench}
                />
              </div>
            </section>

            {/* Key dates */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <DateCard label="Next MOT" date={vehicle.next_mot_date} icon={CalendarCheck} />
              <DateCard label="Next service" date={vehicle.next_service_date} icon={Wrench} />
              <DateCard
                label="PCO licence expiry"
                date={vehicle.insurance_expiry}
                icon={ShieldCheck}
              />
            </div>

            {/* Current driver */}
            <section
              className="vch-card rounded-2xl border p-5"
              style={{ borderColor: T.border, background: T.panel }}
            >
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-[var(--vch-text-muted)]">
                <User className="h-4 w-4 text-[#ff8a3d]" /> Current driver
              </h2>
              {current ? (
                <a
                  href={`/drivers?driver=${encodeURIComponent(current.id)}`}
                  className="vch-lift mt-3 flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
                  style={{ borderColor: T.borderSoft, background: "var(--vch-surface-2)" }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold">{current.name}</span>
                    <span className="text-xs text-[var(--vch-text-muted)]">
                      Since {fmt(current.from)}
                      {current.rent ? ` · £${current.rent}/week` : ""}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--vch-text-muted)]" />
                </a>
              ) : (
                <p className="mt-3 text-sm text-[var(--vch-text-muted)]">
                  No one is renting this car at the moment.
                </p>
              )}
            </section>

            {vehicle.notes && (
              <section
                className="vch-card rounded-2xl border p-5"
                style={{ borderColor: T.border, background: T.panel }}
              >
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-[var(--vch-text-muted)]">
                  <FileText className="h-4 w-4 text-[#ff8a3d]" /> Notes
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{vehicle.notes}</p>
              </section>
            )}

            {/* Service history */}
            <section
              className="vch-card overflow-hidden rounded-2xl border"
              style={{ borderColor: T.border, background: T.panel }}
            >
              <div
                className="flex items-center justify-between border-b px-5 py-4"
                style={{ borderColor: T.border }}
              >
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <Wrench className="h-4 w-4 text-[#ff8a3d]" /> Service history
                </h2>
                <span className="text-xs text-[var(--vch-text-muted)]">
                  {vServices.length} record{vServices.length === 1 ? "" : "s"}
                </span>
              </div>
              {vServices.length === 0 ? (
                <EmptyState icon={Wrench} text="No services logged for this car yet." />
              ) : (
                <ul className="divide-y divide-white/5">
                  {vServices.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                      <div className="w-24 shrink-0 text-xs text-[var(--vch-text-muted)]">
                        {fmt(s.service_date)}
                      </div>
                      <div className="min-w-40 flex-1">
                        <div className="text-sm font-semibold">{s.service_type}</div>
                        <div className="text-xs text-[var(--vch-text-muted)]">
                          {s.garage || "—"} · {s.mileage.toLocaleString("en-GB")} mi
                        </div>
                        {s.description && (
                          <div className="mt-1 text-xs text-[var(--vch-text-muted)]">
                            {s.description}
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-bold text-[#ff8a3d]">£{s.cost.toFixed(2)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Previous drivers log */}
            <section
              className="vch-card overflow-hidden rounded-2xl border"
              style={{ borderColor: T.border, background: T.panel }}
            >
              <div
                className="flex items-center justify-between border-b px-5 py-4"
                style={{ borderColor: T.border }}
              >
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <Users className="h-4 w-4 text-[#ff8a3d]" /> Drivers who have rented this car
                </h2>
                <span className="text-xs text-[var(--vch-text-muted)]">{history.length}</span>
              </div>
              {history.length === 0 ? (
                <EmptyState icon={IdCard} text="No drivers recorded for this car yet." />
              ) : (
                <ul className="divide-y divide-white/5">
                  {history.map((h) => {
                    const body = (
                      <>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-xs font-bold">
                          {h.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase())
                            .join("")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{h.name}</span>
                          <span className="text-xs text-[var(--vch-text-muted)]">
                            {h.state === "deleted"
                              ? `${fmt(h.from)} – deleted ${fmt(h.to)}`
                              : h.state === "current"
                                ? `Since ${fmt(h.from)}`
                                : `From ${fmt(h.from)}`}
                            {h.rent ? ` · £${h.rent}/week` : ""}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            h.state === "current"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : h.state === "deleted"
                                ? "bg-red-500/10 text-red-300"
                                : "bg-white/[0.07] text-[var(--vch-text-muted)]"
                          }`}
                        >
                          {h.state === "current"
                            ? "Current"
                            : h.state === "deleted"
                              ? "Deleted"
                              : "Previous"}
                        </span>
                        {h.link && (
                          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--vch-text-muted)]" />
                        )}
                      </>
                    );
                    return (
                      <li key={h.id}>
                        {h.link ? (
                          <a
                            href={`/drivers?driver=${encodeURIComponent(h.id)}`}
                            className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.04]"
                          >
                            {body}
                          </a>
                        ) : (
                          <div className="flex items-center gap-3 px-5 py-3">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
      {vehicle && editing && (
        <EditVehicleModal
          vehicle={vehicle}
          onClose={() => setEditing(false)}
          onSave={async (v) => {
            await saveVehicle(v, false);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: IconCmp,
  accent,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 border-r p-4 last:border-r-0 sm:p-5 [&:nth-child(2)]:max-md:border-r-0"
      style={{ borderColor: T.border }}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accent ? "bg-[#ff6a00]/15 text-[#ff8a3d]" : "bg-white/[0.05] text-[var(--vch-text-muted)]"}`}
      >
        <IconCmp className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--vch-text-muted)]">
          {label}
        </span>
        <span
          className={`mt-0.5 block truncate text-lg font-bold ${accent ? "text-[#ff8a3d]" : ""}`}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

function DateCard({
  label,
  date,
  icon: IconCmp,
}: {
  label: string;
  date: string;
  icon: LucideIcon;
}) {
  const has = !!date;
  const left = has ? daysUntil(date) : null;
  const expired = left === "Expired";
  const soon = has && !expired && /^\d+/.test(String(left)) && parseInt(String(left), 10) <= 30;
  const tone = expired
    ? "text-red-300 bg-red-500/10"
    : soon
      ? "text-amber-200 bg-amber-500/10"
      : "text-emerald-300 bg-emerald-500/10";
  return (
    <div
      className="vch-card flex items-center gap-3 rounded-2xl border p-4"
      style={{ borderColor: T.border, background: T.panel }}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-[#ff8a3d]">
        <IconCmp className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--vch-text-muted)]">
          {label}
        </span>
        <span
          className={`mt-0.5 block truncate text-base font-bold ${expired ? "text-red-300" : ""}`}
        >
          {has
            ? new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "Not set"}
        </span>
      </span>
      {has && (
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
          {left}
        </span>
      )}
    </div>
  );
}

function EmptyState({ icon: IconCmp, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-[var(--vch-text-muted)]">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-white/[0.05]">
        <IconCmp className="h-5 w-5" />
      </span>
      {text}
    </div>
  );
}
