import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Virtual Car Hire — Fleet Tracker" },
      { name: "description", content: "VCH Fleet Tracker: vehicles, services, driver mileage." },
    ],
  }),
  component: FleetApp,
});

/* ---------------- Seed data ---------------- */
const ALL_VEHICLES_SEED: { reg: string; make: string; model: string; year: number }[] = [
  {reg:'AF70MYK',make:'TESLA',model:'MODEL 3 LONG RANGE AWD',year:2020},
  {reg:'BD20XPU',make:'MERCEDES-BENZ',model:'E 300 AMG LINE PREMIUM DE AUTO',year:2020},
  {reg:'BJ20L6X',make:'TESLA',model:'MODEL 3 LONG RANGE AWD',year:2020},
  {reg:'BK70WYM',make:'TESLA',model:'MODEL 3 LONG RANGE AWD',year:2020},
  {reg:'BL19JDZ',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2019},
  {reg:'BN17CVA',make:'MERCEDES-BENZ',model:'VITO 119 B-TEC TOURER SELECT A',year:2017},
  {reg:'BN20MXL',make:'JAGUAR',model:'I-PACE EV400 S',year:2020},
  {reg:'BN60MYZ',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2018},
  {reg:'BN60NHP',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2018},
  {reg:'BT69TEJ',make:'TESLA',model:'MODEL 3 LONG RANGE AWD',year:2019},
  {reg:'RE21NRX',make:'MG',model:'MG 5 EXCITE EV',year:2021},
  {reg:'BU19ACJ',make:'MERCEDES-BENZ',model:'E 220 D AMG LINE AUTO',year:2019},
  {reg:'BV18WNA',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2018},
  {reg:'BX19ZMY',make:'MERCEDES-BENZ',model:'E 220 D AMG LINE AUTO',year:2019},
  {reg:'CA19UTF',make:'MERCEDES-BENZ',model:'E 220 D AMG LINE AUTO',year:2019},
  {reg:'EF70ZPZ',make:'HYUNDAI',model:'IONIQ PREMIUM PHEV S-A',year:2021},
  {reg:'EF70ZVM',make:'HYUNDAI',model:'IONIQ PREMIUM SE PHEV S-A',year:2020},
  {reg:'EF70ZYD',make:'HYUNDAI',model:'IONIQ PREMIUM SE PHEV S-A',year:2020},
  {reg:'EK70AOO',make:'HYUNDAI',model:'IONIQ PREMIUM PHEV S-A',year:2020},
  {reg:'EN73UBZ',make:'MERCEDES-BENZ',model:'EQE 300 AMG LINE PREMIUM',year:2024},
  {reg:'FL70EUV',make:'HYUNDAI',model:'IONIQ PREMIUM SE PHEV S-A',year:2020},
  {reg:'FX19FXC',make:'MERCEDES-BENZ',model:'E 220 D AMG LINE AUTO',year:2019},
  {reg:'GU72DVP',make:'HYUNDAI',model:'IONIQ PREMIUM SE PHEV S-A',year:2022},
  {reg:'GX70UBD',make:'JAGUAR',model:'I-PACE EV400 S',year:2020},
  {reg:'GY69NVL',make:'MERCEDES-BENZ',model:'E 300 AMG LINE PREMIUM DE AUTO',year:2019},
  {reg:'HX19VXB',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2019},
  {reg:'HX19VZG',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2019},
  {reg:'KF19UCJ',make:'TOYOTA',model:'COROLLA ICON VVT-I HEV CVT',year:2019},
  {reg:'KF19UCN',make:'TOYOTA',model:'COROLLA ICON VVT-I HEV CVT',year:2019},
  {reg:'KN73XLA',make:'MERCEDES-BENZ',model:'EQE 300 AMG LINE PREMIUM',year:2023},
  {reg:'KN73XLB',make:'MERCEDES-BENZ',model:'EQE 300 AMG LINE PREMIUM',year:2023},
  {reg:'KO18HKE',make:'MERCEDES-BENZ',model:'VITO 114 BLUETEC TOURER PRO',year:2018},
  {reg:'KP69WOR',make:'MERCEDES-BENZ',model:'E 220 D SE PREMIUM AUTO',year:2019},
  {reg:'KR74WDL',make:'MERCEDES-BENZ',model:'EQE 350+ AMG LINE',year:2024},
  {reg:'AK69CKJ',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2019},
  {reg:'KT18ATF',make:'MERCEDES-BENZ',model:'VITO 114 BLUETEC TOURER PRO',year:2018},
  {reg:'KT68VYM',make:'MERCEDES-BENZ',model:'E 220 D AMG LINE PREM 4MATIC A',year:2018},
  {reg:'KU73MVW',make:'MERCEDES-BENZ',model:'E 300 AMG LINE PREMIUM',year:2023},
  {reg:'KL18TMV',make:'MERCEDES-BENZ',model:'VITO 114 BLUETEC TOURER PRO',year:2018},
  {reg:'LA69AXF',make:'TESLA',model:'MODEL 3 LONG RANGE AWD',year:2019},
  {reg:'LA69AYB',make:'TESLA',model:'MODEL 3 PERFORMANCE AWD',year:2019},
  {reg:'LB690FY',make:'TESLA',model:'MODEL 3 LONG RANGE AWD',year:2019},
  {reg:'LD20COJ',make:'TESLA',model:'MODEL 3 LONG RANGE AWD',year:2020},
  {reg:'LD20FCE',make:'TESLA',model:'MODEL 3 LONG RANGE AWD',year:2020},
  {reg:'LL68CRZ',make:'TOYOTA',model:'AURIS ICON TECH HEV VVT-I CVT',year:2019},
  {reg:'LL68CRV',make:'TOYOTA',model:'AURIS ICON TECH HEV VVT-I CVT',year:2019},
  {reg:'LL68KRZ',make:'TOYOTA',model:'AURIS ICON TECH HEV VVT-I CVT',year:2018},
  {reg:'LM68KRG',make:'TOYOTA',model:'AURIS ICON TECH HEV VVT-I CVT',year:2018},
  {reg:'LM68KRJ',make:'TOYOTA',model:'AURIS ICON TECH HEV VVT-I CVT',year:2018},
  {reg:'LM68KRO',make:'TOYOTA',model:'AURIS ICON TECH HEV VVT-I CVT',year:2018},
  {reg:'LM68KRU',make:'TOYOTA',model:'AURIS ICON TECH HEV VVT-I CVT',year:2018},
  {reg:'LR16VTY',make:'TOYOTA',model:'PRIUS ACTIVE VVT-I CVT',year:2016},
  {reg:'LR69UCG',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2019},
  {reg:'LT69GSU',make:'TOYOTA',model:'COROLLA ICON VVT-I HEV CVT',year:2019},
  {reg:'LT69GSSV',make:'TOYOTA',model:'COROLLA ICON VVT-I HEV CVT',year:2019},
  {reg:'LT69GSV',make:'TOYOTA',model:'COROLLA ICON VVT-I HEV CVT',year:2019},
  {reg:'LT69GSZ',make:'TOYOTA',model:'COROLLA ICON VVT-I HEV CVT',year:2019},
  {reg:'LT69GTU',make:'TOYOTA',model:'COROLLA ICON VVT-I HEV CVT',year:2019},
  {reg:'MD25AYY',make:'FORD',model:'TOURNEO CUSTOM 340 ZTEC PHEV A',year:2025},
  {reg:'MD25DCX',make:'FORD',model:'TOURNEO CUSTOM 340 ZTEC PHEV A',year:2025},
  {reg:'MJ69YPN',make:'TESLA',model:'MODEL 3 PERFORMANCE AWD',year:2019},
  {reg:'MV68OGF',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2018},
  {reg:'MV68OHB',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2018},
  {reg:'OU68SXP',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2018},
  {reg:'OW19XXN',make:'MERCEDES-BENZ',model:'E 220 D AMG LINE AUTO',year:2019},
  {reg:'PO18UTT',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2018},
  {reg:'RE21NRV',make:'MG',model:'MG 5 EXCITE EV',year:2021},
  {reg:'RE21NRZ',make:'MG',model:'MG 5 EXCITE EV',year:2021},
  {reg:'RE21NSF',make:'MG',model:'MG 5 EXCITE EV',year:2021},
  {reg:'RE21NSU',make:'MG',model:'MG 5 EXCITE EV',year:2021},
  {reg:'RX25CME',make:'FORD',model:'TOURNEO CUSTOM 340 TITANIUM PHEV A',year:2025},
  {reg:'SF19WPIW',make:'MERCEDES-BENZ',model:'VITO 114 BLUETEC TOURER PRO',year:2019},
  {reg:'ID195NN',make:'MERCEDES-BENZ',model:'E 220 D SE AUTO',year:2019},
  {reg:'WG74KFJ',make:'MERCEDES-BENZ',model:'EQE 300 SPORT EDITION',year:2025},
  {reg:'IH74E3F',make:'MERCEDES-BENZ',model:'EQE 300 SPORT EDITION',year:2024},
  {reg:'IHN20E3A',make:'TESLA',model:'MODEL 3 LONG RANGE AWD',year:2020},
  {reg:'IN20NKU',make:'MERCEDES-BENZ',model:'E 300 AMG LINE PREMIUM DE AUTO',year:2020},
  {reg:'WR16UED',make:'MERCEDES-BENZ',model:'VITO 114 BLUETEC TOURER SELECT',year:2016},
  {reg:'WR19UFG',make:'MERCEDES-BENZ',model:'VITO 114 BLUETEC TOURERS PRO',year:2019},
  {reg:'YC72HZM',make:'MG',model:'MG 5 EXCLUSIVE EV',year:2022},
  {reg:'YF22UVZ',make:'MG',model:'MG 5 EXCLUSIVE EV',year:2022},
  {reg:'YF22UWK',make:'MG',model:'MG 5 EXCLUSIVE EV',year:2022},
  {reg:'YF22UWM',make:'MG',model:'MG 5 EXCLUSIVE EV',year:2022},
  {reg:'YF22UWT',make:'MG',model:'MG 5 EXCLUSIVE EV',year:2022},
  {reg:'YF22UWA',make:'MG',model:'MG 5 EXCLUSIVE EV',year:2022},
  {reg:'YF22UXA',make:'MG',model:'MG 5 EXCLUSIVE EV',year:2022},
  {reg:'YF22UXC',make:'MG',model:'MG 5 EXCLUSIVE EV',year:2022},
  {reg:'YF22UXY',make:'MG',model:'MG 5 EXCLUSIVE EV',year:2022},
  {reg:'YH71JHL',make:'MG',model:'MG 5 EXCITE EV',year:2021},
];

