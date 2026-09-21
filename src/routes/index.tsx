import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  useFleetData,
  getVehicleDefaultDeposit,
  getVehicleWeeklyPrice,
  calculateNextPaymentDueDate,
  type Vehicle,
  type ServiceRecord,
  type DriverTrack,
  type MileageSubmission,
  type DriverDocument,
} from "@/lib/fleet-data";
import { simplifyVehicleName, vehicleArtworkPath } from "@/lib/vehicle-display";
import { exportServiceHistoryPdf } from "@/lib/pdf-export";
import { useLeadsData } from "@/lib/leads-data";
import { ApexAssistant } from "@/components/apex-assistant";
import { ChatSimulator } from "@/components/chat-simulator";
import { LeadThread } from "@/components/lead-thread";
import { getLeadConversation, rewordCustomMessage } from "@/lib/chat.functions";
import { GenerationsView } from "@/components/generations-view";
import { type AuditLogEntry } from "@/lib/audit-logger";
import { WEBSITE_BASE_URL } from "@/lib/domain-config";
import { RouteErrorBoundary } from "@/components/error-boundary";
import { calculateContractEndDate, getContractDaysRemaining } from "@/lib/contract-helpers";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fleet Dashboard — Virtual Car Hire Fleet Tracker" },
      {
        name: "description",
        content:
          "Live VCH fleet dashboard: MOT and PCO alerts, service spend, driver mileage and AI-triaged leads.",
      },
      { property: "og:title", content: "Fleet Dashboard — Virtual Car Hire" },
      {
        property: "og:description",
        content:
          "Live VCH fleet dashboard: MOT and PCO alerts, service spend and AI-triaged leads.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FleetApp,
});

/* ---------------- Seed data (used for reg lookup only) ---------------- */
const ALL_VEHICLES_SEED: { reg: string; make: string; model: string; year: number }[] = [
  { reg: "AF70MYK", make: "TESLA", model: "MODEL 3 LONG RANGE AWD", year: 2020 },
  { reg: "BD20XPU", make: "MERCEDES-BENZ", model: "E 300 AMG LINE PREMIUM DE AUTO", year: 2020 },
  { reg: "BJ20L6X", make: "TESLA", model: "MODEL 3 LONG RANGE AWD", year: 2020 },
  { reg: "BK70WYM", make: "TESLA", model: "MODEL 3 LONG RANGE AWD", year: 2020 },
  { reg: "BL19JDZ", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2019 },
  { reg: "BN17CVA", make: "MERCEDES-BENZ", model: "VITO 119 B-TEC TOURER SELECT A", year: 2017 },
  { reg: "BN20MXL", make: "JAGUAR", model: "I-PACE EV400 S", year: 2020 },
  { reg: "BN60MYZ", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2018 },
  { reg: "BN60NHP", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2018 },
  { reg: "BT69TEJ", make: "TESLA", model: "MODEL 3 LONG RANGE AWD", year: 2019 },
  { reg: "RE21NRX", make: "MG", model: "MG 5 EXCITE EV", year: 2021 },
  { reg: "BU19ACJ", make: "MERCEDES-BENZ", model: "E 220 D AMG LINE AUTO", year: 2019 },
  { reg: "BV18WNA", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2018 },
  { reg: "BX19ZMY", make: "MERCEDES-BENZ", model: "E 220 D AMG LINE AUTO", year: 2019 },
  { reg: "CA19UTF", make: "MERCEDES-BENZ", model: "E 220 D AMG LINE AUTO", year: 2019 },
  { reg: "EF70ZPZ", make: "HYUNDAI", model: "IONIQ PREMIUM PHEV S-A", year: 2021 },
  { reg: "EF70ZVM", make: "HYUNDAI", model: "IONIQ PREMIUM SE PHEV S-A", year: 2020 },
  { reg: "EF70ZYD", make: "HYUNDAI", model: "IONIQ PREMIUM SE PHEV S-A", year: 2020 },
  { reg: "EK70AOO", make: "HYUNDAI", model: "IONIQ PREMIUM PHEV S-A", year: 2020 },
  { reg: "EN73UBZ", make: "MERCEDES-BENZ", model: "EQE 300 AMG LINE PREMIUM", year: 2024 },
  { reg: "FL70EUV", make: "HYUNDAI", model: "IONIQ PREMIUM SE PHEV S-A", year: 2020 },
  { reg: "FX19FXC", make: "MERCEDES-BENZ", model: "E 220 D AMG LINE AUTO", year: 2019 },
  { reg: "GU72DVP", make: "HYUNDAI", model: "IONIQ PREMIUM SE PHEV S-A", year: 2022 },
  { reg: "GX70UBD", make: "JAGUAR", model: "I-PACE EV400 S", year: 2020 },
  { reg: "GY69NVL", make: "MERCEDES-BENZ", model: "E 300 AMG LINE PREMIUM DE AUTO", year: 2019 },
  { reg: "HX19VXB", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2019 },
  { reg: "HX19VZG", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2019 },
  { reg: "KF19UCJ", make: "TOYOTA", model: "COROLLA ICON VVT-I HEV CVT", year: 2019 },
  { reg: "KF19UCN", make: "TOYOTA", model: "COROLLA ICON VVT-I HEV CVT", year: 2019 },
  { reg: "KN73XLA", make: "MERCEDES-BENZ", model: "EQE 300 AMG LINE PREMIUM", year: 2023 },
  { reg: "KN73XLB", make: "MERCEDES-BENZ", model: "EQE 300 AMG LINE PREMIUM", year: 2023 },
  { reg: "KO18HKE", make: "MERCEDES-BENZ", model: "VITO 114 BLUETEC TOURER PRO", year: 2018 },
  { reg: "KP69WOR", make: "MERCEDES-BENZ", model: "E 220 D SE PREMIUM AUTO", year: 2019 },
  { reg: "KR74WDL", make: "MERCEDES-BENZ", model: "EQE 350+ AMG LINE", year: 2024 },
  { reg: "AK69CKJ", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2019 },
  { reg: "KT18ATF", make: "MERCEDES-BENZ", model: "VITO 114 BLUETEC TOURER PRO", year: 2018 },
  { reg: "KT68VYM", make: "MERCEDES-BENZ", model: "E 220 D AMG LINE PREM 4MATIC A", year: 2018 },
  { reg: "KU73MVW", make: "MERCEDES-BENZ", model: "E 300 AMG LINE PREMIUM", year: 2023 },
  { reg: "KL18TMV", make: "MERCEDES-BENZ", model: "VITO 114 BLUETEC TOURER PRO", year: 2018 },
  { reg: "LA69AXF", make: "TESLA", model: "MODEL 3 LONG RANGE AWD", year: 2019 },
  { reg: "LA69AYB", make: "TESLA", model: "MODEL 3 PERFORMANCE AWD", year: 2019 },
  { reg: "LB690FY", make: "TESLA", model: "MODEL 3 LONG RANGE AWD", year: 2019 },
  { reg: "LD20COJ", make: "TESLA", model: "MODEL 3 LONG RANGE AWD", year: 2020 },
  { reg: "LD20FCE", make: "TESLA", model: "MODEL 3 LONG RANGE AWD", year: 2020 },
  { reg: "LL68CRZ", make: "TOYOTA", model: "AURIS ICON TECH HEV VVT-I CVT", year: 2019 },
  { reg: "LL68CRV", make: "TOYOTA", model: "AURIS ICON TECH HEV VVT-I CVT", year: 2019 },
  { reg: "LL68KRZ", make: "TOYOTA", model: "AURIS ICON TECH HEV VVT-I CVT", year: 2018 },
  { reg: "LM68KRG", make: "TOYOTA", model: "AURIS ICON TECH HEV VVT-I CVT", year: 2018 },
  { reg: "LM68KRJ", make: "TOYOTA", model: "AURIS ICON TECH HEV VVT-I CVT", year: 2018 },
  { reg: "LM68KRO", make: "TOYOTA", model: "AURIS ICON TECH HEV VVT-I CVT", year: 2018 },
  { reg: "LM68KRU", make: "TOYOTA", model: "AURIS ICON TECH HEV VVT-I CVT", year: 2018 },
  { reg: "LR16VTY", make: "TOYOTA", model: "PRIUS ACTIVE VVT-I CVT", year: 2016 },
  { reg: "LR69UCG", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2019 },
  { reg: "LT69GSU", make: "TOYOTA", model: "COROLLA ICON VVT-I HEV CVT", year: 2019 },
  { reg: "LT69GSSV", make: "TOYOTA", model: "COROLLA ICON VVT-I HEV CVT", year: 2019 },
  { reg: "LT69GSV", make: "TOYOTA", model: "COROLLA ICON VVT-I HEV CVT", year: 2019 },
  { reg: "LT69GSZ", make: "TOYOTA", model: "COROLLA ICON VVT-I HEV CVT", year: 2019 },
  { reg: "LT69GTU", make: "TOYOTA", model: "COROLLA ICON VVT-I HEV CVT", year: 2019 },
  { reg: "MD25AYY", make: "FORD", model: "TOURNEO CUSTOM 340 ZTEC PHEV A", year: 2025 },
  { reg: "MD25DCX", make: "FORD", model: "TOURNEO CUSTOM 340 ZTEC PHEV A", year: 2025 },
  { reg: "MJ69YPN", make: "TESLA", model: "MODEL 3 PERFORMANCE AWD", year: 2019 },
  { reg: "MV68OGF", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2018 },
  { reg: "MV68OHB", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2018 },
  { reg: "OU68SXP", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2018 },
  { reg: "OW19XXN", make: "MERCEDES-BENZ", model: "E 220 D AMG LINE AUTO", year: 2019 },
  { reg: "PO18UTT", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2018 },
  { reg: "RE21NRV", make: "MG", model: "MG 5 EXCITE EV", year: 2021 },
  { reg: "RE21NRZ", make: "MG", model: "MG 5 EXCITE EV", year: 2021 },
  { reg: "RE21NSF", make: "MG", model: "MG 5 EXCITE EV", year: 2021 },
  { reg: "RE21NSU", make: "MG", model: "MG 5 EXCITE EV", year: 2021 },
  { reg: "RX25CME", make: "FORD", model: "TOURNEO CUSTOM 340 TITANIUM PHEV A", year: 2025 },
  { reg: "SF19WPIW", make: "MERCEDES-BENZ", model: "VITO 114 BLUETEC TOURER PRO", year: 2019 },
  { reg: "ID195NN", make: "MERCEDES-BENZ", model: "E 220 D SE AUTO", year: 2019 },
  { reg: "WG74KFJ", make: "MERCEDES-BENZ", model: "EQE 300 SPORT EDITION", year: 2025 },
  { reg: "IH74E3F", make: "MERCEDES-BENZ", model: "EQE 300 SPORT EDITION", year: 2024 },
  { reg: "IHN20E3A", make: "TESLA", model: "MODEL 3 LONG RANGE AWD", year: 2020 },
  { reg: "IN20NKU", make: "MERCEDES-BENZ", model: "E 300 AMG LINE PREMIUM DE AUTO", year: 2020 },
  { reg: "WR16UED", make: "MERCEDES-BENZ", model: "VITO 114 BLUETEC TOURER SELECT", year: 2016 },
  { reg: "WR19UFG", make: "MERCEDES-BENZ", model: "VITO 114 BLUETEC TOURERS PRO", year: 2019 },
  { reg: "YC72HZM", make: "MG", model: "MG 5 EXCLUSIVE EV", year: 2022 },
  { reg: "YF22UVZ", make: "MG", model: "MG 5 EXCLUSIVE EV", year: 2022 },
  { reg: "YF22UWK", make: "MG", model: "MG 5 EXCLUSIVE EV", year: 2022 },
  { reg: "YF22UWM", make: "MG", model: "MG 5 EXCLUSIVE EV", year: 2022 },
  { reg: "YF22UWT", make: "MG", model: "MG 5 EXCLUSIVE EV", year: 2022 },
  { reg: "YF22UWA", make: "MG", model: "MG 5 EXCLUSIVE EV", year: 2022 },
  { reg: "YF22UXA", make: "MG", model: "MG 5 EXCLUSIVE EV", year: 2022 },
  { reg: "YF22UXC", make: "MG", model: "MG 5 EXCLUSIVE EV", year: 2022 },
  { reg: "YF22UXY", make: "MG", model: "MG 5 EXCLUSIVE EV", year: 2022 },
  { reg: "YH71JHL", make: "MG", model: "MG 5 EXCITE EV", year: 2021 },
];
export { ALL_VEHICLES_SEED };

type Toast = { id: string; msg: string; type: "success" | "error" | "info" };
const uid = () => Math.random().toString(36).slice(2, 11);

const SERVICE_TYPES = [
  "Full Service",
  "Interim Service",
  "MOT",
  "Oil Change",
  "Tyre Replacement",
  "Brake Service",
  "Battery Check",
  "Battery Replacement",
  "Filter Replacement",
  "Air Con Gas Replacement",
  "Diagnostic",
  "Bodywork Repair",
  "Electrical Repair",
  "Coolant Flush",
  "Transmission Service",
  "Other",
];

/* ---------------- Theme (Apple liquid glass) ---------------- */
export const T = {
  bg: "linear-gradient(160deg,#05070c 0%,#0a0e18 45%,#080b13 100%)",
  panel: "rgba(255,255,255,0.055)",
  panel2: "rgba(255,255,255,0.10)",
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.07)",
  text: "#eef2f8",
  muted: "#9aa5b8",
  mutedSoft: "#6b7488",
  orange: "#ff8a3d",
  orangeSoft: "rgba(255,138,61,0.14)",
};

