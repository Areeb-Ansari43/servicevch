import { useMemo, useRef, useState } from "react";
import type { Vehicle } from "@/lib/fleet-data";
import { carTermsFor } from "@/lib/fleet-sheet";

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

function label(v: Vehicle) {
  return `${v.make} ${v.model}`.replace(/\s+/g, " ").trim();
}

/**
 * Search box for picking the driver's car: type a reg ("LB70") or model ("e220", "tesla").
 * Available cars are listed first; each row shows the car's weekly rent from the price sheet.
 */
export function VehicleSearch({
  vehicles,
  value,
  onChange,
  invalid,
}: {
  vehicles: Vehicle[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selected = vehicles.find((v) => v.id === value);

  const results = useMemo(() => {
    const q = norm(query);
    const list = vehicles
      .filter((v) => {
        if (!q) return true;
        const hay = norm(`${v.registration} ${v.make} ${v.model} ${v.year}`);
        return (
          hay.includes(q) || norm(v.registration).startsWith(q) || norm(`${v.model}`).includes(q)
        );
      })
      .sort((a, b) => {
        const aFree = a.status === "Active" ? 0 : 1;
        const bFree = b.status === "Active" ? 0 : 1;
        if (aFree !== bFree) return aFree - bFree;
        if (q) {
          const aReg = norm(a.registration).startsWith(q) ? 0 : 1;
          const bReg = norm(b.registration).startsWith(q) ? 0 : 1;
          if (aReg !== bReg) return aReg - bReg;
        }
        return a.registration.localeCompare(b.registration);
      });
    return list.slice(0, 30);
  }, [vehicles, query]);

  const pick = (v: Vehicle) => {
    onChange(v.id);
    setQuery("");
    setOpen(false);
  };

  if (selected && !open) {
    const t = carTermsFor(selected);
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${invalid ? "border-red-500" : "border-[#ff6a00]/60"} bg-[#ff6a00]/[0.06]`}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-white">
            <span className="font-mono">{selected.registration}</span> · {label(selected)}
          </div>
          <div className="text-[11px] text-[#8b95a8]">
            {t.weeklyRent ? `£${t.weeklyRent}/week · ` : ""}
            {t.monthlyAllowance ? `${t.monthlyAllowance.toLocaleString("en-GB")} mi/month · ` : ""}
            {t.excessRatePence}p/mile
            {selected.status !== "Active" ? ` · ${selected.status}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-[#c9d1dc] hover:bg-white/10"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search reg or model, e.g. LB70 or E220"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className={`w-full rounded-lg border bg-[#142131] px-3 py-2.5 text-sm text-white placeholder:text-[#5b6478] focus:border-[#ff6a00] focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/30 ${invalid ? "border-red-500" : "border-white/15"}`}
      />
      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/15 bg-[#0d1420] py-1 shadow-2xl"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[#8b95a8]">No car matches "{query}"</li>
          ) : (
            results.map((v, i) => {
              const t = carTermsFor(v);
              return (
                <li
                  key={v.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(v);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs ${i === active ? "bg-[#ff6a00]/15" : ""}`}
                >
                  <span className="min-w-0 truncate text-white">
                    <span className="font-mono font-bold">{v.registration}</span> · {label(v)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {t.weeklyRent ? (
                      <span className="font-semibold text-[#ff8a3d]">£{t.weeklyRent}/wk</span>
                    ) : null}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${v.status === "Active" ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-[#8b95a8]"}`}
                    >
                      {v.status === "Active" ? "Available" : v.status}
                    </span>
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