/* ---------------- Types ---------------- */
type Vehicle = {
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

type ServiceRecord = {
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

type MonthlyLog = {
  month: string;
  start_mileage: number;
  end_mileage: number;
  miles_driven: number;
  overage: number;
  excess_charge: number;
  date: string;
};

type DriverTrack = {
  id: string;
  driver_name: string;
  vehicle_id: string;
  registration: string;
  start_mileage: number;
  current_mileage: number;
  allowance: number;
  excess_rate: number; // pence/mile
  start_date: string;
  monthly_logs: MonthlyLog[];
};

type Toast = { id: string; msg: string; type: "success" | "error" | "info" };

/* ---------------- Storage helpers ---------------- */
const LS_V = "vch10_v";
const LS_S = "vch10_s";
const LS_M = "vch10_m";

const uid = () => Math.random().toString(36).slice(2, 11);

function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveLS(key: string, val: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(val));
}

const SERVICE_TYPES = [
  "Full Service","Interim Service","MOT","Oil Change","Tyre Replacement","Brake Service",
  "Battery Check","Battery Replacement","Filter Replacement","Air Con Gas Replacement",
  "Diagnostic","Bodywork Repair","Electrical Repair","Coolant Flush","Transmission Service","Other",
];

/* ---------------- Icons ---------------- */
const Icon = {
  Wrench: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
  ),
  Gauge: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
  ),
  Calendar: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
  ),
  Disc: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
  ),
  Info: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
  ),
  Clock: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
  ),
  Car: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm18 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/><path d="M3 17v-5l2-5h14l2 5v5"/></svg>
  ),
  X: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M18 6 6 18M6 6l12 12"/></svg>
  ),
  Alert: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
  ),
};

function serviceStyle(type: string) {
  const t = type.toLowerCase();
  if (t.includes("full service") || t.includes("interim"))
    return { cls: "bg-blue-50 text-blue-700 border-blue-200", I: Icon.Wrench };
  if (t.includes("oil")) return { cls: "bg-orange-50 text-orange-700 border-orange-200", I: Icon.Gauge };
  if (t.includes("mot")) return { cls: "bg-green-50 text-green-700 border-green-200", I: Icon.Calendar };
  if (t.includes("tyre") || t.includes("brake"))
    return { cls: "bg-amber-50 text-amber-700 border-amber-200", I: Icon.Disc };
  return { cls: "bg-slate-100 text-slate-700 border-slate-200", I: Icon.Info };
}

/* ---------------- UK Plate ---------------- */
function UKPlate({ reg, size = "md" }: { reg: string; size?: "sm" | "md" | "lg" }) {
  const h = size === "sm" ? "h-7" : size === "lg" ? "h-11" : "h-9";
  const txt = size === "sm" ? "text-sm" : size === "lg" ? "text-2xl" : "text-lg";
  const padX = size === "sm" ? "px-2" : "px-3";
  return (
    <span className={`inline-flex ${h} items-stretch overflow-hidden rounded-lg border-2 border-black/70 shadow-sm`}>
      <span className="flex w-7 flex-col items-center justify-center bg-[#003399] text-white">
        <span className="text-[8px] leading-none">★</span>
        <span className="text-[10px] font-bold leading-none">UK</span>
      </span>
      <span className={`flex items-center justify-center bg-[#f5c518] font-mono font-bold tracking-[0.15em] text-black ${padX} ${txt}`}>
        {reg.toUpperCase()}
      </span>
    </span>
  );
}

/* ---------------- App ---------------- */
type View = "dashboard" | "vehicles" | "add" | "services" | "log-service" | "mileage";

