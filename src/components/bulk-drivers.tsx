import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  IdCard,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  Upload,

} from "lucide-react";
import { readDrivingLicenceFn } from "@/lib/licence.functions";
import type { LicenceReadResult } from "@/lib/driving-licence";
import type { DriverTrack, Vehicle } from "@/lib/fleet-data";
import { getVehicleWeeklyPrice } from "@/lib/fleet-data";
import { carTermsFor } from "@/lib/fleet-sheet";
import { getVehicleDefaultDeposit } from "@/lib/contract-helpers";
import { fileToDataUrl } from "@/components/licence-scanner";
import { VehicleSearch } from "@/components/vehicle-search";

/** Licences are read two at a time. */
export const READ_AT_ONCE = 2;
const STORE_KEY = "vch_bulk_driver_drafts_v1";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Status = "queued" | "reading" | "read" | "check" | "failed" | "saving" | "saved";
type Mark = "read" | "check" | undefined;

export type Draft = {
  id: string;
  fileName: string;
  thumb: string | null;
  status: Status;
  error?: string;
  warnings: string[];
  name: string;
  licenceNumber: string;
  licenceExpiry: string;
  phone: string;
  vehicleId: string;
  startDate: string;
  weeklyRent: string;
  rentDueDay: string;
  deposit: string;
  allowance: string;
  excessRate: string;
  marks: { name?: Mark; licenceNumber?: Mark; licenceExpiry?: Mark };
};

const today = () => new Date().toISOString().slice(0, 10);

export function blankDraft(fileName: string, thumb: string | null): Draft {
  return {
    id: crypto.randomUUID(),
    fileName,
    thumb,
    status: "queued",
    warnings: [],
    name: "",
    licenceNumber: "",
    licenceExpiry: "",
    phone: "",
    vehicleId: "",
    startDate: today(),
    weeklyRent: "",
    rentDueDay: "Monday",
    deposit: "",
    allowance: "5000",
    excessRate: "20",
    marks: {},
  };
}

/** What still has to be filled in before a driver can be saved (exported for tests). */
export function missingFor(d: Pick<Draft, "name" | "vehicleId" | "weeklyRent">): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push("name");
  if (!d.vehicleId) out.push("car");
  if (!(Number(d.weeklyRent) > 0)) out.push("weekly rent");
  return out;
}

/** Applies a licence read to a draft (exported for tests). */
export function applyRead(d: Draft, res: LicenceReadResult | undefined | null): Draft {
  if (!res || typeof res !== "object" || !res.fullName) {
    return { ...d, status: "failed", error: "The licence reader didn't answer. Try again." };
  }
  if (!res.ok) return { ...d, status: "failed", error: res.error || "Nothing could be read." };
  const mark = (c: "high" | "check" | "missing"): Mark => (c === "high" ? "read" : c === "check" ? "check" : undefined);
  const anyCheck = [res.fullName, res.expiryDate, res.licenceNumber].some((f) => f.confidence !== "high");
  return {
    ...d,
    status: anyCheck ? "check" : "read",
    error: undefined,
    warnings: res.warnings,
    name: d.name || res.fullName.value || "",
    licenceNumber: d.licenceNumber || res.licenceNumber.value || "",
    licenceExpiry: d.licenceExpiry || res.expiryDate.value || "",
    marks: {
      name: mark(res.fullName.confidence),
      licenceNumber: mark(res.licenceNumber.confidence),
      licenceExpiry: mark(res.expiryDate.confidence),
    },
  };
}

/** Small preview so drafts can be kept in the browser without storing the full photo. */
function thumbnail(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!dataUrl.startsWith("data:image/")) return resolve(null);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 220 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? (JSON.parse(raw) as Draft[]) : [];
    // A read that was cut off by closing the page can't resume (the photo isn't kept).
    return list
      .filter((d) => d.status !== "saved")
      .map((d) =>
        d.status === "queued" || d.status === "reading"
          ? { ...d, status: "failed" as Status, error: "The page was closed before this licence was read. Add the photo again." }
          : d.status === "saving"
            ? { ...d, status: "check" as Status }
            : d,
      );
  } catch {
    return [];
  }
}

const field =
  "w-full rounded-lg border border-white/15 bg-[#142131] px-3 py-2.5 text-sm text-white placeholder:text-[#5b6478] focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30";
