import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getNextMotDate, getPcoExpiryDate } from "@/lib/vehicle-date-fields";
import { PDF_FLEET } from "@/lib/pdf-fleet";

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

const dFromRow = (r: any, logs: MonthlyLog[], charges: DriverCharge[] = []): DriverTrack => ({
  id: r.id,
  driver_name: r.driver_name,
  email: r.email ?? "",
  phone: r.phone ?? "",
  vehicle_id: r.vehicle_id ?? "",
  registration: r.reg,
  start_mileage: r.start_mileage,
  current_mileage: r.current_mileage,
  allowance: r.allowance,
  excess_rate: r.rate_pence,
  start_date: r.start_date,
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
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [vRes, sRes, dRes, lRes, cRes] = await Promise.all([
      supabase.from("vehicles").select("*").order("reg"),
      supabase.from("service_records").select("*").order("service_date", { ascending: false }),
      supabase
        .from("driver_tracks")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false }),
      supabase.from("mileage_logs").select("*").order("period_end", { ascending: false }),
      supabase.from("driver_charges").select("*").order("created_at", { ascending: false }),
    ]);
    setVehicles((vRes.data ?? []).map(vFromRow));
    setServices((sRes.data ?? []).map(sFromRow));
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
    }

    setDrivers((dRes.data ?? []).map((r) => dFromRow(r, logsByTrack.get(r.id) ?? [], chargesByDriver.get(r.id) ?? [])));
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
      } else {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", v.id);
        if (error) throw new Error(error.message);
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
      await supabase.from("vehicles").delete().eq("id", id);
      await refresh();
    },
    [refresh],
  );

  const addService = useCallback(
    async (s: Omit<ServiceRecord, "id">) => {
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
      await supabase.from("service_records").delete().eq("id", id);
      await refresh();
    },
    [refresh],
  );

  const addDriver = useCallback(
    async (d: Omit<DriverTrack, "id" | "monthly_logs">) => {
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
        allowance: d.allowance,
        rate_pence: d.excess_rate,
        weekly_rent: d.weekly_rent ?? 0,
        rent_due_day: d.rent_due_day ?? "Monday",
        rent_status: d.rent_status ?? "unpaid",
        balance_due: d.balance_due ?? (d.weekly_rent ?? 0),
      };
      let { error } = await (supabase.from("driver_tracks") as any).insert(driverPayload);
      if (error && /email|phone|column/i.test(error.message)) {
        const { email: _email, phone: _phone, ...legacyPayload } = driverPayload;
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
      await refresh();
    },
    [refresh],
  );

  const updateDriverMileage = useCallback(
    async (d: DriverTrack, newMi: number) => {
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

  const closeMonth = useCallback(
    async (d: DriverTrack, endMi: number) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");

      const driven = Math.max(0, endMi - d.start_mileage);
      const over = Math.max(0, driven - d.allowance);
      const charge = (over * d.excess_rate) / 100;

      await supabase.from("mileage_logs").insert({
        user_id: userId,
        track_id: d.id,
        reg: d.registration,
        driver_name: d.driver_name,
        period_start: d.start_date,
        period_end: new Date().toISOString().slice(0, 10),
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
          start_date: new Date().toISOString().slice(0, 10),
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
        allowance: d.allowance,
        rate_pence: d.excess_rate,
        weekly_rent: d.weekly_rent,
        rent_due_day: d.rent_due_day,
        rent_status: d.rent_status,
        balance_due: d.balance_due,
      };
      let { error } = await supabase.from("driver_tracks").update(payload).eq("id", d.id);
      if (error && /email|phone|column/i.test(error.message)) {
        const { email: _email, phone: _phone, ...legacyPayload } = payload;
        ({ error } = await supabase.from("driver_tracks").update(legacyPayload).eq("id", d.id));
      }
      if (error) throw new Error(error.message);
      await refresh();
    },
    [refresh],
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
      await refresh();
    },
    [refresh],
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

      setDrivers((prev) =>
        prev.map((item) =>
          item.id === driverId
            ? {
                ...item,
                balance_due: Number(item.balance_due || 0) + amount,
                charges: [newCharge, ...(item.charges || [])],
              }
            : item,
        ),
      );

      const { data: driverTrack } = await supabase
        .from("driver_tracks")
        .select("balance_due")
        .eq("id", driverId)
        .single();

      const currentBal = Number(driverTrack?.balance_due ?? 0);
      const newBal = currentBal + amount;

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

      await refresh();
    },
    [refresh],
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
      await refresh();
      return newToken;
    },
    [refresh],
  );

  const deleteDriver = useCallback(
    async (id: string) => {
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
      await refresh();
    },
    [refresh],
  );

  const removeDriver = deleteDriver;

  return {
    vehicles,
    services,
    drivers,
    loading,
    saveVehicle,
    deleteVehicle,
    addService,
    deleteService,
    addDriver,
    editDriver,
    toggleRentStatus,
    addDriverCharge,
    sendDriverReminder,
    generatePortalInvite,
    deleteDriver,
    updateDriverMileage,
    closeMonth,
    removeDriver,
    refresh,
  };
}