function FleetApp() {
  if (typeof window === "undefined") return null;
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverTrack[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem("vch10_auth") !== "1") {
      navigate({ to: "/login" });
    } else {
      setAuthed(true);
    }
  }, [navigate]);


  /* hydrate */
  useEffect(() => {
    const v = loadLS<Vehicle[]>(LS_V, []);
    if (v.length === 0) {
      const seeded: Vehicle[] = ALL_VEHICLES_SEED.map((s) => ({
        id: uid(),
        registration: s.reg,
        make: s.make,
        model: s.model,
        year: s.year,
        fuel_type: "Hybrid",
        current_mileage: 0,
        status: "Active",
        next_service_date: "",
        next_mot_date: "",
        insurance_expiry: "",
        notes: "",
      }));
      setVehicles(seeded);
      saveLS(LS_V, seeded);
    } else setVehicles(v);
    setServices(loadLS<ServiceRecord[]>(LS_S, []));
    setDrivers(loadLS<DriverTrack[]>(LS_M, []));
    setHydrated(true);
  }, []);

  useEffect(() => { if (hydrated) saveLS(LS_V, vehicles); }, [vehicles, hydrated]);
  useEffect(() => { if (hydrated) saveLS(LS_S, services); }, [services, hydrated]);
  useEffect(() => { if (hydrated) saveLS(LS_M, drivers); }, [drivers, hydrated]);

  const toast = (msg: string, type: Toast["type"] = "success") => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 10000);
  };

  /* ----- Sync helpers ----- */
  const updateVehicleMileage = (vehicleId: string, newMileage: number) => {
    setDrivers((ds) =>
      ds.map((d) => (d.vehicle_id === vehicleId ? { ...d, current_mileage: newMileage } : d))
    );
  };

  const saveVehicle = (v: Vehicle) => {
    setVehicles((vs) => {
      const exists = vs.find((x) => x.id === v.id);
      if (exists) {
        if (exists.current_mileage !== v.current_mileage) updateVehicleMileage(v.id, v.current_mileage);
        return vs.map((x) => (x.id === v.id ? v : x));
      }
      return [...vs, v];
    });
  };

  const nav = (v: View) => setView(v);

  const signOut = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("vch10_auth");
      window.localStorage.removeItem("vch10_user");
    }
    navigate({ to: "/login" });
  };

  if (!authed) return null;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a]">
      <Sidebar view={view} setView={nav} onSignOut={signOut} />
      <div className="ml-64">
        <Topbar />
        <main className="p-6 md:p-8">
          {view === "dashboard" && (
            <Dashboard
              vehicles={vehicles}
              services={services}
              drivers={drivers}
              goto={nav}
            />
          )}
          {view === "vehicles" && (
            <VehiclesList
              vehicles={vehicles}
              onEdit={(v) => { setEditingVehicle(v); }}
              onDelete={(id) => { setVehicles((vs) => vs.filter((x) => x.id !== id)); toast("Vehicle removed", "info"); }}
              onAdd={() => nav("add")}
            />
          )}
          {view === "add" && (
            <AddVehicle
              vehicles={vehicles}
              onSave={(v) => { saveVehicle(v); toast(`Vehicle ${v.registration} added`); nav("vehicles"); }}
              onCancel={() => nav("vehicles")}
              toast={toast}
            />
          )}
          {view === "services" && (
            <ServicesList services={services} onAdd={() => nav("log-service")} onDelete={(id) => { setServices((s) => s.filter((x) => x.id !== id)); toast("Service record removed", "info"); }} />
          )}
          {view === "log-service" && (
            <LogService
              vehicles={vehicles}
              onSave={(rec) => {
                setServices((s) => [rec, ...s]);
                // update mileage on master if higher
                setVehicles((vs) => vs.map((v) => v.id === rec.vehicle_id && rec.mileage > v.current_mileage ? { ...v, current_mileage: rec.mileage } : v));
                if (rec.mileage > 0) updateVehicleMileage(rec.vehicle_id, Math.max(rec.mileage, vehicles.find(v=>v.id===rec.vehicle_id)?.current_mileage || 0));
                toast("Service record saved");
                nav("services");
              }}
              onCancel={() => nav("services")}
            />
          )}
          {view === "mileage" && (
            <MileageView
              vehicles={vehicles}
              drivers={drivers}
              setDrivers={setDrivers}
              setVehicles={setVehicles}
              toast={toast}
            />
          )}
        </main>
      </div>

      {editingVehicle && (
        <EditVehicleModal
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSave={(v) => { saveVehicle(v); setEditingVehicle(null); toast("Vehicle updated"); }}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`min-w-[260px] rounded-lg border px-4 py-3 shadow-lg animate-in fade-in slide-in-from-right ${
              t.type === "success" ? "border-green-200 bg-white text-green-800" :
              t.type === "error" ? "border-red-200 bg-white text-red-800" :
              "border-[#e2e8f0] bg-white text-[#0f172a]"
            }`}
          >
            <div className="flex items-start gap-2">
              <div className={`mt-0.5 h-2 w-2 rounded-full ${t.type === "success" ? "bg-green-500" : t.type === "error" ? "bg-red-500" : "bg-[#ff6a00]"}`} />
              <div className="flex-1 text-sm">{t.msg}</div>
              <button className="text-[#475569] hover:text-[#0f172a]" onClick={() => setToasts((tt) => tt.filter((x) => x.id !== t.id))}>
                <Icon.X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Sidebar / Topbar ---------------- */
const NavIcon = {
  Dashboard: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
  ),
  Car: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm18 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/><path d="M3 17v-5l2-5h14l2 5v5"/></svg>
  ),
  Wrench: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
  ),
  Gauge: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><circle cx="12" cy="12" r="10"/><path d="M12 14l4-4"/></svg>
  ),
  Plus: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M12 5v14M5 12h14"/></svg>
  ),
  SignOut: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
  ),
};