const ring = (m: Mark) => (m === "check" ? " ring-2 ring-amber-400/70" : m === "read" ? " ring-2 ring-emerald-500/50" : "");

export function BulkDriversView({
  vehicles,
  drivers,
  addDriver,
  toast,
}: {
  vehicles: Vehicle[];
  drivers: DriverTrack[];
  addDriver: (d: Omit<DriverTrack, "id" | "monthly_logs">) => Promise<void>;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const readFn = useServerFn(readDrivingLicenceFn);
  const [drafts, setDrafts] = useState<Draft[]>(() => (typeof window === "undefined" ? [] : loadDrafts()));
  const [dragging, setDragging] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const files = useRef(new Map<string, File>()); // photos waiting to be read (memory only)
  const active = useRef(0);

  // Keep drafts in this browser so nothing is lost on refresh.
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(drafts.filter((d) => d.status !== "saved")));
    } catch {
      /* storage full or blocked: drafts still work for this visit */
    }
  }, [drafts]);

  const update = useCallback((id: string, patch: Partial<Draft> | ((d: Draft) => Draft)) => {
    setDrafts((list) => list.map((d) => (d.id === id ? (typeof patch === "function" ? patch(d) : { ...d, ...patch }) : d)));
  }, []);

  // Reads the queue, two licences at a time.
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const started = useRef(new Set<string>());
  const pump = useCallback(() => {
    const waiting = draftsRef.current.filter(
      (d) => d.status === "queued" && files.current.has(d.id) && !started.current.has(d.id),
    );
    for (const d of waiting.slice(0, Math.max(0, READ_AT_ONCE - active.current))) {
      active.current += 1;
      started.current.add(d.id);
      update(d.id, { status: "reading", error: undefined });
      const file = files.current.get(d.id)!;
      (async () => {
        try {
          const dataUrl = await fileToDataUrl(file);
          const res = (await readFn({ data: { file: dataUrl } })) as LicenceReadResult | undefined;
          update(d.id, (cur) => applyRead(cur, res));
        } catch (err) {
          update(d.id, {
            status: "failed",
            error: (err instanceof Error && err.message) || "The licence couldn't be read.",
          });
        } finally {
          active.current -= 1;
          started.current.delete(d.id);
          setTimeout(() => pump(), 0);
        }
      })();
    }
  }, [readFn, update]);
  // Start reading whenever new licences are waiting.
  useEffect(() => {
    if (drafts.some((d) => d.status === "queued" && files.current.has(d.id))) pump();
  }, [drafts, pump]);

  const addFiles = useCallback(
    async (list: FileList | File[] | null | undefined) => {
      const ok = [...(list ?? [])].filter(
        (f) => /^image\//.test(f.type) || f.type === "application/pdf" || /\.(heic|heif)$/i.test(f.name),
      );
      if (!ok.length) {
        toast("Please choose photos or PDFs of driving licences.", "error");
        return;
      }
      const fresh: Draft[] = [];
      for (const f of ok) {
        let thumb: string | null = null;
        try {
          if (f.type.startsWith("image/")) {
            const url = URL.createObjectURL(f);
            thumb = await thumbnail(url);
            URL.revokeObjectURL(url);
          }
        } catch {
          thumb = null;
        }
        const d = blankDraft(f.name, thumb);
        files.current.set(d.id, f);
        fresh.push(d);
      }
      setDrafts((cur) => [...cur, ...fresh]);
    },
    [toast],
  );

  const pickCar = (d: Draft, vehicleId: string) => {
    const v = vehicles.find((x) => x.id === vehicleId);
    if (!v) return update(d.id, { vehicleId });
    const t = carTermsFor(v);
    update(d.id, {
      vehicleId,
      weeklyRent: String(t.weeklyRent ?? getVehicleWeeklyPrice(v.make, v.model)),
      allowance: String(t.monthlyAllowance ?? (d.allowance || 5000)),
      excessRate: String(t.excessRatePence),
      deposit: String(t.deposit ?? v.default_deposit ?? getVehicleDefaultDeposit(v.make, v.model)),
    });
  };

  const existingNumbers = useMemo(
    () => new Set(drivers.map((d) => String((d as any).licence_number || "").toUpperCase()).filter(Boolean)),
    [drivers],
  );
  const usedCars = useMemo(() => {
    const m = new Map<string, number>();
    drafts.forEach((d) => d.vehicleId && d.status !== "saved" && m.set(d.vehicleId, (m.get(d.vehicleId) ?? 0) + 1));
    return m;
  }, [drafts]);

  const saveOne = async (d: Draft): Promise<boolean> => {
    const v = vehicles.find((x) => x.id === d.vehicleId);
    if (!v || missingFor(d).length) return false;
    update(d.id, { status: "saving", error: undefined });
    try {
      const rent = Number(d.weeklyRent) || 0;
      await addDriver({
        driver_name: d.name.trim(),
        email: "",
        phone: d.phone.trim(),
        vehicle_id: v.id,
        registration: v.registration,
        start_mileage: v.current_mileage,
        current_mileage: v.current_mileage,
        allowance: parseInt(d.allowance) || 5000,
        excess_rate: parseInt(d.excessRate) || 20,
        start_date: d.startDate || today(),
        licence_expiry_date: d.licenceExpiry || null,
        licence_number: d.licenceNumber.trim().toUpperCase() || null,
        weekly_rent: rent,
        rent_due_day: d.rentDueDay,
        rent_status: "unpaid",
        balance_due: rent,
        deposit_total: Number(d.deposit) || 0,
      } as any);
      update(d.id, { status: "saved" });
      files.current.delete(d.id);
      return true;
    } catch (err) {
      update(d.id, { status: "check", error: (err instanceof Error && err.message) || "Could not save" });
      return false;
    }
  };

  const ready = drafts.filter((d) => d.status !== "saved" && d.status !== "reading" && d.status !== "queued" && d.status !== "saving" && missingFor(d).length === 0);
  const reading = drafts.filter((d) => d.status === "reading" || d.status === "queued").length;
  const open = drafts.filter((d) => d.status !== "saved");
  const savedCount = drafts.filter((d) => d.status === "saved").length;

  const saveAll = async () => {
    setSavingAll(true);
    let ok = 0;
    for (const d of ready) if (await saveOne(d)) ok += 1;
    setSavingAll(false);
    const failed = ready.length - ok;
    toast(failed ? `${ok} drivers saved, ${failed} could not be saved (see the red notes)` : `${ok} driver${ok === 1 ? "" : "s"} saved`, failed ? "error" : "success");
    // Saved cards fade out after a moment.
    setTimeout(() => setDrafts((list) => list.filter((d) => d.status !== "saved")), 2500);
  };

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
            <IdCard className="h-6 w-6 text-[#ff8a3d]" /> Bulk Driver Recognition
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#8b95a8]">
            Drop in as many driving licences as you like. Each one is read (two at a time) and becomes a driver card
            with the name, licence number and expiry filled in. Pick each driver's car, check the details, then save
            them all at once. Drafts are kept on this computer until they're saved.
          </p>
        </div>
        {open.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (confirm(`Remove all ${open.length} unsaved driver cards?`)) setDrafts([]);
              }}
              className="vch-press rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-[#c9d1dc] hover:bg-white/10"
            >
              Clear all
            </button>
            <button
              type="button"
              disabled={!ready.length || savingAll}
              onClick={saveAll}
              className="vch-press inline-flex items-center gap-2 rounded-lg bg-[#ff6a00] px-4 py-2 text-sm font-bold text-white hover:bg-[#e05d00] disabled:opacity-50"
            >
              {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save {ready.length} ready driver{ready.length === 1 ? "" : "s"}
            </button>
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Add driving licence photos"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={`vch-press flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-[#ff6a00] bg-[#ff6a00]/10" : "border-[#ff6a00]/40 bg-[#ff6a00]/[0.04] hover:bg-[#ff6a00]/10"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="grid h-12 w-12 place-items-center rounded-full bg-[#ff6a00]/15 text-[#ff8a3d]">
          <Upload className="h-6 w-6" />
        </div>
        <div className="text-sm font-bold text-white">Drop driving licences here</div>
        <div className="text-xs text-[#8b95a8]">Photos or PDFs of the front of each licence. Select as many as you like.</div>
      </div>

      {/* Progress */}
      {drafts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-xs text-[#c9d1dc]">
          <span><b className="text-white">{open.length}</b> to save</span>
          {reading > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[#ff8a3d]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading {reading} licence{reading === 1 ? "" : "s"}…
            </span>
          )}
          <span className="text-emerald-300"><b>{ready.length}</b> ready</span>
          {open.length - ready.length - reading > 0 && (
            <span className="text-amber-200"><b>{open.length - ready.length - reading}</b> need a car or details</span>
          )}
          {savedCount > 0 && <span className="text-emerald-300"><b>{savedCount}</b> saved</span>}
        </div>
      )}

      {/* Cards */}
      <div className="grid gap-3 xl:grid-cols-2">
        {drafts.map((d, i) => {
          const missing = missingFor(d);
          const busy = d.status === "reading" || d.status === "queued";
          const dup = d.licenceNumber && existingNumbers.has(d.licenceNumber.toUpperCase());
          const sharedCar = d.vehicleId && (usedCars.get(d.vehicleId) ?? 0) > 1;
          const carTaken = d.vehicleId && drivers.some((x) => x.vehicle_id === d.vehicleId && (x as any).status !== "inactive" && !(x as any).deleted_at);
          return (
            <div
              key={d.id}
              className={`vch-enter rounded-2xl border bg-[#10141d] p-4 transition-opacity ${
                d.status === "saved" ? "border-emerald-500/40 opacity-60" : d.status === "failed" ? "border-red-500/40" : "border-white/10"
              }`}
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <div className="flex items-start gap-3">
                {d.thumb ? (
                  <img src={d.thumb} alt="" className="h-14 w-20 shrink-0 rounded-md object-cover ring-1 ring-white/15" />
                ) : (
                  <div className="grid h-14 w-20 shrink-0 place-items-center rounded-md bg-[#ff6a00]/10 text-[#ff8a3d]">
                    <IdCard className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">
                    {d.name || (busy ? "Reading licence…" : "Driver")}
                  </div>
                  <div className="truncate text-[11px] text-[#8b95a8]">{d.fileName}</div>
                  <div className="mt-1">
                    {busy ? (
                      <span className="inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-[#c9d1dc]">
                        <Loader2 className="h-3 w-3 animate-spin" /> {d.status === "queued" ? "Waiting" : "Reading"}
                      </span>
                    ) : d.status === "saved" ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> Saved
                      </span>
                    ) : d.status === "saving" ? (
                      <span className="inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        <Loader2 className="h-3 w-3 animate-spin" /> Saving
                      </span>
                    ) : d.status === "failed" ? (
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">Not read: type the details</span>
                    ) : missing.length ? (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">Needs {missing.join(", ")}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                        <Check className="h-3 w-3" /> Ready
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${d.name || d.fileName}`}
                  onClick={() => {
                    files.current.delete(d.id);
                    setDrafts((list) => list.filter((x) => x.id !== d.id));
                  }}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#8b95a8] hover:bg-white/10 hover:text-white"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {(d.error || d.warnings.length > 0 || dup) && (
                <ul className="mt-3 space-y-1 text-[11px]">
                  {d.error && <li className="text-red-300">{d.error}</li>}
                  {dup && <li className="text-red-300">A driver with this licence number is already in the CRM.</li>}
                  {d.warnings.map((w) => (
                    <li key={w} className="flex gap-1.5 text-amber-200">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}

              {d.status !== "saved" && (
                <fieldset disabled={busy || d.status === "saving"} className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 disabled:opacity-60">
                  <label className="sm:col-span-2 text-[11px] font-semibold text-[#c9d1dc]">
                    Full name *
                    <input
                      value={d.name}
                      onChange={(e) => update(d.id, (c) => ({ ...c, name: e.target.value, marks: { ...c.marks, name: undefined } }))}
                      className={`${field} mt-1${ring(d.marks.name)}`}
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-[#c9d1dc]">
                    Licence number
                    <input
                      value={d.licenceNumber}
                      onChange={(e) =>
                        update(d.id, (c) => ({ ...c, licenceNumber: e.target.value.toUpperCase(), marks: { ...c.marks, licenceNumber: undefined } }))
                      }
                      className={`${field} mt-1 font-mono${ring(d.marks.licenceNumber)}`}
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-[#c9d1dc]">
                    Licence expiry
                    <input
                      type="date"
                      value={d.licenceExpiry}
                      onChange={(e) => update(d.id, (c) => ({ ...c, licenceExpiry: e.target.value, marks: { ...c.marks, licenceExpiry: undefined } }))}
                      className={`${field} mt-1${ring(d.marks.licenceExpiry)}`}
                    />
                  </label>
                  <div className="sm:col-span-2 text-[11px] font-semibold text-[#c9d1dc]">
                    Car *
                    <div className="mt-1">
                      <VehicleSearch vehicles={vehicles} value={d.vehicleId} invalid={false} onChange={(id) => pickCar(d, id)} />
                    </div>
                    {sharedCar ? (
                      <p className="mt-1 font-normal text-amber-200">This car is picked for more than one driver here.</p>
                    ) : carTaken ? (
                      <p className="mt-1 font-normal text-amber-200">This car already has a driver in the CRM.</p>
                    ) : null}
                  </div>
                  <label className="text-[11px] font-semibold text-[#c9d1dc]">
                    Phone (optional)
                    <input
                      type="tel"
                      inputMode="tel"
                      value={d.phone}
                      onChange={(e) => update(d.id, { phone: e.target.value })}
                      placeholder="+44 7…"
                      className={`${field} mt-1`}
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-[#c9d1dc]">
                    Rent start date
                    <input type="date" value={d.startDate} onChange={(e) => update(d.id, { startDate: e.target.value })} className={`${field} mt-1`} />
                  </label>
                  <label className="text-[11px] font-semibold text-[#c9d1dc]">
                    Weekly rent (£) *
                    <input
                      inputMode="decimal"
                      value={d.weeklyRent}
                      onChange={(e) => update(d.id, { weeklyRent: e.target.value.replace(/[^0-9.]/g, "") })}
                      className={`${field} mt-1`}
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-[#c9d1dc]">
                    Rent due day
                    <select value={d.rentDueDay} onChange={(e) => update(d.id, { rentDueDay: e.target.value })} className={`${field} mt-1`}>
                      {DAYS.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] font-semibold text-[#c9d1dc]">
                    Deposit (£)
                    <input
                      inputMode="decimal"
                      value={d.deposit}
                      onChange={(e) => update(d.id, { deposit: e.target.value.replace(/[^0-9.]/g, "") })}
                      className={`${field} mt-1`}
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-[#c9d1dc]">
                    Monthly allowance (mi)
                    <input
                      inputMode="numeric"
                      value={d.allowance}
                      onChange={(e) => update(d.id, { allowance: e.target.value.replace(/\D/g, "") })}
                      className={`${field} mt-1`}
                    />
                  </label>
                  <div className="sm:col-span-2 mt-1 flex justify-end gap-2">
                    {d.status === "failed" && files.current.has(d.id) && (
                      <button
                        type="button"
                        onClick={() => update(d.id, { status: "queued", error: undefined })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-[#c9d1dc] hover:bg-white/10"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Read again
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={missing.length > 0 || savingAll}
                      onClick={async () => {
                        if (await saveOne(d)) {
                          toast(`${d.name.trim()} saved`);
                          setTimeout(() => setDrafts((list) => list.filter((x) => x.id !== d.id)), 2000);
                        }
                      }}
                      className="vch-press inline-flex items-center gap-1.5 rounded-lg bg-[#ff6a00] px-3 py-2 text-xs font-bold text-white hover:bg-[#e05d00] disabled:opacity-40"
                    >
                      <Save className="h-3.5 w-3.5" /> Save this driver
                    </button>
                  </div>
                </fieldset>
              )}
            </div>
          );
        })}
      </div>

      {/* Phones: Save stays in reach while scrolling a long list */}
      {ready.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:hidden">
          <button
            type="button"
            disabled={savingAll}
            onClick={saveAll}
            className="vch-pop pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#ff6a00] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_30px_rgba(255,106,0,0.45)] disabled:opacity-60"
          >
            {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save {ready.length} ready driver{ready.length === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {drafts.length === 0 && (
        <p className="text-center text-xs text-[#8b95a8]">
          Tip: on a phone, tap the box above and choose several licence photos from your gallery at once.
        </p>
      )}
    </div>
  );
}

