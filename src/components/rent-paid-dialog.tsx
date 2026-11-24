import { useMemo, useState } from "react";
import { Check, Wallet, X } from "lucide-react";
import type { DriverTrack } from "@/lib/fleet-data";
import { addDays, rentState } from "@/lib/rent-cycle";

const money = (n: number) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nice = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/** Calculates what a payment does (exported for tests). */
export function previewPayment(input: {
  owed: number;
  weekly: number;
  anchorDue: string | null;
  advance: boolean;
  totalPaid: number;
  depositAgreed: number;
  depositPaidSoFar: number;
  depositNow: number;
}) {
  const extra = input.advance ? Math.max(0, input.totalPaid - input.owed) : 0;
  const weeksAhead = input.weekly > 0 ? Math.floor((extra + 1e-9) / input.weekly) : 0;
  const credit = Math.round((extra - weeksAhead * input.weekly) * 100) / 100;
  const nextDue = input.anchorDue ? addDays(input.anchorDue, 7 * (weeksAhead + 1)) : null;
  const depositLeft = Math.max(0, input.depositAgreed - input.depositPaidSoFar - input.depositNow);
  return { weeksAhead, credit, nextDue, depositLeft, balanceAfter: credit > 0 ? -credit : 0 };
}

function YesNo({
  value,
  onChange,
  name,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  name: string;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-white/10 bg-black/20 p-0.5"
      role="radiogroup"
      aria-label={name}
    >
      {[false, true].map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`vch-press rounded-md px-4 py-1.5 text-xs font-bold transition-colors ${
            value === v
              ? v
                ? "bg-[#ff6a00] text-white"
                : "bg-white/15 text-white"
              : "text-[#8b95a8] hover:text-white"
          }`}
        >
          {v ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

/**
 * Pop-up shown when staff press Paid. Clears what is owed and asks two questions:
 * was any deposit paid with the rent, and was rent paid in advance.
 */
export function RentPaidDialog({
  driver,
  onConfirm,
  onClose,
}: {
  driver: DriverTrack;
  onConfirm: (opts: {
    totalPaid: number | null;
    depositPaid: number | null;
    extraCharge: { amount: number; description: string } | null;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const weekly = Number(driver.weekly_rent || 0);
  const owed = Math.max(0, Number(driver.balance_due || 0));
  const charges = (driver.charges || []).filter(
    (c: any) => !["paid", "settled", "cancelled"].includes(String(c.status || "").toLowerCase()),
  );
  const chargesTotal = charges.reduce((s, c) => s + Number(c.amount || 0), 0);
  const rentOwed = Math.max(0, owed - chargesTotal);
  const weeksOwed = weekly > 0 ? Math.round(rentOwed / weekly) : 0;
  const state = weekly > 0 && driver.rent_due_day ? rentState(driver as any) : null;
  const anchorDue = state?.payableDue ?? null;

  const depositAgreed = Number(driver.deposit_total || 0);
  const depositPaidSoFar = (driver.deposit_payments || []).reduce(
    (s, p) => s + Number(p.amount || 0),
    0,
  );
  const depositOutstanding = Math.max(0, depositAgreed - depositPaidSoFar);

  const [withDeposit, setWithDeposit] = useState(false);
  const [deposit, setDeposit] = useState(depositOutstanding ? String(depositOutstanding) : "");
  const [advance, setAdvance] = useState(false);
  const [total, setTotal] = useState(String(owed + weekly));
  const [withExtra, setWithExtra] = useState(false);
  const [extraAmount, setExtraAmount] = useState("");
  const [extraDesc, setExtraDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const depositNow = withDeposit ? Math.max(0, Number(deposit) || 0) : 0;
  const extraNow = withExtra ? Math.max(0, Math.round((Number(extraAmount) || 0) * 100) / 100) : 0;
  const extraMissing = withExtra && (extraNow <= 0 || !extraDesc.trim());
  const totalPaid = advance ? Math.max(0, Number(total) || 0) : owed;
  const p = useMemo(
    () =>
      previewPayment({
        owed,
        weekly,
        anchorDue,
        advance,
        totalPaid,
        depositAgreed,
        depositPaidSoFar,
        depositNow,
      }),
    [owed, weekly, anchorDue, advance, totalPaid, depositAgreed, depositPaidSoFar, depositNow],
  );
  const advanceTooSmall = advance && totalPaid < owed;
  const blocked = advanceTooSmall || extraMissing;

  const confirm = async () => {
    if (blocked) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm({
        // The extra charge is added to what is owed first, so the rent total covers it too.
        totalPaid: advance ? totalPaid + extraNow : null,
        depositPaid: depositNow || null,
        extraCharge: extraNow > 0 ? { amount: extraNow, description: extraDesc.trim() } : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paid-title"
        className="vch-sheet max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/15 bg-[#10141d] p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="paid-title" className="flex items-center gap-2 text-base font-bold text-white">
              <Wallet className="h-4 w-4 text-[#ff8a3d]" /> Rent paid
            </h2>
            <p className="text-xs text-[#8b95a8]">
              {driver.driver_name} · {driver.registration}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8b95a8] hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* What is owed */}
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
          <div className="flex justify-between text-[#8b95a8]">
            <span>Rent owed{weeksOwed > 1 ? ` (${weeksOwed} weeks × ${money(weekly)})` : ""}</span>
            <span className="font-semibold text-white">{money(rentOwed)}</span>
          </div>
          {chargesTotal > 0 && (
            <div className="mt-1 flex justify-between text-[#8b95a8]">
              <span>Extra charges</span>
              <span className="font-semibold text-white">{money(chargesTotal)}</span>
            </div>
          )}
          {extraNow > 0 && (
            <div className="mt-1 flex justify-between text-[#8b95a8]">
              <span className="truncate pr-2">Paid now: {extraDesc.trim() || "extra charge"}</span>
              <span className="font-semibold text-white">{money(extraNow)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-sm font-bold text-white">
            <span>{extraNow > 0 ? "Total paid now" : "Owed now"}</span>
            <span>{money((advance ? totalPaid : owed) + extraNow)}</span>
          </div>
        </div>

        {/* Deposit with rent */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-white">
              Was any deposit paid with this rent?
            </span>
            <YesNo name="Deposit paid with rent" value={withDeposit} onChange={setWithDeposit} />
          </div>
          {withDeposit && (
            <div className="vch-enter rounded-xl border border-white/10 bg-black/20 p-3">
              <label className="text-xs text-[#8b95a8]" htmlFor="dep-now">
                How much deposit was paid with the rent?
              </label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm font-bold text-white">£</span>
                <input
                  id="dep-now"
                  inputMode="decimal"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="w-full rounded-lg border border-white/15 bg-[#142131] px-3 py-2 text-sm text-white focus:border-[#ff6a00] focus:outline-none"
                />
              </div>
              {depositAgreed > 0 ? (
                <p
                  className={`mt-2 text-xs ${p.depositLeft === 0 ? "text-emerald-300" : "text-[#8b95a8]"}`}
                >
                  Deposit {money(depositAgreed)} · paid so far {money(depositPaidSoFar)} ·{" "}
                  {p.depositLeft === 0 ? (
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Check className="h-3 w-3" /> paid in full after this
                    </span>
                  ) : (
                    <>
                      still to pay after this:{" "}
                      <span className="font-semibold text-white">{money(p.depositLeft)}</span>
                    </>
                  )}
                </p>
              ) : (
                <p className="mt-2 text-xs text-[#8b95a8]">
                  No deposit amount is set for this driver yet.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Extra charges paid with this payment (e.g. maintenance) */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-white">
              Does this payment have any other extra charges?
            </span>
            <YesNo name="Extra charges with this payment" value={withExtra} onChange={setWithExtra} />
          </div>
          {withExtra && (
            <div className="vch-enter grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
              <div>
                <label className="text-xs text-[#8b95a8]" htmlFor="extra-amount">
                  Amount
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm font-bold text-white">£</span>
                  <input
                    id="extra-amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={extraAmount}
                    onChange={(e) => setExtraAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="w-full rounded-lg border border-white/15 bg-[#142131] px-3 py-2 text-sm text-white focus:border-[#ff6a00] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8b95a8]" htmlFor="extra-desc">
                  What is it for?
                </label>
                <input
                  id="extra-desc"
                  placeholder="e.g. Maintenance, tyre replacement, PCN"
                  value={extraDesc}
                  maxLength={200}
                  onChange={(e) => setExtraDesc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#142131] px-3 py-2 text-sm text-white focus:border-[#ff6a00] focus:outline-none"
                />
              </div>
              <p className={`text-xs ${extraMissing ? "text-amber-200" : "text-[#8b95a8]"}`}>
                {extraMissing
                  ? "Add the amount and a short description."
                  : "Recorded as a charge on the driver's account and marked as paid."}
              </p>
            </div>
          )}
        </div>

        {/* Rent in advance */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-white">Was rent paid in advance?</span>
            <YesNo name="Rent paid in advance" value={advance} onChange={setAdvance} />
          </div>
          {advance && (
            <div className="vch-enter rounded-xl border border-white/10 bg-black/20 p-3">
              <label className="text-xs text-[#8b95a8]" htmlFor="rent-total">
                How much rent was paid in total?
              </label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm font-bold text-white">£</span>
                <input
                  id="rent-total"
                  inputMode="decimal"
                  value={total}
                  onChange={(e) => setTotal(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="w-full rounded-lg border border-white/15 bg-[#142131] px-3 py-2 text-sm text-white focus:border-[#ff6a00] focus:outline-none"
                />
              </div>
              {advanceTooSmall ? (
                <p className="mt-2 text-xs text-red-300">
                  That is less than the {money(owed)} owed now.
                </p>
              ) : (
                <p className="mt-2 text-xs text-[#8b95a8]">
                  {p.weeksAhead > 0 ? (
                    <>
                      Covers what is owed plus{" "}
                      <span className="font-semibold text-white">
                        {p.weeksAhead} week{p.weeksAhead === 1 ? "" : "s"} ahead
                      </span>
                      .
                      {p.nextDue ? (
                        <>
                          {" "}
                          Stays Paid until rent is next due on{" "}
                          <span className="font-semibold text-white">{nice(p.nextDue)}</span>.
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>Not enough for a full extra week ({money(weekly)}).</>
                  )}
                  {p.credit > 0 && <> {money(p.credit)} is kept as credit off the next week.</>}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Result */}
        <div className="mt-5 flex items-center justify-between rounded-xl bg-emerald-500/10 px-4 py-3">
          <span className="text-sm font-semibold text-emerald-200">Balance due after this</span>
          <span className="text-lg font-extrabold text-emerald-300">
            {p.balanceAfter < 0 ? `${money(-p.balanceAfter)} credit` : money(0)}
          </span>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || blocked}
            onClick={confirm}
            className="vch-press inline-flex items-center gap-1.5 rounded-lg bg-[#ff6a00] px-4 py-2 text-xs font-bold text-white hover:bg-[#e05d00] disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Mark as paid"}
          </button>
        </div>
      </div>
    </div>
  );
}
