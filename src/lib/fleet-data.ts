import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getNextMotDate, getPcoExpiryDate } from "@/lib/vehicle-date-fields";
import { PDF_FLEET } from "@/lib/pdf-fleet";
import { logAuditEvent } from "@/lib/audit-logger";
import { getVehicleDefaultDeposit } from "@/lib/contract-helpers";

export { getVehicleDefaultDeposit };

export type Vehicle = {
  id: string;
  registration: string;
  make: string;
  model: string;
  year: number;
  fuel_type: "Petrol" | "Diesel" | "Hybrid" | "Electric" | "Plug-in-Hybrid";
  current_mileage: number;
  status: "Active" | "In Service" | "Rented" | "Off Road";
  next_service_date: string;
  next_mot_date: string;
  insurance_expiry: string;
  notes: string;
  default_deposit?: number;
};

export type DriverDocument = {
  id: string;
  driver_id: string;
  user_id?: string | null;
  document_type: "contract" | "permission_letter" | "vehicle_schedule" | "pco_licence";
  file_name: string;
  file_path: string;
  file_size?: number | null;
  created_at: string;
};

export type ServiceRecord = {
  id: string;
  vehicle_id: string;
  registration: string;
  service_type: string;
  service_date: string;
  mileage: number;
  cost: number;
  garage: string;
  description: string;
};

export type MonthlyLog = {
  id?: string;
  month: string;
  start_mileage: number;
  end_mileage: number;
  miles_driven: number;
  overage: number;
  excess_charge: number;
  date: string;
};

export type InviteStatus = "none" | "pending" | "accepted";

export type DriverCharge = {
  id: string;
  driver_id: string;
  amount: number;
  description: string;
  created_at: string;
};

export type DriverNotification = {
  id: string;
  driver_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
};

export type DepositPayment = {
  id: string;
  driver_id: string;
  amount: number;
  paid_at: string;
  note?: string | null;
  created_at: string;
};

export type DriverTrack = {
  id: string;
  driver_name: string;
  email?: string | null;
  phone?: string | null;
  vehicle_id: string;
  registration: string;
  start_mileage: number;
  current_mileage: number;
  allowance: number;
  excess_rate: number;
  start_date: string;
  contract_length_weeks?: number;
  deposit_total?: number;
  deposit_payments?: DepositPayment[];
  invite_token?: string | null;
  invite_status?: InviteStatus | null;
  auth_user_id?: string | null;
  weekly_rent: number;
  rent_due_day: string;
  rent_status: "paid" | "unpaid";
  balance_due: number;
  charges: DriverCharge[];
  monthly_logs: MonthlyLog[];
};

export type MileageSubmission = {
  id: string;
  driver_id?: string | null;
  driver_name: string;
  registration: string;
  photo_url: string;
  ocr_mileage?: number | null;
  ocr_confidence?: "high" | "low" | "none" | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  approved_mileage?: number | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  notes?: string | null;
};

const statusToDb = (s: Vehicle["status"]): string =>
  s === "Active"
    ? "available"
    : s === "In Service"
      ? "in_service"
      : s === "Rented"
        ? "rented"
        : "off_road";
const statusFromDb = (s: string): Vehicle["status"] =>
  s === "in_service"
    ? "In Service"
    : s === "rented"
      ? "Rented"
      : s === "off_road"
        ? "Off Road"
        : "Active";

const vFromRow = (r: any): Vehicle => ({
  id: r.id,
  registration: r.reg,
  make: r.make,
  model: r.model,
  year:
    r.year ??
    PDF_FLEET.find(
      (vehicle) =>
        vehicle.registration ===
        String(r.reg ?? "")
          .replace(/\s+/g, "")
          .toUpperCase(),
    )?.year ??
    new Date().getFullYear(),
  fuel_type: (r.fuel_type ??
    PDF_FLEET.find(
      (vehicle) =>
        vehicle.registration ===
        String(r.reg ?? "")
          .replace(/\s+/g, "")
          .toUpperCase(),
    )?.fuelType ??
    "Diesel") as Vehicle["fuel_type"],
  current_mileage: r.current_mileage ?? 0,
  status: statusFromDb(r.status ?? "available"),
  next_service_date: r.next_service_date ?? "",
  next_mot_date: getNextMotDate(r),
  insurance_expiry: getPcoExpiryDate(r),
  notes: r.notes ?? "",
  default_deposit: Number(r.default_deposit ?? getVehicleDefaultDeposit(r.make, r.model)),
});

const sFromRow = (r: any): ServiceRecord => ({
  id: r.id,
  vehicle_id: r.vehicle_id ?? "",
  registration: r.reg,
  service_type: r.service_type ?? "Full Service",
  service_date: r.service_date,
  mileage: r.mileage ?? 0,
  cost: Number(r.cost ?? 0),
  garage: r.garage ?? "",
  description: r.notes ?? "",
});

const cFromRow = (r: any): DriverCharge => ({
  id: r.id,
  driver_id: r.driver_id ?? r.user_id,
  amount: Number(r.amount ?? 0),
  description: r.description,
  created_at: r.created_at,
});

