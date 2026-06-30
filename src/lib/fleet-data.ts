import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Vehicle = {
  id: string;
  registration: string;
  make: string;
  model: string;
  year: number;
  fuel_type: "Petrol" | "Diesel" | "Hybrid" | "Electric";
  current_mileage: number;
  status: "Active" | "In Service" | "Off Road";
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

export type DriverTrack = {
  id: string;
  driver_name: string;
  vehicle_id: string;
  registration: string;
  start_mileage: number;
  current_mileage: number;
  allowance: number;
  excess_rate: number;
  start_date: string;
  monthly_logs: MonthlyLog[];
};

const statusToDb = (s: Vehicle["status"]): string =>
  s === "Active" ? "available" : s === "In Service" ? "in_service" : "off_road";
const statusFromDb = (s: string): Vehicle["status"] =>
  s === "in_service" ? "In Service" : s === "off_road" ? "Off Road" : "Active";

const vFromRow = (r: any): Vehicle => ({
  id: r.id,
  registration: r.reg,
  make: r.make,
  model: r.model,
  year: r.year ?? new Date().getFullYear(),
  fuel_type: (r.fuel_type ?? "Diesel") as Vehicle["fuel_type"],
  current_mileage: r.current_mileage ?? 0,
  status: statusFromDb(r.status ?? "available"),
  next_service_date: r.next_service_date ?? "",
  next_mot_date: r.next_mot_date ?? "",
  insurance_expiry: r.pco_expiry_date ?? "",
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

const dFromRow = (r: any, logs: MonthlyLog[]): DriverTrack => ({
  id: r.id,
  driver_name: r.driver_name,
  vehicle_id: r.vehicle_id ?? "",
  registration: r.reg,
  start_mileage: r.start_mileage,
  current_mileage: r.current_mileage,
  allowance: r.allowance,
  excess_rate: r.rate_pence,
  start_date: r.start_date,
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
    const [vRes, sRes, dRes, lRes] = await Promise.all([
      supabase.from("vehicles").select("*").order("reg"),
      supabase.from("service_records").select("*").order("service_date", { ascending: false }),
      supabase.from("driver_tracks").select("*").eq("active", true).order("created_at", { ascending: false }),
      supabase.from("mileage_logs").select("*").order("period_end", { ascending: false }),
    ]);
    setVehicles((vRes.data ?? []).map(vFromRow));
    setServices((sRes.data ?? []).map(sFromRow));
    const logsByTrack = new Map<string, MonthlyLog[]>();
    for (const l of lRes.data ?? []) {
      const arr = logsByTrack.get(l.track_id) ?? [];
      arr.push(lFromRow(l));
      logsByTrack.set(l.track_id, arr);
    }
    setDrivers((dRes.data ?? []).map((r) => dFromRow(r, logsByTrack.get(r.id) ?? [])));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveVehicle = useCallback(async (v: Vehicle, isNew: boolean) => {
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
    await supabase.from("driver_tracks").update({ current_mileage: v.current_mileage }).eq("vehicle_id", v.id).lt("current_mileage", v.current_mileage);
    await refresh();
  }, [refresh]);

  const deleteVehicle = useCallback(async (id: string) => {
    await supabase.from("vehicles").delete().eq("id", id);
    await refresh();
  }, [refresh]);

  const addService = useCallback(async (s: Omit<ServiceRecord, "id">) => {
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
      await supabase.from("vehicles").update({ current_mileage: s.mileage }).eq("id", s.vehicle_id).lt("current_mileage", s.mileage);
      await supabase.from("driver_tracks").update({ current_mileage: s.mileage }).eq("vehicle_id", s.vehicle_id).lt("current_mileage", s.mileage);
    }
    await refresh();
  }, [refresh]);

  const deleteService = useCallback(async (id: string) => {
    await supabase.from("service_records").delete().eq("id", id);
    await refresh();
  }, [refresh]);

  const addDriver = useCallback(async (d: Omit<DriverTrack, "id" | "monthly_logs">) => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("Not signed in");
    const { error } = await supabase.from("driver_tracks").insert({
      user_id: userId,
      vehicle_id: d.vehicle_id || null,
      reg: d.registration,
      driver_name: d.driver_name,
      start_date: d.start_date,
      start_mileage: d.start_mileage,
      current_mileage: d.start_mileage,
      allowance: d.allowance,
      rate_pence: d.excess_rate,
    });
    if (error) throw new Error(error.message);
    await refresh();
  }, [refresh]);

  const updateDriverMileage = useCallback(async (d: DriverTrack, newMi: number) => {
    await supabase.from("driver_tracks").update({ current_mileage: newMi }).eq("id", d.id);
    if (d.vehicle_id) {
      await supabase.from("vehicles").update({ current_mileage: newMi }).eq("id", d.vehicle_id).lt("current_mileage", newMi);
    }
    await refresh();
  }, [refresh]);

  const closeMonth = useCallback(async (d: DriverTrack, endMi: number) => {
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
    await supabase.from("driver_tracks").update({
      start_mileage: endMi,
      current_mileage: endMi,
      start_date: new Date().toISOString().slice(0, 10),
    }).eq("id", d.id);
    if (d.vehicle_id) {
      await supabase.from("vehicles").update({ current_mileage: endMi }).eq("id", d.vehicle_id);
    }
    await refresh();
  }, [refresh]);

  const removeDriver = useCallback(async (id: string) => {
    await supabase.from("driver_tracks").update({ active: false }).eq("id", id);
    await refresh();
  }, [refresh]);

  return {
    vehicles, services, drivers, loading,
    saveVehicle, deleteVehicle,
    addService, deleteService,
    addDriver, updateDriverMileage, closeMonth, removeDriver,
    refresh,
  };
}