/* ---------------- Icons ---------------- */
const Icon = {
  ChevronUp: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  ),
  Key: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M21 2l-2 2m-1.5 1.5l-3 3m-2 2l-3 3m2-2l-3 3m-2-2l-3 3m2-2l-3 3" />
      <circle cx="7.5" cy="16.5" r="4.5" />
    </svg>
  ),
  RotateCcw: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  ),
  Shield: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  FileText: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  Wrench: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  Gauge: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M12 14l4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  ),
  Calendar: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  Disc: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Info: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  ),
  Clock: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  Car: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm18 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
      <path d="M3 17v-5l2-5h14l2 5v5" />
    </svg>
  ),
  Search: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  ),
  Menu: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  Bolt: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="m13 2-9 12h7l-1 8 9-12h-7z" />
    </svg>
  ),
  X: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  Alert: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
    </svg>
  ),
  Download: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Plus: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  SignOut: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Dashboard: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  Chat: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  Crash: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="m13 2-3 7h5l-3 7" />
      <path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm18 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
      <path d="M3 17v-4l2-3h4" />
    </svg>
  ),
  AirCan: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <rect x="7" y="7" width="10" height="14" rx="2" />
      <path d="M10 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <path d="M12 3V1" />
      <path d="M4 10h.01M2 13h.01M5 16h.01" />
    </svg>
  ),
  Droplet: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
    </svg>
  ),
  Battery: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <rect x="2" y="7" width="16" height="10" rx="2" />
      <line x1="22" y1="11" x2="22" y2="13" />
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="8" y1="10" x2="8" y2="14" />
    </svg>
  ),
  Filter: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  Cog: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Activity: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  User: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Shield: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Camera: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  ),
  Eye: (p: { className?: string }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

function serviceStyle(type: string) {
  const t = type.toLowerCase();
  if (t.includes("air con"))
    return { cls: "border-sky-500/30 bg-sky-500/10 text-sky-300", I: Icon.AirCan };
  if (t.includes("oil"))
    return { cls: "border-amber-500/30 bg-amber-500/10 text-amber-300", I: Icon.Droplet };
  if (t.includes("coolant"))
    return { cls: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300", I: Icon.Droplet };
  if (t.includes("battery"))
    return { cls: "border-violet-500/30 bg-violet-500/10 text-violet-300", I: Icon.Battery };
  if (t.includes("filter"))
    return { cls: "border-lime-500/30 bg-lime-500/10 text-lime-300", I: Icon.Filter };
  if (t.includes("diagnostic"))
    return { cls: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300", I: Icon.Activity };
  if (t.includes("transmission"))
    return { cls: "border-purple-500/30 bg-purple-500/10 text-purple-300", I: Icon.Cog };
  if (t.includes("electrical"))
    return { cls: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300", I: Icon.Bolt };
  if (t.includes("mot"))
    return { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", I: Icon.Calendar };
  if (t.includes("full service"))
    return { cls: "border-blue-500/30 bg-blue-500/10 text-blue-300", I: Icon.Wrench };
  if (t.includes("interim"))
    return { cls: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300", I: Icon.Wrench };
  if (t.includes("tyre"))
    return { cls: "border-orange-500/30 bg-orange-500/10 text-orange-300", I: Icon.Disc };
  if (t.includes("brake"))
    return { cls: "border-red-500/30 bg-red-500/10 text-red-300", I: Icon.Disc };
  if (t.includes("bodywork"))
    return { cls: "border-pink-500/30 bg-pink-500/10 text-pink-300", I: Icon.Car };
  return { cls: "border-slate-500/30 bg-slate-500/10 text-slate-300", I: Icon.Info };
}

function DarkSelect({
  value,
  onChange,
  options,
  placeholder,
  className = inputCls,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const selected = options.find((option) => option.value === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`${className} flex items-center justify-between text-left`}
      >
        <span className={selected ? "text-white" : "text-[#9aa5b8]"}>
          {selected?.label ?? placeholder ?? "Choose…"}
        </span>
        <span className="ml-3 text-[#cbd5e1]">▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-[80] mt-1 max-h-64 overflow-y-auto rounded-lg border p-1 shadow-2xl"
          style={{ borderColor: T.border, background: "#1e222b" }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-[#ff6a00] hover:text-white ${option.value === value ? "bg-[#ff6a00]/20 text-white" : "text-[#eef2f8]"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Driver Search ---------------- */
function DriverSearch({
  drivers,
  onPick,
  value,
  onTextChange,
}: {
  drivers: DriverTrack[];
  onPick: (d: DriverTrack) => void;
  value: string;
  onTextChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return drivers.slice(0, 8);
    return drivers
      .filter(
        (d) =>
          d.driver_name.toLowerCase().includes(q) ||
          d.registration.toLowerCase().includes(q) ||
          (d.phone && d.phone.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [value, drivers]);

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Select existing driver or type name..."
        className={inputCls}
      />
      {open && matches.length > 0 && (
        <div
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border shadow-xl"
          style={{ borderColor: T.border, background: T.panel }}
        >
          {matches.map((d) => (
            <button
              type="button"
              key={d.id}
              onClick={() => {
                onPick(d);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between border-b px-3 py-2 text-left hover:bg-[#ff6a00]/10"
              style={{ borderColor: T.borderSoft }}
            >
              <div className="flex-1 truncate">
                <div className="text-sm font-semibold">{d.driver_name}</div>
                <div className="text-xs text-[#8b95a8]">
                  {d.registration || "No Reg"} {d.phone ? `· ${d.phone}` : ""}
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="font-semibold text-white">{(d.current_mileage || 0).toLocaleString()} mi</div>
                <div className="text-[#8b95a8]">Allowance: {(d.allowance || 0).toLocaleString()} mi</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserSettingsView({
  account,
  toast,
}: {
  account: { email: string } | null;
  toast: (m: string, t?: Toast["type"]) => void;
}) {
  const email = account?.email || "admin@virtualcarhire.com";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [startView, setStartView] = useState(() => {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("vch_pref_start_view") || "/";
    }
    return "/";
  });

  const [rentAlerts, setRentAlerts] = useState(() => {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("vch_pref_rent_alerts") !== "disabled";
    }
    return true;
  });

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) {
      toast("Please enter a new password", "error");
      return;
    }
    if (newPassword.length < 6) {
      toast("Password must be at least 6 characters long", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("Passwords do not match", "error");
      return;
    }

    try {
      setUpdatingPassword(true);
      setPasswordSuccess(false);

      if (typeof window !== "undefined" && (window as any).__MOCK_AUTH__) {
        await new Promise((r) => setTimeout(r, 600));
        setPasswordSuccess(true);
        setNewPassword("");
        setConfirmPassword("");
        toast("Password updated successfully (mock session)");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        throw new Error(error.message);
      }

      setPasswordSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
      toast("Password updated successfully");
    } catch (err: any) {
      toast(err?.message || "Failed to update password", "error");
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleSavePreferences = () => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("vch_pref_start_view", startView);
      localStorage.setItem("vch_pref_rent_alerts", rentAlerts ? "enabled" : "disabled");
    }
    toast("Preferences saved successfully");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">User Settings</h1>
        <p className="mt-1 text-xs text-[#9aa5b8]">
          Manage your CRM staff account profile, credentials, and workspace preferences.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ACCOUNT PROFILE CARD */}
        <div
          className="rounded-2xl border p-5"
          style={{ borderColor: T.border, background: T.panel }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6a00] to-[#ff9d4d] text-lg font-bold text-white shadow-md">
              {email ? email[0].toUpperCase() : "A"}
            </div>
            <div>
              <div className="text-base font-bold text-white">{email}</div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#ff6a00]/30 bg-[#ff6a00]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ff8a3d]">
                Fleet Admin
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3 border-t pt-4" style={{ borderColor: T.borderSoft }}>
            <div className="flex justify-between text-xs">
              <span style={{ color: T.muted }}>Account Type</span>
              <span className="font-semibold text-white">CRM Staff Operator</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: T.muted }}>Access Role</span>
              <span className="font-semibold text-[#ff8a3d]">Full Administrator</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: T.muted }}>Authentication Provider</span>
              <span className="font-semibold text-white">Supabase Auth</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: T.muted }}>Status</span>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Active Session
              </span>
            </div>
          </div>
        </div>

        {/* CHANGE PASSWORD CARD */}
        <div
          className="rounded-2xl border p-5"
          style={{ borderColor: T.border, background: T.panel }}
        >
          <div className="flex items-center gap-2">
            <Icon.Key className="h-5 w-5 text-[#ff6a00]" />
            <h2 className="text-base font-bold text-white">Change Password</h2>
          </div>
          <p className="mt-1 text-xs text-[#9aa5b8]">
            Update your account password securely via Supabase Auth.
          </p>

          <form onSubmit={handlePasswordUpdate} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#9aa5b8] mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 chars)"
                className="w-full rounded-xl border bg-black/40 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#ff6a00] focus:outline-none"
                style={{ borderColor: T.borderSoft }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9aa5b8] mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-xl border bg-black/40 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#ff6a00] focus:outline-none"
                style={{ borderColor: T.borderSoft }}
              />
            </div>

            {passwordSuccess && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">
                ✓ Password changed successfully!
              </div>
            )}

            <button
              type="submit"
              disabled={updatingPassword}
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff9d4d] px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:opacity-90 disabled:opacity-50"
            >
              {updatingPassword ? "Updating Password..." : "Update Password"}
            </button>
          </form>
        </div>
      </div>

      {/* APP PREFERENCES */}
      <div
        className="rounded-2xl border p-5"
        style={{ borderColor: T.border, background: T.panel }}
      >
        <div className="flex items-center gap-2">
          <Icon.Cog className="h-5 w-5 text-[#ff6a00]" />
          <h2 className="text-base font-bold text-white">Account Preferences</h2>
        </div>
        <p className="mt-1 text-xs text-[#9aa5b8]">
          Customize default navigation behavior and automated portal notifications.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-[#9aa5b8] mb-1">
              Default Landing View
            </label>
            <select
              value={startView}
              onChange={(e) => setStartView(e.target.value)}
              className="w-full rounded-xl border bg-black/40 px-3 py-2 text-xs text-white focus:border-[#ff6a00] focus:outline-none"
              style={{ borderColor: T.borderSoft }}
            >
              <option value="/">Dashboard</option>
              <option value="/vehicles">Vehicles</option>
              <option value="/drivers">Drivers</option>
              <option value="/whatsapp-leads">WhatsApp Leads</option>
              <option value="/driver-mileage">Driver Mileage</option>
              <option value="/accident-cases">Accident Cases</option>
              <option value="/audit-logs">Audit Logs</option>
            </select>
          </div>

          <div className="flex items-center justify-between rounded-xl border p-3" style={{ borderColor: T.borderSoft, background: T.panel2 }}>
            <div>
              <div className="text-xs font-semibold text-white">Rent Alert Toasts</div>
              <div className="text-[11px] text-[#8b95a8]">
                Display system alerts for overdue driver rent
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRentAlerts(!rentAlerts)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                rentAlerts ? "bg-[#ff6a00]" : "bg-zinc-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  rentAlerts ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleSavePreferences}
            className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}

function AuditLogsView({
  data,
  toast,
}: {
  data: ReturnType<typeof useFleetData>;
  toast: (m: string, t?: Toast["type"]) => void;
}) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("[AuditLogs] Query warning:", error.message);
        setFetchError(error.message);
        setLogs([]);
        return;
      }
      setLogs((data as any) || []);
    } catch (err: any) {
      console.error("[AuditLogs] Exception loading audit logs:", err);
      setFetchError(err?.message || "Failed to load audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();

    const channel = supabase
      .channel("audit_logs_realtime_view")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        (payload) => {
          setLogs((prev) => [payload.new as any, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (!log) return false;
      const actionType = log.action_type || "";

      // Category filter
      if (categoryFilter !== "all") {
        if (categoryFilter === "driver" && !actionType.startsWith("driver")) return false;
        if (categoryFilter === "rent" && actionType !== "rent_updated") return false;
        if (categoryFilter === "charge" && actionType !== "charge_added") return false;
        if (categoryFilter === "invite" && actionType !== "invite_sent") return false;
        if (categoryFilter === "vehicle" && !actionType.startsWith("vehicle")) return false;
      }

      // Date filter
      if (dateFilter !== "all" && log.created_at) {
        const logDate = new Date(log.created_at).getTime();
        if (!isNaN(logDate)) {
          const now = Date.now();
          if (dateFilter === "today") {
            const startOfToday = new Date().setHours(0, 0, 0, 0);
            if (logDate < startOfToday) return false;
          } else if (dateFilter === "7days") {
            if (now - logDate > 7 * 24 * 60 * 60 * 1000) return false;
          } else if (dateFilter === "30days") {
            if (now - logDate > 30 * 24 * 60 * 60 * 1000) return false;
          }
        }
      }

      // Text search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const actorMatch = log.actor ? String(log.actor).toLowerCase().includes(q) : false;
        const actionMatch = actionType.toLowerCase().includes(q);
        const targetMatch = log.target_id ? String(log.target_id).toLowerCase().includes(q) : false;
        const detailsStr = typeof log.details === "object" && log.details !== null
          ? JSON.stringify(log.details).toLowerCase()
          : String(log.details || "").toLowerCase();
        const detailsMatch = detailsStr.includes(q);
        return actorMatch || actionMatch || targetMatch || detailsMatch;
      }

      return true;
    });
  }, [logs, categoryFilter, dateFilter, search]);

  const actionBadge = (actionType?: string | null) => {
    let colorCls = "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
    const safeType = actionType || "unknown";
    let label = safeType;

    switch (safeType) {
      case "driver_created":
        colorCls = "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
        label = "Driver Created";
        break;
      case "driver_edited":
        colorCls = "border-blue-500/30 bg-blue-500/10 text-blue-300";
        label = "Driver Edited";
        break;
      case "driver_deleted":
        colorCls = "border-red-500/30 bg-red-500/10 text-red-300";
        label = "Driver Deleted";
        break;
      case "rent_updated":
        colorCls = "border-amber-500/30 bg-amber-500/10 text-amber-300";
        label = "Rent Status Updated";
        break;
      case "charge_added":
        colorCls = "border-purple-500/30 bg-purple-500/10 text-purple-300";
        label = "Charge Added";
        break;
      case "invite_sent":
        colorCls = "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
        label = "Portal Invite Sent";
        break;
      case "vehicle_added":
        colorCls = "border-teal-500/30 bg-teal-500/10 text-teal-300";
        label = "Vehicle Added";
        break;
      case "vehicle_edited":
        colorCls = "border-indigo-500/30 bg-indigo-500/10 text-indigo-300";
        label = "Vehicle Edited";
        break;
      case "vehicle_deleted":
        colorCls = "border-rose-500/30 bg-rose-500/10 text-rose-300";
        label = "Vehicle Deleted";
        break;
    }

    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${colorCls}`}>
        {label}
      </span>
    );
  };

  const formatDetails = (details: Record<string, any> | null | undefined) => {
    if (!details || typeof details !== "object" || Array.isArray(details) || Object.keys(details).length === 0) {
      return <span className="text-zinc-500">—</span>;
    }

    const items: string[] = [];
    if (details.driver_name) items.push(`Driver: ${String(details.driver_name)}`);
    if (details.reg) items.push(`Reg: ${String(details.reg).toUpperCase()}`);
    if (details.amount !== undefined && details.amount !== null) items.push(`Amount: £${details.amount}`);
    if (details.description) items.push(`Description: "${String(details.description)}"`);
    if (details.previous_status && details.new_status) {
      items.push(`Rent: ${String(details.previous_status).toUpperCase()} ➔ ${String(details.new_status).toUpperCase()}`);
    }
    if (details.make || details.model) items.push(`Vehicle: ${details.make || ""} ${details.model || ""}`.trim());

    if (items.length > 0) {
      return <span className="text-xs font-medium text-[#c8d0dd]">{items.join(" · ")}</span>;
    }

    try {
      return <span className="font-mono text-[11px] text-[#8b95a8]">{JSON.stringify(details)}</span>;
    } catch {
      return <span className="text-zinc-500">—</span>;
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">System Audit Logs</h1>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
              Append-Only
            </span>
          </div>
          <p className="mt-1 text-xs text-[#9aa5b8]">
            Complete record of driver mutations, rent payment changes, charges, invites, and vehicle updates.
          </p>
        </div>

        <button
          onClick={loadLogs}
          className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
          style={{ borderColor: T.border, background: T.panel }}
        >
          <Icon.RotateCcw className="h-3.5 w-3.5" />
          Refresh Logs
        </button>
      </div>

      {/* RECENTLY DELETED DRIVERS (48-HOUR RECOVERY) */}
      {data.deletedDrivers.length > 0 && (
        <div
          className="rounded-2xl border p-4 space-y-3"
          style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon.Alert className="h-4 w-4 text-red-400" />
              <h3 className="text-sm font-bold text-white">
                Recently Deleted Drivers ({data.deletedDrivers.length}) — 48-Hour Recovery Window
              </h3>
            </div>
            <span className="text-[10px] font-bold text-red-300 bg-red-500/20 px-2 py-0.5 rounded-full border border-red-500/30">
              Soft-Deleted
            </span>
          </div>

          <div className="space-y-2">
            {data.deletedDrivers.map((d) => {
              const deletedTime = d.deleted_at ? new Date(d.deleted_at).getTime() : Date.now();
              const expiresAt = deletedTime + 48 * 3600 * 1000;
              const msLeft = expiresAt - Date.now();
              const hoursLeft = Math.max(0, Math.floor(msLeft / (3600 * 1000)));
              const minsLeft = Math.max(0, Math.floor((msLeft % (3600 * 1000)) / (60 * 1000)));

              return (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 bg-black/40 border-white/10"
                >
                  <div className="flex items-center gap-3">
                    <UKPlate reg={d.registration} size="sm" />
                    <div>
                      <div className="text-xs font-bold text-white">{d.driver_name}</div>
                      <div className="text-[11px] text-[#8b95a8]">
                        Deleted: {d.deleted_at ? new Date(d.deleted_at).toLocaleString("en-GB") : "Recently"} ·{" "}
                        <span className="text-amber-300 font-semibold">{hoursLeft}h {minsLeft}m left before permanent purge</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await data.restoreDriver(d.id);
                        toast(`Driver ${d.driver_name} restored successfully! Portal access restored.`, "info");
                      } catch (err: any) {
                        toast(err?.message ?? "Failed to restore driver", "error");
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 transition"
                  >
                    <Icon.RotateCcw className="h-3.5 w-3.5" />
                    Restore Driver & Portal
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FILTER BAR */}
      <div
        className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-3"
        style={{ borderColor: T.border, background: T.panel }}
      >
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8b95a8] mb-1">
            Search Keyword / Driver / Reg
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs by keyword..."
            className="w-full rounded-xl border bg-black/40 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#ff6a00] focus:outline-none"
            style={{ borderColor: T.borderSoft }}
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8b95a8] mb-1">
            Action Category
          </label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full rounded-xl border bg-black/40 px-3 py-2 text-xs text-white focus:border-[#ff6a00] focus:outline-none"
            style={{ borderColor: T.borderSoft }}
          >
            <option value="all">All Actions</option>
            <option value="driver">Driver Actions</option>
            <option value="rent">Rent Updates</option>
            <option value="charge">Charges Added</option>
            <option value="invite">Portal Invites</option>
            <option value="vehicle">Vehicle Actions</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8b95a8] mb-1">
            Time Period
          </label>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full rounded-xl border bg-black/40 px-3 py-2 text-xs text-white focus:border-[#ff6a00] focus:outline-none"
            style={{ borderColor: T.borderSoft }}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
          </select>
        </div>
      </div>

      {/* LOGS TABLE / LIST */}
      <div
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: T.border, background: T.panel }}
      >
        {loading ? (
          <div className="p-12 text-center text-xs text-[#9aa5b8]">Loading audit log records…</div>
        ) : fetchError ? (
          <div className="p-8 text-center text-xs text-[#9aa5b8]">
            <div className="text-amber-400 font-semibold mb-1">Audit Logs Currently Unavailable</div>
            <div className="text-[11px] text-[#8b95a8]">{fetchError}</div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#9aa5b8]">
            No audit log entries matching your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-black/30 text-[10px] font-bold uppercase tracking-wider text-[#8b95a8]" style={{ borderColor: T.borderSoft }}>
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Details / Target</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: T.borderSoft }}>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-4 py-3 text-[#8b95a8]">
                      {log.created_at && !isNaN(new Date(log.created_at).getTime())
                        ? new Date(log.created_at).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-white">
                      {log.actor || "Fleet Admin"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {actionBadge(log.action_type)}
                    </td>
                    <td className="px-4 py-3">
                      {formatDetails(log.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceTypePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedStyle = serviceStyle(value);
  const SelectedIcon = selectedStyle.I;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") setOpen(false);
        }}
        className={`${inputCls} flex w-full items-center justify-between gap-3 text-left text-white`}
        style={{ background: "#242936", color: T.text }}
      >
        <span className="flex items-center gap-2">
          <SelectedIcon className={`h-4 w-4 ${selectedStyle.cls.split(" ").pop()}`} />
          {value}
        </span>
        <span className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Service type"
          className="absolute left-0 right-0 z-40 mt-2 max-h-72 overflow-y-auto rounded-xl border p-1 shadow-2xl"
          style={{ borderColor: T.border, background: "#151a25" }}
        >
          {SERVICE_TYPES.map((service) => {
            const style = serviceStyle(service);
            const ServiceIcon = style.I;
            return (
              <button
                key={service}
                type="button"
                role="option"
                aria-selected={service === value}
                onClick={() => {
                  onChange(service);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/10 ${service === value ? "bg-white/10" : ""}`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-md border ${style.cls}`}
                >
                  <ServiceIcon className="h-4 w-4" />
                </span>
                <span className="text-white">{service}</span>
                {service === value && (
                  <span className="ml-auto text-xs text-[#ff9a5c]">Selected</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- UK Plate ---------------- */
export function UKPlate({ reg, size = "md" }: { reg: string; size?: "sm" | "md" | "lg" }) {
  const h = size === "sm" ? "h-7" : size === "lg" ? "h-11" : "h-9";
  const txt = size === "sm" ? "text-sm" : size === "lg" ? "text-2xl" : "text-lg";
  const padX = size === "sm" ? "px-2" : "px-3";
  return (
    <span
      className={`inline-flex ${h} items-stretch overflow-hidden rounded-lg border-2 border-black/70 shadow-sm`}
    >
      <span className="flex w-7 flex-col items-center justify-center bg-[#003399] text-white">
        <span className="text-[8px] leading-none">★</span>
        <span className="text-[10px] font-bold leading-none">UK</span>
      </span>
      <span
        className={`flex items-center justify-center bg-[#f5c518] font-mono font-bold tracking-[0.15em] text-black ${padX} ${txt}`}
      >
        {reg.toUpperCase()}
      </span>
    </span>
  );
}

/* ---------------- App ---------------- */
export type View =
  | "dashboard"
  | "vehicles"
  | "add"
  | "services"
  | "log-service"
  | "mileage"
  | "drivers"
  | "leads"
  | "accidents"
  | "generations"
  | "settings"
  | "audit-logs";

export const VIEW_PATH: Record<View, string> = {
  dashboard: "/",
  vehicles: "/vehicles",
  add: "/add-vehicle",
  services: "/service-history",
  "log-service": "/service-history/new",
  mileage: "/driver-mileage",
  drivers: "/drivers",
  leads: "/whatsapp-leads",
  accidents: "/accident-cases",
  generations: "/generations",
  settings: "/settings",
  "audit-logs": "/audit-logs",
};

export const regSlug = (reg: string) => reg.replace(/\s+/g, "").toUpperCase();

function FleetApp() {
  return (
    <RouteErrorBoundary
      fallbackTitle="Dashboard Error"
      fallbackMessage="An unexpected error occurred while loading the dashboard. Please try reloading."
    >
      <FleetShell view="dashboard" />
    </RouteErrorBoundary>
  );
}

export function FleetShell({ view }: { view: View }) {
  if (typeof window === "undefined") return null;

  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [account, setAccount] = useState<{ email: string } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [apexOpen, setApexOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const data = useFleetData();

  const go = (v: View) => navigate({ to: VIEW_PATH[v] });

  useEffect(() => {
    let cancelled = false;
    if (typeof window !== "undefined" && (window as any).__MOCK_AUTH__) {
      setAuthed(true);
      setAccount({ email: "admin@virtualcarhire.com" });
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[Auth] Error fetching session:", error);
          setAuthError(error.message);
          navigate({ to: "/login" });
          return;
        }
        if (!data?.session) {
          console.info("[Auth] No active session found, redirecting to /login");
          navigate({ to: "/login" });
        } else {
          setAuthed(true);
          setAccount({ email: data.session.user.email ?? "" });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[Auth] Exception during session check:", err);
        setAuthError(err?.message ?? "Session validation failed");
        navigate({ to: "/login" });
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session && !((window as any).__MOCK_AUTH__)) {
        navigate({ to: "/login" });
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const toast = useCallback((msg: string, type: Toast["type"] = "success") => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 10000);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  if (!authed) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center px-4 text-[#eef2f8]"
        style={{ background: T.bg }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 animate-pulse items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-[#ff7a1a] to-[#ff9d52] text-white shadow-[0_18px_40px_-12px_rgba(255,106,0,0.7)]">
            <img
              src="/vch-logo.png"
              alt="Virtual Car Hire"
              className="h-full w-full object-contain p-0.5"
            />
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#ff8a3d]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#ff8a3d] border-t-transparent" />
            <span>Authenticating session…</span>
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

  return (
    <div
      className="vch-app relative min-h-screen overflow-x-hidden text-[#eef2f8]"
      style={{ background: T.bg }}
    >
      <div className="vch-glow" />
      {isOffline && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500/90 px-4 py-2 text-center text-xs font-bold text-slate-950 shadow-md backdrop-blur-md">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4 shrink-0">
            <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
          </svg>
          <span>You are offline — viewing cached fleet data</span>
        </div>
      )}
      <Sidebar
        view={view}
        setView={(next) => {
          setMobileNavOpen(false);
          go(next);
        }}
        onSignOut={signOut}
        account={account}
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onOpenApex={() => setApexOpen((prev) => !prev)}
      />
      <div className="relative z-10 ml-0 lg:ml-64 pb-24 lg:pb-6">
        <Topbar vehicles={data.vehicles} goto={go} onMenu={() => setMobileNavOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] p-3 sm:p-5 xl:p-6">
          {data.loading ? (
            <div
              className="rounded-xl border p-12 text-center text-sm"
              style={{ borderColor: T.border, background: T.panel, color: T.muted }}
            >
              Loading fleet data…
            </div>
          ) : view === "dashboard" ? (
            <Dashboard
              vehicles={data.vehicles}
              services={data.services}
              drivers={data.drivers}
              goto={go}
            />
          ) : view === "vehicles" ? (
            <VehiclesList
              vehicles={data.vehicles}
              drivers={data.drivers}
              onAdd={() => go("add")}
              onOpen={(v) =>
                navigate({ to: "/vehicles/$reg", params: { reg: regSlug(v.registration) } })
              }
            />
          ) : view === "add" ? (
            <AddVehicle
              vehicles={data.vehicles}
              onSave={async (v) => {
                try {
                  await data.saveVehicle(v, true);
                  toast(`Vehicle ${v.registration} added`);
                  go("vehicles");
                } catch (e: any) {
                  toast(e?.message ?? "Failed to save", "error");
                }
              }}
              onCancel={() => go("vehicles")}
              toast={toast}
            />
          ) : view === "services" ? (
            <ServicesList
              services={data.services}
              vehicles={data.vehicles}
              onAdd={() => go("log-service")}
              onDelete={async (id) => {
                await data.deleteService(id);
                toast("Service record removed", "info");
              }}
            />
          ) : view === "log-service" ? (
            <LogService
              vehicles={data.vehicles}
              onSave={async (rec) => {
                try {
                  await data.addService(rec);
                  toast("Service record saved");
                  go("services");
                } catch (e: any) {
                  toast(e?.message ?? "Failed", "error");
                }
              }}
              onCancel={() => go("services")}
            />
          ) : view === "mileage" ? (
            <RouteErrorBoundary
              fallbackTitle="Driver Mileage Error"
              fallbackMessage="An error occurred while loading the Driver Mileage tracking page."
            >
              <MileageView
                vehicles={data.vehicles}
                drivers={data.drivers}
                data={data}
                toast={toast}
              />
            </RouteErrorBoundary>
          ) : view === "drivers" ? (
            <RouteErrorBoundary
              fallbackTitle="Drivers Management Error"
              fallbackMessage="An error occurred while loading the Drivers directory or driver profile popup."
            >
              <DriversView
                vehicles={data.vehicles}
                drivers={data.drivers}
                data={data}
                toast={toast}
              />
            </RouteErrorBoundary>
          ) : view === "leads" ? (
            <WhatsAppLeadsView toast={toast} />
          ) : view === "accidents" ? (
            <AccidentCasesView toast={toast} />
          ) : view === "generations" ? (
            <GenerationsView vehicles={data.vehicles} drivers={data.drivers} toast={toast} />
          ) : view === "settings" ? (
            <UserSettingsView account={account} toast={toast} />
          ) : view === "audit-logs" ? (
            <RouteErrorBoundary
              fallbackTitle="Audit Logs Error"
              fallbackMessage="An error occurred while loading system audit logs."
            >
              <AuditLogsView data={data} toast={toast} />
            </RouteErrorBoundary>
          ) : null}
        </main>
      </div>

      <MobileBottomNav
        currentView={view}
        goto={go}
        onOpenApex={() => setApexOpen(true)}
      />

      <ApexAssistant
        vehicles={data.vehicles}
        services={data.services}
        drivers={data.drivers}
        open={apexOpen}
        onOpenChange={setApexOpen}
      />

      {editingVehicle && (
        <EditVehicleModal
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSave={async (v) => {
            try {
              await data.saveVehicle(v, false);
              setEditingVehicle(null);
              toast("Vehicle updated");
            } catch (e: any) {
              toast(e?.message ?? "Failed", "error");
            }
          }}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="min-w-[260px] rounded-lg border px-4 py-3 shadow-xl"
            style={{
              borderColor:
                t.type === "success"
                  ? "rgba(34,197,94,0.3)"
                  : t.type === "error"
                    ? "rgba(239,68,68,0.3)"
                    : T.border,
              background: T.panel,
            }}
          >
            <div className="flex items-start gap-2">
              <div
                className={`mt-0.5 h-2 w-2 rounded-full ${t.type === "success" ? "bg-green-500" : t.type === "error" ? "bg-red-500" : "bg-[#ff6a00]"}`}
              />
              <div className="flex-1 text-sm">{t.msg}</div>
              <button
                className="text-[#8b95a8] hover:text-white"
                onClick={() => setToasts((tt) => tt.filter((x) => x.id !== t.id))}
              >
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
function Sidebar({
  view,
  setView,
  onSignOut,
  account,
  mobileOpen,
  onClose,
  onOpenApex,
}: {
  view: View;
  setView: (v: View) => void;
  onSignOut: () => void;
  account: { email: string } | null;
  mobileOpen: boolean;
  onClose: () => void;
  onOpenApex: () => void;
}) {
  type NavItem = {
    id: View;
    label: string;
    Icon: (p: { className?: string }) => React.ReactElement;
  };

  const fleetItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", Icon: Icon.Dashboard },
    { id: "vehicles", label: "Vehicles", Icon: Icon.Car },
    { id: "services", label: "Service History", Icon: Icon.Wrench },
    { id: "generations", label: "Reservations / Contracts", Icon: Icon.Calendar },
    { id: "add", label: "Add Vehicle", Icon: Icon.Plus },
  ];

  const driverItems: NavItem[] = [
    { id: "drivers", label: "Drivers", Icon: Icon.User },
    { id: "mileage", label: "Driver Mileage", Icon: Icon.Gauge },
    { id: "leads", label: "WhatsApp Leads", Icon: Icon.Chat },
    { id: "accidents", label: "Accident Cases", Icon: Icon.Crash },
  ];

  const email = account?.email ?? "";
  const initial = (email.trim()[0] ?? "V").toUpperCase();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [accountMenuOpen]);

  const renderNavItem = (it: NavItem) => {
    const active = view === it.id;
    return (
      <button
        key={it.id}
        onClick={() => setView(it.id)}
        className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm transition-colors min-h-[44px]"
        style={
          active
            ? {
                background: T.orangeSoft,
                color: T.orange,
                fontWeight: 600,
                boxShadow: "inset 0 0 0 1px rgba(255,106,0,0.28)",
              }
            : { color: "#c5cbd6" }
        }
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.background = T.panel2;
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.background = "transparent";
        }}
      >
        <it.Icon className="h-4 w-4 shrink-0" />
        <span>{it.label}</span>
      </button>
    );
  };

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(19rem,88vw)] max-w-[88vw] flex-col border-r pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-transform duration-200 lg:z-30 lg:w-64 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          borderColor: T.border,
          background: "rgba(12,16,27,0.96)",
          backdropFilter: "blur(24px)",
        }}
      >
        <div className="flex items-center gap-3 px-5 py-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#ff6a00]/30 shadow-md"
            style={{ background: "linear-gradient(135deg,#0b0d12,#1e222b)" }}
          >
            <img
              src="/vch-logo.png"
              alt="Virtual Car Hire Logo"
              className="h-full w-full object-contain p-0.5"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold leading-tight text-white">
              Virtual Car Hire
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8b95a8]">
              Fleet Tracker
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-xl p-2 text-[#8b95a8] transition hover:bg-white/[0.08] hover:text-white lg:hidden"
          >
            <Icon.X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {/* FLEET SECTION */}
          <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7d8799]">
            Fleet
          </div>
          <div className="space-y-1">{fleetItems.map(renderNavItem)}</div>

          {/* DIVIDER */}
          <div className="my-3 border-t border-white/[0.08]" />

          {/* DRIVERS SECTION */}
          <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7d8799]">
            Drivers
          </div>
          <div className="space-y-1">{driverItems.map(renderNavItem)}</div>
        </nav>

        <div className="border-t p-3" style={{ borderColor: T.border }}>
          {/* Apex AI button directly above admin email box */}
          <button
            onClick={onOpenApex}
            className="mb-2.5 flex w-full items-center gap-2.5 rounded-2xl border border-[#ff6a00]/30 bg-[#ff6a00]/10 px-3 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-[#ff6a00]/20"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6a00] to-[#ff9d4d] text-white shadow-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M12 3l1.8 4.9L19 9.7l-4.4 3 .5 5.3-3.1-2.5-3.1 2.5.5-5.3-4.4-3 5.2-1.8z" />
              </svg>
            </span>
            <span>Apex AI Assistant</span>
          </button>

          <div className="relative" ref={accountMenuRef}>
            {accountMenuOpen && (
              <div
                className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-2xl border bg-[#0d121f] p-1.5 shadow-2xl backdrop-blur-xl z-50"
                style={{ borderColor: T.border }}
              >
                <div className="px-3 py-2 border-b border-white/10 mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#8b95a8]">Account Options</p>
                  <p className="truncate text-xs font-semibold text-white">{email || "Fleet Admin"}</p>
                </div>

                <button
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setView("settings");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white"
                >
                  <Icon.Cog className="h-4 w-4 text-[#ff6a00]" />
                  <span>User Settings</span>
                </button>

                <button
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setView("audit-logs");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white"
                >
                  <Icon.Shield className="h-4 w-4 text-emerald-400" />
                  <span>Audit Logs</span>
                </button>

                <div className="my-1 border-t border-white/10" />

                <button
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onSignOut();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
                >
                  <Icon.SignOut className="h-4 w-4" />
                  <span>Log out</span>
                </button>
              </div>
            )}

            <div
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition hover:border-[#ff6a00]/50 hover:bg-white/[0.08]"
              style={{ borderColor: accountMenuOpen ? T.orange : T.borderSoft, background: T.panel2 }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setAccountMenuOpen(!accountMenuOpen);
                }
              }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6a00] to-[#ff9d4d] text-sm font-bold text-white shadow-sm">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-[#e7eaf0]">
                  {email || "Signed in"}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b95a8]">
                  Fleet Admin
                </div>
              </div>
              <div className="shrink-0 text-[#8b95a8]">
                <Icon.ChevronUp className={`h-4 w-4 transition-transform ${accountMenuOpen ? "rotate-180 text-[#ff6a00]" : ""}`} />
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] text-[#8b95a8]">
            Powered by{" "}
            <a
              href={WEBSITE_BASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#ff6a00] hover:text-[#ff8a3d]"
            >
              Virtual Car Hire
            </a>
          </p>
        </div>
      </aside>
    </>
  );
}

function MobileBottomNav({
  currentView,
  goto,
  onOpenApex,
}: {
  currentView: View;
  goto: (v: View) => void;
  onOpenApex: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  type PrimaryTab = {
    id: View;
    label: string;
    Icon: (p: { className?: string }) => React.ReactElement;
  };

  const primaryTabs: PrimaryTab[] = [
    { id: "dashboard", label: "Dashboard", Icon: Icon.Dashboard },
    { id: "vehicles", label: "Vehicles", Icon: Icon.Car },
    { id: "services", label: "Service", Icon: Icon.Wrench },
    { id: "drivers", label: "Drivers", Icon: Icon.User },
  ];

  type SecondaryItem = {
    id: View;
    label: string;
    description: string;
    Icon: (p: { className?: string }) => React.ReactElement;
  };

  const secondaryItems: SecondaryItem[] = [
    {
      id: "leads",
      label: "WhatsApp Leads",
      description: "Inbound chats & lead triage",
      Icon: Icon.Chat,
    },
    {
      id: "mileage",
      label: "Driver Mileage",
      description: "Log and track monthly miles",
      Icon: Icon.Gauge,
    },
    {
      id: "accidents",
      label: "Accident Cases",
      description: "Incident logs & reports",
      Icon: Icon.Crash,
    },
    {
      id: "generations",
      label: "Reservations / Contracts",
      description: "Permission letters & contracts",
      Icon: Icon.Calendar,
    },
    {
      id: "add",
      label: "Add Vehicle",
      description: "Add new vehicle to fleet",
      Icon: Icon.Plus,
    },
    {
      id: "settings",
      label: "User Settings",
      description: "Manage password & preferences",
      Icon: Icon.Cog,
    },
    {
      id: "audit-logs",
      label: "Audit Logs",
      description: "System mutation & activity history",
      Icon: Icon.Shield,
    },
  ];

  const isSecondaryActive = secondaryItems.some((item) => item.id === currentView);

  return (
    <>
      {/* Fixed Bottom Tab Bar for Mobile */}
      <nav
        className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-around border-t bg-[#0c101b]/95 backdrop-blur-2xl px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden shadow-2xl"
        style={{ borderColor: T.border }}
        aria-label="Mobile Navigation"
      >
        {primaryTabs.map((tab) => {
          const active = currentView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setMoreOpen(false);
                goto(tab.id);
              }}
              className="flex flex-1 flex-col items-center justify-center py-1 text-[11px] font-medium transition-colors min-h-[48px] touch-manipulation"
              style={{ color: active ? T.orange : "#9aa5b8" }}
            >
              <tab.Icon
                className={`h-5 w-5 mb-0.5 ${active ? "scale-110 transition-transform text-[#ff8a3d]" : ""}`}
              />
              <span className={active ? "font-bold text-[#ff8a3d]" : ""}>{tab.label}</span>
            </button>
          );
        })}

        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center justify-center py-1 text-[11px] font-medium transition-colors min-h-[48px] touch-manipulation"
          style={{ color: isSecondaryActive || moreOpen ? T.orange : "#9aa5b8" }}
        >
          <Icon.Menu
            className={`h-5 w-5 mb-0.5 ${isSecondaryActive || moreOpen ? "scale-110 transition-transform text-[#ff8a3d]" : ""}`}
          />
          <span className={isSecondaryActive || moreOpen ? "font-bold text-[#ff8a3d]" : ""}>
            More
          </span>
        </button>
      </nav>

      {/* "More" Bottom Sheet Drawer */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-white/15 bg-[#0f1422] p-5 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Drag Handle */}
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20" />

            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">More Options</h3>
                <p className="text-xs text-[#8b95a8]">Quick access to remaining fleet features</p>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                className="rounded-full border p-2 text-[#8b95a8] hover:bg-white/10 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
                style={{ borderColor: T.borderSoft }}
              >
                <Icon.X className="h-4 w-4" />
              </button>
            </div>

            {/* Apex AI Button in More Menu */}
            <button
              onClick={() => {
                setMoreOpen(false);
                onOpenApex();
              }}
              className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-[#ff6a00]/40 bg-[#ff6a00]/15 p-3.5 text-left text-sm font-semibold text-white shadow-md active:scale-[0.98] transition-transform min-h-[52px]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff6a00] to-[#ff9d4d] text-white shadow-sm">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="M12 3l1.8 4.9L19 9.7l-4.4 3 .5 5.3-3.1-2.5-3.1 2.5.5-5.3-4.4-3 5.2-1.8z" />
                </svg>
              </span>
              <div className="flex-1">
                <div className="font-bold text-white">Apex AI Assistant</div>
                <div className="text-xs text-[#ffb27e]">Ask anything about your fleet</div>
              </div>
            </button>

            <div className="space-y-2">
              {secondaryItems.map((item) => {
                const active = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setMoreOpen(false);
                      goto(item.id);
                    }}
                    className="flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-colors min-h-[52px] touch-manipulation"
                    style={
                      active
                        ? {
                            background: T.orangeSoft,
                            borderColor: "rgba(255,106,0,0.4)",
                          }
                        : {
                            background: T.panel,
                            borderColor: T.borderSoft,
                          }
                    }
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                      style={
                        active
                          ? {
                              borderColor: T.orange,
                              color: T.orange,
                              background: "rgba(255,106,0,0.15)",
                            }
                          : { borderColor: T.borderSoft, color: "#aeb8c9", background: T.panel2 }
                      }
                    >
                      <item.Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-bold ${active ? "text-[#ff8a3d]" : "text-white"}`}
                      >
                        {item.label}
                      </div>
                      <div className="text-xs text-[#8b95a8]">{item.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Topbar({
  vehicles,
  goto,
  onMenu,
}: {
  vehicles: Vehicle[];
  goto: (v: View) => void;
  onMenu: () => void;
}) {
  const total = vehicles.length;
  const active = vehicles.filter((vehicle) => vehicle.status === "Active").length;
  const rented = vehicles.filter((vehicle) => vehicle.status === "Rented").length;
  const alertCount = vehicles.filter((vehicle) => {
    const dates = [vehicle.next_mot_date, vehicle.insurance_expiry];
    return dates.some((date) => {
      if (!date) return false;
      const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
      return !Number.isNaN(days) && days <= 30;
    });
  }).length;

  const statusItems = [
    { label: `${total} Vehicles`, tone: "text-[#aeb8c9]" },
    { label: `${active} Active`, tone: "text-emerald-300" },
    { label: `${rented} Rented`, tone: "text-sky-300" },
  ];

  return (
    <header
      className="sticky top-0 z-20 flex h-[56px] items-center gap-3 border-b px-3 sm:px-6 xl:px-8"
      style={{
        borderColor: T.border,
        background: "rgba(8,11,19,0.88)",
        backdropFilter: "blur(20px)",
      }}
    >
      <button
        onClick={onMenu}
        className="rounded-lg border p-1.5 text-[#c5cbd6] transition hover:bg-white/10 lg:hidden"
        style={{ borderColor: T.borderSoft }}
        aria-label="Open navigation"
      >
        <Icon.Menu className="h-4 w-4" />
      </button>
      <span
        className="inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#ff8a3d]"
        style={{ background: T.orangeSoft }}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff6a00]/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#ff6a00]" />
        </span>
        <span>VCH Fleet</span>
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#ffb27e]">
          Live
        </span>
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <div className="flex items-center divide-x divide-white/[0.08] rounded-lg border border-white/[0.06] bg-white/[0.018] px-1 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
          {statusItems.map((item) => (
            <span
              key={item.label}
              className={`px-2 text-[11px] font-medium whitespace-nowrap sm:px-3 ${item.tone}`}
            >
              {item.label}
            </span>
          ))}
          <button
            onClick={() => goto("dashboard")}
            title={alertCount ? `${alertCount} fleet alerts` : "No fleet alerts"}
            aria-label={alertCount ? `${alertCount} fleet alerts` : "No fleet alerts"}
            className={`px-2 text-[11px] font-semibold whitespace-nowrap transition hover:text-white sm:px-3 ${alertCount ? "text-orange-300" : "text-[#758096]"}`}
          >
            <span
              className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
              style={{ background: alertCount ? "#f97316" : "#596579" }}
            />
            {alertCount} Alert{alertCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="hidden text-[10px] font-medium text-[#748096] md:inline">
          Updated just now
        </span>
        <button
          onClick={() => goto("dashboard")}
          title="View dashboard alerts"
          aria-label="View dashboard alerts"
          className="relative rounded-lg p-1.5 text-[#aeb8c9] transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6a00]/60"
        >
          <span
            className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${alertCount ? "bg-orange-400" : "bg-[#596579]"}`}
          />
          <Icon.Alert className="h-4 w-4" />
        </button>
        <button
          onClick={() => goto("leads")}
          title="Open WhatsApp messages"
          aria-label="Open WhatsApp messages"
          className="relative rounded-lg p-1.5 text-[#aeb8c9] transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6a00]/60"
        >
          <Icon.Chat className="h-4 w-4" />
        </button>
        <button
          onClick={() => goto("services")}
          title="Open service calendar"
          aria-label="Open service calendar"
          className="rounded-lg p-1.5 text-[#aeb8c9] transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6a00]/60"
        >
          <Icon.Calendar className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function GlobalSearch({
  vehicles,
  drivers,
  services,
  goto,
}: {
  vehicles: Vehicle[];
  drivers: DriverTrack[];
  services: ServiceRecord[];
  goto: (v: View) => void;
}) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const q = query.trim().toLowerCase();

  const cleanQ = q.replace(/[^a-z0-9]/g, "");
  const results = q
    ? [
        ...vehicles
          .filter((v) => {
            const rawText = `${v.registration} ${v.make} ${v.model}`.toLowerCase();
            const cleanText = rawText.replace(/[^a-z0-9]/g, "");
            return rawText.includes(q) || (cleanQ.length > 0 && cleanText.includes(cleanQ));
          })
          .slice(0, 5)
          .map((v) => ({
            label: simplifyVehicleName(v),
            meta: v.registration,
            searchKey: v.registration,
            view: "vehicles" as View,
          })),
        ...drivers
          .filter((d) => `${d.driver_name} ${d.phone} ${d.registration}`.toLowerCase().includes(q))
          .slice(0, 5)
          .map((d) => ({
            label: d.driver_name,
            meta: `${d.phone || "No phone"} · ${d.registration}`,
            searchKey: d.driver_name,
            view: "drivers" as View,
          })),
        ...services
          .filter((s) =>
            `${s.registration} ${s.service_type} ${s.description}`.toLowerCase().includes(q),
          )
          .slice(0, 5)
          .map((s) => ({
            label: s.service_type,
            meta: `${s.registration} · ${s.description || "Service record"}`,
            searchKey: s.registration,
            view: "services" as View,
          })),
        ...(q.includes("lead") || q.includes("whatsapp")
          ? [
              {
                label: "WhatsApp Leads",
                meta: "Open customer conversations",
                searchKey: "lead",
                view: "leads" as View,
              },
            ]
          : []),
        ...(q.includes("accident") || q.includes("crash")
          ? [
              {
                label: "Accident Cases",
                meta: "Open accident reports",
                searchKey: "accident",
                view: "accidents" as View,
              },
            ]
          : []),
        ...(q.includes("generation") || q.includes("contract") || q.includes("permission")
          ? [
              {
                label: "Generations",
                meta: "Permission letters and contracts",
                searchKey: "generation",
                view: "generations" as View,
              },
            ]
          : []),
      ].slice(0, 8)
    : [];

  const handleSelect = (r: { view: View; searchKey: string }) => {
    const basePath = VIEW_PATH[r.view];
    const targetUrl = `${basePath}?q=${encodeURIComponent(r.searchKey)}`;
    navigate({ to: targetUrl });
    setQuery("");
  };

  return (
    <div className="relative min-w-0 flex-1">
      <div
        className="flex items-center gap-2 rounded-xl border border-t-0 px-3 py-2 transition-colors focus-within:border-[#ff6a00]/40"
        style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.025)" }}
      >
        <Icon.Search className="h-4 w-4 shrink-0 text-[#8b95a8]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vehicles, drivers, services..."
          className="min-w-0 flex-1 appearance-none bg-transparent text-sm text-white outline-none placeholder:text-[#6b7488] focus:outline-none focus:ring-0"
          aria-label="Search CRM"
        />
        <kbd
          className="hidden rounded border px-1.5 py-0.5 text-[10px] text-[#8b95a8] sm:block"
          style={{ borderColor: T.borderSoft }}
        >
          ⌘ K
        </kbd>
      </div>
      {results.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border p-1 shadow-2xl"
          style={{
            borderColor: T.border,
            background: "rgba(12,16,27,0.96)",
            backdropFilter: "blur(20px)",
          }}
        >
          {results.map((r, i) => (
            <button
              key={`${r.label}-${i}`}
              onClick={() => handleSelect(r)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.08]"
            >
              <span className="truncate text-sm font-semibold text-white">{r.label}</span>
              <span className="ml-3 truncate text-xs text-[#8b95a8]">{r.meta}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({
  vehicles,
  services,
  drivers,
  goto,
}: {
  vehicles: Vehicle[];
  services: ServiceRecord[];
  drivers: DriverTrack[];
  goto: (v: View) => void;
}) {
  const total = vehicles.length;
  const inService = vehicles.filter((v) => v.status === "In Service").length;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = vehicles.filter(
    (v) =>
      (v.next_service_date && v.next_service_date < today) ||
      (v.next_mot_date && v.next_mot_date < today) ||
      (v.insurance_expiry && v.insurance_expiry < today),
  ).length;
  const grossSpend = services.reduce((a, s) => a + (s.cost || 0), 0);

  const statusCounts = {
    Active: vehicles.filter((v) => v.status === "Active").length,
    "In Service": inService,
    Rented: vehicles.filter((v) => v.status === "Rented").length,
    "Off Road": vehicles.filter((v) => v.status === "Off Road").length,
  };

  const monthlyMap = new Map<string, number>();
  services.forEach((s) => {
    const k = (s.service_date || "").slice(0, 7);
    if (!k) return;
    monthlyMap.set(k, (monthlyMap.get(k) || 0) + (s.cost || 0));
  });
  const monthly = Array.from(monthlyMap.entries()).sort().slice(-6);

  // End of month reminders: fires 1 day before the due date (start_date + 1 month)
  // and stays until the driver's mileage is updated (closeMonth resets start_date).
  const now = Date.now();
  const eomReminders = drivers
    .map((d) => {
      const start = new Date(d.start_date);
      const dueDate = new Date(start);
      dueDate.setMonth(dueDate.getMonth() + 1);
      const days = Math.ceil((dueDate.getTime() - now) / 86400000);
      return { d, dueDate, days };
    })
    .filter((x) => x.days <= 1)
    .sort((a, b) => a.days - b.days);

  // Expiry alerts: MOT & PCO expiring within 30 days or expired
  const expiryAlerts = vehicles
    .flatMap((v) => {
      const items: { v: Vehicle; type: "MOT" | "PCO License"; date: string; days: number }[] = [];
      const check = (type: "MOT" | "PCO License", date: string) => {
        if (!date) return;
        const t = new Date(date).getTime();
        if (isNaN(t)) return;
        const days = Math.ceil((t - now) / 86400000);
        if (days <= 30) items.push({ v, type, date, days });
      };
      check("MOT", v.next_mot_date);
      check("PCO License", v.insurance_expiry);
      return items;
    })
    .sort((a, b) => a.days - b.days);

  // Driver licence expiry alerts (<= 30 days)
  const driverLicenceAlerts = drivers
    .filter((d) => !d.deleted_at && d.licence_expiry_date)
    .flatMap((d) => {
      const t = new Date(d.licence_expiry_date!).getTime();
      if (isNaN(t)) return [];
      const days = Math.ceil((t - now) / 86400000);
      if (days <= 30) return [{ driver: d, date: d.licence_expiry_date!, days }];
      return [];
    })
    .sort((a, b) => a.days - b.days);

  // Rent due reminders (1 day before)
  const rentDueReminders = drivers
    .filter((d) => !d.deleted_at && d.weekly_rent > 0)
    .flatMap((d) => {
      const nextDue = calculateNextPaymentDueDate(d.start_date, d.rent_due_day, new Date(now));
      const days = Math.ceil((nextDue.getTime() - now) / 86400000);
      if (days === 1) return [{ driver: d, nextDue, days }];
      return [];
    });

  const [expandedChart, setExpandedChart] = useState<null | "donut" | "line">(null);

  return (
    <div className="space-y-4 xl:space-y-5">
      <div
        className="flex flex-wrap items-end justify-between gap-3 border-b pb-4"
        style={{ borderColor: T.borderSoft }}
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-[#8b95a8]">Welcome back, Fleet Admin 👋</p>
        </div>
        <div className="flex items-center gap-2">
          <ChatSimulator />
          <div
            className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs text-[#c5cbd6]"
            style={{ borderColor: T.border, background: T.panel }}
          >
            <Icon.Calendar className="h-4 w-4 text-[#ff6a00]" />{" "}
            {new Date().toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
      </div>
      {eomReminders.length > 0 && (
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "rgba(255,106,0,0.4)", background: T.orangeSoft }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Icon.Alert className="h-5 w-5 text-[#ff6a00]" />
            <h3 className="text-base font-semibold text-[#ff6a00]">End of Month Reminders</h3>
            <span className="ml-auto rounded-full bg-[#ff6a00] px-2 py-0.5 text-[10px] font-bold text-white">
              {eomReminders.length}
            </span>
          </div>
          <div className="space-y-2">
            {eomReminders.map(({ d, dueDate, days }) => (
              <button
                key={d.id}
                onClick={() => goto("mileage")}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-[#1e222b]"
                style={{ borderColor: T.border, background: T.panel }}
              >
                <UKPlate reg={d.registration} size="sm" />
                <div className="flex-1 text-sm">
                  <span className="font-bold text-[#ff8a3d]">Please update driver mileage:</span>{" "}
                  Ask <span className="font-bold">{d.driver_name}</span> to send a photo of the
                  current mileage for <span className="font-semibold">{d.registration}</span>.
                  <div className="text-xs text-[#8b95a8]">
                    Due {dueDate.toLocaleDateString("en-GB")} · Dismisses when you log End of Month
                    mileage
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    days < 0
                      ? "bg-red-500/20 text-red-300"
                      : days === 1
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {days < 0
                    ? `${Math.abs(days)}d overdue`
                    : days === 1
                      ? "Due tomorrow"
                      : "Due today"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {rentDueReminders.length > 0 && (
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.06)" }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Icon.Alert className="h-5 w-5 text-blue-400" />
            <h3 className="text-base font-semibold text-blue-300">
              Rent Due Tomorrow — 1 Day Reminder
            </h3>
            <span className="ml-auto rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {rentDueReminders.length}
            </span>
          </div>
          <div className="space-y-2">
            {rentDueReminders.map(({ driver, nextDue }) => (
              <button
                key={driver.id + "-rent-due"}
                onClick={() => goto("drivers")}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-[#1e222b]"
                style={{ borderColor: T.border, background: T.panel }}
              >
                <UKPlate reg={driver.registration} size="sm" />
                <div className="flex-1 text-sm">
                  <span className="font-bold text-white">{driver.driver_name}</span> — Weekly rent of{" "}
                  <span className="font-bold text-emerald-400">£{driver.weekly_rent.toFixed(2)}</span> is due tomorrow ({nextDue.toLocaleDateString("en-GB")})
                  <div className="text-xs text-[#8b95a8]">Rent due day: {driver.rent_due_day}</div>
                </div>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-bold text-blue-300">
                  Due Tomorrow
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {driverLicenceAlerts.length > 0 && (
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.06)" }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Icon.Alert className="h-5 w-5 text-amber-400" />
            <h3 className="text-base font-semibold text-amber-300">
              Alerts — Driver Licence Expiry
            </h3>
            <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {driverLicenceAlerts.length}
            </span>
          </div>
          <div className="space-y-2">
            {driverLicenceAlerts.map(({ driver, date, days }) => (
              <button
                key={driver.id + "-licence"}
                onClick={() => goto("drivers")}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-[#1e222b]"
                style={{ borderColor: T.border, background: T.panel }}
              >
                <UKPlate reg={driver.registration} size="sm" />
                <div className="flex-1 text-sm">
                  <span className="font-bold text-white">{driver.driver_name}</span> — Licence {days < 0 ? "expired" : "expiring"}
                  <div className="text-xs text-[#8b95a8]">
                    Expiry date: {new Date(date).toLocaleDateString("en-GB")}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    days < 0 ? "bg-red-500/20 text-red-300" : days <= 7 ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d left`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {expiryAlerts.length > 0 && (
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.06)" }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Icon.Alert className="h-5 w-5 text-red-400" />
            <h3 className="text-base font-semibold text-red-300">
              Alerts — MOT & PCO License Expiry
            </h3>
            <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {expiryAlerts.length}
            </span>
          </div>
          <div className="space-y-2">
            {expiryAlerts.map(({ v, type, date, days }) => (
              <button
                key={v.id + type}
                onClick={() => goto("vehicles")}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-[#1e222b]"
                style={{ borderColor: T.border, background: T.panel }}
              >
                <UKPlate reg={v.registration} size="sm" />
                <div className="flex-1 text-sm">
                  <span className="font-bold">{type}</span> {days < 0 ? "expired" : "expiring"} for{" "}
                  {simplifyVehicleName(v)}
                  <div className="text-xs text-[#8b95a8]">
                    {new Date(date).toLocaleDateString("en-GB")}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${days < 0 ? "bg-red-500/20 text-red-300" : days <= 7 ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}
                >
                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d left`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label="Total Vehicles" value={total} accent="#e7eaf0" />
        <Kpi label="In Service" value={inService} accent="#60a5fa" />
        <Kpi label="Overdue Checks" value={overdue} accent="#f87171" />
        <Kpi
          label="Service Spend"
          value={`£${grossSpend.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          accent="#ff6a00"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title="Fleet Status"
          onClick={() => setExpandedChart(expandedChart === "donut" ? null : "donut")}
        >
          <Donut data={statusCounts} height={expandedChart === "donut" ? 320 : 210} />
        </ChartCard>
        <ChartCard
          title="Service Spend (Last 6 months)"
          onClick={() => setExpandedChart(expandedChart === "line" ? null : "line")}
        >
          <LineChart data={monthly} height={expandedChart === "line" ? 320 : 210} />
        </ChartCard>
      </div>

      <div
        className="rounded-2xl border p-4"
        style={{ borderColor: T.border, background: T.panel }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Recent Service Records</h3>
            <p className="text-xs text-[#8b95a8]">Latest service activities across your fleet</p>
          </div>
          <button
            onClick={() => goto("services")}
            className="rounded-lg border px-3 py-1.5 text-[11px] text-[#aeb8c9] hover:text-white"
            style={{ borderColor: T.borderSoft }}
          >
            View all records →
          </button>
        </div>
        {services.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#8b95a8]">No service records yet.</div>
        ) : (
          <div className="space-y-2">
            {services.slice(0, 5).map((s) => {
              const st = serviceStyle(s.service_type);
              return (
                <div
                  key={s.id}
                  className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border px-3 py-3 transition hover:border-[#ff6a00]/40"
                  style={{ borderColor: T.border, background: "rgba(255,255,255,0.018)" }}
                >
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium ${st.cls}`}
                  >
                    <st.I className="h-3.5 w-3.5" /> {s.service_type}
                  </span>
                  <UKPlate reg={s.registration} size="sm" />
                  <div className="min-w-[130px] flex-1 truncate text-sm text-[#aeb8c9]">
                    {s.description || "No notes recorded"}
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                    Completed
                  </span>
                  <div className="text-sm font-semibold text-white">£{s.cost.toFixed(2)}</div>
                  <div className="text-xs text-[#8b95a8]">{s.service_date}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div
        className="grid grid-cols-1 gap-3 rounded-2xl border p-3 sm:grid-cols-3"
        style={{ borderColor: T.border, background: "rgba(17,24,39,0.72)" }}
      >
        <button
          onClick={() => goto("services")}
          className="flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-white/[0.04]"
        >
          <span className="flex items-center gap-2 text-sm text-[#c5cbd6]">
            <Icon.Calendar className="h-4 w-4 text-[#ff8a3d]" /> Next Service Due
          </span>
          <span className="font-semibold text-white">
            {
              vehicles.filter(
                (v) =>
                  v.next_service_date &&
                  v.next_service_date <=
                    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
              ).length
            }{" "}
            Vehicles
          </span>
        </button>
        <button
          onClick={() => goto("vehicles")}
          className="flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-white/[0.04]"
        >
          <span className="flex items-center gap-2 text-sm text-[#c5cbd6]">
            <Icon.Alert className="h-4 w-4 text-amber-300" /> MOT Due Soon
          </span>
          <span className="font-semibold text-white">
            {
              vehicles.filter(
                (v) =>
                  v.next_mot_date &&
                  v.next_mot_date <=
                    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
              ).length
            }{" "}
            Vehicles
          </span>
        </button>
        <button
          onClick={() => goto("vehicles")}
          className="flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-white/[0.04]"
        >
          <span className="flex items-center gap-2 text-sm text-[#c5cbd6]">
            <Icon.Alert className="h-4 w-4 text-emerald-300" /> Insurance Expiring
          </span>
          <span className="font-semibold text-white">
            {
              vehicles.filter(
                (v) =>
                  v.insurance_expiry &&
                  v.insurance_expiry <=
                    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
              ).length
            }{" "}
            Vehicles
          </span>
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  const KpiIcon =
    label === "In Service"
      ? Icon.Bolt
      : label === "Overdue Checks"
        ? Icon.Alert
        : label === "Service Spend"
          ? Icon.Wrench
          : Icon.Car;
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border p-4 shadow-[0_12px_35px_rgba(0,0,0,0.16)] transition hover:-translate-y-0.5"
      style={{
        borderColor: T.border,
        background: "linear-gradient(145deg, rgba(21,28,43,0.96), rgba(13,18,30,0.96))",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl border"
          style={{ borderColor: `${accent}45`, background: `${accent}18`, color: accent }}
        >
          <KpiIcon className="h-5 w-5" />
        </div>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[#718096]">Live</span>
      </div>
      <div className="relative z-10 mt-4 text-[10px] uppercase tracking-[0.14em] text-[#8b95a8]">
        {label}
      </div>
      <div className="relative z-10 mt-1 text-3xl font-bold" style={{ color: accent }}>
        {value}
      </div>
      <KpiIcon className="pointer-events-none absolute -bottom-3 -right-2 h-24 w-24 opacity-[0.06]" />
    </div>
  );
}

function ChartCard({
  title,
  children,
  onClick,
}: {
  title: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: T.border, background: T.panel }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-[#8b95a8]">
            {title === "Fleet Status"
              ? "Overview of your entire fleet"
              : "Track your service expenditure over time"}
          </p>
        </div>
        <button
          onClick={onClick}
          className="rounded-lg border px-3 py-1.5 text-[11px] font-medium text-[#aeb8c9] transition hover:border-[#ff6a00]/50 hover:text-white"
          style={{ borderColor: T.borderSoft }}
        >
          {title === "Fleet Status" ? "View all vehicles →" : "View full report ↗"}
        </button>
      </div>
      {children}
    </div>
  );
}

function Donut({ data, height }: { data: Record<string, number>; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, c.clientWidth, height);
    const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
    const cx = c.clientWidth / 2,
      cy = height / 2;
    const r = Math.min(cx, cy) - 20,
      ir = r * 0.6;
    const colors: Record<string, string> = {
      Active: "#22c55e",
      "In Service": "#60a5fa",
      Rented: "#ff8a3d",
      "Off Road": "#64748b",
    };
    let a0 = -Math.PI / 2;
    Object.entries(data).forEach(([k, v]) => {
      const a1 = a0 + (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * ir, cy + Math.sin(a0) * ir);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.arc(cx, cy, ir, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = colors[k] || "#64748b";
      ctx.fill();
      a0 = a1;
    });
    ctx.fillStyle = "#e7eaf0";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(total), cx, cy - 6);
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#8b95a8";
    ctx.fillText("vehicles", cx, cy + 14);
  }, [data, height]);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
      <canvas ref={ref} className="w-full shrink-0 sm:w-[55%]" style={{ height }} />
      <div className="flex w-full flex-1 flex-wrap justify-center gap-3 text-xs sm:flex-col sm:justify-center sm:gap-0">
        {Object.entries(data).map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-1 py-2.5 last:border-0"
          >
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded"
                style={{
                  background:
                    k === "Active"
                      ? "#22c55e"
                      : k === "In Service"
                        ? "#60a5fa"
                        : k === "Rented"
                          ? "#ff8a3d"
                          : "#64748b",
                }}
              />
              <span className="text-[#aeb8c9]">{k}</span>
            </span>
            <span className="font-semibold text-white">
              {v}{" "}
              <span className="font-normal text-[#718096]">
                ({Math.round((v / (Object.values(data).reduce((a, b) => a + b, 0) || 1)) * 100)}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, height }: { data: [string, number][]; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = height * dpr;
    ctx.scale(dpr, dpr);
    const W = c.clientWidth,
      H = height;
    ctx.clearRect(0, 0, W, H);
    const padL = 40,
      padB = 30,
      padT = 10,
      padR = 10;
    const max = Math.max(...data.map((d) => d[1]), 100);
    ctx.strokeStyle = "#262b36";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + ((H - padT - padB) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillStyle = "#8b95a8";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`£${Math.round(max - (max * i) / 4)}`, padL - 6, y + 3);
    }
    if (data.length === 0) {
      ctx.fillStyle = "#5b6478";
      ctx.textAlign = "center";
      ctx.font = "12px sans-serif";
      ctx.fillText("No service spend recorded yet", W / 2, H / 2);
      return;
    }
    const stepX = (W - padL - padR) / Math.max(data.length - 1, 1);
    const points = data.map(([_, v], i) => ({
      x: padL + i * stepX,
      y: padT + (H - padT - padB) * (1 - v / max),
    }));
    const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
    grad.addColorStop(0, "rgba(255,106,0,0.35)");
    grad.addColorStop(1, "rgba(255,106,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(points[0].x, H - padB);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, H - padB);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ff6a00";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    points.forEach((p, i) => {
      ctx.fillStyle = "#ff6a00";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8b95a8";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(data[i][0].slice(2), p.x, H - padB + 14);
    });
  }, [data, height]);
  return <canvas ref={ref} style={{ width: "100%", height }} />;
}

/* ---------------- Vehicles ---------------- */
function vehicleArtwork(vehicle: Vehicle) {
  return vehicleArtworkPath(vehicle);
}

function VehiclesList({
  vehicles,
  drivers,
  onAdd,
  onOpen,
}: {
  vehicles: Vehicle[];
  drivers: DriverTrack[];
  onAdd: () => void;
  onOpen: (v: Vehicle) => void;
}) {
  const [q, setQ] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("q") ?? "")
      : "",
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const filtered = vehicles.filter((v) => {
    const rawQ = q.trim().toLowerCase();
    const cleanQ = rawQ.replace(/[^a-z0-9]/g, "");
    const matchQ = [v.registration, v.make, v.model].some((s) => {
      const rawS = (s ?? "").toLowerCase();
      const cleanS = rawS.replace(/[^a-z0-9]/g, "");
      return rawS.includes(rawQ) || (cleanQ.length > 0 && cleanS.includes(cleanQ));
    });
    const matchS = statusFilter === "all" || v.status === statusFilter;
    return matchQ && matchS;
  });
  const fuelStyle = (f: Vehicle["fuel_type"]) => {
    if (f === "Electric") return "border-blue-500/30 bg-blue-500/10 text-blue-300";
    if (f === "Hybrid") return "border-orange-500/30 bg-orange-500/10 text-orange-300";
    if (f === "Diesel") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  };
  const driverByVehicle = new Map(drivers.map((driver) => [driver.vehicle_id, driver]));
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold">Vehicles</h2>
          <p className="text-sm text-[#8b95a8]">{vehicles.length} vehicles in your fleet</p>
        </div>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-[#ff6a00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]"
        >
          <Icon.Plus className="h-4 w-4" /> Add Vehicle
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b6478]"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by make, model or registration..."
            className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-[#5b6478] focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30"
            style={{ borderColor: T.border, background: T.panel }}
          />
        </div>
        <DarkSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All Statuses" },
            { value: "Active", label: "Available" },
            { value: "In Service", label: "In Service" },
            { value: "Rented", label: "Rented" },
            { value: "Off Road", label: "Off Road" },
          ]}
          className="min-w-[170px] rounded-lg border px-3 py-2.5 text-sm text-white focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30"
        />
      </div>

      {filtered.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center text-sm text-[#8b95a8]"
          style={{ borderColor: T.border, background: T.panel }}
        >
          No vehicles match.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((v) => {
            const artwork = vehicleArtwork(v);
            return (
              <div
                key={v.id}
                className="group relative flex min-h-[365px] flex-col overflow-hidden rounded-2xl border p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#ff6a00]/60 hover:shadow-xl hover:shadow-orange-500/10 sm:min-h-[385px]"
                style={{ borderColor: T.border, background: T.panel }}
              >
                {artwork ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-10 top-24 z-0 flex items-end justify-end opacity-50 transition-all duration-200 group-hover:opacity-95 group-hover:brightness-[1.25] group-hover:contrast-125 group-hover:drop-shadow-[0_0_18px_rgba(255,255,255,0.55)]"
                    aria-hidden="true"
                  >
                    <img
                      src={artwork}
                      alt=""
                      className="h-full w-[86%] object-contain object-right mix-blend-normal sm:w-[90%]"
                    />
                  </div>
                ) : (
                  <div className="pointer-events-none absolute right-4 top-24 z-0 opacity-[0.07] transition-opacity group-hover:opacity-[0.13]">
                    {v.fuel_type === "Electric" ? (
                      <Icon.Bolt className="h-36 w-36 text-sky-300" />
                    ) : (
                      <Icon.Car
                        className={`h-36 w-36 ${v.fuel_type === "Hybrid" ? "text-amber-300" : "text-slate-200"}`}
                      />
                    )}
                  </div>
                )}
                <div className="relative z-10 mb-3 flex items-start justify-between gap-2">
                  <UKPlate reg={v.registration} size="sm" />
                  <StatusBadge status={v.status} />
                </div>
                {(() => {
                  const simp = simplifyVehicleName(v);
                  return (
                    <button
                      onClick={() => onOpen(v)}
                      className="relative z-10 block max-w-[82%] text-left"
                    >
                      <div className="line-clamp-2 text-lg font-extrabold uppercase leading-[1.08] tracking-tight text-[#f3f5f8] sm:text-xl">
                        {simp}
                      </div>
                    </button>
                  );
                })()}
                <div className="relative z-10 mt-4 grid max-w-[56%] grid-cols-1 gap-2 text-xs text-[#aab3c2] sm:max-w-[46%]">
                  <div
                    className="flex items-center gap-2.5 border-b pb-2.5"
                    style={{ borderColor: T.borderSoft }}
                  >
                    <Icon.Calendar className="h-6 w-6 shrink-0 text-[#aeb8c9]" />
                    <span>
                      <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d8799]">
                        Year
                      </span>
                      <span className="text-lg font-semibold text-[#e8ebf0]">{v.year}</span>
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-2.5 border-b pb-2.5"
                    style={{ borderColor: T.borderSoft }}
                  >
                    <Icon.Bolt
                      className={`h-6 w-6 shrink-0 ${v.fuel_type === "Electric" ? "text-sky-300" : "text-[#ff8a3d]"}`}
                    />
                    <span>
                      <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d8799]">
                        Fuel
                      </span>
                      <span
                        className={`mt-0.5 inline-block rounded-md border px-2 py-0.5 text-sm font-bold ${fuelStyle(v.fuel_type)}`}
                      >
                        {v.fuel_type}
                      </span>
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-2.5 border-b pb-2.5"
                    style={{ borderColor: T.borderSoft }}
                  >
                    <Icon.Alert className="h-6 w-6 shrink-0 text-[#aeb8c9]" />
                    <span>
                      <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d8799]">
                        PCO
                      </span>
                      <span className="text-lg font-semibold text-[#e8ebf0]">
                        {v.insurance_expiry ? daysUntil(v.insurance_expiry) : "—"}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Icon.Alert className="h-6 w-6 shrink-0 text-[#aeb8c9]" />
                    <span>
                      <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d8799]">
                        MOT
                      </span>
                      <span className="text-lg font-semibold text-[#e8ebf0]">
                        {v.next_mot_date ? daysUntil(v.next_mot_date) : "—"}
                      </span>
                    </span>
                  </div>
                </div>
                {driverByVehicle.get(v.id)?.driver_name && (
                  <div className="relative z-10 mt-2 max-w-[62%] truncate text-[10px] text-sky-200 sm:max-w-[48%]">
                    Driver:{" "}
                    <span className="font-semibold">{driverByVehicle.get(v.id)?.driver_name}</span>
                  </div>
                )}
                <div className="relative z-10 mt-auto pt-4">
                  <button
                    onClick={() => onOpen(v)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#ff8a3d]/80 bg-[#15171d]/70 px-3 py-2.5 text-sm font-bold text-[#ff8a3d] transition hover:bg-[#ff8a3d] hover:text-white"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-current">
                      →
                    </span>{" "}
                    View Details <span>→</span>
                  </button>
                </div>
              </div>
            );
          })}
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
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium ${expired ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-[#262b36] bg-[#1e222b] text-[#8b95a8]"}`}
    >
      <span className="opacity-70">{label}</span>
      <span className={expired ? "font-bold" : ""}>{value}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: Vehicle["status"] }) {
  const map = {
    Active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    "In Service": "border-blue-500/30 bg-blue-500/10 text-blue-300",
    Rented: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    "Off Road": "border-slate-500/30 bg-slate-500/10 text-slate-300",
  } as const;
  return (
    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {status}
    </span>
  );
}
export { StatusBadge, Pill, daysUntil };

/* ---------------- Add Vehicle ---------------- */
function emptyVehicle(): Vehicle {
  return {
    id: uid(),
    registration: "",
    make: "",
    model: "",
    year: new Date().getFullYear(),
    fuel_type: "Hybrid",
    current_mileage: 0,
    status: "Active",
    next_service_date: "",
    next_mot_date: "",
    insurance_expiry: "",
    notes: "",
  };
}

function AddVehicle({
  vehicles,
  onSave,
  onCancel,
  toast,
}: {
  vehicles: Vehicle[];
  onSave: (v: Vehicle) => void;
  onCancel: () => void;
  toast: (m: string, t?: Toast["type"]) => void;
}) {
  const [v, setV] = useState<Vehicle>(emptyVehicle());
  const [warn, setWarn] = useState<string | null>(null);
  const [mileageStr, setMileageStr] = useState("");

  const lookup = () => {
    const reg = v.registration.trim().toUpperCase();
    if (!reg) {
      setWarn("Enter a registration first.");
      return;
    }
    const seed = ALL_VEHICLES_SEED.find((s) => s.reg.toUpperCase() === reg);
    const existing = vehicles.find((x) => x.registration.toUpperCase() === reg);
    if (existing) {
      setWarn(`Vehicle ${reg} already exists in your fleet.`);
      return;
    }
    if (seed) {
      setV((x) => ({
        ...x,
        registration: reg,
        make: seed.make,
        model: seed.model,
        year: seed.year,
      }));
      setWarn(null);
      toast(`Found ${seed.make} ${seed.model} (${seed.year})`);
    } else {
      setWarn("No match in database. Enter make, model and year manually below.");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.registration.trim() || !v.make.trim() || !v.model.trim()) {
      toast("Registration, make and model are required.", "error");
      return;
    }
    onSave({
      ...v,
      registration: v.registration.toUpperCase().trim(),
      current_mileage: parseInt(mileageStr) || 0,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-3xl space-y-6 rounded-xl border p-6 md:p-8"
      style={{ borderColor: T.border, background: T.panel }}
    >
      <div>
        <Label>Registration *</Label>
        <div className="flex gap-2">
          <input
            value={v.registration}
            onChange={(e) => setV({ ...v, registration: e.target.value.toUpperCase() })}
            placeholder="AB12 CDE"
            className="flex-1 rounded-lg border px-4 py-2.5 font-mono uppercase tracking-wider text-white focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30"
            style={{ borderColor: T.border, background: T.panel2 }}
          />
          <button
            type="button"
            onClick={lookup}
            className="rounded-lg bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]"
          >
            Look up
          </button>
        </div>
        {warn && (
          <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {warn}
          </div>
        )}
      </div>

      <Grid2>
        <Field label="Make *">
          <input
            value={v.make}
            onChange={(e) => setV({ ...v, make: e.target.value })}
            className={inputCls}
            placeholder="e.g. MERCEDES-BENZ"
          />
        </Field>
        <Field label="Model *">
          <input
            value={v.model}
            onChange={(e) => setV({ ...v, model: e.target.value })}
            className={inputCls}
            placeholder="e.g. E 220 D"
          />
        </Field>
      </Grid2>

      <Grid2>
        <Field label="Year">
          <input
            type="number"
            value={v.year}
            onChange={(e) => setV({ ...v, year: +e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Fuel Type">
          <DarkSelect
            value={v.fuel_type}
            onChange={(value) => setV({ ...v, fuel_type: value as Vehicle["fuel_type"] })}
            options={["Petrol", "Diesel", "Hybrid", "Electric"].map((value) => ({
              value,
              label: value,
            }))}
          />
        </Field>
      </Grid2>

      <Grid2>
        <Field label="Current Mileage">
          <input
            type="number"
            inputMode="numeric"
            value={mileageStr}
            onChange={(e) => setMileageStr(e.target.value.replace(/^0+(?=\d)/, ""))}
            placeholder="0"
            className={inputCls}
          />
        </Field>
        <Field label="Status">
          <DarkSelect
            value={v.status}
            onChange={(value) => setV({ ...v, status: value as Vehicle["status"] })}
            options={["Active", "In Service", "Rented", "Off Road"].map((value) => ({
              value,
              label: value,
            }))}
          />
        </Field>
      </Grid2>

      <div>
        <Label>Important Dates</Label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Next Service">
            <input
              type="date"
              value={v.next_service_date}
              onChange={(e) => setV({ ...v, next_service_date: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Next MOT">
            <input
              type="date"
              value={v.next_mot_date}
              onChange={(e) => setV({ ...v, next_mot_date: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="PCO License Expiry">
            <input
              type="date"
              value={v.insurance_expiry}
              onChange={(e) => setV({ ...v, insurance_expiry: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      <Field label="Notes">
        <textarea
          rows={4}
          value={v.notes}
          onChange={(e) => setV({ ...v, notes: e.target.value })}
          className={inputCls}
        />
      </Field>

      <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: T.border }}>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border px-5 py-2.5 text-sm font-medium hover:bg-[#1e222b]"
          style={{ borderColor: T.border }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]"
        >
          Add Vehicle
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border px-3 py-2.5 text-sm text-white placeholder:text-[#5b6478] focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30";
function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-sm font-semibold text-[#e7eaf0]">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

// Provide background style on inputs via inline-style helper using wrapper
// We rely on parent setting border/bg via Tailwind tokens above—give actual bg here:
const _styleInjectId = "vch-input-bg-style";
if (typeof document !== "undefined" && !document.getElementById(_styleInjectId)) {
  const tag = document.createElement("style");
  tag.id = _styleInjectId;
  tag.textContent = `
    input, select, textarea { background-color: ${T.panel2}; border-color: ${T.border}; color: ${T.text}; }
    select { color-scheme: dark; }
    select option, select optgroup { background-color: #1e222b; color: #eef2f8; }
    input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); }
  `;
  document.head.appendChild(tag);
}

/* ---------------- Edit Vehicle Modal ---------------- */
export function EditVehicleModal({
  vehicle,
  onClose,
  onSave,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onSave: (v: Vehicle) => void;
}) {
  const [v, setV] = useState<Vehicle>(vehicle);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#10141d] p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
        style={{ borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Edit Vehicle</h2>
          <button onClick={onClose} className="text-[#8b95a8] hover:text-white">
            <Icon.X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="flex justify-center">
            <UKPlate reg={v.registration} size="lg" />
          </div>
          <Grid2>
            <Field label="Make">
              <input
                value={v.make}
                onChange={(e) => setV({ ...v, make: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Model">
              <input
                value={v.model}
                onChange={(e) => setV({ ...v, model: e.target.value })}
                className={inputCls}
              />
            </Field>
          </Grid2>
          <Grid2>
            <Field label="Year">
              <input
                type="number"
                value={v.year}
                onChange={(e) => setV({ ...v, year: +e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Fuel Type">
              <DarkSelect
                value={v.fuel_type}
                onChange={(value) => setV({ ...v, fuel_type: value as Vehicle["fuel_type"] })}
                options={["Petrol", "Diesel", "Hybrid", "Electric"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Field>
          </Grid2>
          <Grid2>
            <Field label="Current Mileage">
              <input
                type="number"
                value={v.current_mileage}
                onChange={(e) => setV({ ...v, current_mileage: +e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Status">
              <DarkSelect
                value={v.status}
                onChange={(value) => setV({ ...v, status: value as Vehicle["status"] })}
                options={["Active", "In Service", "Rented", "Off Road"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Field>
          </Grid2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Next Service">
              <input
                type="date"
                value={v.next_service_date}
                onChange={(e) => setV({ ...v, next_service_date: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Next MOT">
              <input
                type="date"
                value={v.next_mot_date}
                onChange={(e) => setV({ ...v, next_mot_date: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="PCO License">
              <input
                type="date"
                value={v.insurance_expiry}
                onChange={(e) => setV({ ...v, insurance_expiry: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              rows={3}
              value={v.notes}
              onChange={(e) => setV({ ...v, notes: e.target.value })}
              className={inputCls}
            />
          </Field>
          <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: T.border }}>
            <button
              onClick={onClose}
              className="rounded-lg border px-5 py-2.5 text-sm font-medium hover:bg-[#1e222b]"
              style={{ borderColor: T.border }}
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(v)}
              className="rounded-lg bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Reg Search ---------------- */
function RegSearch({
  vehicles,
  onPick,
  value,
  onTextChange,
}: {
  vehicles: Vehicle[];
  onPick: (v: Vehicle) => void;
  value: string;
  onTextChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = value.trim().toUpperCase();
    if (!q) return [];
    return vehicles
      .filter(
        (v) =>
          v.registration.toUpperCase().includes(q) ||
          v.make.toUpperCase().includes(q) ||
          v.model.toUpperCase().includes(q),
      )
      .slice(0, 8);
  }, [value, vehicles]);
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onTextChange(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Type registration to search..."
        className={inputCls + " font-mono uppercase tracking-wider"}
      />
      {open && matches.length > 0 && (
        <div
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border shadow-xl"
          style={{ borderColor: T.border, background: T.panel }}
        >
          {matches.map((v) => (
            <button
              type="button"
              key={v.id}
              onClick={() => {
                onPick(v);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 border-b px-3 py-2 text-left hover:bg-[#ff6a00]/10"
              style={{ borderColor: T.borderSoft }}
            >
              <UKPlate reg={v.registration} size="sm" />
              <div className="flex-1 truncate">
                <div className="text-sm font-semibold">{simplifyVehicleName(v)}</div>
                <div className="text-xs text-[#8b95a8]">
                  {v.model} · {v.year}
                </div>
              </div>
              <div className="text-xs text-[#8b95a8]">{v.current_mileage.toLocaleString()} mi</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Log Service ---------------- */
function LogService({
  vehicles,
  onSave,
  onCancel,
}: {
  vehicles: Vehicle[];
  onSave: (r: Omit<ServiceRecord, "id">) => void;
  onCancel: () => void;
}) {
  const [regText, setRegText] = useState("");
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [type, setType] = useState("Full Service");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mileage, setMileage] = useState<string>("");
  const [cost, setCost] = useState<string>("");
  const [garage, setGarage] = useState("");
  const [desc, setDesc] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      alert("Pick a vehicle by registration.");
      return;
    }
    onSave({
      vehicle_id: selected.id,
      registration: selected.registration,
      service_type: type,
      service_date: date,
      mileage: parseInt(mileage) || 0,
      cost: parseFloat(cost) || 0,
      garage,
      description: desc,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-3xl space-y-5 rounded-xl border p-6 md:p-8"
      style={{ borderColor: T.border, background: T.panel }}
    >
      <div>
        <Label>Registration *</Label>
        <RegSearch
          vehicles={vehicles}
          value={regText}
          onTextChange={(s) => {
            setRegText(s);
            setSelected(null);
          }}
          onPick={(v) => {
            setSelected(v);
            setRegText(v.registration);
            setMileage(String(v.current_mileage || ""));
          }}
        />
        {selected && (
          <div
            className="mt-2 flex items-center gap-2 rounded-lg border p-2"
            style={{ borderColor: T.border, background: T.panel2 }}
          >
            <UKPlate reg={selected.registration} size="sm" />
            <div className="text-sm">
              <span className="font-semibold">{simplifyVehicleName(selected)}</span> ·{" "}
              {selected.year}
            </div>
          </div>
        )}
      </div>

      <Grid2>
        <Field label="Service Type">
          <ServiceTypePicker value={type} onChange={setType} />
        </Field>
        <Field label="Service Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </Field>
      </Grid2>

      <Grid2>
        <Field label="Mileage at Service">
          <input
            type="number"
            inputMode="numeric"
            value={mileage}
            onChange={(e) => setMileage(e.target.value.replace(/^0+(?=\d)/, ""))}
            placeholder="e.g. 45000"
            className={inputCls}
          />
        </Field>
        <Field label="Cost (£)">
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="e.g. 150.00"
            className={inputCls}
          />
        </Field>
      </Grid2>

      <Field label="Garage / Service Centre">
        <input value={garage} onChange={(e) => setGarage(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Description of Work Performed">
        <textarea
          rows={4}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className={inputCls}
        />
      </Field>

      <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: T.border }}>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border px-5 py-2.5 text-sm font-medium hover:bg-[#1e222b]"
          style={{ borderColor: T.border }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-[#ff6a00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]"
        >
          Save Record
        </button>
      </div>
    </form>
  );
}

/* ---------------- Service History ---------------- */
type ServiceCategory = "Mercedes" | "Toyota" | "Other premium cars";

function serviceCategory(service: ServiceRecord, vehicles: Vehicle[]): ServiceCategory {
  const make =
    vehicles
      .find((v) => v.registration.toLowerCase() === service.registration.toLowerCase())
      ?.make.toLowerCase() ?? "";
  if (make.includes("mercedes")) return "Mercedes";
  if (make.includes("toyota")) return "Toyota";
  return "Other premium cars";
}

function ServicesList({
  services,
  vehicles,
  onAdd,
  onDelete,
}: {
  services: ServiceRecord[];
  vehicles: Vehicle[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const [q, setQ] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("q") ?? "")
      : "",
  );
  const [category, setCategory] = useState<ServiceCategory | "All">("All");
  const [selected, setSelected] = useState<ServiceRecord | null>(null);
  const categories: (ServiceCategory | "All")[] = [
    "All",
    "Mercedes",
    "Toyota",
    "Other premium cars",
  ];
  const filtered = services.filter((s) => {
    const matchesCategory = category === "All" || serviceCategory(s, vehicles) === category;
    const query = q.toLowerCase();
    const matchesSearch = [s.registration, s.service_type, s.garage, s.description].some((v) =>
      (v || "").toLowerCase().includes(query),
    );
    return matchesCategory && matchesSearch;
  });
  const total = filtered.reduce((a, s) => a + (s.cost || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Service History</h2>
          <p className="text-sm text-[#8b95a8]">
            {filtered.length} of {services.length} records · £{total.toFixed(2)} total spend
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportServiceHistoryPdf(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1e222b] disabled:opacity-50"
            style={{ borderColor: T.border, background: T.panel2 }}
          >
            <Icon.Download className="h-4 w-4" /> Export to PDF
          </button>
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-[#ff6a00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]"
          >
            <Icon.Plus className="h-4 w-4" /> Log Service
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${category === item ? "border-[#ff6a00] bg-[#ff6a00]/15 text-[#ff9a5c]" : "text-[#9aa5b8] hover:bg-[#1e222b]"}`}
            style={category === item ? undefined : { borderColor: T.border, background: T.panel }}
          >
            {item}{" "}
            {item === "All"
              ? `(${services.length})`
              : `(${services.filter((s) => serviceCategory(s, vehicles) === item).length})`}
          </button>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b6478]"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by registration, notes, garage or service type..."
          className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30"
          style={{ borderColor: T.border, background: T.panel }}
        />
      </div>

      {filtered.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-12 text-center text-sm text-[#8b95a8]"
          style={{ borderColor: T.border, background: T.panel }}
        >
          {services.length === 0
            ? "No service records logged yet."
            : "No records match your filters."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((s) => {
            const st = serviceStyle(s.service_type);
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(s);
                  }
                }}
                className="flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-colors hover:border-[#ff6a00]/40 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
                style={{ borderColor: T.border, background: T.panel }}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${st.cls}`}
                >
                  <st.I className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <UKPlate reg={s.registration} size="sm" />
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${st.cls}`}
                    >
                      {s.service_type}
                    </span>
                    <span className="ml-auto text-base font-bold text-[#ff6a00]">
                      £{s.cost.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm text-[#c5cbd6]">
                    {s.service_date} · {s.mileage.toLocaleString()} mi
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-[#8b95a8]">
                    {s.description || "No notes recorded for this service."}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this service record?")) onDelete(s.id);
                  }}
                  className="shrink-0 text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selected && <ServiceDetailsModal service={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ServiceDetailsModal({
  service,
  onClose,
}: {
  service: ServiceRecord;
  onClose: () => void;
}) {
  const st = serviceStyle(service.service_type);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#10141d] p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
        style={{ borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Service record details"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20 sm:hidden" />
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl border ${st.cls}`}
            >
              <st.I className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{service.service_type}</h2>
              <p className="text-sm text-[#8b95a8]">Complete service record</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8b95a8] hover:text-white"
            aria-label="Close service details"
          >
            <Icon.X className="h-5 w-5" />
          </button>
        </div>
        <div
          className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border p-4"
          style={{ borderColor: T.border, background: T.panel }}
        >
          <UKPlate reg={service.registration} size="lg" />
          <div className="ml-auto text-right">
            <div className="text-xs uppercase tracking-wider text-[#8b95a8]">Total cost</div>
            <div className="text-2xl font-bold text-[#ff8a3d]">£{service.cost.toFixed(2)}</div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div
            className="rounded-lg border p-4"
            style={{ borderColor: T.border, background: T.panel }}
          >
            <div className="text-xs uppercase tracking-wider text-[#8b95a8]">Service date</div>
            <div className="mt-1 font-semibold">{service.service_date || "Not recorded"}</div>
          </div>
          <div
            className="rounded-lg border p-4"
            style={{ borderColor: T.border, background: T.panel }}
          >
            <div className="text-xs uppercase tracking-wider text-[#8b95a8]">Mileage</div>
            <div className="mt-1 font-semibold">{service.mileage.toLocaleString()} mi</div>
          </div>
          <div
            className="rounded-lg border p-4 sm:col-span-2"
            style={{ borderColor: T.border, background: T.panel }}
          >
            <div className="text-xs uppercase tracking-wider text-[#8b95a8]">Garage / provider</div>
            <div className="mt-1 font-semibold">{service.garage || "Not recorded"}</div>
          </div>
        </div>
        <div
          className="mt-4 rounded-xl border p-5"
          style={{ borderColor: T.border, background: T.panel }}
        >
          <div className="mb-2 text-xs uppercase tracking-wider text-[#8b95a8]">Service notes</div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-[#e6eaf0]">
            {service.description || "No notes were recorded for this service."}
          </p>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#ff6a00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Drivers ---------------- */
function portalStatusBadge(driver: DriverTrack) {
  const isActive = Boolean(driver.auth_user_id) || driver.invite_status === "accepted";
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Portal active
      </span>
    );
  }
  const status = driver.invite_status ?? "none";
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
        Invite sent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold text-slate-400">
      Not invited
    </span>
  );
}

function DriversView({
  vehicles,
  drivers,
  data,
  toast,
}: {
  vehicles: Vehicle[];
  drivers: DriverTrack[];
  data: ReturnType<typeof useFleetData>;
  toast: (m: string, t?: Toast["type"]) => void;
}) {
  const [searchQuery, setSearchQuery] = useState(() =>
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("q") ?? "")
      : "",
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [profileDriver, setProfileDriver] = useState<DriverTrack | null>(null);
  const [balanceDriver, setBalanceDriver] = useState<DriverTrack | null>(null);
  const [previewDriver, setPreviewDriver] = useState<DriverTrack | null>(null);
  const [inviteModalDriver, setInviteModalDriver] = useState<DriverTrack | null>(null);

  const totalDrivers = drivers.length;
  const activeDrivers = drivers.length; // Active driver tracks
  const inactiveDrivers = 0;
  const pendingActionDrivers = drivers.filter((d) => !d.phone || !d.vehicle_id).length;

  const filteredDrivers = drivers.filter((d) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesQ =
      !q ||
      d.driver_name.toLowerCase().includes(q) ||
      (d.phone && d.phone.toLowerCase().includes(q)) ||
      d.registration.toLowerCase().includes(q);
    const matchesS =
      statusFilter === "all" ||
      (statusFilter === "active" && true) ||
      (statusFilter === "pending" && (!d.phone || !d.vehicle_id));
    return matchesQ && matchesS;
  });

  const handleDelete = async (driver: DriverTrack) => {
    if (confirm(`Are you sure you want to delete driver "${driver.driver_name}"?`)) {
      try {
        await data.deleteDriver(driver.id);
        toast(`Driver ${driver.driver_name} deleted`, "info");
      } catch (err: any) {
        toast(err?.message ?? "Failed to delete driver", "error");
      }
    }
  };

  return (
    <div className="space-y-4 text-xs sm:text-sm">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Drivers</h2>
          <p className="mt-0.5 text-xs text-[#8b95a8]">
            Manage client drivers, contact details, and vehicle assignments.
          </p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#ff6a00] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#e05d00]"
        >
          <Icon.Plus className="h-4 w-4" /> Add Driver
        </button>
      </div>

      {/* Stat Cards (Slightly smaller, compact design) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          className="rounded-xl border p-3.5 shadow-sm"
          style={{ borderColor: T.border, background: T.panel }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#8b95a8]">
            Total Drivers
          </div>
          <div className="mt-1 text-2xl font-extrabold text-white">{totalDrivers}</div>
        </div>
        <div
          className="rounded-xl border p-3.5 shadow-sm"
          style={{ borderColor: T.border, background: T.panel }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            Active
          </div>
          <div className="mt-1 text-2xl font-extrabold text-emerald-300">{activeDrivers}</div>
        </div>
        <div
          className="rounded-xl border p-3.5 shadow-sm"
          style={{ borderColor: T.border, background: T.panel }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Inactive
          </div>
          <div className="mt-1 text-2xl font-extrabold text-slate-300">{inactiveDrivers}</div>
        </div>
        <div
          className="rounded-xl border p-3.5 shadow-sm"
          style={{ borderColor: T.border, background: T.panel }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
            Pending Action
          </div>
          <div className="mt-1 text-2xl font-extrabold text-amber-300">{pendingActionDrivers}</div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Icon.Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5b6478]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search driver by name, phone or vehicle..."
            className="w-full rounded-lg border py-2 pl-8 pr-3 text-xs text-white placeholder:text-[#5b6478] focus:border-[#ff6a00] focus:outline-none"
            style={{ borderColor: T.border, background: T.panel }}
          />
        </div>
        <DarkSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All Statuses" },
            { value: "active", label: "Active" },
            { value: "pending", label: "Pending Action" },
          ]}
          className="min-w-[150px] rounded-lg border px-2.5 py-2 text-xs text-white"
        />
      </div>

      {/* Drivers Data Table */}
      <div
        className="overflow-hidden rounded-xl border"
        style={{ borderColor: T.border, background: T.panel }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead
              className="border-b text-[10px] uppercase tracking-wider text-[#8b95a8]"
              style={{ borderColor: T.borderSoft, background: "rgba(255,255,255,0.03)" }}
            >
              <tr>
                <th className="px-4 py-3 font-bold">Driver</th>
                <th className="px-4 py-3 font-bold">Contact</th>
                <th className="px-4 py-3 font-bold">Vehicle</th>
                <th className="px-4 py-3 font-bold">Weekly Rent</th>
                <th className="px-4 py-3 font-bold">Rent Status</th>
                <th className="px-4 py-3 font-bold">Balance Due</th>
                <th className="px-4 py-3 font-bold">Portal</th>
                <th className="px-4 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[#8b95a8]">
                    No drivers match your search.
                  </td>
                </tr>
              ) : (
                filteredDrivers.map((driver) => {
                  const vehicle = vehicles.find((v) => v.id === driver.vehicle_id);
                  const driverName = driver.driver_name || "Driver";
                  const initials =
                    driverName
                      .split(" ")
                      .map((n) => n[0])
                      .filter(Boolean)
                      .join("")
                      .slice(0, 2)
                      .toUpperCase() || "D";
                  const allowanceVal = driver.allowance || 5000;
                  const balanceDueVal = driver.balance_due || 0;
                  const isPortalActive = Boolean(driver.auth_user_id) || driver.invite_status === "accepted";

                  return (
                    <tr key={driver.id} onClick={() => setProfileDriver(driver)} className="cursor-pointer transition-colors hover:bg-white/[0.04]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6a00] to-[#ff9d4d] text-xs font-bold text-white shadow-sm">
                            {initials}
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProfileDriver(driver);
                              }}
                              className="font-bold text-white hover:text-[#ff8a3d] text-left underline-offset-2 hover:underline"
                            >
                              {driverName}
                            </button>
                            <div className="text-[10px] text-[#8b95a8]">
                              Allowance: {allowanceVal.toLocaleString()} mi
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-[#c5ccda]">
                        <div>{driver.phone || "No phone saved"}</div>
                        {driver.email ? (
                          <div className="text-[10px] text-[#8b95a8]">{driver.email}</div>
                        ) : (
                          <div className="text-[10px] text-amber-500/80 italic">No email on file</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <UKPlate reg={vehicle?.registration ?? driver.registration} size="sm" />
                          <span className="text-xs text-[#aeb8c9]">
                            {vehicle ? simplifyVehicleName(vehicle) : "Unassigned"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#9aa5b8]">
                        <div className="font-semibold text-white">£{driver.weekly_rent || 0}/wk</div>
                        <div className="text-[10px] text-[#8b95a8]">
                          {driver.rent_due_day || "Monday"} (Next:{" "}
                          {calculateNextPaymentDueDate(driver.start_date, driver.rent_due_day).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                          )
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await data.toggleRentStatus(
                                driver.id,
                                driver.rent_status,
                                driver.weekly_rent,
                                driver.balance_due,
                              );
                              toast(`Rent status for ${driver.driver_name} updated`);
                            } catch (err: any) {
                              toast(err?.message ?? "Failed to update rent status", "error");
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border transition-all ${
                            driver.rent_status === "paid"
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                              : "border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              driver.rent_status === "paid" ? "bg-emerald-400" : "bg-red-400"
                            }`}
                          />
                          {driver.rent_status === "paid" ? "Paid" : "Unpaid"}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBalanceDriver(driver);
                          }}
                          className="hover:underline text-left cursor-pointer"
                          title="Open Deposit & Financial Balance popup"
                        >
                          <span
                            className={
                              balanceDueVal > 0 ? "font-bold text-red-400" : "text-[#9aa5b8]"
                            }
                          >
                            £{balanceDueVal.toFixed(2)}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">{portalStatusBadge(driver)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isPortalActive && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInviteModalDriver(driver);
                              }}
                              title="Send Portal Invite"
                              className="inline-flex items-center gap-1 rounded-md border border-[#ff6a00]/40 bg-[#ff6a00]/15 px-2 py-1 text-[11px] font-bold text-[#ff8a3d] hover:bg-[#ff6a00]/25"
                            >
                              <Icon.Bolt className="h-3 w-3" />
                              {driver.invite_status === "pending" ? "Re-invite" : "Invite"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewDriver(driver);
                            }}
                            title="View WhatsApp Chat History"
                            className="rounded-md border p-1.5 text-[#8b95a8] hover:bg-white/10 hover:text-white"
                            style={{ borderColor: T.borderSoft }}
                          >
                            <Icon.Chat className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProfileDriver(driver);
                            }}
                            title="Driver Settings & Profile"
                            className="rounded-md border p-1.5 text-[#8b95a8] hover:bg-white/10 hover:text-white"
                            style={{ borderColor: T.borderSoft }}
                          >
                            <Icon.Cog className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(driver);
                            }}
                            title="Delete Driver"
                            className="rounded-md border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                          >
                            <Icon.X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Driver Modal */}
      {addModalOpen && (
        <AddDriverModal
          vehicles={vehicles}
          onClose={() => setAddModalOpen(false)}
          onSave={async (newDriver) => {
            try {
              await data.addDriver(newDriver);
              toast(`Driver ${newDriver.driver_name} saved`);
              setAddModalOpen(false);
            } catch (err: any) {
              toast(err?.message ?? "Failed to save driver", "error");
            }
          }}
        />
      )}

      {/* Profile Popup */}
      {profileDriver && (
        <DriverProfileModal
          driver={drivers.find((d) => d.id === profileDriver.id) || profileDriver}
          vehicles={vehicles}
          data={data}
          toast={toast}
          onClose={() => setProfileDriver(null)}
          onSave={async (updatedDriver) => {
            try {
              await data.editDriver(updatedDriver);
              toast(`Driver ${updatedDriver.driver_name} updated`);
              setProfileDriver(null);
            } catch (err: any) {
              toast(err?.message ?? "Failed to update driver", "error");
            }
          }}
        />
      )}

      {/* Balance Popup */}
      {balanceDriver && (
        <DriverBalanceModal
          driver={drivers.find((d) => d.id === balanceDriver.id) || balanceDriver}
          vehicles={vehicles}
          data={data}
          toast={toast}
          onClose={() => setBalanceDriver(null)}
        />
      )}

      {/* Send Portal Invite Modal */}
      {inviteModalDriver && (
        <PortalInviteModal
          driver={inviteModalDriver}
          onClose={() => setInviteModalDriver(null)}
          onGenerateInvite={async () => {
            try {
              const token = await data.generatePortalInvite(inviteModalDriver.id);
              toast(`Portal invite link generated for ${inviteModalDriver.driver_name}`);
              return token;
            } catch (err: any) {
              toast(err?.message ?? "Failed to generate portal invite", "error");
              throw err;
            }
          }}
          onEditEmail={() => {
            const driverToEdit = inviteModalDriver;
            setInviteModalDriver(null);
            setProfileDriver(driverToEdit);
          }}
        />
      )}

      {/* Driver WhatsApp History Preview Modal */}
      {previewDriver && (
        <DriverPreviewModal
          driver={previewDriver}
          vehicle={vehicles.find((item) => item.id === previewDriver.vehicle_id)}
          onClose={() => setPreviewDriver(null)}
          onSendInvite={() => {
            const d = previewDriver;
            setPreviewDriver(null);
            setInviteModalDriver(d);
          }}
        />
      )}
    </div>
  );
}

function AddDriverModal({
  vehicles,
  onClose,
  onSave,
}: {
  vehicles: Vehicle[];
  onClose: () => void;
  onSave: (driver: Omit<DriverTrack, "id" | "monthly_logs">) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [licenceExpiry, setLicenceExpiry] = useState("");
  const [weeklyRent, setWeeklyRent] = useState("200");
  const [rentDueDay, setRentDueDay] = useState("Monday");
  const [rentStatus, setRentStatus] = useState<"paid" | "unpaid">("unpaid");
  const [balanceDue, setBalanceDue] = useState("200");
  const [allowance, setAllowance] = useState("5000");
  const [excessRate, setExcessRate] = useState("20");
  const [saving, setSaving] = useState(false);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedVehicle) return;
    setSaving(true);
    try {
      const rentAmt = parseFloat(weeklyRent) || 0;
      await onSave({
        driver_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        vehicle_id: selectedVehicle.id,
        registration: selectedVehicle.registration,
        start_mileage: selectedVehicle.current_mileage,
        current_mileage: selectedVehicle.current_mileage,
        allowance: parseInt(allowance) || 5000,
        excess_rate: parseInt(excessRate) || 20,
        start_date: startDate,
        licence_expiry_date: licenceExpiry || null,
        weekly_rent: rentAmt,
        rent_due_day: rentDueDay,
        rent_status: rentStatus,
        balance_due: parseFloat(balanceDue) ?? rentAmt,
      });
      onClose();
    } catch {
      // Error notification handled by parent onSave catch handler
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#10141d] p-5 shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
        style={{ borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Add New Driver</h3>
          <button onClick={onClose} className="text-[#8b95a8] hover:text-white">
            <Icon.X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <Field label="Full Name *">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="e.g. John Smith"
            />
          </Field>
          <Field label="Email Address">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="e.g. driver@example.com"
            />
          </Field>
          <Field label="Phone Number *">
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputCls}
              placeholder="e.g. +44 7721 502779"
            />
          </Field>
          <Field label="Linked Vehicle *">
            <DarkSelect
              value={vehicleId}
              onChange={(val) => {
                setVehicleId(val);
                const newV = vehicles.find((v) => v.id === val);
                if (newV) {
                  const price = getVehicleWeeklyPrice(newV.make, newV.model);
                  setWeeklyRent(String(price));
                  setBalanceDue(String(price));
                  const defDep = newV.default_deposit ?? getVehicleDefaultDeposit(newV.make, newV.model);
                  setDepositTotal(String(defDep));
                }
              }}
              placeholder="Choose a vehicle…"
              options={vehicles.map((v) => ({
                value: v.id,
                label: `${v.registration} — ${simplifyVehicleName(v)}`,
              }))}
            />
          </Field>
          <Grid2>
            <Field label="Rent Start Date">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Licence Expiry Date">
              <input
                type="date"
                value={licenceExpiry}
                onChange={(e) => setLicenceExpiry(e.target.value)}
                className={inputCls}
              />
            </Field>
          </Grid2>
          <Grid2>
            <Field label="Weekly Rent (£)">
              <input
                type="number"
                step="0.01"
                value={weeklyRent}
                onChange={(e) => setWeeklyRent(e.target.value)}
                className={inputCls}
              />
            </Field>
          <Grid2>
            <Field label="Rent Due Day">
              <DarkSelect
                value={rentDueDay}
                onChange={setRentDueDay}
                options={[
                  { value: "Monday", label: "Monday" },
                  { value: "Tuesday", label: "Tuesday" },
                  { value: "Wednesday", label: "Wednesday" },
                  { value: "Thursday", label: "Thursday" },
                  { value: "Friday", label: "Friday" },
                  { value: "Saturday", label: "Saturday" },
                  { value: "Sunday", label: "Sunday" },
                ]}
              />
            </Field>
            <Field label="Total Balance Due (£)">
              <input
                type="number"
                step="0.01"
                value={balanceDue}
                onChange={(e) => setBalanceDue(e.target.value)}
                className={inputCls}
              />
            </Field>
          </Grid2>
          <Grid2>
            <Field label="Monthly Allowance (mi)">
              <input
                type="number"
                value={allowance}
                onChange={(e) => setAllowance(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Excess Rate (p/mi)">
              <input
                type="number"
                value={excessRate}
                onChange={(e) => setExcessRate(e.target.value)}
                className={inputCls}
              />
            </Field>
          </Grid2>
          <div className="flex justify-end gap-2 border-t pt-3" style={{ borderColor: T.border }}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 hover:bg-white/10"
              style={{ borderColor: T.border }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !vehicleId}
              className="rounded-lg bg-[#ff6a00] px-4 py-2 font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Driver"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CustomMessageModal({
  driver,
  onClose,
  onSend,
}: {
  driver: DriverTrack;
  onClose: () => void;
  onSend: (rewordedMessage: string) => Promise<void>;
}) {
  const [rawText, setRawText] = useState("");
  const [rewordedText, setRewordedText] = useState("");
  const [reworded, setReworded] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [sending, setSending] = useState(false);

  const handleReword = async () => {
    if (!rawText.trim()) return;
    setLoadingAi(true);
    try {
      const res = await rewordCustomMessage({
        data: {
          driverName: driver.driver_name,
          registration: driver.registration,
          rawMessage: rawText.trim(),
        },
      });
      setRewordedText(res.reworded);
      setReworded(true);
    } catch (e: any) {
      setRewordedText(`Hello ${driver.driver_name}, ${rawText.trim()}. Please check your portal.`);
      setReworded(true);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleConfirmSend = async () => {
    const messageToSend = rewordedText.trim() || rawText.trim();
    if (!messageToSend) return;
    setSending(true);
    try {
      await onSend(messageToSend);
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#10141d] p-5 sm:p-6 shadow-2xl space-y-4"
        style={{ borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: T.borderSoft }}>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Icon.Sparkles className="h-4 w-4 text-[#ff6a00]" /> Custom Message for {driver.driver_name}
          </h3>
          <button onClick={onClose} className="text-[#8b95a8] hover:text-white">
            <Icon.X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="mb-1 block font-bold text-[#8b95a8]">Step 1: Type Plain Message</label>
            <textarea
              rows={3}
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setReworded(false);
              }}
              placeholder="e.g. Please bring vehicle reg LB22 OKM in for service on Thursday at 10am."
              className={inputCls}
            />
          </div>

          <button
            type="button"
            disabled={!rawText.trim() || loadingAi}
            onClick={handleReword}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 font-bold text-white shadow-md hover:from-orange-600 hover:to-amber-600 disabled:opacity-50"
          >
            <Icon.Sparkles className="h-4 w-4" />
            {loadingAi ? "AI Rewording..." : "AI Reword Message"}
          </button>

          {reworded && (
            <div className="space-y-2 rounded-xl border p-3.5 bg-white/5 border-orange-500/30">
              <label className="block font-bold text-[#ff8a3d]">
                Step 2: Polished Message (Review / Edit before sending)
              </label>
              <textarea
                rows={4}
                value={rewordedText}
                onChange={(e) => setRewordedText(e.target.value)}
                className={inputCls}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-xs font-semibold text-[#8b95a8] hover:bg-white/5"
            style={{ borderColor: T.border }}
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={(!rewordedText.trim() && !rawText.trim()) || sending}
            onClick={handleConfirmSend}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#ff6a00] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50"
          >
            {sending ? "Sending Notice..." : "Confirm & Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DriverDocumentsSection({
  driver,
  toast,
}: {
  driver: DriverTrack;
  toast: (m: string, t?: Toast["type"]) => void;
}) {
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const [unlinkedDocs, setUnlinkedDocs] = useState<DriverDocument[]>([]);
  const [selectedUnlinkedDocId, setSelectedUnlinkedDocId] = useState<string>("");
  const [attachingDoc, setAttachingDoc] = useState(false);

  const docTypes: { type: DriverDocument["document_type"]; label: string }[] = [
    { type: "contract", label: "Contract" },
    { type: "permission_letter", label: "Permission Letter" },
    { type: "vehicle_schedule", label: "Vehicle Schedule" },
    { type: "pco_licence", label: "PCO Licence" },
  ];

  const fetchDocs = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("driver_documents")
        .select("*")
        .eq("driver_id", driver.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDocuments((data as any) || []);
    } catch {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [driver.id]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);
  const fetchUnlinkedDocs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("driver_documents")
        .select("*")
        .is("driver_id", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error && data) {
        setUnlinkedDocs((data as any) || []);
      }
    } catch {
      setUnlinkedDocs([]);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
    fetchUnlinkedDocs();
  }, [fetchDocs, fetchUnlinkedDocs]);

  const handleAttachGeneratedDoc = async () => {
    if (!selectedUnlinkedDocId) return;
    const docToAttach = unlinkedDocs.find((d) => d.id === selectedUnlinkedDocId);
    if (!docToAttach) return;

    setAttachingDoc(true);
    try {
      // Associate unlinked document with the current driver
      const { error } = await supabase
        .from("driver_documents")
        .update({ driver_id: driver.id } as any)
        .eq("id", docToAttach.id);

      if (error) throw error;

      const typeLabel =
        docToAttach.document_type === "permission_letter"
          ? "Permission Letter"
          : docToAttach.document_type === "contract"
            ? "Contract"
            : docToAttach.document_type === "vehicle_schedule"
              ? "Vehicle Schedule"
              : "PCO Licence";

      toast(`Linked ${typeLabel} (${docToAttach.file_name}) to ${driver.driver_name}`);
      setSelectedUnlinkedDocId("");
      await fetchDocs();
      await fetchUnlinkedDocs();
    } catch (err: any) {
      toast(err?.message || "Failed to attach document", "error");
    } finally {
      setAttachingDoc(false);
    }
  };

  const handleUpload = async (
    docType: DriverDocument["document_type"],
    file: File
  ) => {
    if (!file) return;
    setUploadingDoc(docType);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id || null;

      const fileExt = file.name.split(".").pop();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `${driver.id}/${docType}_${Date.now()}_${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from("driver-documents")
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { error: dbErr } = await supabase.from("driver_documents").insert({
        driver_id: driver.id,
        user_id: userId,
        document_type: docType,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
      } as any);

      if (dbErr) throw dbErr;

      toast(`Uploaded ${file.name}`);
      await fetchDocs();
    } catch (err: any) {
      toast(err?.message || "Failed to upload document", "error");
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleDelete = async (doc: DriverDocument) => {
    if (!confirm(`Delete ${doc.file_name}?`)) return;
    try {
      await supabase.storage.from("driver-documents").remove([doc.file_path]);
      await supabase.from("driver_documents").delete().eq("id", doc.id);
      toast(`Removed ${doc.file_name}`, "info");
      await fetchDocs();
    } catch (err: any) {
      toast(err?.message || "Failed to delete document", "error");
    }
  };

  const getPublicUrl = (filePath: string) => {
    const { data } = supabase.storage.from("driver-documents").getPublicUrl(filePath);
    return data.publicUrl;
  };

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: T.borderSoft, background: T.panel }}>
      <div className="flex items-center justify-between">
        <div className="font-bold text-white text-xs">Driver Documents & Portal Attachments</div>
        <span className="text-[10px] text-[#8b95a8]">Syncs live with Driver Portal</span>
      </div>

      {/* Recently Generated Letters Dropdown (VCHLetter Integration) */}
      <div className="rounded-lg border p-3 space-y-2 text-xs" style={{ borderColor: T.borderSoft, background: T.panel2 }}>
        <div className="font-semibold text-white flex items-center justify-between">
          <span>Attach a recently generated letter (VCHLetter)</span>
          <span className="text-[10px] text-[#ff8a3d] font-normal">VCHLetter sync</span>
        </div>
        <p className="text-[11px] text-[#8b95a8]">
          Attach unlinked contracts or permission letters created in the VCHLetter tool directly to this driver.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <select
            value={selectedUnlinkedDocId}
            onChange={(e) => setSelectedUnlinkedDocId(e.target.value)}
            disabled={attachingDoc || unlinkedDocs.length === 0}
            className="flex-1 rounded border bg-[#142131] px-2.5 py-1.5 text-xs text-white focus:border-[#ff6a00] focus:outline-none"
            style={{ borderColor: T.borderSoft }}
          >
            <option value="">
              {unlinkedDocs.length === 0
                ? "No unlinked generated letters found"
                : "Select a generated PDF letter..."}
            </option>
            {unlinkedDocs.map((doc) => {
              const typeLabel =
                doc.document_type === "permission_letter"
                  ? "Permission Letter"
                  : doc.document_type === "contract"
                    ? "Contract"
                    : doc.document_type === "vehicle_schedule"
                      ? "Vehicle Schedule"
                      : "PCO Licence";

              const dateStr = new Date(doc.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <option key={doc.id} value={doc.id}>
                  {typeLabel} ({dateStr}) — {doc.file_name}
                </option>
              );
            })}
          </select>

          <button
            type="button"
            disabled={!selectedUnlinkedDocId || attachingDoc}
            onClick={handleAttachGeneratedDoc}
            className="rounded border border-[#ff6a00]/50 bg-[#ff6a00] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#e05d00] disabled:opacity-50 transition-colors shrink-0"
          >
            {attachingDoc ? "Attaching..." : "Attach Letter"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-[#8b95a8] py-2">Loading documents...</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {docTypes.map(({ type, label }) => {
            const existingDocs = documents.filter((d) => d.document_type === type);
            const isUploading = uploadingDoc === type;

            return (
              <div
                key={type}
                className="rounded-lg border p-3 flex flex-col justify-between space-y-2 text-xs"
                style={{ borderColor: T.borderSoft, background: T.panel2 }}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[#8b95a8]">
                      {existingDocs.length} uploaded
                    </span>
                  </div>

                  {existingDocs.length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {existingDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-2 rounded bg-black/30 p-1.5 text-[11px]"
                        >
                          <div className="min-w-0 flex-1 truncate">
                            <a
                              href={getPublicUrl(doc.file_path)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-[#ff8a3d] hover:underline truncate block"
                              title={doc.file_name}
                            >
                              📄 {doc.file_name}
                            </a>
                            {doc.file_size ? (
                              <span className="text-[10px] text-[#8b95a8]">
                                {(doc.file_size / (1024 * 1024)).toFixed(1)} MB
                              </span>
                            ) : null}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDelete(doc)}
                            className="text-red-400 hover:text-red-300 px-1 py-0.5"
                            title="Delete Document"
                          >
                            <Icon.X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-[#8b95a8] italic">No {label.toLowerCase()} uploaded</p>
                  )}
                </div>

                <div className="pt-1">
                  <label className="block w-full cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      disabled={isUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(type, file);
                        e.target.value = "";
                      }}
                    />
                    <span className="flex items-center justify-center gap-1 w-full rounded border border-[#ff6a00]/40 bg-[#ff6a00]/10 px-2.5 py-1.5 text-[11px] font-bold text-[#ff8a3d] hover:bg-[#ff6a00]/20 transition-colors">
                      <Icon.Plus className="h-3 w-3" />
                      {isUploading ? "Uploading..." : `Upload ${label}`}
                    </span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DriverProfileModal({
  driver,
  vehicles,
  data,
  toast,
  onClose,
  onSave,
}: {
  driver: DriverTrack;
  vehicles: Vehicle[];
  data: ReturnType<typeof useFleetData>;
  toast: (m: string, t?: Toast["type"]) => void;
  onClose: () => void;
  onSave: (driver: DriverTrack) => Promise<void>;
}) {
  const [name, setName] = useState(driver.driver_name);
  const [email, setEmail] = useState(driver.email || "");
  const [phone, setPhone] = useState(driver.phone || "");
  const [vehicleId, setVehicleId] = useState(driver.vehicle_id);
  const [startDate, setStartDate] = useState(driver.start_date || new Date().toISOString().slice(0, 10));
  const [licenceExpiry, setLicenceExpiry] = useState(driver.licence_expiry_date || "");
  const [contractWeeks, setContractWeeks] = useState(String(driver.contract_length_weeks ?? 6));
  const [saving, setSaving] = useState(false);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [customMsgModalOpen, setCustomMsgModalOpen] = useState(false);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  const [nextMotDate, setNextMotDate] = useState(selectedVehicle?.next_mot_date || "");
  const [insuranceExpiry, setInsuranceExpiry] = useState(selectedVehicle?.insurance_expiry || "");

  useEffect(() => {
    const v = vehicles.find((item) => item.id === vehicleId);
    if (v) {
      setNextMotDate(v.next_mot_date || "");
      setInsuranceExpiry(v.insurance_expiry || "");
    }
  }, [vehicleId, vehicles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (
        selectedVehicle &&
        (nextMotDate !== selectedVehicle.next_mot_date || insuranceExpiry !== selectedVehicle.insurance_expiry)
      ) {
        await data.saveVehicle(
          {
            ...selectedVehicle,
            next_mot_date: nextMotDate,
            insurance_expiry: insuranceExpiry,
          },
          false,
        );
      }

      await onSave({
        ...driver,
        driver_name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        vehicle_id: selectedVehicle ? selectedVehicle.id : driver.vehicle_id,
        registration: selectedVehicle ? selectedVehicle.registration : driver.registration,
        start_date: startDate,
        licence_expiry_date: licenceExpiry || null,
        contract_length_weeks: parseInt(contractWeeks) || 6,
      });
      onClose();
    } catch (err: any) {
      toast(err?.message ?? "Failed to save driver profile", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSendReminder = async (type: "mot" | "service" | "pco" | "contract") => {
    setSendingReminder(type);
    try {
      await data.sendDriverReminder(driver, type);
      toast(`${type.toUpperCase()} reminder sent to driver portal & email`);
    } catch (err: any) {
      toast(err?.message ?? "Failed to send reminder", "error");
    } finally {
      setSendingReminder(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#10141d] p-6 shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200 space-y-5"
        style={{ borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-white/20 sm:hidden" />
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: T.border }}>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">Driver Profile</h3>
              {portalStatusBadge(driver)}
            </div>
            <p className="text-xs text-[#8b95a8]">
              {driver.driver_name} — {selectedVehicle ? `${selectedVehicle.registration} (${simplifyVehicleName(selectedVehicle)})` : driver.registration}
            </p>
          </div>
          <button onClick={onClose} className="text-[#8b95a8] hover:text-white">
            <Icon.X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Alert Reminders */}
        <div className="rounded-xl border p-4 space-y-2.5" style={{ borderColor: T.borderSoft, background: T.panel }}>
          <div className="text-xs font-bold uppercase tracking-wider text-[#ff8a3d]">Quick Alert & Reminder Actions</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={sendingReminder !== null}
              onClick={() => handleSendReminder("mot")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-50"
            >
              <Icon.Alert className="h-3.5 w-3.5" />
              {sendingReminder === "mot" ? "Sending..." : "MOT Reminder"}
            </button>
            <button
              type="button"
              disabled={sendingReminder !== null}
              onClick={() => handleSendReminder("service")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 disabled:opacity-50"
            >
              <Icon.Wrench className="h-3.5 w-3.5" />
              {sendingReminder === "service" ? "Sending..." : "Service Reminder"}
            </button>
            <button
              type="button"
              disabled={sendingReminder !== null}
              onClick={() => handleSendReminder("pco")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/15 px-3 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 disabled:opacity-50"
            >
              <Icon.Shield className="h-3.5 w-3.5" />
              {sendingReminder === "pco" ? "Sending..." : "PCO Reminder"}
            </button>
            <button
              type="button"
              disabled={sendingReminder !== null}
              onClick={() => handleSendReminder("contract")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/15 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:bg-orange-500/25 disabled:opacity-50"
            >
              <Icon.Calendar className="h-3.5 w-3.5" />
              {sendingReminder === "contract" ? "Sending..." : "Contract Renewal Reminder"}
            </button>
            <button
              type="button"
              disabled={sendingReminder !== null}
              onClick={() => setCustomMsgModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <Icon.Sparkles className="h-3.5 w-3.5" />
              Custom Message
            </button>
          </div>
          <p className="text-[11px] text-[#8b95a8]">
            Sends a direct notification to the driver's portal dashboard and an email copy if connected.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <Grid2>
            <Field label="Full Name *">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Phone Number">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </Field>
          </Grid2>

          <Grid2>
            <Field label="Email Address">
              <div>
                <input
                  type="email"
                  readOnly={Boolean(driver.auth_user_id || driver.email)}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${inputCls} ${driver.auth_user_id || driver.email ? "opacity-75 cursor-not-allowed bg-white/5" : ""}`}
                  placeholder="e.g. driver@example.com"
                />
                {driver.auth_user_id || driver.email ? (
                  <span className="mt-1 text-[10px] text-emerald-400 block font-medium">
                    ✓ Set by customer (website account login)
                  </span>
                ) : null}
              </div>
            </Field>

            <Field label="Linked Vehicle">
              <DarkSelect
                value={vehicleId}
                onChange={(val) => setVehicleId(val)}
                options={vehicles.map((v) => ({
                  value: v.id,
                  label: `${v.registration} — ${simplifyVehicleName(v)}`,
                }))}
              />
            </Field>
          </Grid2>

          {selectedVehicle ? (
            <Grid2>
              <Field label="Linked Vehicle Next MOT">
                <input
                  type="date"
                  value={nextMotDate}
                  onChange={(e) => setNextMotDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Linked Vehicle PCO License Expiry">
                <input
                  type="date"
                  value={insuranceExpiry}
                  onChange={(e) => setInsuranceExpiry(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </Grid2>
            <Grid2>
              <Field label="Driver Licence Expiry Date">
                <input
                  type="date"
                  value={licenceExpiry}
                  onChange={(e) => setLicenceExpiry(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </Grid2>
          ) : null}

          {/* Contract Term & Renewal Tracking */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: T.borderSoft, background: T.panel }}>
            <div className="font-bold text-white text-xs">Contract Term & Renewal</div>
            <Grid2>
              <Field label="Contract Start Date">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Contract Length (Weeks)">
                <input
                  type="number"
                  min="1"
                  value={contractWeeks}
                  onChange={(e) => setContractWeeks(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </Grid2>
            <Grid2>
              <Field label="Calculated Contract End Date">
                <div className="rounded-lg border px-3 py-2 text-xs font-semibold text-white bg-white/5 border-white/10">
                  {calculateContractEndDate(startDate, parseInt(contractWeeks) || 6).toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </Field>
              <Field label="Contract Status / Time Remaining">
                {(() => {
                  const remDays = getContractDaysRemaining(startDate, parseInt(contractWeeks) || 6);
                  return (
                    <div
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                        remDays <= 14
                          ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
                          : "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
                      }`}
                    >
                      {remDays < 0
                        ? `${Math.abs(remDays)} days past contract end`
                        : `${remDays} days remaining (${Math.ceil(remDays / 7)} weeks)`}
                    </div>
                  );
                })()}
              </Field>
            </Grid2>
          </div>

          {/* Document Upload Section */}
          <DriverDocumentsSection driver={driver} toast={toast} />

          <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: T.border }}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 hover:bg-white/10"
              style={{ borderColor: T.border }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-lg bg-[#ff6a00] px-4 py-2 font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </form>

        {customMsgModalOpen && (
          <CustomMessageModal
            driver={driver}
            onClose={() => setCustomMsgModalOpen(false)}
            onSend={async (finalMessage) => {
              try {
                await data.sendDriverReminder(driver, "custom", finalMessage);
                toast(`Custom message sent to ${driver.driver_name}'s portal & email`);
              } catch (err: any) {
                toast(err?.message ?? "Failed to send custom message", "error");
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function DriverBalanceModal({
  driver,
  vehicles,
  data,
  toast,
  onClose,
}: {
  driver: DriverTrack;
  vehicles: Vehicle[];
  data: ReturnType<typeof useFleetData>;
  toast: (m: string, t?: Toast["type"]) => void;
  onClose: () => void;
}) {
  const [depositTotal, setDepositTotal] = useState(String(driver.deposit_total ?? 0));
  const [weeklyRent, setWeeklyRent] = useState(String(driver.weekly_rent || 0));
  const [rentDueDay, setRentDueDay] = useState(driver.rent_due_day || "Monday");
  const [rentStatus, setRentStatus] = useState<"paid" | "unpaid">(driver.rent_status || "unpaid");
  const [balanceDue, setBalanceDue] = useState(String(driver.balance_due || 0));
  const [startDate, setStartDate] = useState(driver.start_date || new Date().toISOString().slice(0, 10));

  const [depAmount, setDepAmount] = useState("");
  const [depDate, setDepDate] = useState(new Date().toISOString().slice(0, 10));
  const [depNote, setDepNote] = useState("");
  const [addingDeposit, setAddingDeposit] = useState(false);
  const [togglingDeposit, setTogglingDeposit] = useState(false);

  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDesc, setChargeDesc] = useState("");
  const [addingCharge, setAddingCharge] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBalanceDue(String(driver.balance_due || 0));
  }, [driver.balance_due]);

  useEffect(() => {
    setRentStatus(driver.rent_status || "unpaid");
  }, [driver.rent_status]);

  const totalPaidDeposit = (driver.deposit_payments || []).reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );
  const agreedDeposit = parseFloat(depositTotal) || 0;
  const isDepositFullyPaid = agreedDeposit > 0 && totalPaidDeposit >= agreedDeposit;

  const handleToggleDepositPaid = async () => {
    setTogglingDeposit(true);
    try {
      await data.toggleDepositPaidStatus(driver.id, !isDepositFullyPaid, agreedDeposit);
      toast(
        !isDepositFullyPaid
          ? `Marked deposit as fully paid (£${agreedDeposit})`
          : `Deposit status reset to unpaid`
      );
    } catch (err: any) {
      toast(err?.message || "Failed to update deposit status", "error");
    } finally {
      setTogglingDeposit(false);
    }
  };

  const handleAddDeposit = async () => {
    const amt = parseFloat(depAmount);
    if (!amt || isNaN(amt)) return;
    setAddingDeposit(true);
    try {
      await data.addDepositPayment(driver.id, amt, depNote.trim() || undefined, depDate);
      toast(`Recorded deposit payment of £${amt.toFixed(2)} for ${driver.driver_name}`);
      setDepAmount("");
      setDepNote("");
    } catch (err: any) {
      toast(err?.message ?? "Failed to record deposit payment", "error");
    } finally {
      setAddingDeposit(false);
    }
  };

  const handleAddCharge = async () => {
    const amt = parseFloat(chargeAmount);
    if (!amt || isNaN(amt) || !chargeDesc.trim()) return;
    setAddingCharge(true);
    try {
      await data.addDriverCharge(driver.id, amt, chargeDesc.trim());
      toast(`Added charge of £${amt.toFixed(2)} to ${driver.driver_name}'s balance`);
      setChargeAmount("");
      setChargeDesc("");
      setBalanceDue(String(Number(balanceDue || 0) + amt));
    } catch (err: any) {
      toast(err?.message ?? "Failed to add charge", "error");
    } finally {
      setAddingCharge(false);
    }
  };

  const handleSaveFinancials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await data.editDriver({
        ...driver,
        deposit_total: parseFloat(depositTotal) || 0,
        weekly_rent: parseFloat(weeklyRent) || 0,
        rent_due_day: rentDueDay,
        rent_status: rentStatus,
        balance_due: parseFloat(balanceDue) || 0,
      });
      toast(`Financial details for ${driver.driver_name} updated`);
      onClose();
    } catch (err: any) {
      toast(err?.message ?? "Failed to update balance details", "error");
    } finally {
      setSaving(false);
    }
  };

  const selectedVehicle = vehicles.find((v) => v.id === driver.vehicle_id);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#10141d] p-6 shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200 space-y-5"
        style={{ borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-white/20 sm:hidden" />
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: T.border }}>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">Deposit & Balance Details</h3>
              <span className="font-bold text-red-400 text-sm">
                Balance Due: £{Number(balanceDue || 0).toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-[#8b95a8]">
              {driver.driver_name} — {selectedVehicle ? `${selectedVehicle.registration} (${simplifyVehicleName(selectedVehicle)})` : driver.registration}
            </p>
          </div>
          <button onClick={onClose} className="text-[#8b95a8] hover:text-white">
            <Icon.X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSaveFinancials} className="space-y-4 text-xs">
          {/* Deposit Tracking & Paid/Unpaid Toggle */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: T.borderSoft, background: T.panel }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-bold text-white text-xs">Deposit Tracking</div>
              <div className="flex items-center gap-2">
                {(() => {
                  let badgeCls = "border-red-500/40 bg-red-500/15 text-red-300";
                  let label = "Unpaid";
                  if (agreedDeposit > 0 && totalPaidDeposit >= agreedDeposit) {
                    badgeCls = "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
                    label = "Paid in full";
                  } else if (totalPaidDeposit > 0) {
                    badgeCls = "border-amber-500/40 bg-amber-500/15 text-amber-300";
                    label = `£${totalPaidDeposit} of £${agreedDeposit} paid`;
                  } else if (agreedDeposit === 0) {
                    badgeCls = "border-slate-500/40 bg-slate-500/15 text-slate-300";
                    label = "None set";
                  }
                  return (
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${badgeCls}`}>
                      {label}
                    </span>
                  );
                })()}

                <button
                  type="button"
                  disabled={togglingDeposit || agreedDeposit === 0}
                  onClick={handleToggleDepositPaid}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold border transition-colors ${
                    isDepositFullyPaid
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                      : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${isDepositFullyPaid ? "bg-amber-400" : "bg-emerald-400"}`} />
                  {togglingDeposit
                    ? "Updating..."
                    : isDepositFullyPaid
                      ? "Mark Unpaid"
                      : "Mark Paid Outright"}
                </button>
              </div>
            </div>

            <Grid2>
              <Field label="Total Agreed Deposit (£)">
                <input
                  type="number"
                  step="0.01"
                  value={depositTotal}
                  onChange={(e) => setDepositTotal(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Outstanding Deposit Balance (£)">
                {(() => {
                  const outstanding = Math.max(0, agreedDeposit - totalPaidDeposit);
                  return (
                    <div className="rounded-lg border px-3 py-2 text-xs font-bold text-white bg-white/5 border-white/10">
                      £{outstanding.toFixed(2)}
                    </div>
                  );
                })()}
              </Field>
            </Grid2>

            {/* Deposit Payments Received List */}
            <div className="border-t pt-3 space-y-2.5" style={{ borderColor: T.borderSoft }}>
              <div className="font-semibold text-white text-xs">Deposit Payments Received</div>
              {driver.deposit_payments && driver.deposit_payments.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {driver.deposit_payments.map((dp) => (
                    <div
                      key={dp.id}
                      className="flex justify-between items-center rounded-lg border p-2 text-xs"
                      style={{ borderColor: T.borderSoft, background: T.panel2 }}
                    >
                      <div>
                        <div className="font-medium text-white">{dp.note || "Deposit Payment"}</div>
                        <div className="text-[10px] text-[#8b95a8]">
                          {new Date(dp.paid_at).toLocaleDateString("en-GB")}
                        </div>
                      </div>
                      <div className="font-bold text-emerald-400">+£{Number(dp.amount).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-[#8b95a8] italic">No deposit payments recorded yet.</div>
              )}

              {/* Record Deposit Instalment Form */}
              <div className="rounded-lg border p-2.5 space-y-2" style={{ borderColor: T.border, background: T.panel2 }}>
                <div className="text-[11px] font-bold text-[#ff8a3d]">Record Deposit Payment / Instalment</div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={depAmount}
                    onChange={(e) => setDepAmount(e.target.value)}
                    placeholder="Amount (£)"
                    className="w-28 rounded-lg border py-1.5 px-2 text-xs text-white"
                    style={{ borderColor: T.border, background: T.panel }}
                  />
                  <input
                    type="date"
                    value={depDate}
                    onChange={(e) => setDepDate(e.target.value)}
                    className="w-36 rounded-lg border py-1.5 px-2 text-xs text-white"
                    style={{ borderColor: T.border, background: T.panel }}
                  />
                  <input
                    type="text"
                    value={depNote}
                    onChange={(e) => setDepNote(e.target.value)}
                    placeholder="Optional note (e.g. 2nd instalment)"
                    className="flex-1 min-w-[150px] rounded-lg border py-1.5 px-2 text-xs text-white"
                    style={{ borderColor: T.border, background: T.panel }}
                  />
                  <button
                    type="button"
                    disabled={addingDeposit || !depAmount}
                    onClick={handleAddDeposit}
                    className="rounded-lg bg-[#ff6a00] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#e05d00] disabled:opacity-50 shrink-0"
                  >
                    {addingDeposit ? "Saving..." : "Record Payment"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Rent & Financial Tracking */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: T.borderSoft, background: T.panel }}>
            <div className="font-bold text-white text-xs">Rent & Account Balance</div>
            <Grid2>
              <Field label="Rent Start Date">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Weekly Rent (£)">
                <input
                  type="number"
                  step="0.01"
                  value={weeklyRent}
                  onChange={(e) => setWeeklyRent(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </Grid2>

            <Grid2>
              <Field label="Rent Due Day">
                <DarkSelect
                  value={rentDueDay}
                  onChange={setRentDueDay}
                  options={[
                    { value: "Monday", label: "Monday" },
                    { value: "Tuesday", label: "Tuesday" },
                    { value: "Wednesday", label: "Wednesday" },
                    { value: "Thursday", label: "Thursday" },
                    { value: "Friday", label: "Friday" },
                    { value: "Saturday", label: "Saturday" },
                    { value: "Sunday", label: "Sunday" },
                  ]}
                />
              </Field>
              <Field label="Next Payment Due Date">
                <div className="rounded-lg border px-3 py-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                  {calculateNextPaymentDueDate(startDate, rentDueDay).toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </Field>
            </Grid2>

            <Grid2>
              <Field label="Rent Status">
                <DarkSelect
                  value={rentStatus}
                  onChange={(v) => setRentStatus(v as "paid" | "unpaid")}
                  options={[
                    { value: "paid", label: "Paid" },
                    { value: "unpaid", label: "Unpaid" },
                  ]}
                />
              </Field>
              <Field label="Total Balance Due (£)">
                <input
                  type="number"
                  step="0.01"
                  value={balanceDue}
                  onChange={(e) => setBalanceDue(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </Grid2>

            {/* Itemised Charges Breakdown & Add Charge */}
            <div className="border-t pt-3 space-y-2.5" style={{ borderColor: T.borderSoft }}>
              <div className="font-semibold text-white text-xs">Itemised Charges Breakdown</div>
              {driver.charges && driver.charges.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {driver.charges.map((c) => (
                    <div
                      key={c.id}
                      className="flex justify-between items-center rounded-lg border p-2 text-xs"
                      style={{ borderColor: T.borderSoft, background: T.panel2 }}
                    >
                      <div>
                        <div className="font-medium text-white">{c.description}</div>
                        <div className="text-[10px] text-[#8b95a8]">
                          {new Date(c.created_at).toLocaleDateString("en-GB")}
                        </div>
                      </div>
                      <div className="font-bold text-red-400">+£{Number(c.amount).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-[#8b95a8] italic">No extra charges recorded yet.</div>
              )}

              {/* Add Charge Input Form */}
              <div className="rounded-lg border p-2.5 space-y-2" style={{ borderColor: T.border, background: T.panel2 }}>
                <div className="text-[11px] font-bold text-[#ff8a3d]">Add New Charge (e.g. Maintenance, Tolls)</div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(e.target.value)}
                    placeholder="Amount (£)"
                    className="w-28 rounded-lg border py-1.5 px-2 text-xs text-white"
                    style={{ borderColor: T.border, background: T.panel }}
                  />
                  <input
                    type="text"
                    value={chargeDesc}
                    onChange={(e) => setChargeDesc(e.target.value)}
                    placeholder="Short description (e.g. Maintenance — brake pads)"
                    className="flex-1 rounded-lg border py-1.5 px-2 text-xs text-white"
                    style={{ borderColor: T.border, background: T.panel }}
                  />
                  <button
                    type="button"
                    disabled={addingCharge || !chargeAmount || !chargeDesc.trim()}
                    onClick={handleAddCharge}
                    className="rounded-lg bg-[#ff6a00] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#e05d00] disabled:opacity-50 shrink-0"
                  >
                    {addingCharge ? "Adding..." : "Add Charge"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: T.border }}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 hover:bg-white/10"
              style={{ borderColor: T.border }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#ff6a00] px-4 py-2 font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Financial Details"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function phoneKey(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/@c\.us|@s\.whatsapp\.net|@lid/gi, "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("0") ? `44${digits.slice(1)}` : digits;
}

function phoneKeysMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = phoneKey(left);
  const b = phoneKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  // Drivers are sometimes stored with a shortened local number while Meta
  // stores the full international number. Require an 8-digit suffix so this
  // remains safer than matching on a single short fragment.
  return a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8);
}

function PortalInviteModal({
  driver,
  onClose,
  onGenerateInvite,
}: {
  driver: DriverTrack;
  onClose: () => void;
  onGenerateInvite: () => Promise<string>;
  onEditEmail?: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const inviteUrl = token ? `https://virtualcarhire.pages.dev/portal/signup?invite=${token}` : "";
  const defaultMessage = `Hello ${driver.driver_name}, thank you for joining Virtual Car Hire. Please make an account using this link: ${inviteUrl}. This is our portal where you can track all your rent — whatever rent is coming, you'll be opted into service and rent reminders by email. Please look through there and create an account. If you have any trouble, please contact us straight away.`;

  const [messageTemplate, setMessageTemplate] = useState(defaultMessage);

  useEffect(() => {
    if (inviteUrl) {
      setMessageTemplate(
        `Hello ${driver.driver_name}, thank you for joining Virtual Car Hire. Please make an account using this link: ${inviteUrl}. This is our portal where you can track all your rent — whatever rent is coming, you'll be opted into service and rent reminders by email. Please look through there and create an account. If you have any trouble, please contact us straight away.`
      );
    }
  }, [inviteUrl, driver.driver_name]);

  const onGenerateRef = useRef(onGenerateInvite);
  useEffect(() => {
    onGenerateRef.current = onGenerateInvite;
  }, [onGenerateInvite]);

  useEffect(() => {
    // Generate a fresh unique token once on modal mount (Re-invite / Invite)
    let isMounted = true;
    void (async () => {
      setLoading(true);
      try {
        const t = await onGenerateRef.current();
        if (isMounted) {
          setToken(t);
        }
      } catch {
        // Toast handled in parent
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageTemplate);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // ignore copy error
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#10141d] p-5 shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
        style={{ borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff6a00]/20 text-[#ff8a3d]">
              <Icon.Bolt className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Generate Link</h3>
              <p className="text-xs text-[#8b95a8]">{driver.driver_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#8b95a8] hover:text-white">
            <Icon.X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div className="rounded-xl border p-3.5 space-y-2" style={{ borderColor: T.borderSoft, background: T.panel }}>
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#8b95a8]">Driver:</span>
              <span className="font-semibold text-white">{driver.driver_name}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#8b95a8]">Vehicle:</span>
              <span className="font-semibold text-white">{driver.registration}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#8b95a8]">Portal Status:</span>
              {portalStatusBadge(driver)}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Signup Link</Label>
            <input
              readOnly
              value={loading ? "Generating signup link..." : inviteUrl}
              className="w-full rounded-lg border py-2 px-3 text-xs font-mono text-white select-all focus:outline-none"
              style={{ borderColor: T.border, background: T.panel2 }}
            />
          </div>

          <div className="space-y-2">
            <Label>Pre-filled Message Template (Editable)</Label>
            <textarea
              rows={5}
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              className="w-full rounded-lg border p-3 text-xs text-white placeholder:text-[#5b6478] focus:border-[#ff6a00] focus:outline-none leading-relaxed"
              style={{ borderColor: T.border, background: T.panel2 }}
            />
            <p className="text-[11px] text-[#8b95a8]">
              Copy this pre-filled invitation message to manually paste into WhatsApp, Email, or SMS for {driver.driver_name}.
            </p>
          </div>

          <div className="flex items-center justify-between border-t pt-4" style={{ borderColor: T.border }}>
            <button
              type="button"
              onClick={handleCopyMessage}
              disabled={loading || !inviteUrl}
              className="rounded-lg bg-[#ff6a00] px-4 py-2 text-xs font-bold text-white hover:bg-[#e05d00] disabled:opacity-50"
            >
              {copied ? "Copied Message!" : "Copy message"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-xs font-semibold hover:bg-white/10 text-[#8b95a8] hover:text-white"
              style={{ borderColor: T.border }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DriverPreviewModal({
  driver,
  vehicle,
  onClose,
  onSendInvite,
}: {
  driver: DriverTrack;
  vehicle?: Vehicle;
  onClose: () => void;
  onSendInvite?: () => void;
}) {
  const { leads, loading: leadsLoading } = useLeadsData();
  const loadConversation = useServerFn(getLeadConversation);
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      sender: string;
      content: string;
      created_at: string;
      media_url: string | null;
    }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const lead = leads.find((item) => phoneKeysMatch(item.phone, driver.phone));
  useEffect(() => {
    let cancelled = false;
    if (!lead) {
      setMessages([]);
      return;
    }
    setHistoryLoading(true);
    loadConversation({ data: { leadId: lead.id } })
      .then((result) => {
        if (!cancelled) setMessages(result.messages as typeof messages);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lead?.id, loadConversation]);
  return (
    <div
      className="fixed inset-0 z-[96] flex items-end sm:items-center justify-center bg-slate-950/75 p-0 sm:p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-[26px] border border-white/15 bg-[#0d1320]/95 shadow-2xl backdrop-blur-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-white/20 sm:hidden" />
        <div className="flex items-start gap-4 border-b border-white/10 bg-white/[0.04] p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ff6a00]/15 text-[#ff8a3d]">
            <Icon.Chat className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">{driver.driver_name}</h2>
              {portalStatusBadge(driver)}
            </div>
            <p className="text-sm text-[#aeb8c9]">
              {driver.phone || "No phone saved"} {driver.email ? `· ${driver.email}` : ""}
            </p>
            <p className="mt-1 text-xs text-[#7f8aa0]">
              {vehicle
                ? `${simplifyVehicleName(vehicle)} · ${vehicle.registration}`
                : driver.registration}
            </p>
          </div>
          {onSendInvite && (
            <button
              type="button"
              onClick={onSendInvite}
              className="inline-flex items-center gap-1 rounded-lg bg-[#ff6a00] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e05d00]"
            >
              <Icon.Bolt className="h-3.5 w-3.5" />
              Portal Invite
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close driver preview"
            className="rounded-full p-2 text-[#8b95a8] hover:bg-white/10 hover:text-white"
          >
            <Icon.X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {leadsLoading || historyLoading ? (
            <p className="text-sm text-[#8b95a8]">Loading WhatsApp history…</p>
          ) : !lead ? (
            <div
              className="rounded-2xl border border-dashed p-6 text-center text-sm text-[#8b95a8]"
              style={{ borderColor: T.border }}
            >
              No previous WhatsApp conversation found for this number.
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-[#8b95a8]">
              This customer has a lead, but no messages have been saved yet.
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[88%] rounded-2xl border px-4 py-3 ${message.sender === "customer" ? "border-white/10 bg-white/[0.05]" : "ml-auto border-[#ff6a00]/25 bg-[#ff6a00]/10"}`}
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b95a8]">
                  {message.sender === "customer"
                    ? "Customer"
                    : message.sender === "human"
                      ? "You"
                      : "AI Agent"}{" "}
                  · {new Date(message.created_at).toLocaleString("en-GB")}
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#edf2f8]">
                  {message.content}
                </div>
                {message.media_url && (
                  <img
                    src={message.media_url}
                    alt="WhatsApp attachment"
                    className="mt-2 max-h-48 rounded-xl"
                  />
                )}
              </div>
            ))
          )}
        </div>
        <div className="border-t border-white/10 bg-white/[0.04] p-4 text-xs text-[#8b95a8]">
          {lead
            ? "WhatsApp conversation history is linked to this driver."
            : "No WhatsApp history is linked to this number yet."}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Mileage View ---------------- */
function MileageView({
  vehicles,
  drivers,
  data,
  toast,
}: {
  vehicles: Vehicle[];
  drivers: DriverTrack[];
  data: ReturnType<typeof useFleetData>;
  toast: (m: string, t?: Toast["type"]) => void;
}) {
  const [selectedDriver, setSelectedDriver] = useState<DriverTrack | null>(null);
  const [driverSearchText, setDriverSearchText] = useState("");
  const [regText, setRegText] = useState("");
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [driverName, setDriverName] = useState("");
  const [startMileage, setStartMileage] = useState<string>("");
  const [allowance, setAllowance] = useState<string>("5000");
  const [excessRate, setExcessRate] = useState<string>("20");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const [updateTarget, setUpdateTarget] = useState<DriverTrack | null>(null);
  const [eomTarget, setEomTarget] = useState<DriverTrack | null>(null);
  const [logsTarget, setLogsTarget] = useState<DriverTrack | null>(null);
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);

  // Mileage Submissions Queue State
  const [subFilter, setSubFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const submissions = data.mileageSubmissions || [];
  const pendingSubmissions = submissions.filter((s) => s.status === "pending");
  const approvedSubmissions = submissions.filter((s) => s.status === "approved");
  const rejectedSubmissions = submissions.filter((s) => s.status === "rejected");

  const filteredSubmissions =
    subFilter === "pending"
      ? pendingSubmissions
      : subFilter === "approved"
        ? approvedSubmissions
        : subFilter === "rejected"
          ? rejectedSubmissions
          : submissions;
  const handlePickDriver = (d: DriverTrack) => {
    setSelectedDriver(d);
    setDriverSearchText(d.driver_name || "");
    setDriverName(d.driver_name || "");
    setRegText(d.registration || "");
    setStartMileage(String(d.current_mileage ?? d.start_mileage ?? "0"));
    setAllowance(String(d.allowance || "5000"));
    setExcessRate(String(d.excess_rate || "20"));
    setStartDate(d.start_date || new Date().toISOString().slice(0, 10));

    const matchedVeh = vehicles.find(
      (v) =>
        v.id === d.vehicle_id ||
        (v.registration || "").toUpperCase() === (d.registration || "").toUpperCase(),
    );
    if (matchedVeh) {
      setSelected(matchedVeh);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected && !selectedDriver?.vehicle_id) {
      toast("Pick a vehicle by registration or select an existing driver.", "error");
      return;
    }
    if (!driverName.trim()) {
      toast("Driver name is required.", "error");
      return;
    }
    try {
      const targetVeh = selected || vehicles.find((v) => v.id === selectedDriver?.vehicle_id);
      const autoRent = targetVeh ? getVehicleWeeklyPrice(targetVeh.make, targetVeh.model) : 200;

      if (selectedDriver) {
        // Update existing driver tracking details
        const updatedMi = parseInt(startMileage) || selectedDriver.current_mileage || 0;
        await data.editDriver({
          ...selectedDriver,
          driver_name: driverName.trim(),
          registration: selected?.registration || selectedDriver.registration,
          vehicle_id: selected?.id || selectedDriver.vehicle_id,
          allowance: parseInt(allowance) || 5000,
          excess_rate: parseInt(excessRate) || 20,
          start_date: startDate,
        });
        if (updatedMi !== selectedDriver.current_mileage) {
          await data.updateDriverMileage(selectedDriver, updatedMi);
        }
        toast(`Mileage and tracking updated for ${driverName}`);
      } else {
        // Start tracking a new driver
        await data.addDriver({
          driver_name: driverName.trim(),
          vehicle_id: selected?.id || "",
          registration: selected?.registration || regText.trim().toUpperCase(),
          start_mileage: parseInt(startMileage) || 0,
          current_mileage: parseInt(startMileage) || 0,
          allowance: parseInt(allowance) || 5000,
          excess_rate: parseInt(excessRate) || 20,
          start_date: startDate,
          weekly_rent: autoRent,
          rent_due_day: "Monday",
          rent_status: "unpaid",
          balance_due: autoRent,
        });
        toast(`Tracking started for ${driverName}`);
      }

      setSelectedDriver(null);
      setDriverSearchText("");
      setDriverName("");
      setRegText("");
      setSelected(null);
      setStartMileage("");
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Pending Mileage Submissions Review Queue (B1, B2, B3) */}
      <div
        className="rounded-xl border p-5 sm:p-6 shadow-sm"
        style={{ borderColor: T.border, background: T.panel }}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-white">
                Mileage Submission Review Queue
              </h2>
              {pendingSubmissions.length > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/30 animate-pulse">
                  {pendingSubmissions.length} Pending
                </span>
              )}
            </div>
            <p className="text-xs text-[#8b95a8] mt-0.5">
              Review driver odometer photo submissions, verify Gemini Vision OCR suggested values, and confirm automatic mileage & excess charges.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSubmitModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#ff6a00] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#e05d00] transition-colors"
            >
              <Icon.Camera className="h-4 w-4" />
              Submit Odometer Photo
            </button>
          </div>
        </div>

        {/* Queue Filter Tabs */}
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b pb-3" style={{ borderColor: T.borderSoft }}>
          <button
            type="button"
            onClick={() => setSubFilter("pending")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              subFilter === "pending"
                ? "bg-[#ff6a00] text-white"
                : "bg-white/5 text-[#8b95a8] hover:bg-white/10 hover:text-white"
            }`}
          >
            Pending ({pendingSubmissions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubFilter("approved")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              subFilter === "approved"
                ? "bg-[#ff6a00] text-white"
                : "bg-white/5 text-[#8b95a8] hover:bg-white/10 hover:text-white"
            }`}
          >
            Approved ({approvedSubmissions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubFilter("rejected")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              subFilter === "rejected"
                ? "bg-[#ff6a00] text-white"
                : "bg-white/5 text-[#8b95a8] hover:bg-white/10 hover:text-white"
            }`}
          >
            Rejected ({rejectedSubmissions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              subFilter === "all"
                ? "bg-[#ff6a00] text-white"
                : "bg-white/5 text-[#8b95a8] hover:bg-white/10 hover:text-white"
            }`}
          >
            All Submissions ({submissions.length})
          </button>
        </div>

        {/* Submissions List */}
        {filteredSubmissions.length === 0 ? (
          <div
            className="rounded-xl border border-dashed p-8 text-center text-sm text-[#8b95a8]"
            style={{ borderColor: T.border, background: T.panel2 }}
          >
            {subFilter === "pending"
              ? "No pending mileage submissions to review. All submissions are up to date!"
              : `No ${subFilter} mileage submissions found.`}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSubmissions.map((sub) => (
              <MileageSubmissionCard
                key={sub.id}
                submission={sub}
                drivers={drivers}
                data={data}
                toast={toast}
                onExpandPhoto={(url) => setPreviewPhotoUrl(url)}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Active Drivers ({drivers.length})</h3>
          <button
            type="button"
            onClick={() => {
              setSelectedDriver(null);
              setDriverSearchText("");
              setDriverName("");
              setRegText("");
              setSelected(null);
              setStartMileage("");
              setTrackingModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#ff6a00] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#e05d00] transition-colors"
          >
            <Icon.Plus className="h-4 w-4" />
            Add Tracking / Update Mileage
          </button>
        </div>

        {drivers.length === 0 ? (
          <div
            className="rounded-xl border border-dashed p-10 text-center text-sm text-[#8b95a8]"
            style={{ borderColor: T.border, background: T.panel }}
          >
            No active driver tracking yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {drivers.map((d) => {
              const curMi = d.current_mileage || 0;
              const stMi = d.start_mileage || 0;
              const dAllowance = d.allowance || 5000;
              const dRate = d.excess_rate || 20;

              const driven = Math.max(0, curMi - stMi);
              const over = Math.max(0, driven - dAllowance);
              const charge = (over * dRate) / 100;
              const logsCount = (d.monthly_logs || []).length;
              return (
                <div
                  key={d.id}
                  className="rounded-xl border p-5"
                  style={{ borderColor: T.border, background: T.panel }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-base font-bold">{d.driver_name || "Driver"}</div>
                      <div className="text-xs text-[#8b95a8]">Started {d.start_date || "—"}</div>
                    </div>
                    <UKPlate reg={d.registration || ""} size="sm" />
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg p-2" style={{ background: T.panel2 }}>
                      <div className="text-xs text-[#8b95a8]">Month Start</div>
                      <div className="font-semibold">{stMi.toLocaleString()} mi</div>
                    </div>
                    <div className="rounded-lg p-2" style={{ background: T.panel2 }}>
                      <div className="text-xs text-[#8b95a8]">Current / Last Known</div>
                      <div className="font-semibold">{curMi.toLocaleString()} mi</div>
                    </div>
                  </div>
                  <div className="mb-3 text-sm">
                    <div className="flex justify-between text-xs text-[#8b95a8]">
                      <span>Driven</span>
                      <span>
                        {driven.toLocaleString()} / {dAllowance.toLocaleString()} mi
                      </span>
                    </div>
                    <div
                      className="mt-1 h-2 overflow-hidden rounded-full"
                      style={{ background: T.panel2 }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (driven / dAllowance) * 100)}%`,
                          background: over > 0 ? "#dc2626" : "#22c55e",
                        }}
                      />
                    </div>
                  </div>
                  {over > 0 ? (
                    <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm font-bold text-red-300">
                      Excess: {over.toLocaleString()} mi · £{charge.toFixed(2)}
                    </div>
                  ) : (
                    <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-center text-xs font-semibold text-emerald-300">
                      Within Allowance
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setUpdateTarget(d)}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-[#1e222b]"
                      style={{ borderColor: T.border }}
                    >
                      Update
                    </button>
                    <button
                      onClick={() => setEomTarget(d)}
                      className="rounded-md bg-[#ff6a00] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e05d00]"
                    >
                      End of Month
                    </button>
                    {logsCount > 0 && (
                      <button
                        onClick={() => setLogsTarget(d)}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-[#1e222b]"
                        style={{ borderColor: T.border }}
                      >
                        <Icon.Clock className="h-3.5 w-3.5" /> Logged Miles ({logsCount})
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (confirm(`Stop tracking ${d.driver_name}?`)) {
                          await data.removeDriver(d.id);
                          toast("Driver removed", "info");
                        }
                      }}
                      className="ml-auto text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
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
          onSave={async (newMi) => {
            try {
              await data.updateDriverMileage(updateTarget, newMi);
              toast("Current mileage updated");
              setUpdateTarget(null);
            } catch (e: any) {
              toast(e?.message ?? "Failed", "error");
            }
          }}
        />
      )}

      {eomTarget && (
        <EndOfMonthModal
          driver={eomTarget}
          onClose={() => setEomTarget(null)}
          onConfirm={async (endMi) => {
            try {
              await data.closeMonth(eomTarget, endMi);
              toast(`End-of-month saved for ${eomTarget.driver_name}`);
              setEomTarget(null);
            } catch (e: any) {
              toast(e?.message ?? "Failed", "error");
            }
          }}
        />
      )}

      {logsTarget && <LogsModal driver={logsTarget} onClose={() => setLogsTarget(null)} />}

      {submitModalOpen && (
        <SubmitMileagePhotoModal
          drivers={drivers}
          data={data}
          toast={toast}
          onClose={() => setSubmitModalOpen(false)}
        />
      )}

      {previewPhotoUrl && (
        <FullImagePreviewModal
          photoUrl={previewPhotoUrl}
          onClose={() => setPreviewPhotoUrl(null)}
        />
      )}

      {trackingModalOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setTrackingModalOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#10141d] p-5 sm:p-6 shadow-2xl space-y-4"
            style={{ borderColor: T.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: T.borderSoft }}>
              <h3 className="text-base font-bold text-white">
                {selectedDriver ? `Update Tracking for ${selectedDriver.driver_name}` : "Start Tracking / Update Driver Mileage"}
              </h3>
              <button onClick={() => setTrackingModalOpen(false)} className="text-[#8b95a8] hover:text-white">
                <Icon.X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                await submit(e);
                setTrackingModalOpen(false);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <Label>Select Existing Driver (Auto-Fills Details)</Label>
                <DriverSearch
                  drivers={drivers}
                  value={driverSearchText}
                  onTextChange={(s) => {
                    setDriverSearchText(s);
                    if (selectedDriver && s !== selectedDriver.driver_name) {
                      setSelectedDriver(null);
                    }
                  }}
                  onPick={handlePickDriver}
                />
              </div>

              <Grid2>
                <div>
                  <Label>Vehicle Registration *</Label>
                  <RegSearch
                    vehicles={vehicles}
                    value={regText}
                    onTextChange={(s) => {
                      setRegText(s);
                      setSelected(null);
                    }}
                    onPick={(v) => {
                      setSelected(v);
                      setRegText(v.registration);
                      if (!selectedDriver) {
                        setStartMileage(String(v.current_mileage || ""));
                      }
                    }}
                  />
                </div>
                <Field label="Driver Name *">
                  <input
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className={inputCls}
                  />
                </Field>
              </Grid2>
              <Grid2>
                <Field label="Month Start Mileage">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={startMileage}
                    onChange={(e) => setStartMileage(e.target.value.replace(/^0+(?=\d)/, ""))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Tracking Start Date">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </Grid2>
              <Grid2>
                <Field label="Monthly Allowance (miles)">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={allowance}
                    onChange={(e) => setAllowance(e.target.value.replace(/^0+(?=\d)/, ""))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Excess Rate (pence/mile)">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={excessRate}
                    onChange={(e) => setExcessRate(e.target.value.replace(/^0+(?=\d)/, ""))}
                    className={inputCls}
                  />
                </Field>
              </Grid2>
              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setTrackingModalOpen(false)}
                  className="rounded-lg border px-4 py-2 font-semibold text-[#8b95a8] hover:bg-white/5"
                  style={{ borderColor: T.border }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#ff6a00] px-5 py-2 font-semibold text-white hover:bg-[#e05d00]"
                >
                  Save Tracking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MileageSubmissionCard({
  submission,
  drivers,
  data,
  toast,
  onExpandPhoto,
}: {
  submission: MileageSubmission;
  drivers: DriverTrack[];
  data: ReturnType<typeof useFleetData>;
  toast: (m: string, t?: Toast["type"]) => void;
  onExpandPhoto: (url: string) => void;
}) {
  const driver = drivers.find(
    (d) =>
      (submission.driver_id && d.id === submission.driver_id) ||
      (d.registration || "").replace(/\s+/g, "").toUpperCase() ===
        (submission.registration || "").replace(/\s+/g, "").toUpperCase(),
  );

  const [confirmedInput, setConfirmedInput] = useState<string>(
    submission.approved_mileage
      ? String(submission.approved_mileage)
      : submission.ocr_mileage
        ? String(submission.ocr_mileage)
        : "",
  );

  const numVal = parseInt(confirmedInput) || 0;
  const recordedMi = driver?.current_mileage ?? driver?.start_mileage ?? 0;
  const startMi = driver?.start_mileage ?? 0;
  const allowance = driver?.allowance ?? 5000;
  const excessRate = driver?.excess_rate ?? 20;

  // Validation Flags (B3)
  const isBackwards = numVal > 0 && driver && numVal < recordedMi;
  const isImplausibleJump = driver && numVal > recordedMi && numVal - recordedMi > 3000;

  // Automatic Mileage Calculation (B2)
  const milesDriven = Math.max(0, numVal - startMi);
  const remainingMiles = Math.max(0, allowance - milesDriven);
  const overageMiles = Math.max(0, milesDriven - allowance);
  const excessCharge = (overageMiles * excessRate) / 100;

  const handleApprove = async () => {
    if (!numVal || numVal <= 0) {
      toast("Please enter a valid positive odometer reading.", "error");
      return;
    }
    if (isBackwards) {
      if (!confirm(`Warning: Submitted reading (${numVal.toLocaleString()}) is lower than recorded current mileage (${recordedMi.toLocaleString()}). Are you sure you want to approve?`)) {
        return;
      }
    }
    try {
      await data.approveMileageSubmission(submission.id, numVal);
      toast(`Approved reading of ${numVal.toLocaleString()} mi for ${submission.driver_name}`);
    } catch (e: any) {
      toast(e?.message ?? "Failed to approve", "error");
    }
  };

  const handleReject = async () => {
    const reason = prompt("Enter rejection reason:", "Blurry photo or wrong reading");
    if (reason === null) return;
    try {
      await data.rejectMileageSubmission(submission.id, reason);
      toast("Submission rejected", "info");
    } catch (e: any) {
      toast(e?.message ?? "Failed to reject", "error");
    }
  };

  const handleAddExcessCharge = async () => {
    if (!driver) return;
    if (excessCharge <= 0) return;
    if (
      confirm(
        `Add excess charge of £${excessCharge.toFixed(2)} to ${driver.driver_name}'s balance? (${overageMiles.toLocaleString()} miles over @ ${excessRate}p/mi)`,
      )
    ) {
      try {
        await data.addDriverCharge(
          driver.id,
          excessCharge,
          `Excess mileage charge: ${overageMiles.toLocaleString()} miles @ ${excessRate}p/mi`,
        );
        toast(`Added £${excessCharge.toFixed(2)} excess mileage charge to driver balance`);
      } catch (e: any) {
        toast(e?.message ?? "Failed to add charge", "error");
      }
    }
  };

  return (
    <div
      className="rounded-xl border p-4 sm:p-5 transition-all"
      style={{ borderColor: T.border, background: T.panel2 }}
    >
      {/* Top Info Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: T.borderSoft }}>
        <div className="flex items-center gap-3">
          <UKPlate reg={submission.registration} size="sm" />
          <div>
            <div className="text-base font-extrabold text-white">{submission.driver_name}</div>
            <div className="text-xs text-[#8b95a8]">
              Submitted: {new Date(submission.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        <div>
          {submission.status === "pending" && (
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 border border-amber-500/30">
              Pending Review
            </span>
          )}
          {submission.status === "approved" && (
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/30">
              Approved ({submission.approved_mileage?.toLocaleString()} mi)
            </span>
          )}
          {submission.status === "rejected" && (
            <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300 border border-red-500/30">
              Rejected
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: Photo Preview & OCR Calculation Panel */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {/* Photo Column */}
        <div className="md:col-span-4 lg:col-span-3">
          <div className="text-xs font-semibold text-[#8b95a8] mb-1.5 flex items-center justify-between">
            <span>Submitted Odometer Photo</span>
            <span className="text-[10px] text-amber-400">Click to view</span>
          </div>
          <div
            onClick={() => onExpandPhoto(submission.photo_url)}
            className="group relative cursor-pointer overflow-hidden rounded-lg border border-white/10 bg-black/40 hover:border-[#ff6a00] transition-all"
            style={{ height: "140px" }}
          >
            <img
              src={submission.photo_url}
              alt="Odometer Submission"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="inline-flex items-center gap-1 rounded-md bg-black/80 px-2.5 py-1 text-xs font-semibold text-white">
                <Icon.Eye className="h-3.5 w-3.5" /> Enlarge Photo
              </span>
            </div>
          </div>
        </div>

        {/* Reading & Calculations Column */}
        <div className="md:col-span-8 lg:col-span-9 space-y-3">
          {/* OCR Suggestion Status Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {submission.ocr_confidence === "high" && submission.ocr_mileage ? (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                <span>✨ Gemini Vision OCR Extracted:</span>
                <span className="font-bold">{submission.ocr_mileage.toLocaleString()} mi</span>
                <span className="text-[10px] text-emerald-400/80">(High Confidence - Editable)</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                <span>⚠️ Manual Entry Required</span>
                <span className="text-[10px] text-amber-400/80">(OCR low confidence or photo unclear)</span>
              </div>
            )}

            {driver && (
              <div className="text-xs text-[#8b95a8]">
                Last recorded: <span className="font-semibold text-white">{recordedMi.toLocaleString()} mi</span>
              </div>
            )}
          </div>

          {/* Odometer Input Field */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-[#8b95a8] mb-1">
                Confirmed Odometer Reading (mi) *
              </label>
              <input
                type="number"
                inputMode="numeric"
                disabled={submission.status !== "pending"}
                value={confirmedInput}
                onChange={(e) => setConfirmedInput(e.target.value.replace(/^0+(?=\d)/, ""))}
                placeholder="Enter confirmed mileage"
                className={inputCls}
              />
            </div>

            {submission.status === "pending" && (
              <div className="flex items-end gap-2 pt-5">
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={!numVal || numVal <= 0}
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-sm"
                >
                  Confirm & Approve
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition-colors"
                >
                  Reject
                </button>
              </div>
            )}
          </div>

          {/* Correctness & Validation Warnings (B3) */}
          {isBackwards && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/15 p-3 text-xs text-red-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-red-300">
                <span>⛔ REJECTION / MISREAD WARNING</span>
              </div>
              <p>
                Submitted reading (<span className="font-bold text-white">{numVal.toLocaleString()} mi</span>) is lower than current recorded mileage (<span className="font-bold text-white">{recordedMi.toLocaleString()} mi</span>). Odometers do not run backwards — check for trip meter misreads or incorrect photos.
              </p>
            </div>
          )}

          {isImplausibleJump && !isBackwards && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/15 p-3 text-xs text-amber-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-300">
                <span>⚠️ IMPLAUSIBLE JUMP WARNING</span>
              </div>
              <p>
                Submitted reading is <span className="font-bold text-white">+{(numVal - recordedMi).toLocaleString()} miles</span> above current recorded mileage. Verify photo carefully before approving.
              </p>
            </div>
          )}

          {/* Automatic Mileage & Excess Calculation Box (B2) */}
          {driver && numVal > 0 && !isBackwards && (
            <div className="rounded-lg border p-3.5 space-y-2 text-xs" style={{ borderColor: T.border, background: T.panel }}>
              <div className="text-xs font-bold text-white mb-1 border-b pb-1" style={{ borderColor: T.borderSoft }}>
                Automatic Mileage Calculation
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-[#8b95a8] block text-[11px]">Start Mileage</span>
                  <span className="font-semibold text-white">{startMi.toLocaleString()} mi</span>
                </div>
                <div>
                  <span className="text-[#8b95a8] block text-[11px]">Approved Reading</span>
                  <span className="font-semibold text-emerald-400">{numVal.toLocaleString()} mi</span>
                </div>
                <div>
                  <span className="text-[#8b95a8] block text-[11px]">Miles Driven</span>
                  <span className="font-bold text-white">{milesDriven.toLocaleString()} mi</span>
                </div>
                <div>
                  <span className="text-[#8b95a8] block text-[11px]">Monthly Allowance</span>
                  <span className="font-semibold text-white">{allowance.toLocaleString()} mi</span>
                </div>
              </div>

              {overageMiles > 0 ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2.5">
                  <div>
                    <span className="font-bold text-red-300 block">
                      🚨 Allowance Exceeded by {overageMiles.toLocaleString()} miles
                    </span>
                    <span className="text-[11px] text-red-200">
                      Calculated Excess Charge: <span className="font-bold text-white">£{excessCharge.toFixed(2)}</span> ({excessRate}p/mi)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddExcessCharge}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 transition-colors shadow-sm"
                  >
                    ⚡ Add Excess Charge £{excessCharge.toFixed(2)} to Balance
                  </button>
                </div>
              ) : (
                <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-center text-xs font-semibold text-emerald-300">
                  ✅ Within Allowance ({remainingMiles.toLocaleString()} miles remaining)
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SubmitMileagePhotoModal({
  drivers,
  data,
  toast,
  onClose,
}: {
  drivers: DriverTrack[];
  data: ReturnType<typeof useFleetData>;
  toast: (m: string, t?: Toast["type"]) => void;
  onClose: () => void;
}) {
  const [selectedDriverId, setSelectedDriverId] = useState<string>(drivers[0]?.id || "");
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [ocrResult, setOcrResult] = useState<{ odometer: number | null; confidence: "high" | "low" | "none" } | null>(null);
  const [notes, setNotes] = useState("");

  const selectedDriver = drivers.find((d) => d.id === selectedDriverId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setPhotoPreview(base64);
        void runOcr(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUrlBlur = () => {
    if (photoUrl.trim() && photoUrl !== photoPreview) {
      setPhotoPreview(photoUrl.trim());
      void runOcr(photoUrl.trim());
    }
  };

  const runOcr = async (imageSource: string) => {
    setAnalyzing(true);
    setOcrResult(null);
    try {
      const res = await fetch("/api/public/ocr-odometer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_url: imageSource }),
      });
      if (res.ok) {
        const body = await res.json();
        setOcrResult({
          odometer: typeof body.odometer === "number" ? body.odometer : null,
          confidence: body.confidence || "none",
        });
      }
    } catch {
      // ignore
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriver) {
      toast("Please select a driver", "error");
      return;
    }
    const finalPhoto = photoPreview || photoUrl.trim();
    if (!finalPhoto) {
      toast("Please provide an odometer photo or file", "error");
      return;
    }

    try {
      await data.addMileageSubmission({
        driver_id: selectedDriver.id,
        driver_name: selectedDriver.driver_name,
        registration: selectedDriver.registration,
        photo_url: finalPhoto,
        ocr_mileage: ocrResult?.odometer ?? null,
        ocr_confidence: ocrResult?.confidence ?? "low",
        notes,
      });
      toast(`Odometer photo submitted for review (${selectedDriver.driver_name})`);
      onClose();
    } catch (e: any) {
      toast(e?.message ?? "Failed to submit photo", "error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-xl border border-white/15 bg-[#10141d] p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
        style={{ borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-white">Submit Odometer Photo</h2>
            <p className="text-xs text-[#8b95a8]">Upload dashboard image for automatic Gemini OCR extraction</p>
          </div>
          <button onClick={onClose} className="text-[#8b95a8] hover:text-white">
            <Icon.X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Select Driver *</Label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className={inputCls}
            >
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.driver_name} ({d.registration})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Upload Photo / Image File</Label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="block w-full text-xs text-[#8b95a8] file:mr-3 file:rounded-md file:border-0 file:bg-[#ff6a00] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-[#e05d00] cursor-pointer"
            />
          </div>

          <Field label="OR Photo URL">
            <input
              type="url"
              placeholder="https://..."
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              onBlur={handleUrlBlur}
              className={inputCls}
            />
          </Field>

          {photoPreview && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-[#8b95a8]">Image Preview</div>
              <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/50 max-h-48 flex items-center justify-center p-2">
                <img src={photoPreview} alt="Preview" className="max-h-44 object-contain rounded" />
              </div>
            </div>
          )}

          {analyzing && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center text-xs font-semibold text-amber-300 animate-pulse flex items-center justify-center gap-2">
              <Icon.Clock className="h-4 w-4 animate-spin" />
              Analyzing photo with Gemini Vision OCR...
            </div>
          )}

          {ocrResult && !analyzing && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span>✨ OCR Analysis Complete</span>
              </div>
              {ocrResult.odometer ? (
                <p>
                  Extracted Odometer: <span className="font-bold text-white">{ocrResult.odometer.toLocaleString()} mi</span> (High Confidence)
                </p>
              ) : (
                <p className="text-amber-300">
                  ⚠️ Confidence low or image unclear — field will be left blank for staff manual entry.
                </p>
              )}
            </div>
          )}

          <Field label="Notes / Comments (Optional)">
            <input
              type="text"
              placeholder="e.g., Weekly mileage check photo"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls}
            />
          </Field>

          <div className="mt-5 flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-xs font-semibold hover:bg-[#1e222b]"
              style={{ borderColor: T.border }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={analyzing || (!photoPreview && !photoUrl.trim())}
              className="rounded-lg bg-[#ff6a00] px-4 py-2 text-xs font-bold text-white hover:bg-[#e05d00] disabled:opacity-50 transition-colors"
            >
              Submit Photo for Review
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FullImagePreviewModal({
  photoUrl,
  onClose,
}: {
  photoUrl: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-h-[95vh] max-w-4xl overflow-hidden rounded-xl border border-white/20 bg-black/80 p-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black transition-colors"
        >
          <Icon.X className="h-6 w-6" />
        </button>
        <img
          src={photoUrl}
          alt="Enlarged Odometer Submission"
          className="max-h-[85vh] w-full object-contain rounded-lg"
        />
      </div>
    </div>
  );
}

function UpdateMileageModal({
  driver,
  onClose,
  onSave,
}: {
  driver: DriverTrack;
  onClose: () => void;
  onSave: (n: number) => void;
}) {
  const [v, setV] = useState<string>(String(driver.current_mileage));
  const num = parseInt(v) || 0;
  const invalid = num < driver.start_mileage;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl sm:rounded-xl border border-white/15 bg-[#10141d] p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
        style={{ borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20 sm:hidden" />
        <h2 className="mb-1 text-lg font-bold">Update Current Mileage</h2>
        <p className="mb-4 text-sm text-[#8b95a8]">
          Driver: <span className="font-semibold text-white">{driver.driver_name}</span> ·{" "}
          {driver.registration}
        </p>
        <Field label="Current Odometer (mi)">
          <input
            type="number"
            inputMode="numeric"
            value={v}
            onChange={(e) => setV(e.target.value.replace(/^0+(?=\d)/, ""))}
            className={inputCls}
          />
        </Field>
        {invalid && (
          <div className="mt-2 text-xs text-red-400">
            Must be at least the month-start mileage ({driver.start_mileage.toLocaleString()}).
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-[#1e222b]"
            style={{ borderColor: T.border }}
          >
            Cancel
          </button>
          <button
            disabled={invalid}
            onClick={() => onSave(num)}
            className="rounded-lg bg-[#ff6a00] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function EndOfMonthModal({
  driver,
  onClose,
  onConfirm,
}: {
  driver: DriverTrack;
  onClose: () => void;
  onConfirm: (n: number) => void;
}) {
  const [v, setV] = useState<string>(String(driver.current_mileage));
  const num = parseInt(v) || 0;
  const driven = Math.max(0, num - driver.start_mileage);
  const over = Math.max(0, driven - driver.allowance);
  const charge = (over * driver.excess_rate) / 100;
  const invalid = num <= driver.start_mileage;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl sm:rounded-xl border border-white/15 bg-[#10141d] p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
        style={{ borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20 sm:hidden" />
        <h2 className="mb-1 text-lg font-bold">End of Month Miles</h2>
        <p className="mb-4 text-sm text-[#8b95a8]">
          Enter the driver's odometer reading at the end of this month.
        </p>
        <div className="mb-3 rounded-lg p-3 text-sm" style={{ background: T.panel2 }}>
          <div className="flex justify-between">
            <span className="text-[#8b95a8]">Driver</span>
            <span className="font-semibold">{driver.driver_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8b95a8]">Start Mileage</span>
            <span className="font-semibold">{driver.start_mileage.toLocaleString()} mi</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8b95a8]">Allowance</span>
            <span className="font-semibold">{driver.allowance.toLocaleString()} mi</span>
          </div>
        </div>
        <Field label="End of Month Odometer Reading (mi)">
          <input
            type="number"
            inputMode="numeric"
            value={v}
            onChange={(e) => setV(e.target.value.replace(/^0+(?=\d)/, ""))}
            className={inputCls}
          />
        </Field>
        {invalid ? (
          <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            Reading must be greater than start mileage ({driver.start_mileage.toLocaleString()}).
          </div>
        ) : (
          <div
            className="mt-3 space-y-1.5 rounded-lg border p-3 text-sm"
            style={{ borderColor: T.border }}
          >
            <div className="flex justify-between">
              <span className="text-[#8b95a8]">Miles Driven</span>
              <span className="font-semibold">{driven.toLocaleString()} mi</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8b95a8]">Overage</span>
              <span className="font-semibold">{over.toLocaleString()} mi</span>
            </div>
            <div
              className={`flex justify-between font-bold ${over > 0 ? "text-red-400" : "text-emerald-400"}`}
            >
              <span>Excess Charge</span>
              <span>£{charge.toFixed(2)}</span>
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-[#1e222b]"
            style={{ borderColor: T.border }}
          >
            Cancel
          </button>
          <button
            disabled={invalid}
            onClick={() => onConfirm(num)}
            className="rounded-lg bg-[#ff6a00] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50"
          >
            Confirm & Save
          </button>
        </div>
      </div>
    </div>
  );
}

function LogsModal({ driver, onClose }: { driver: DriverTrack; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl sm:rounded-xl border border-white/15 bg-[#10141d] p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
        style={{ borderColor: T.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Logged Miles · {driver.driver_name}</h2>
            <p className="text-sm text-[#8b95a8]">
              {driver.registration} · {driver.monthly_logs.length} records
            </p>
          </div>
          <button onClick={onClose} className="text-[#8b95a8] hover:text-white">
            <Icon.X className="h-5 w-5" />
          </button>
        </div>
        <table className="w-full text-sm">
          <thead
            className="text-left text-xs uppercase tracking-wider text-[#8b95a8]"
            style={{ background: T.panel2 }}
          >
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
              <tr key={i} className="border-t" style={{ borderColor: T.borderSoft }}>
                <td className="px-3 py-2 font-semibold">{l.month}</td>
                <td className="px-3 py-2">{l.start_mileage.toLocaleString()}</td>
                <td className="px-3 py-2">{l.end_mileage.toLocaleString()}</td>
                <td className="px-3 py-2">{l.miles_driven.toLocaleString()}</td>
                <td className="px-3 py-2">{l.overage.toLocaleString()}</td>
                <td
                  className={`px-3 py-2 font-bold ${l.overage > 0 ? "text-red-400" : "text-emerald-400"}`}
                >
                  £{l.excess_charge.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- WhatsApp Leads ---------------- */
function displayLeadPhone(phone: string | null | undefined): string {
  if (!phone) return "No number";
  if (/@lid$/i.test(phone)) return "Phone pending resolution";
  const digits = phone.replace(/@c\.us$/i, "").replace(/\D/g, "");
  if (digits.startsWith("44") && digits.length === 12) {
    return `+44 ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return `+44 ${digits.slice(1, 5)} ${digits.slice(5)}`;
  }
  return phone.replace(/@c\.us$/i, "");
}

function customerTypeLabel(value: string | null | undefined): string {
  if (value === "existing_customer") return "Existing customer";
  if (value === "needs_human") return "Needs human handoff";
  if (value === "fake") return "Fake";
  return "New customer";
}

function customerTypePill(value: string | null | undefined): string {
  if (value === "existing_customer") return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  if (value === "needs_human") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  if (value === "fake") return "border-red-400/30 bg-red-400/10 text-red-200";
  return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
}

function statusPill(status: string) {
  const s = status.toLowerCase();
  if (s === "new" || s === "open")
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (s === "contacted" || s === "in progress")
    return "border-sky-400/30 bg-sky-400/10 text-sky-300";
  return "border-white/15 bg-white/5 text-[#9aa5b8]";
}

function severityPill(sev: string) {
  const s = sev.toLowerCase();
  if (s === "severe") return "border-red-400/30 bg-red-400/10 text-red-300";
  if (s === "moderate") return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-white/15 bg-white/5 text-[#9aa5b8]";
}

function SectionHead({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle: string;
  count: number;
}) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-[#9aa5b8]">{subtitle}</p>
      </div>
      <span
        className="rounded-full border px-3 py-1 text-xs font-semibold"
        style={{ borderColor: T.border, background: T.panel, color: T.orange }}
      >
        {count} total
      </span>
    </div>
  );
}

function WhatsAppLeadsView({ toast }: { toast: (m: string, t?: Toast["type"]) => void }) {
  const { leads, loading, refresh, setLeadStatus, deleteLead } = useLeadsData();
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const openLead = leads.find((l) => l.id === openLeadId) ?? null;

  // Deep link from Telegram handoff alerts: /whatsapp-leads?lead=<id>
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("lead");
    if (id) setOpenLeadId(id);
  }, []);

  return (
    <div className="space-y-6">
      <SectionHead
        title="WhatsApp Leads"
        subtitle="Inbound WhatsApp messages triaged and summarised by AI."
        count={leads.length}
      />

      {loading ? (
        <div
          className="rounded-xl border p-12 text-center text-sm"
          style={{ borderColor: T.border, background: T.panel, color: T.muted }}
        >
          Loading leads…
        </div>
      ) : leads.length === 0 ? (
        <div
          className="rounded-xl border p-12 text-center"
          style={{ borderColor: T.border, background: T.panel }}
        >
          <Icon.Chat className="mx-auto h-8 w-8 text-[#9aa5b8]" />
          <div className="mt-3 text-sm text-[#9aa5b8]">
            No leads yet. The AI files new WhatsApp enquiries here automatically.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {leads.map((l) => (
            <div
              key={l.id}
              className="rounded-2xl border p-5"
              style={{ borderColor: T.border, background: T.panel }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-emerald-300"
                  style={{ background: "rgba(16,185,129,0.14)" }}
                >
                  <Icon.Chat className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{l.contact_name}</div>
                  <div className="truncate text-xs text-[#9aa5b8]">
                    {displayLeadPhone(l.phone)} · {new Date(l.created_at).toLocaleString("en-GB")}
                  </div>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${customerTypePill(l.customer_type)}`}
                >
                  {customerTypeLabel(l.customer_type)}
                </span>
                {l.ai_paused && (
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                    Human handling
                  </span>
                )}
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusPill(l.status)}`}
                >
                  {l.status}
                </span>
              </div>

              {l.ai_summary && (
                <div
                  className="mt-4 rounded-xl border p-3 text-sm"
                  style={{ borderColor: T.borderSoft, background: T.panel2 }}
                >
                  <div
                    className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: T.orange }}
                  >
                    AI Summary
                  </div>
                  {l.ai_summary}
                </div>
              )}

              <p className="mt-3 whitespace-pre-wrap text-sm text-[#c8d0dd]">{l.message}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {l.intent && (
                  <span
                    className="rounded-md border px-2 py-1 text-[11px] capitalize"
                    style={{ borderColor: T.borderSoft, color: T.muted }}
                  >
                    {l.intent}
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => setOpenLeadId(l.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ background: T.orange }}
                  >
                    Open chat
                  </button>
                  {l.status !== "contacted" && (
                    <button
                      onClick={async () => {
                        await setLeadStatus(l.id, "contacted");
                        toast("Lead marked as contacted");
                      }}
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                      style={{ borderColor: T.border, background: T.panel2 }}
                    >
                      Mark contacted
                    </button>
                  )}
                  {l.status !== "closed" && (
                    <button
                      onClick={async () => {
                        await setLeadStatus(l.id, "closed");
                        toast("Lead closed", "info");
                      }}
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                      style={{ borderColor: T.border, background: T.panel2 }}
                    >
                      Close
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      await deleteLead(l.id);
                      toast("Lead removed", "info");
                    }}
                    className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-xs font-semibold text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {openLead && (
        <LeadThread
          leadId={openLead.id}
          contactName={openLead.contact_name}
          aiPaused={Boolean(openLead.ai_paused)}
          onClose={() => setOpenLeadId(null)}
          onChanged={refresh}
          toast={toast}
        />
      )}
    </div>
  );
}

/* ---------------- Accident Cases ---------------- */
function AccidentCasesView({ toast }: { toast: (m: string, t?: Toast["type"]) => void }) {
  const { accidents, loading, setAccidentStatus, deleteAccident } = useLeadsData();

  return (
    <div className="space-y-6">
      <SectionHead
        title="Accident Cases"
        subtitle="Accident reports captured and classified by AI."
        count={accidents.length}
      />

      {loading ? (
        <div
          className="rounded-xl border p-12 text-center text-sm"
          style={{ borderColor: T.border, background: T.panel, color: T.muted }}
        >
          Loading cases…
        </div>
      ) : accidents.length === 0 ? (
        <div
          className="rounded-xl border p-12 text-center"
          style={{ borderColor: T.border, background: T.panel }}
        >
          <Icon.Crash className="mx-auto h-8 w-8 text-[#9aa5b8]" />
          <div className="mt-3 text-sm text-[#9aa5b8]">
            No accident cases logged. The AI files new incident reports here automatically.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {accidents.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border p-5"
              style={{ borderColor: T.border, background: T.panel }}
            >
              <div className="flex flex-wrap items-center gap-3">
                {a.reg ? (
                  <UKPlate reg={a.reg} size="sm" />
                ) : (
                  <span className="text-sm text-[#9aa5b8]">No reg</span>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{a.driver_name || "Unknown driver"}</div>
                  <div className="text-xs text-[#9aa5b8]">
                    {new Date(a.incident_date).toLocaleDateString("en-GB")} ·{" "}
                    {a.location || "Location unknown"}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${severityPill(a.severity)}`}
                  >
                    {a.severity}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusPill(a.status)}`}
                  >
                    {a.status}
                  </span>
                </div>
              </div>

              {a.ai_summary && (
                <div
                  className="mt-4 rounded-xl border p-3 text-sm"
                  style={{ borderColor: T.borderSoft, background: T.panel2 }}
                >
                  <div
                    className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: T.orange }}
                  >
                    AI Summary
                  </div>
                  {a.ai_summary}
                </div>
              )}

              <p className="mt-3 whitespace-pre-wrap text-sm text-[#c8d0dd]">{a.description}</p>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {a.status !== "in progress" && (
                  <button
                    onClick={async () => {
                      await setAccidentStatus(a.id, "in progress");
                      toast("Case moved to in progress");
                    }}
                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                    style={{ borderColor: T.border, background: T.panel2 }}
                  >
                    In progress
                  </button>
                )}
                {a.status !== "closed" && (
                  <button
                    onClick={async () => {
                      await setAccidentStatus(a.id, "closed");
                      toast("Case closed", "info");
                    }}
                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                    style={{ borderColor: T.border, background: T.panel2 }}
                  >
                    Close case
                  </button>
                )}
                <button
                  onClick={async () => {
                    await deleteAccident(a.id);
                    toast("Case removed", "info");
                  }}
                  className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-xs font-semibold text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