const msFromRow = (r: any): MileageSubmission => ({
  id: r.id,
  driver_id: r.driver_id ?? null,
  driver_name: r.driver_name ?? "Unknown Driver",
  registration: r.registration ?? r.reg ?? "",
  photo_url: r.photo_url ?? "",
  ocr_mileage: typeof r.ocr_mileage === "number" ? r.ocr_mileage : null,
  ocr_confidence: r.ocr_confidence ?? "low",
  status: (r.status as "pending" | "approved" | "rejected") ?? "pending",
  submitted_at: r.submitted_at ?? r.created_at ?? new Date().toISOString(),
  approved_mileage: typeof r.approved_mileage === "number" ? r.approved_mileage : null,
  approved_at: r.approved_at ?? null,
  rejected_at: r.rejected_at ?? null,
  rejection_reason: r.rejection_reason ?? null,
  notes: r.notes ?? null,
});

export const WEBSITE_CATALOG = [
  { make: "Mercedes", model: "E300", fuel: "Plug-in-Hybrid", price: 340, year: "2021–24" },
  { make: "Mercedes", model: "Vito", fuel: "Petrol", price: 380, year: "2021–24" },
  { make: "Mercedes", model: "V-Class", fuel: "Petrol", price: 450, year: "2022–24" },
  { make: "Mercedes", model: "EQS", fuel: "Electric", price: 500, year: "2022–24" },
  { make: "Mercedes", model: "E220", fuel: "Petrol", price: 310, year: "2020–24" },
  { make: "Mercedes", model: "EQE", fuel: "Electric", price: 440, year: "2023–24" },
  { make: "Toyota", model: "Corolla Estate", fuel: "Plug-in-Hybrid", price: 220, year: "2021–24" },
  { make: "Toyota", model: "Auris Estate", fuel: "Plug-in-Hybrid", price: 210, year: "2019–22" },
  { make: "Toyota", model: "Prius", fuel: "Plug-in-Hybrid", price: 200, year: "2020–24" },
  { make: "Tesla", model: "Model 3", fuel: "Electric", price: 260, year: "2021–24" },
  { make: "Jaguar", model: "I-Pace", fuel: "Electric", price: 330, year: "2020–24" },
  { make: "Hyundai", model: "IONIQ", fuel: "Plug-in-Hybrid", price: 220, year: "2020–23" },
  { make: "MG", model: "MG5 EV", fuel: "Electric", price: 200, year: "2022–24" },
  { make: "Ford", model: "Tourneo Custom", fuel: "Electric", price: 410, year: "2025" },
  { make: "MG", model: "MG S9 PHEV SUV", fuel: "Plug-in-Hybrid", price: 350, year: "2024–25" },
  { make: "Volkswagen", model: "Multivan PHEV", fuel: "Plug-in-Hybrid", price: 350, year: "2024–25" },
];

export function getVehicleWeeklyPrice(make?: string | null, model?: string | null): number {
  if (!make && !model) return 200;
  const combined = `${make ?? ""} ${model ?? ""}`.toLowerCase();

  if (/eqe/i.test(combined)) return 440;
  if (/eqs/i.test(combined)) return 500;
  if (/v-class|vclass/i.test(combined)) return 450;
  if (/vito/i.test(combined)) return 380;
  if (/e300|e\s*300/i.test(combined)) return 340;
  if (/e220|e\s*220/i.test(combined)) return 310;
  if (/tourneo/i.test(combined)) return 410;
  if (/i-pace|ipace/i.test(combined)) return 330;
  if (/model 3|model3/i.test(combined)) return 260;
  if (/corolla/i.test(combined)) return 220;
  if (/auris/i.test(combined)) return 210;
  if (/prius/i.test(combined)) return 200;
  if (/ioniq/i.test(combined)) return 220;
  if (/mg5|mg 5/i.test(combined)) return 200;
  if (/multivan/i.test(combined)) return 350;

  const mClean = (make ?? "").toLowerCase();
  const modClean = (model ?? "").toLowerCase();
  const found = WEBSITE_CATALOG.find(
    (c) =>
      c.make.toLowerCase() === mClean &&
      (c.model.toLowerCase().includes(modClean) || modClean.includes(c.model.toLowerCase())),
  );
  return found ? found.price : 200;
}

export function calculateNextPaymentDueDate(
  startDateStr?: string | null,
  dueDayName?: string | null,
  refDate: Date = new Date(),
): Date {
  const daysMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const targetDay = daysMap[(dueDayName || "Monday").trim().toLowerCase()] ?? 1;

  // Base date: today at start of day
  const today = new Date(refDate);
  today.setHours(0, 0, 0, 0);

  let baseDate = new Date(today);

  if (startDateStr) {
    const parsedStart = new Date(startDateStr);
    if (!isNaN(parsedStart.getTime())) {
      parsedStart.setHours(0, 0, 0, 0);
      if (parsedStart > today) {
        baseDate = parsedStart;
      }
    }
  }

  const currentDay = baseDate.getDay();
  const daysUntil = (targetDay - currentDay + 7) % 7;

  const nextDue = new Date(baseDate);
  nextDue.setDate(baseDate.getDate() + daysUntil);
  return nextDue;
}

const dpFromRow = (r: any): DepositPayment => ({
  id: r.id,
  driver_id: r.driver_id ?? "",
  amount: Number(r.amount ?? 0),
  paid_at: r.paid_at ?? r.created_at ?? new Date().toISOString(),
  note: r.note ?? null,
  created_at: r.created_at ?? new Date().toISOString(),
});