function Sidebar({ view, setView, onSignOut }: { view: View; setView: (v: View) => void; onSignOut: () => void }) {
  const items: { id: View; label: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
    { id: "dashboard", label: "Dashboard", Icon: NavIcon.Dashboard },
    { id: "vehicles", label: "Vehicles", Icon: NavIcon.Car },
    { id: "services", label: "Service History", Icon: NavIcon.Wrench },
    { id: "mileage", label: "Driver Mileage", Icon: NavIcon.Gauge },
    { id: "add", label: "Add Vehicle", Icon: NavIcon.Plus },
  ];
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-[#e2e8f0] bg-white">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1a1a1a] to-[#2d2d2d] text-[#ff6a00] shadow-sm">
          <NavIcon.Car className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold leading-tight text-[#0f172a]">Virtual Car Hire</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Fleet Tracker</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {items.map((it) => {
          const active = view === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setView(it.id)}
              className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                active
                  ? "bg-[#fff1e6] font-semibold text-[#ff6a00]"
                  : "text-[#334155] hover:bg-[#f1f5f9]"
              }`}
            >
              <it.Icon className="h-4 w-4 shrink-0" />
              <span>{it.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-[#e2e8f0] p-3">
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-[#475569] transition-colors hover:bg-[#f1f5f9]"
        >
          <NavIcon.SignOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center border-b border-[#e2e8f0] bg-white px-6 md:px-8">
      <span className="inline-flex items-center gap-2 rounded-full bg-[#fff1e6] px-3 py-1 text-xs font-semibold text-[#ff6a00]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#ff6a00]" />
        VCH Fleet
      </span>
    </header>
  );
}


/* ---------------- Dashboard ---------------- */
function Dashboard({
  vehicles, services, drivers, goto,
}: { vehicles: Vehicle[]; services: ServiceRecord[]; drivers: DriverTrack[]; goto: (v: View) => void }) {
  const total = vehicles.length;
  const inService = vehicles.filter((v) => v.status === "In Service").length;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = vehicles.filter((v) =>
    (v.next_service_date && v.next_service_date < today) ||
    (v.next_mot_date && v.next_mot_date < today) ||
    (v.insurance_expiry && v.insurance_expiry < today)
  ).length;
  const grossSpend = services.reduce((a, s) => a + (s.cost || 0), 0);

  const statusCounts = {
    Active: vehicles.filter((v) => v.status === "Active").length,
    "In Service": inService,
    "Off Road": vehicles.filter((v) => v.status === "Off Road").length,
  };

  // monthly spend
  const monthlyMap = new Map<string, number>();
  services.forEach((s) => {
    const k = (s.service_date || "").slice(0, 7);
    if (!k) return;
    monthlyMap.set(k, (monthlyMap.get(k) || 0) + (s.cost || 0));
  });
  const monthly = Array.from(monthlyMap.entries()).sort().slice(-6);

  const [expandedChart, setExpandedChart] = useState<null | "donut" | "line">(null);

  return (
    <div className="space-y-6">
      {drivers.length > 0 && (
        <button
          onClick={() => goto("mileage")}
          className="group flex w-full items-center gap-4 rounded-xl border border-[#ff6a00] bg-[#ff6a00] bg-opacity-[0.08] p-4 text-left transition-colors hover:bg-opacity-[0.15]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#ff6a00] text-white">
            <Icon.Alert className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-[#ff6a00]">Active Driver Mileage Reminders</div>
            <div className="mt-1 space-y-0.5 text-sm text-[#0f172a]">
              {drivers.slice(0, 3).map((d) => (
                <div key={d.id}>
                  Ask <span className="font-semibold">{d.driver_name}</span> ({d.registration}) for the car's current Mileage.
                </div>
              ))}
              {drivers.length > 3 && <div className="text-xs text-[#475569]">+{drivers.length - 3} more</div>}
            </div>
          </div>
        </button>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Total Vehicles" value={total} accent="#0f172a" />
        <Kpi label="In Service" value={inService} accent="#2563eb" />
        <Kpi label="Overdue Checks" value={overdue} accent="#dc2626" />
        <Kpi label="Service Spend" value={`£${grossSpend.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} accent="#ff6a00" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Fleet Status" onClick={() => setExpandedChart(expandedChart === "donut" ? null : "donut")}>
          <Donut data={statusCounts} height={expandedChart === "donut" ? 450 : 240} />
        </ChartCard>
        <ChartCard title="Service Spend (Last 6 months)" onClick={() => setExpandedChart(expandedChart === "line" ? null : "line")}>
          <LineChart data={monthly} height={expandedChart === "line" ? 450 : 240} />
        </ChartCard>
      </div>

      <div className="rounded-xl border border-[#e2e8f0] bg-white p-6">
        <h3 className="mb-4 text-base font-semibold">Recent Service Records</h3>
        {services.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#475569]">No service records yet.</div>
        ) : (
          <div className="space-y-2">
            {services.slice(0, 5).map((s) => {
              const st = serviceStyle(s.service_type);
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-[#e2e8f0] p-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${st.cls}`}>
                    <st.I className="h-3.5 w-3.5" /> {s.service_type}
                  </span>
                  <UKPlate reg={s.registration} size="sm" />
                  <div className="flex-1 truncate text-sm text-[#475569]">{s.garage || "—"}</div>
                  <div className="text-sm font-semibold">£{s.cost.toFixed(2)}</div>
                  <div className="text-xs text-[#475569]">{s.service_date}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-5">
      <div className="text-xs uppercase tracking-wider text-[#475569]">{label}</div>
      <div className="mt-2 text-3xl font-bold" style={{ color: accent }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children, onClick }: { title: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        <button onClick={onClick} className="text-xs text-[#ff6a00] hover:text-[#e05d00]">Toggle size</button>
      </div>
      {children}
    </div>
  );
}

function Donut({ data, height }: { data: Record<string, number>; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr; c.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, c.clientWidth, height);
    const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
    const cx = c.clientWidth / 2, cy = height / 2;
    const r = Math.min(cx, cy) - 20, ir = r * 0.6;
    const colors: Record<string,string> = { Active: "#22c55e", "In Service": "#2563eb", "Off Road": "#94a3b8" };
    let a0 = -Math.PI / 2;
    Object.entries(data).forEach(([k, v]) => {
      const a1 = a0 + (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * ir, cy + Math.sin(a0) * ir);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.arc(cx, cy, ir, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = colors[k] || "#94a3b8";
      ctx.fill();
      a0 = a1;
    });
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(total), cx, cy - 6);
    ctx.font = "12px sans-serif"; ctx.fillStyle = "#475569";
    ctx.fillText("vehicles", cx, cy + 14);
  }, [data, height]);
  return (
    <div>
      <canvas ref={ref} style={{ width: "100%", height }} />
      <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded" style={{ background: k === "Active" ? "#22c55e" : k === "In Service" ? "#2563eb" : "#94a3b8" }} />
            <span className="text-[#475569]">{k}</span>
            <span className="font-semibold">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, height }: { data: [string, number][]; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr; c.height = height * dpr;
    ctx.scale(dpr, dpr);
    const W = c.clientWidth, H = height;
    ctx.clearRect(0, 0, W, H);
    const padL = 40, padB = 30, padT = 10, padR = 10;
    const max = Math.max(...data.map((d) => d[1]), 100);
    // grid
    ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + ((H - padT - padB) * i) / 4;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = "#475569"; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
      ctx.fillText(`£${Math.round(max - (max * i) / 4)}`, padL - 6, y + 3);
    }
    if (data.length === 0) {
      ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center"; ctx.font = "12px sans-serif";
      ctx.fillText("No service spend recorded yet", W / 2, H / 2);
      return;
    }
    const stepX = (W - padL - padR) / Math.max(data.length - 1, 1);
    const points = data.map(([_, v], i) => ({ x: padL + i * stepX, y: padT + (H - padT - padB) * (1 - v / max) }));
    // fill
    const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
    grad.addColorStop(0, "rgba(255,106,0,0.25)"); grad.addColorStop(1, "rgba(255,106,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(points[0].x, H - padB);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, H - padB); ctx.closePath(); ctx.fill();
    // line
    ctx.strokeStyle = "#ff6a00"; ctx.lineWidth = 2.5; ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    // dots + labels
    points.forEach((p, i) => {
      ctx.fillStyle = "#ff6a00"; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#475569"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(data[i][0].slice(2), p.x, H - padB + 14);
    });
  }, [data, height]);
  return <canvas ref={ref} style={{ width: "100%", height }} />;
}

/* ---------------- Vehicles ---------------- */
function VehiclesList({
  vehicles, onEdit, onDelete, onAdd,
}: { vehicles: Vehicle[]; onEdit: (v: Vehicle) => void; onDelete: (id: string) => void; onAdd: () => void }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const filtered = vehicles.filter((v) => {
    const matchQ = [v.registration, v.make, v.model].some((s) => s.toLowerCase().includes(q.toLowerCase()));
    const matchS = statusFilter === "all" || v.status === statusFilter;
    return matchQ && matchS;
  });
  const fuelStyle = (f: Vehicle["fuel_type"]) => {
    if (f === "Electric") return "bg-blue-50 text-blue-700 border-blue-200";
    if (f === "Hybrid") return "bg-orange-50 text-orange-700 border-orange-200";
    if (f === "Diesel") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#0f172a]">Vehicles</h2>
          <p className="text-sm text-[#475569]">{vehicles.length} vehicles in your fleet</p>
        </div>
        <button onClick={onAdd} className="inline-flex items-center gap-2 rounded-lg bg-[#ff6a00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]">
          <NavIcon.Plus className="h-4 w-4" /> Add Vehicle
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by make, model or registration..."
            className="w-full rounded-lg border border-[#e2e8f0] bg-white py-2.5 pl-9 pr-3 text-sm focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2.5 text-sm focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/20"
        >
          <option value="all">All Statuses</option>
          <option value="Active">Available</option>
          <option value="In Service">In Service</option>
          <option value="Off Road">Off Road</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e2e8f0] bg-white p-10 text-center text-sm text-[#475569]">No vehicles match.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((v) => (
            <div
              key={v.id}
              className="group flex flex-col rounded-xl border border-[#e2e8f0] bg-white p-4 transition-all hover:border-[#ff6a00]/40 hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <UKPlate reg={v.registration} size="sm" />
                <StatusBadge status={v.status} />
              </div>
              <button onClick={() => onEdit(v)} className="block text-left">
                <div className="line-clamp-2 text-sm font-bold uppercase leading-tight text-[#0f172a]">
                  {v.make} {v.model}
                </div>
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#475569]">
                <span>{v.year}</span>
                <span className={`rounded border px-1.5 py-0.5 font-medium ${fuelStyle(v.fuel_type)}`}>{v.fuel_type}</span>
                <span>{v.current_mileage.toLocaleString()} mi</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#f1f5f9] pt-3 text-[10px]">
                {v.next_mot_date && <Pill label="MOT" value={daysUntil(v.next_mot_date)} />}
                {v.next_service_date && <Pill label="Service" value={daysUntil(v.next_service_date)} />}
                {v.insurance_expiry && <Pill label="Ins." value={daysUntil(v.insurance_expiry)} />}
              </div>
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-[#f1f5f9] pt-3 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => onEdit(v)} className="rounded-md px-2 py-1 text-xs font-medium text-[#ff6a00] hover:bg-[#fff1e6]">Edit</button>
                <button onClick={() => { if (confirm(`Delete ${v.registration}?`)) onDelete(v.id); }} className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function daysUntil(dateStr: string): string {
  const now = Date.now();
  const target = new Date(dateStr).getTime();
  if (isNaN(target)) return "—";
  const diff = Math.round((target - now) / 86400000);
  if (diff < 0) return "Expired";
  return `${diff}d`;
}

function Pill({ label, value }: { label: string; value: string }) {
  const expired = value === "Expired";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium ${expired ? "border-red-200 bg-red-50 text-red-700" : "border-[#e2e8f0] bg-[#f8fafc] text-[#475569]"}`}>
      <span className="opacity-70">{label}</span>
      <span className={expired ? "font-bold" : ""}>{value}</span>
    </span>
  );
}


function StatusBadge({ status }: { status: Vehicle["status"] }) {
  const map = {
    Active: "bg-green-50 text-green-700 border-green-200",
    "In Service": "bg-blue-50 text-blue-700 border-blue-200",
    "Off Road": "bg-slate-100 text-slate-700 border-slate-200",
  } as const;
  return <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>;
}

/* ---------------- Add Vehicle ---------------- */
function emptyVehicle(): Vehicle {
  return {
    id: uid(), registration: "", make: "", model: "", year: new Date().getFullYear(),
    fuel_type: "Hybrid", current_mileage: 0, status: "Active",
    next_service_date: "", next_mot_date: "", insurance_expiry: "", notes: "",
  };
}

function AddVehicle({
  vehicles, onSave, onCancel, toast,
}: { vehicles: Vehicle[]; onSave: (v: Vehicle) => void; onCancel: () => void; toast: (m: string, t?: Toast["type"]) => void }) {
  const [v, setV] = useState<Vehicle>(emptyVehicle());
  const [warn, setWarn] = useState<string | null>(null);

  const lookup = () => {
    const reg = v.registration.trim().toUpperCase();
    if (!reg) { setWarn("Enter a registration first."); return; }
    const seed = ALL_VEHICLES_SEED.find((s) => s.reg.toUpperCase() === reg);
    const existing = vehicles.find((x) => x.registration.toUpperCase() === reg);
    if (existing) { setWarn(`Vehicle ${reg} already exists in your fleet.`); return; }
    if (seed) {
      setV((x) => ({ ...x, registration: reg, make: seed.make, model: seed.model, year: seed.year }));
      setWarn(null);
      toast(`Found ${seed.make} ${seed.model} (${seed.year})`);
    } else {
      setWarn("No match in database. Enter details manually.");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.registration.trim() || !v.make.trim() || !v.model.trim()) {
      toast("Registration, make and model are required.", "error"); return;
    }
    onSave({ ...v, registration: v.registration.toUpperCase().trim() });
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6 rounded-xl border border-[#e2e8f0] bg-white p-6 md:p-8">
      <div>
        <Label>Registration *</Label>
        <div className="flex gap-2">
          <input
            value={v.registration}
            onChange={(e) => setV({ ...v, registration: e.target.value.toUpperCase() })}
            placeholder="AB12 CDE"
            className="flex-1 rounded-lg border border-[#e2e8f0] bg-white px-4 py-2.5 font-mono uppercase tracking-wider focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/20"
          />
          <button type="button" onClick={lookup} className="rounded-lg bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]">Look up</button>
        </div>
        {warn && <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{warn}</div>}
      </div>

      <Grid2>
        <Field label="Make"><input value={v.make} onChange={(e) => setV({ ...v, make: e.target.value })} className={inputCls} /></Field>
        <Field label="Model"><input value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} className={inputCls} /></Field>
      </Grid2>

      <Grid2>
        <Field label="Year"><input type="number" value={v.year} onChange={(e) => setV({ ...v, year: +e.target.value })} className={inputCls} /></Field>
        <Field label="Fuel Type">
          <select value={v.fuel_type} onChange={(e) => setV({ ...v, fuel_type: e.target.value as Vehicle["fuel_type"] })} className={inputCls}>
            <option>Petrol</option><option>Diesel</option><option>Hybrid</option><option>Electric</option>
          </select>
        </Field>
      </Grid2>

      <Grid2>
        <Field label="Current Mileage"><input type="number" value={v.current_mileage} onChange={(e) => setV({ ...v, current_mileage: +e.target.value })} className={inputCls} /></Field>
        <Field label="Status">
          <select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as Vehicle["status"] })} className={inputCls}>
            <option>Active</option><option>In Service</option><option>Off Road</option>
          </select>
        </Field>
      </Grid2>

      <div>
        <Label>Important Dates</Label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Next Service"><input type="date" value={v.next_service_date} onChange={(e) => setV({ ...v, next_service_date: e.target.value })} className={inputCls} /></Field>
          <Field label="Next MOT"><input type="date" value={v.next_mot_date} onChange={(e) => setV({ ...v, next_mot_date: e.target.value })} className={inputCls} /></Field>
          <Field label="Insurance Expiry"><input type="date" value={v.insurance_expiry} onChange={(e) => setV({ ...v, insurance_expiry: e.target.value })} className={inputCls} /></Field>
        </div>
      </div>

      <Field label="Notes"><textarea rows={4} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className={inputCls} /></Field>

      <div className="flex justify-end gap-2 border-t border-[#e2e8f0] pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg border border-[#e2e8f0] bg-white px-5 py-2.5 text-sm font-medium text-[#0f172a] hover:bg-[#f1f5f9]">Cancel</button>
        <button type="submit" className="rounded-lg bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]">Add Vehicle</button>
      </div>
    </form>
  );
}

const inputCls = "w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2.5 text-sm focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/20";
function Label({ children }: { children: React.ReactNode }) { return <div className="mb-1.5 text-sm font-semibold text-[#0f172a]">{children}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label>{children}</div>;
}
function Grid2({ children }: { children: React.ReactNode }) { return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>; }

/* ---------------- Edit Vehicle Modal ---------------- */
function EditVehicleModal({ vehicle, onClose, onSave }: { vehicle: Vehicle; onClose: () => void; onSave: (v: Vehicle) => void }) {
  const [v, setV] = useState<Vehicle>(vehicle);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#e2e8f0] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Edit Vehicle</h2>
          <button onClick={onClose} className="text-[#475569] hover:text-[#0f172a]"><Icon.X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="flex justify-center"><UKPlate reg={v.registration} size="lg" /></div>
          <Grid2>
            <Field label="Make"><input value={v.make} onChange={(e) => setV({ ...v, make: e.target.value })} className={inputCls} /></Field>
            <Field label="Model"><input value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} className={inputCls} /></Field>
          </Grid2>
          <Grid2>
            <Field label="Year"><input type="number" value={v.year} onChange={(e) => setV({ ...v, year: +e.target.value })} className={inputCls} /></Field>
            <Field label="Fuel Type">
              <select value={v.fuel_type} onChange={(e) => setV({ ...v, fuel_type: e.target.value as Vehicle["fuel_type"] })} className={inputCls}>
                <option>Petrol</option><option>Diesel</option><option>Hybrid</option><option>Electric</option>
              </select>
            </Field>
          </Grid2>
          <Grid2>
            <Field label="Current Mileage"><input type="number" value={v.current_mileage} onChange={(e) => setV({ ...v, current_mileage: +e.target.value })} className={inputCls} /></Field>
            <Field label="Status">
              <select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as Vehicle["status"] })} className={inputCls}>
                <option>Active</option><option>In Service</option><option>Off Road</option>
              </select>
            </Field>
          </Grid2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Next Service"><input type="date" value={v.next_service_date} onChange={(e) => setV({ ...v, next_service_date: e.target.value })} className={inputCls} /></Field>
            <Field label="Next MOT"><input type="date" value={v.next_mot_date} onChange={(e) => setV({ ...v, next_mot_date: e.target.value })} className={inputCls} /></Field>
            <Field label="Insurance"><input type="date" value={v.insurance_expiry} onChange={(e) => setV({ ...v, insurance_expiry: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="Notes"><textarea rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className={inputCls} /></Field>
          <div className="flex justify-end gap-2 border-t border-[#e2e8f0] pt-4">
            <button onClick={onClose} className="rounded-lg border border-[#e2e8f0] bg-white px-5 py-2.5 text-sm font-medium hover:bg-[#f1f5f9]">Cancel</button>
            <button onClick={() => onSave(v)} className="rounded-lg bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Reg Search ---------------- */
function RegSearch({
  vehicles, onPick, value, onTextChange,
}: { vehicles: Vehicle[]; onPick: (v: Vehicle) => void; value: string; onTextChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = value.trim().toUpperCase();
    if (!q) return [];
    return vehicles.filter((v) =>
      v.registration.toUpperCase().includes(q) || v.make.toUpperCase().includes(q) || v.model.toUpperCase().includes(q)
    ).slice(0, 8);
  }, [value, vehicles]);
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => { onTextChange(e.target.value.toUpperCase()); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Type registration to search..."
        className={inputCls + " font-mono uppercase tracking-wider"}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[#e2e8f0] bg-white shadow-lg">
          {matches.map((v) => (
            <button
              type="button" key={v.id}
              onClick={() => { onPick(v); setOpen(false); }}
              className="flex w-full items-center gap-3 border-b border-[#f1f5f9] px-3 py-2 text-left hover:bg-[#ff6a00] hover:bg-opacity-[0.08]"
            >
              <UKPlate reg={v.registration} size="sm" />
              <div className="flex-1 truncate">
                <div className="text-sm font-semibold">{v.make}</div>
                <div className="text-xs text-[#475569]">{v.model} · {v.year}</div>
              </div>
              <div className="text-xs text-[#475569]">{v.current_mileage.toLocaleString()} mi</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Log Service ---------------- */
function LogService({
  vehicles, onSave, onCancel,
}: { vehicles: Vehicle[]; onSave: (r: ServiceRecord) => void; onCancel: () => void }) {
  const [regText, setRegText] = useState("");
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [type, setType] = useState("Full Service");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mileage, setMileage] = useState<number>(0);
  const [cost, setCost] = useState<number>(0);
  const [garage, setGarage] = useState("");
  const [desc, setDesc] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) { alert("Pick a vehicle by registration."); return; }
    onSave({
      id: uid(), vehicle_id: selected.id, registration: selected.registration,
      service_type: type, service_date: date, mileage: +mileage || 0, cost: +cost || 0,
      garage, description: desc,
    });
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5 rounded-xl border border-[#e2e8f0] bg-white p-6 md:p-8">
      <div>
        <Label>Registration *</Label>
        <RegSearch
          vehicles={vehicles}
          value={regText}
          onTextChange={(s) => { setRegText(s); setSelected(null); }}
          onPick={(v) => { setSelected(v); setRegText(v.registration); setMileage(v.current_mileage); }}
        />
        {selected && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-2">
            <UKPlate reg={selected.registration} size="sm" />
            <div className="text-sm"><span className="font-semibold">{selected.make}</span> {selected.model} · {selected.year}</div>
          </div>
        )}
      </div>

      <Grid2>
        <Field label="Service Type">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Service Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
      </Grid2>

      <Grid2>
        <Field label="Mileage at Service"><input type="number" value={mileage} onChange={(e) => setMileage(+e.target.value)} className={inputCls} /></Field>
        <Field label="Cost (£)"><input type="number" step="0.01" value={cost} onChange={(e) => setCost(+e.target.value)} placeholder="150.00" className={inputCls} /></Field>
      </Grid2>

      <Field label="Garage / Service Centre"><input value={garage} onChange={(e) => setGarage(e.target.value)} className={inputCls} /></Field>
      <Field label="Description of Work Performed"><textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} className={inputCls} /></Field>

      <div className="flex justify-end gap-2 border-t border-[#e2e8f0] pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg border border-[#e2e8f0] bg-white px-5 py-2.5 text-sm font-medium hover:bg-[#f1f5f9]">Cancel</button>
        <button type="submit" className="rounded-lg bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]">Save Record</button>
      </div>
    </form>
  );
}

function ServicesList({ services, onAdd, onDelete }: { services: ServiceRecord[]; onAdd: () => void; onDelete: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={onAdd} className="rounded-lg bg-[#ff6a00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]">+ Log Service</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#f8fafc] text-left text-xs uppercase tracking-wider text-[#475569]">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Mileage</th>
              <th className="px-4 py-3">Garage</th>
              <th className="px-4 py-3">Cost</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => {
              const st = serviceStyle(s.service_type);
              return (
                <tr key={s.id} className="border-t border-[#e2e8f0] hover:bg-[#f8fafc]">
                  <td className="px-4 py-3">{s.service_date}</td>
                  <td className="px-4 py-3"><UKPlate reg={s.registration} size="sm" /></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${st.cls}`}>
                      <st.I className="h-3.5 w-3.5" /> {s.service_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">{s.mileage.toLocaleString()} mi</td>
                  <td className="px-4 py-3 text-[#475569]">{s.garage || "—"}</td>
                  <td className="px-4 py-3 font-semibold">£{s.cost.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { if (confirm("Delete this service record?")) onDelete(s.id); }} className="text-red-600 hover:text-red-700">Delete</button>
                  </td>
                </tr>
              );
            })}
            {services.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-[#475569]">No service records logged yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Mileage View ---------------- */
function MileageView({
  vehicles, drivers, setDrivers, setVehicles, toast,
}: {
  vehicles: Vehicle[]; drivers: DriverTrack[];
  setDrivers: React.Dispatch<React.SetStateAction<DriverTrack[]>>;
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  toast: (m: string, t?: Toast["type"]) => void;
}) {
  const [regText, setRegText] = useState("");
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [driverName, setDriverName] = useState("");
  const [startMileage, setStartMileage] = useState<number>(0);
  const [allowance, setAllowance] = useState<number>(5000);
  const [excessRate, setExcessRate] = useState<number>(20);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const [updateTarget, setUpdateTarget] = useState<DriverTrack | null>(null);
  const [eomTarget, setEomTarget] = useState<DriverTrack | null>(null);
  const [logsTarget, setLogsTarget] = useState<DriverTrack | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) { toast("Pick a vehicle by registration.", "error"); return; }
    if (!driverName.trim()) { toast("Driver name is required.", "error"); return; }
    const d: DriverTrack = {
      id: uid(), driver_name: driverName.trim(), vehicle_id: selected.id, registration: selected.registration,
      start_mileage: +startMileage || 0, current_mileage: +startMileage || 0,
      allowance: +allowance || 5000, excess_rate: +excessRate || 20,
      start_date: startDate, monthly_logs: [],
    };
    setDrivers((ds) => [d, ...ds]);
    toast(`Tracking started for ${d.driver_name}`);
    setDriverName(""); setRegText(""); setSelected(null); setStartMileage(0);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-[#e2e8f0] bg-white p-6">
        <h3 className="text-base font-semibold">Start Tracking a Driver</h3>
        <Grid2>
          <div>
            <Label>Registration *</Label>
            <RegSearch
              vehicles={vehicles}
              value={regText}
              onTextChange={(s) => { setRegText(s); setSelected(null); }}
              onPick={(v) => { setSelected(v); setRegText(v.registration); setStartMileage(v.current_mileage); }}
            />
          </div>
          <Field label="Driver Name"><input value={driverName} onChange={(e) => setDriverName(e.target.value)} className={inputCls} /></Field>
        </Grid2>
        <Grid2>
          <Field label="Month Start Mileage"><input type="number" value={startMileage} onChange={(e) => setStartMileage(+e.target.value)} className={inputCls} /></Field>
          <Field label="Tracking Start Date"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} /></Field>
        </Grid2>
        <Grid2>
          <Field label="Monthly Allowance (miles)"><input type="number" value={allowance} onChange={(e) => setAllowance(+e.target.value)} className={inputCls} /></Field>
          <Field label="Excess Rate (pence/mile)"><input type="number" value={excessRate} onChange={(e) => setExcessRate(+e.target.value)} className={inputCls} /></Field>
        </Grid2>
        <div className="flex justify-end">
          <button type="submit" className="rounded-lg bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]">Start Tracking</button>
        </div>
      </form>

      <div>
        <h3 className="mb-3 text-base font-semibold">Active Drivers ({drivers.length})</h3>
        {drivers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#e2e8f0] bg-white p-10 text-center text-sm text-[#475569]">
            No active driver tracking yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {drivers.map((d) => {
              const driven = Math.max(0, d.current_mileage - d.start_mileage);
              const over = Math.max(0, driven - d.allowance);
              const charge = (over * d.excess_rate) / 100;
              return (
                <div key={d.id} className="rounded-xl border border-[#e2e8f0] bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-base font-bold">{d.driver_name}</div>
                      <div className="text-xs text-[#475569]">Started {d.start_date}</div>
                    </div>
                    <UKPlate reg={d.registration} size="sm" />
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-[#f8fafc] p-2">
                      <div className="text-xs text-[#475569]">Month Start</div>
                      <div className="font-semibold">{d.start_mileage.toLocaleString()} mi</div>
                    </div>
                    <div className="rounded-lg bg-[#f8fafc] p-2">
                      <div className="text-xs text-[#475569]">Current / Last Known</div>
                      <div className="font-semibold">{d.current_mileage.toLocaleString()} mi</div>
                    </div>
                  </div>
                  <div className="mb-3 text-sm">
                    <div className="flex justify-between text-xs text-[#475569]"><span>Driven</span><span>{driven.toLocaleString()} / {d.allowance.toLocaleString()} mi</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#f1f5f9]">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (driven / d.allowance) * 100)}%`, background: over > 0 ? "#dc2626" : "#22c55e" }} />
                    </div>
                  </div>
                  {over > 0 ? (
                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm font-bold text-[#dc2626]">
                      Excess: {over.toLocaleString()} mi · £{charge.toFixed(2)}
                    </div>
                  ) : (
                    <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-2 py-1.5 text-center text-xs font-semibold text-green-700">
                      Within Allowance
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setUpdateTarget(d)} className="rounded-md border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-medium text-[#0f172a] hover:bg-[#f1f5f9]">Update</button>
                    <button onClick={() => setEomTarget(d)} className="rounded-md bg-[#ff6a00] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e05d00]">End of Month</button>
                    {d.monthly_logs.length > 0 && (
                      <button onClick={() => setLogsTarget(d)} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-medium text-[#0f172a] hover:bg-[#f1f5f9]">
                        <Icon.Clock className="h-3.5 w-3.5" /> Logged Miles ({d.monthly_logs.length})
                      </button>
                    )}
                    <button
                      onClick={() => { if (confirm(`Stop tracking ${d.driver_name}?`)) setDrivers((ds) => ds.filter((x) => x.id !== d.id)); }}
                      className="ml-auto text-xs text-red-600 hover:text-red-700"
                    >Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {updateTarget && (
        <UpdateMileageModal
          driver={updateTarget}
          onClose={() => setUpdateTarget(null)}
          onSave={(newMi) => {
            setDrivers((ds) => ds.map((x) => x.id === updateTarget.id ? { ...x, current_mileage: newMi } : x));
            setVehicles((vs) => vs.map((v) => v.id === updateTarget.vehicle_id && newMi > v.current_mileage ? { ...v, current_mileage: newMi } : v));
            toast("Current mileage updated"); setUpdateTarget(null);
          }}
        />
      )}

      {eomTarget && (
        <EndOfMonthModal
          driver={eomTarget}
          onClose={() => setEomTarget(null)}
          onConfirm={(endMi) => {
            const driven = Math.max(0, endMi - eomTarget.start_mileage);
            const over = Math.max(0, driven - eomTarget.allowance);
            const charge = (over * eomTarget.excess_rate) / 100;
            const monthLabel = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
            const log: MonthlyLog = {
              month: monthLabel, start_mileage: eomTarget.start_mileage, end_mileage: endMi,
              miles_driven: driven, overage: over, excess_charge: charge, date: new Date().toISOString().slice(0, 10),
            };
            setDrivers((ds) => ds.map((x) => x.id === eomTarget.id ? {
              ...x, start_mileage: endMi, current_mileage: endMi, monthly_logs: [log, ...x.monthly_logs],
            } : x));
            setVehicles((vs) => vs.map((v) => v.id === eomTarget.vehicle_id ? { ...v, current_mileage: endMi } : v));
            toast(`End-of-month saved for ${eomTarget.driver_name}`); setEomTarget(null);
          }}
        />
      )}

      {logsTarget && <LogsModal driver={logsTarget} onClose={() => setLogsTarget(null)} />}
    </div>
  );
}

function UpdateMileageModal({ driver, onClose, onSave }: { driver: DriverTrack; onClose: () => void; onSave: (n: number) => void }) {
  const [v, setV] = useState<number>(driver.current_mileage);
  const invalid = v < driver.start_mileage;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[#e2e8f0] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-bold">Update Current Mileage</h2>
        <p className="mb-4 text-sm text-[#475569]">Driver: <span className="font-semibold text-[#0f172a]">{driver.driver_name}</span> · {driver.registration}</p>
        <Field label="Current Odometer (mi)">
          <input type="number" value={v} onChange={(e) => setV(+e.target.value)} className={inputCls} />
        </Field>
        {invalid && <div className="mt-2 text-xs text-red-600">Must be at least the month-start mileage ({driver.start_mileage.toLocaleString()}).</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-2 text-sm hover:bg-[#f1f5f9]">Cancel</button>
          <button disabled={invalid} onClick={() => onSave(v)} className="rounded-lg bg-[#ff6a00] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}

function EndOfMonthModal({ driver, onClose, onConfirm }: { driver: DriverTrack; onClose: () => void; onConfirm: (n: number) => void }) {
  const [v, setV] = useState<number>(driver.current_mileage);
  const driven = Math.max(0, v - driver.start_mileage);
  const over = Math.max(0, driven - driver.allowance);
  const charge = (over * driver.excess_rate) / 100;
  const invalid = v <= driver.start_mileage;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[#e2e8f0] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-bold">End of Month Miles</h2>
        <p className="mb-4 text-sm text-[#475569]">Enter the driver's odometer reading at the end of this month.</p>
        <div className="mb-3 rounded-lg bg-[#f8fafc] p-3 text-sm">
          <div className="flex justify-between"><span className="text-[#475569]">Driver</span><span className="font-semibold">{driver.driver_name}</span></div>
          <div className="flex justify-between"><span className="text-[#475569]">Start Mileage</span><span className="font-semibold">{driver.start_mileage.toLocaleString()} mi</span></div>
          <div className="flex justify-between"><span className="text-[#475569]">Allowance</span><span className="font-semibold">{driver.allowance.toLocaleString()} mi</span></div>
        </div>
        <Field label="End of Month Odometer Reading (mi)">
          <input type="number" value={v} onChange={(e) => setV(+e.target.value)} className={inputCls} />
        </Field>
        {invalid ? (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            Reading must be greater than start mileage ({driver.start_mileage.toLocaleString()}).
          </div>
        ) : (
          <div className="mt-3 space-y-1.5 rounded-lg border border-[#e2e8f0] p-3 text-sm">
            <div className="flex justify-between"><span className="text-[#475569]">Miles Driven</span><span className="font-semibold">{driven.toLocaleString()} mi</span></div>
            <div className="flex justify-between"><span className="text-[#475569]">Overage</span><span className="font-semibold">{over.toLocaleString()} mi</span></div>
            <div className={`flex justify-between font-bold ${over > 0 ? "text-[#dc2626]" : "text-green-700"}`}>
              <span>Excess Charge</span><span>£{charge.toFixed(2)}</span>
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-2 text-sm hover:bg-[#f1f5f9]">Cancel</button>
          <button disabled={invalid} onClick={() => onConfirm(v)} className="rounded-lg bg-[#ff6a00] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50">Confirm & Save</button>
        </div>
      </div>
    </div>
  );
}

function LogsModal({ driver, onClose }: { driver: DriverTrack; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[#e2e8f0] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Logged Miles · {driver.driver_name}</h2>
            <p className="text-sm text-[#475569]">{driver.registration} · {driver.monthly_logs.length} records</p>
          </div>
          <button onClick={onClose} className="text-[#475569] hover:text-[#0f172a]"><Icon.X className="h-5 w-5" /></button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#f8fafc] text-left text-xs uppercase tracking-wider text-[#475569]">
            <tr>
              <th className="px-3 py-2">Month</th>
              <th className="px-3 py-2">Start</th>
              <th className="px-3 py-2">End</th>
              <th className="px-3 py-2">Driven</th>
              <th className="px-3 py-2">Overage</th>
              <th className="px-3 py-2">Charge</th>
            </tr>
          </thead>
          <tbody>
            {driver.monthly_logs.map((l, i) => (
              <tr key={i} className="border-t border-[#e2e8f0]">
                <td className="px-3 py-2 font-semibold">{l.month}</td>
                <td className="px-3 py-2">{l.start_mileage.toLocaleString()}</td>
                <td className="px-3 py-2">{l.end_mileage.toLocaleString()}</td>
                <td className="px-3 py-2">{l.miles_driven.toLocaleString()}</td>
                <td className="px-3 py-2">{l.overage.toLocaleString()}</td>
                <td className={`px-3 py-2 font-bold ${l.overage > 0 ? "text-[#dc2626]" : "text-green-700"}`}>£{l.excess_charge.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