const dFromRow = (
  r: any,
  logs: MonthlyLog[],
  charges: DriverCharge[] = [],
  depositPayments: DepositPayment[] = [],
): DriverTrack => ({
  id: r.id,
  driver_name: r.driver_name ?? "Driver",
  email: r.email ?? "",
  phone: r.phone ?? "",
  vehicle_id: r.vehicle_id ?? "",
  registration: r.reg ?? "",
  start_mileage: Number(r.start_mileage ?? 0),
  current_mileage: Number(r.current_mileage ?? 0),
  allowance: Number(r.allowance ?? 5000),
  excess_rate: Number(r.rate_pence ?? 20),
  start_date: r.start_date ?? new Date().toISOString().slice(0, 10),
  contract_length_weeks: Number(r.contract_length_weeks ?? 6),
  deposit_total: Number(r.deposit_total ?? 0),
  deposit_payments: depositPayments,
  invite_token: r.invite_token ?? null,
  invite_status: (r.invite_status as InviteStatus) ?? "none",
  auth_user_id: r.auth_user_id ?? null,
  weekly_rent: Number(r.weekly_rent ?? 0),
  rent_due_day: r.rent_due_day ?? "Monday",
  rent_status: (r.rent_status as "paid" | "unpaid") ?? "unpaid",
  balance_due: Number(r.balance_due ?? 0),
  charges,
  monthly_logs: logs,
});

const lFromRow = (r: any): MonthlyLog => ({
  id: r.id,
  month: new Date(r.period_end).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
  start_mileage: r.start_mileage,
  end_mileage: r.end_mileage,
  miles_driven: Math.max(0, r.end_mileage - r.start_mileage),
  overage: Math.max(0, r.end_mileage - r.start_mileage - r.allowance),
  excess_charge: Number(r.excess_charge ?? 0),
  date: r.period_end,
});

export function useFleetData() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverTrack[]>([]);
  const [mileageSubmissions, setMileageSubmissions] = useState<MileageSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    let dpData: any[] = [];
    try {
      const dpRes = await supabase.from("deposit_payments").select("*").order("paid_at", { ascending: false });
      if (dpRes.data) dpData = dpRes.data;
    } catch {
      dpData = [];
    }

    const [vRes, sRes, dRes, lRes, cRes, msRes] = await Promise.all([
      supabase.from("vehicles").select("*").order("reg"),
      supabase.from("service_records").select("*").order("service_date", { ascending: false }),
      supabase
        .from("driver_tracks")
        .select("*")
        .neq("active", false)
        .order("created_at", { ascending: false }),
      supabase.from("mileage_logs").select("*").order("period_end", { ascending: false }),
      supabase.from("driver_charges").select("*").order("created_at", { ascending: false }),
      supabase.from("mileage_submissions").select("*").order("submitted_at", { ascending: false }),
    ]);
    setVehicles((vRes.data ?? []).map(vFromRow));
    setServices((sRes.data ?? []).map(sFromRow));
    setMileageSubmissions((msRes.data ?? []).map(msFromRow));

    const logsByTrack = new Map<string, MonthlyLog[]>();
    for (const l of lRes.data ?? []) {
      if (!l.track_id) continue;
      const arr = logsByTrack.get(l.track_id) ?? [];
      arr.push(lFromRow(l));
      logsByTrack.set(l.track_id, arr);
    }

    const chargesByDriver = new Map<string, DriverCharge[]>();
    for (const c of cRes.data ?? []) {
      const targetDriverId = c.driver_id ?? c.user_id;
      if (!targetDriverId) continue;
      const arr = chargesByDriver.get(targetDriverId) ?? [];
      arr.push(cFromRow(c));
      chargesByDriver.set(targetDriverId, arr);
      if (c.driver_id && c.user_id && c.driver_id !== c.user_id) {
        const arr2 = chargesByDriver.get(c.user_id) ?? [];
        arr2.push(cFromRow(c));
        chargesByDriver.set(c.user_id, arr2);
      }
    }

    const depositPaymentsByDriver = new Map<string, DepositPayment[]>();
    for (const dp of dpData) {
      if (!dp.driver_id) continue;
      const arr = depositPaymentsByDriver.get(dp.driver_id) ?? [];
      arr.push(dpFromRow(dp));
      depositPaymentsByDriver.set(dp.driver_id, arr);
    }

    setDrivers(
      (dRes.data ?? []).map((r) => {
        const matchedCharges = [
          ...(chargesByDriver.get(r.id) ?? []),
          ...(r.auth_user_id && r.auth_user_id !== r.id ? chargesByDriver.get(r.auth_user_id) ?? [] : []),
        ];
        const uniqueChargesMap = new Map<string, DriverCharge>();
        for (const ch of matchedCharges) {
          uniqueChargesMap.set(ch.id, ch);
        }
        const chargesList = Array.from(uniqueChargesMap.values());
        const depositPaymentsList = [
          ...(depositPaymentsByDriver.get(r.id) ?? []),
          ...(r.auth_user_id && r.auth_user_id !== r.id ? depositPaymentsByDriver.get(r.auth_user_id) ?? [] : []),
        ];
        return dFromRow(r, logsByTrack.get(r.id) ?? [], chargesList, depositPaymentsList);
      }),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();

    const channel = supabase
      .channel("fleet-data-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_records" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_tracks" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mileage_logs" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_charges" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mileage_submissions" },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[FleetData] Realtime sync status: ${status}`);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const saveVehicle = useCallback(
    async (v: Vehicle, isNew: boolean) => {
      setVehicles((prev) => {
        if (isNew) {
          return [v, ...prev];
        }
        return prev.map((item) => (item.id === v.id ? v : item));
      });
      if (!isNew && v.current_mileage > 0) {
        setDrivers((prev) =>
          prev.map((d) =>
            d.vehicle_id === v.id && d.current_mileage < v.current_mileage
              ? { ...d, current_mileage: v.current_mileage }
              : d,
          ),
        );
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");

      const payload = {
        user_id: userId,
        reg: v.registration.toUpperCase().trim(),
        make: v.make,
        model: v.model,
        year: v.year,
        fuel_type: v.fuel_type,
        current_mileage: v.current_mileage,
        status: statusToDb(v.status),
        next_service_date: v.next_service_date || null,
        next_mot_date: v.next_mot_date || null,
        pco_expiry_date: v.insurance_expiry || null,
        notes: v.notes,
      };
      if (isNew) {
        const { error } = await supabase.from("vehicles").insert(payload);
        if (error) throw new Error(error.message);
        await logAuditEvent({
          actionType: "vehicle_added",
          targetTable: "vehicles",
          targetId: v.id ?? null,
          details: { reg: v.registration, make: v.make, model: v.model, year: v.year, status: v.status },
        });
      } else {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", v.id);
        if (error) throw new Error(error.message);
        await logAuditEvent({
          actionType: "vehicle_edited",
          targetTable: "vehicles",
          targetId: v.id ?? null,
          details: { reg: v.registration, make: v.make, model: v.model, status: v.status, current_mileage: v.current_mileage },
        });
      }
      // sync driver_tracks current_mileage if updated
      await supabase
        .from("driver_tracks")
        .update({ current_mileage: v.current_mileage })
        .eq("vehicle_id", v.id)
        .lt("current_mileage", v.current_mileage);
      await refresh();
    },
    [refresh],
  );

  const deleteVehicle = useCallback(
    async (id: string) => {
      const target = vehicles.find((v) => v.id === id);
      setVehicles((prev) => prev.filter((v) => v.id !== id));
      await supabase.from("vehicles").delete().eq("id", id);
      await logAuditEvent({
        actionType: "vehicle_deleted",
        targetTable: "vehicles",
        targetId: id,
        details: { reg: target?.registration ?? null, make: target?.make ?? null, model: target?.model ?? null },
      });
      await refresh();
    },
    [vehicles, refresh],
  );

  const addService = useCallback(
    async (s: Omit<ServiceRecord, "id">) => {
      const newServiceRecord: ServiceRecord = {
        id: crypto.randomUUID(),
        vehicle_id: s.vehicle_id || "",
        registration: s.registration,
        service_type: s.service_type,
        service_date: s.service_date,
        mileage: s.mileage,
        cost: s.cost,
        garage: s.garage,
        description: s.description,
      };
      setServices((prev) => [newServiceRecord, ...prev]);
      if (s.vehicle_id && s.mileage > 0) {
        setVehicles((prev) =>
          prev.map((v) =>
            v.id === s.vehicle_id && v.current_mileage < s.mileage
              ? { ...v, current_mileage: s.mileage }
              : v,
          ),
        );
        setDrivers((prev) =>
          prev.map((d) =>
            d.vehicle_id === s.vehicle_id && d.current_mileage < s.mileage
              ? { ...d, current_mileage: s.mileage }
              : d,
          ),
        );
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");

      const { error } = await supabase.from("service_records").insert({
        user_id: userId,
        vehicle_id: s.vehicle_id || null,
        reg: s.registration,
        service_type: s.service_type,
        service_date: s.service_date,
        mileage: s.mileage,
        cost: s.cost,
        garage: s.garage,
        notes: s.description,
      });
      if (error) throw new Error(error.message);
      // bump vehicle mileage
      if (s.vehicle_id && s.mileage > 0) {
        await supabase
          .from("vehicles")
          .update({ current_mileage: s.mileage })
          .eq("id", s.vehicle_id)
          .lt("current_mileage", s.mileage);
        await supabase
          .from("driver_tracks")
          .update({ current_mileage: s.mileage })
          .eq("vehicle_id", s.vehicle_id)
          .lt("current_mileage", s.mileage);
      }
      await refresh();
    },
    [refresh],
  );

  const deleteService = useCallback(
    async (id: string) => {
      setServices((prev) => prev.filter((s) => s.id !== id));
      await supabase.from("service_records").delete().eq("id", id);
      await refresh();
    },
    [refresh],
  );

  const addDriver = useCallback(
    async (d: Omit<DriverTrack, "id" | "monthly_logs">) => {
      const newDriver: DriverTrack = {
        ...d,
        id: crypto.randomUUID(),
        charges: d.charges || [],
        monthly_logs: [],
      };
      setDrivers((prev) => [newDriver, ...prev]);
      if (d.vehicle_id) {
        setVehicles((prev) =>
          prev.map((v) => (v.id === d.vehicle_id ? { ...v, status: "Rented" } : v)),
        );
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");
      const driverPayload = {
        user_id: userId,
        vehicle_id: d.vehicle_id || null,
        reg: d.registration,
        driver_name: d.driver_name,
        email: d.email?.trim() || null,
        phone: d.phone?.trim() || null,
        start_date: d.start_date,
        start_mileage: d.start_mileage,
        current_mileage: d.start_mileage,
        contract_length_weeks: d.contract_length_weeks ?? 6,
        deposit_total: d.deposit_total ?? 0,
        allowance: d.allowance,
        rate_pence: d.excess_rate,
        weekly_rent: d.weekly_rent ?? 0,
        rent_due_day: d.rent_due_day ?? "Monday",
        rent_status: d.rent_status ?? "unpaid",
        balance_due: d.balance_due ?? (d.weekly_rent ?? 0),
      };
      let { error } = await (supabase.from("driver_tracks") as any).insert(driverPayload);
      if (error && /email|phone|column|contract_length_weeks|deposit_total/i.test(error.message)) {
        const { contract_length_weeks: _c, deposit_total: _d, email: _email, phone: _phone, ...legacyPayload } = driverPayload;
        ({ error } = await (supabase.from("driver_tracks") as any).insert(legacyPayload));
      }
      if (error) throw new Error(error.message);
      if (d.vehicle_id) {
        const { error: vehicleError } = await supabase
          .from("vehicles")
          .update({ status: "rented" })
          .eq("id", d.vehicle_id);
        if (vehicleError) throw new Error(vehicleError.message);
      }
      await logAuditEvent({
        actionType: "driver_created",
        targetTable: "driver_tracks",
        targetId: null,
        details: {
          driver_name: d.driver_name,
          reg: d.registration,
          phone: d.phone,
          email: d.email,
          weekly_rent: d.weekly_rent,
          rent_due_day: d.rent_due_day,
          rent_status: d.rent_status,
        },
      });
      await refresh();
    },
    [refresh],
  );

  const updateDriverMileage = useCallback(
    async (d: DriverTrack, newMi: number) => {
      setDrivers((prev) =>
        prev.map((item) => (item.id === d.id ? { ...item, current_mileage: newMi } : item)),
      );
      if (d.vehicle_id) {
        setVehicles((prev) =>
          prev.map((v) =>
            v.id === d.vehicle_id && v.current_mileage < newMi ? { ...v, current_mileage: newMi } : v,
          ),
        );
      }
      await supabase.from("driver_tracks").update({ current_mileage: newMi }).eq("id", d.id);
      if (d.vehicle_id) {
        await supabase
          .from("vehicles")
          .update({ current_mileage: newMi })
          .eq("id", d.vehicle_id)
          .lt("current_mileage", newMi);
      }
      await refresh();
    },
    [refresh],
  );

  const approveMileageSubmission = useCallback(
    async (submissionId: string, confirmedMileage: number) => {
      const sub = mileageSubmissions.find((s) => s.id === submissionId);

      const targetDriver = drivers.find(
        (d) =>
          (sub?.driver_id && d.id === sub.driver_id) ||
          (sub?.registration &&
            d.registration.replace(/\s+/g, "").toUpperCase() ===
              sub.registration.replace(/\s+/g, "").toUpperCase()),
      );

      setMileageSubmissions((prev) =>
        prev.map((s) =>
          s.id === submissionId
            ? {
                ...s,
                status: "approved",
                approved_mileage: confirmedMileage,
                approved_at: new Date().toISOString(),
              }
            : s,
        ),
      );

      if (targetDriver) {
        setDrivers((prev) =>
          prev.map((d) => (d.id === targetDriver.id ? { ...d, current_mileage: confirmedMileage } : d)),
        );
        if (targetDriver.vehicle_id) {
          setVehicles((prev) =>
            prev.map((v) =>
              v.id === targetDriver.vehicle_id ? { ...v, current_mileage: confirmedMileage } : v,
            ),
          );
        }
      }

      await supabase
        .from("mileage_submissions")
        .update({
          status: "approved",
          approved_mileage: confirmedMileage,
          approved_at: new Date().toISOString(),
        })
        .eq("id", submissionId);

      if (targetDriver) {
        await supabase
          .from("driver_tracks")
          .update({ current_mileage: confirmedMileage })
          .eq("id", targetDriver.id);

        if (targetDriver.vehicle_id) {
          await supabase
            .from("vehicles")
            .update({ current_mileage: confirmedMileage })
            .eq("id", targetDriver.vehicle_id);
        }
      }

      await logAuditEvent({
        actionType: "mileage_submission_approved",
        targetTable: "mileage_submissions",
        targetId: submissionId,
        details: {
          driver_name: sub?.driver_name ?? targetDriver?.driver_name ?? "Driver",
          reg: sub?.registration ?? targetDriver?.registration ?? null,
          approved_mileage: confirmedMileage,
          previous_mileage: targetDriver?.current_mileage ?? null,
        },
      });

      await refresh();
    },
    [mileageSubmissions, drivers, refresh],
  );

  const rejectMileageSubmission = useCallback(
    async (submissionId: string, reason?: string) => {
      const sub = mileageSubmissions.find((s) => s.id === submissionId);
      setMileageSubmissions((prev) =>
        prev.map((s) =>
          s.id === submissionId
            ? {
                ...s,
                status: "rejected",
                rejected_at: new Date().toISOString(),
                rejection_reason: reason || "Rejected by staff",
              }
            : s,
        ),
      );

      await supabase
        .from("mileage_submissions")
        .update({
          status: "rejected",
          rejected_at: new Date().toISOString(),
          rejection_reason: reason || "Rejected by staff",
        })
        .eq("id", submissionId);

      await logAuditEvent({
        actionType: "mileage_submission_rejected",
        targetTable: "mileage_submissions",
        targetId: submissionId,
        details: {
          driver_name: sub?.driver_name ?? "Driver",
          reg: sub?.registration ?? null,
          rejection_reason: reason || "Rejected by staff",
        },
      });

      await refresh();
    },
    [mileageSubmissions, refresh],
  );

  const addMileageSubmission = useCallback(
    async (sub: {
      driver_id?: string | null;
      driver_name: string;
      registration: string;
      photo_url: string;
      ocr_mileage?: number | null;
      ocr_confidence?: "high" | "low" | "none" | null;
      notes?: string | null;
    }) => {
      const newSub: MileageSubmission = {
        id: crypto.randomUUID(),
        driver_id: sub.driver_id ?? null,
        driver_name: sub.driver_name,
        registration: sub.registration,
        photo_url: sub.photo_url,
        ocr_mileage: sub.ocr_mileage ?? null,
        ocr_confidence: sub.ocr_confidence ?? "low",
        status: "pending",
        submitted_at: new Date().toISOString(),
        notes: sub.notes ?? null,
      };

      setMileageSubmissions((prev) => [newSub, ...prev]);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id || null;

      await supabase.from("mileage_submissions").insert({
        ...(userId ? { user_id: userId } : {}),
        driver_id: sub.driver_id || null,
        driver_name: sub.driver_name,
        registration: sub.registration,
        photo_url: sub.photo_url,
        ocr_mileage: sub.ocr_mileage || null,
        ocr_confidence: sub.ocr_confidence || "low",
        status: "pending",
        notes: sub.notes || null,
      } as any);

      await refresh();
      return newSub;
    },
    [refresh],
  );

  const closeMonth = useCallback(
    async (d: DriverTrack, endMi: number) => {
      const today = new Date().toISOString().slice(0, 10);
      const driven = Math.max(0, endMi - d.start_mileage);
      const over = Math.max(0, driven - d.allowance);
      const charge = (over * d.excess_rate) / 100;

      const newLog: MonthlyLog = {
        month: new Date(today).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        start_mileage: d.start_mileage,
        end_mileage: endMi,
        miles_driven: driven,
        overage: over,
        excess_charge: charge,
        date: today,
      };

      setDrivers((prev) =>
        prev.map((item) =>
          item.id === d.id
            ? {
                ...item,
                start_mileage: endMi,
                current_mileage: endMi,
                start_date: today,
                monthly_logs: [newLog, ...(item.monthly_logs || [])],
              }
            : item,
        ),
      );

      if (d.vehicle_id) {
        setVehicles((prev) =>
          prev.map((v) => (v.id === d.vehicle_id ? { ...v, current_mileage: endMi } : v)),
        );
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");

      await supabase.from("mileage_logs").insert({
        user_id: userId,
        track_id: d.id,
        reg: d.registration,
        driver_name: d.driver_name,
        period_start: d.start_date,
        period_end: today,
        start_mileage: d.start_mileage,
        end_mileage: endMi,
        allowance: d.allowance,
        rate_pence: d.excess_rate,
        excess_charge: charge,
      });
      await supabase
        .from("driver_tracks")
        .update({
          start_mileage: endMi,
          current_mileage: endMi,
          start_date: today,
        })
        .eq("id", d.id);
      if (d.vehicle_id) {
        await supabase.from("vehicles").update({ current_mileage: endMi }).eq("id", d.vehicle_id);
      }
      await refresh();
    },
    [refresh],
  );

  const editDriver = useCallback(
    async (d: DriverTrack) => {
      setDrivers((prev) =>
        prev.map((item) =>
          item.id === d.id
            ? {
                ...item,
                driver_name: d.driver_name,
                email: d.email,
                phone: d.phone,
                vehicle_id: d.vehicle_id,
                registration: d.registration,
                start_date: d.start_date,
                contract_length_weeks: d.contract_length_weeks ?? 6,
                deposit_total: d.deposit_total ?? 0,
                allowance: d.allowance,
                excess_rate: d.excess_rate,
                weekly_rent: d.weekly_rent,
                rent_due_day: d.rent_due_day,
                rent_status: d.rent_status,
                balance_due: d.balance_due,
              }
            : item,
        ),
      );

      const payload: any = {
        driver_name: d.driver_name,
        email: d.email?.trim() || null,
        phone: d.phone?.trim() || null,
        vehicle_id: d.vehicle_id || null,
        reg: d.registration,
        start_date: d.start_date,
        contract_length_weeks: d.contract_length_weeks ?? 6,
        deposit_total: d.deposit_total ?? 0,
        allowance: d.allowance,
        rate_pence: d.excess_rate,
        weekly_rent: d.weekly_rent,
        rent_due_day: d.rent_due_day,
        rent_status: d.rent_status,
        balance_due: d.balance_due,
      };
      let { error } = await supabase.from("driver_tracks").update(payload).eq("id", d.id);
      if (error && /email|phone|column|contract_length_weeks|deposit_total/i.test(error.message)) {
        const { contract_length_weeks: _c, deposit_total: _d, email: _email, phone: _phone, ...legacyPayload } = payload;
        ({ error } = await supabase.from("driver_tracks").update(legacyPayload).eq("id", d.id));
      }
      if (error) throw new Error(error.message);

      const existing = drivers.find((item) => item.id === d.id);
      await logAuditEvent({
        actionType: "driver_edited",
        targetTable: "driver_tracks",
        targetId: d.id,
        details: {
          driver_name: d.driver_name,
          reg: d.registration,
          phone: d.phone,
          email: d.email,
          weekly_rent: d.weekly_rent,
          rent_due_day: d.rent_due_day,
          rent_status: d.rent_status,
          balance_due: d.balance_due,
          previous_name: existing?.driver_name,
        },
      });

      await refresh();
    },
    [drivers, refresh],
  );

  const addDepositPayment = useCallback(
    async (driverId: string, amount: number, note?: string, paidAt?: string) => {
      const paidDate = paidAt || new Date().toISOString();
      const newPayment: DepositPayment = {
        id: crypto.randomUUID(),
        driver_id: driverId,
        amount,
        paid_at: paidDate,
        note: note || null,
        created_at: new Date().toISOString(),
      };

      setDrivers((prev) =>
        prev.map((item) => {
          if (item.id === driverId) {
            return {
              ...item,
              deposit_payments: [newPayment, ...(item.deposit_payments || [])],
            };
          }
          return item;
        }),
      );

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id || null;

      let { error } = await supabase.from("deposit_payments").insert({
        driver_id: driverId,
        amount,
        note: note || null,
        paid_at: paidDate,
        ...(userId ? { user_id: userId } : {}),
      } as any);

      if (error && /user_id/i.test(error.message)) {
        ({ error } = await supabase.from("deposit_payments").insert({
          driver_id: driverId,
          amount,
          note: note || null,
          paid_at: paidDate,
        } as any));
      }

      const target = drivers.find((item) => item.id === driverId);
      await logAuditEvent({
        actionType: "deposit_payment_added",
        targetTable: "deposit_payments",
        targetId: driverId,
        details: {
          driver_id: driverId,
          driver_name: target?.driver_name ?? "Driver",
          reg: target?.registration ?? null,
          amount,
          note,
        },
      });

      await refresh();
    },
    [drivers, refresh],
  );

  const toggleDepositPaidStatus = useCallback(
    async (driverId: string, isPaid: boolean, depositTotal: number) => {
      const targetDriver = drivers.find((item) => item.id === driverId);
      if (!targetDriver) return;

      if (isPaid) {
        const paidSoFar = (targetDriver.deposit_payments || []).reduce(
          (sum, p) => sum + Number(p.amount || 0),
          0,
        );
        const outstanding = Math.max(0, depositTotal - paidSoFar);

        if (outstanding > 0) {
          await addDepositPayment(driverId, outstanding, "Deposit marked fully paid");
        }
      } else {
        setDrivers((prev) =>
          prev.map((item) =>
            item.id === driverId ? { ...item, deposit_payments: [] } : item,
          ),
        );

        await supabase.from("deposit_payments").delete().eq("driver_id", driverId);

        await logAuditEvent({
          actionType: "deposit_payment_cleared",
          targetTable: "deposit_payments",
          targetId: driverId,
          details: {
            driver_id: driverId,
            driver_name: targetDriver.driver_name,
            reg: targetDriver.registration,
            action: "Toggled deposit back to unpaid",
          },
        });

        await refresh();
      }
    },
    [drivers, addDepositPayment, refresh],
  );

  const toggleRentStatus = useCallback(
    async (driverId: string, currentStatus: "paid" | "unpaid", weeklyRent: number, currentBalance: number) => {
      const newStatus = currentStatus === "paid" ? "unpaid" : "paid";
      let newBalance = currentBalance;
      if (newStatus === "paid") {
        newBalance = 0;
      } else {
        newBalance = currentBalance === 0 ? weeklyRent : currentBalance + weeklyRent;
      }

      setDrivers((prev) =>
        prev.map((item) =>
          item.id === driverId
            ? { ...item, rent_status: newStatus, balance_due: newBalance }
            : item,
        ),
      );

      const { error } = await supabase
        .from("driver_tracks")
        .update({
          rent_status: newStatus,
          balance_due: newBalance,
        })
        .eq("id", driverId);

      if (error) throw new Error(error.message);

      const target = drivers.find((item) => item.id === driverId);
      await logAuditEvent({
        actionType: "rent_updated",
        targetTable: "driver_tracks",
        targetId: driverId,
        details: {
          driver_name: target?.driver_name ?? "Driver",
          reg: target?.registration ?? null,
          previous_status: currentStatus,
          new_status: newStatus,
          weekly_rent: weeklyRent,
          new_balance_due: newBalance,
        },
      });

      await refresh();
    },
    [drivers, refresh],
  );

  const addDriverCharge = useCallback(
    async (driverId: string, amount: number, description: string) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id || null;

      const newCharge: DriverCharge = {
        id: crypto.randomUUID(),
        driver_id: driverId,
        amount,
        description,
        created_at: new Date().toISOString(),
      };

      let newBal = amount;
      setDrivers((prev) =>
        prev.map((item) => {
          if (item.id === driverId) {
            newBal = Number(item.balance_due || 0) + amount;
            return {
              ...item,
              balance_due: newBal,
              charges: [newCharge, ...(item.charges || [])],
            };
          }
          return item;
        }),
      );

      let { error: chargeErr } = await supabase.from("driver_charges").insert({
        driver_id: driverId,
        amount,
        description,
        ...(userId ? { user_id: userId } : {}),
      } as any);

      if (chargeErr && /user_id/i.test(chargeErr.message)) {
        ({ error: chargeErr } = await supabase.from("driver_charges").insert({
          driver_id: driverId,
          amount,
          description,
        } as any));
      }

      if (chargeErr) throw new Error(chargeErr.message);

      const { error: trackErr } = await supabase
        .from("driver_tracks")
        .update({ balance_due: newBal })
        .eq("id", driverId);

      if (trackErr) throw new Error(trackErr.message);

      const target = drivers.find((item) => item.id === driverId);
      await logAuditEvent({
        actionType: "charge_added",
        targetTable: "driver_charges",
        targetId: driverId,
        details: {
          driver_id: driverId,
          driver_name: target?.driver_name ?? "Driver",
          reg: target?.registration ?? null,
          amount,
          description,
        },
      });

      await refresh();
    },
    [drivers, refresh],
  );

  const sendDriverReminder = useCallback(
    async (driver: DriverTrack, reminderType: string, customMessage?: string) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id || null;

      const titleMap: Record<string, string> = {
        mot: "MOT Renewal Reminder",
        service: "Vehicle Service Reminder",
        pco: "PCO License Expiry Reminder",
      };

      const title = titleMap[reminderType.toLowerCase()] ?? `${reminderType} Reminder`;
      const defaultMessage = `Hello ${driver.driver_name}, this is a reminder regarding your vehicle ${driver.registration} for ${title}. Please check your portal for details or contact us if you have any questions.`;
      const message = customMessage || defaultMessage;

      // 1. Create notification entry for driver portal
      const { error: notifErr } = await supabase.from("driver_notifications").insert({
        user_id: userId,
        driver_id: driver.id,
        type: reminderType.toLowerCase(),
        title,
        message,
      });

      if (notifErr) console.warn("Could not save driver notification:", notifErr.message);

      // 2. Email driver if email exists
      if (driver.email && driver.email.trim()) {
        const resendKey = (import.meta as any).env?.VITE_RESEND_API_KEY || (process as any).env?.RESEND_API_KEY;
        if (resendKey) {
          try {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendKey}`,
              },
              body: JSON.stringify({
                from: "Virtual Car Hire <onboarding@resend.dev>",
                to: [driver.email.trim()],
                subject: `Virtual Car Hire: ${title}`,
                html: `<div style="font-family:sans-serif;padding:20px;background:#0d1117;color:#fff;border-radius:10px;">
                  <h2 style="color:#ff6a00;">${title}</h2>
                  <p>Hello ${driver.driver_name},</p>
                  <p>${message}</p>
                  <br/>
                  <p style="color:#8b95a8;font-size:12px;">Virtual Car Hire Fleet Management</p>
                </div>`,
              }),
            });
          } catch (e) {
            console.warn("Failed sending reminder email via Resend:", e);
          }
        }
      }

      await refresh();
    },
    [refresh],
  );

  const generatePortalInvite = useCallback(
    async (driverId: string) => {
      const newToken = crypto.randomUUID();
      const { error } = await supabase
        .from("driver_tracks")
        .update({
          invite_token: newToken,
          invite_status: "pending",
        })
        .eq("id", driverId);

      if (error) throw new Error(error.message);

      const target = drivers.find((item) => item.id === driverId);
      await logAuditEvent({
        actionType: "invite_sent",
        targetTable: "driver_tracks",
        targetId: driverId,
        details: {
          driver_id: driverId,
          driver_name: target?.driver_name ?? "Driver",
          reg: target?.registration ?? null,
          invite_status: "pending",
        },
      });

      await refresh();
      return newToken;
    },
    [drivers, refresh],
  );

  const deleteDriver = useCallback(
    async (id: string) => {
      const target = drivers.find((item) => item.id === id);
      setDrivers((prev) => prev.filter((d) => d.id !== id));
      const { data: track } = await supabase
        .from("driver_tracks")
        .select("vehicle_id")
        .eq("id", id)
        .maybeSingle();
      const { error } = await supabase.from("driver_tracks").delete().eq("id", id);
      if (error) {
        await supabase.from("driver_tracks").update({ active: false }).eq("id", id);
      }
      if (track?.vehicle_id) {
        await supabase
          .from("vehicles")
          .update({ status: "available" })
          .eq("id", track.vehicle_id)
          .eq("status", "rented");
      }

      await logAuditEvent({
        actionType: "driver_deleted",
        targetTable: "driver_tracks",
        targetId: id,
        details: {
          driver_name: target?.driver_name ?? null,
          reg: target?.registration ?? null,
        },
      });

      await refresh();
    },
    [drivers, refresh],
  );

  const removeDriver = deleteDriver;

  return {
    vehicles,
    services,
    drivers,
    mileageSubmissions,
    loading,
    saveVehicle,
    deleteVehicle,
    addService,
    deleteService,
    addDriver,
    editDriver,
    addDepositPayment,
    toggleDepositPaidStatus,
    toggleRentStatus,
    addDriverCharge,
    sendDriverReminder,
    generatePortalInvite,
    deleteDriver,
    updateDriverMileage,
    approveMileageSubmission,
    rejectMileageSubmission,
    addMileageSubmission,
    closeMonth,
    removeDriver,
    refresh,
  };
}
