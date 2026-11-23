import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { scanOdometerFn } from "@/lib/odometer.functions";

export type OdometerScan = {
  dataUrl: string;
  odometer: number | null;
  confidence: "high" | "low" | "none";
  reason?: string;
};

/** Phone photos are shrunk to 1600px JPEG: plenty for the digits, quick to upload and read. */
export function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the photo"));
    reader.onload = () => {
      const original = String(reader.result);
      const img = new Image();
      img.onload = () => {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => resolve(original); // e.g. HEIC the browser can't draw: send as-is
      img.src = original;
    };
    reader.readAsDataURL(file);
  });
}

/** Drop / tap / take a photo of the dashboard; reads the odometer with the AI. */
export function OdometerScanner({ onScan }: { onScan: (scan: OdometerScan) => void }) {
  const scan = useServerFn(scanOdometerFn);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<OdometerScan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
      setError("Please use a photo of the dashboard.");
      return;
    }
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const dataUrl = await shrinkPhoto(file);
      setPreview(dataUrl);
      const res = (await scan({ data: { image: dataUrl } })) as
        | { odometer: number | null; confidence: "high" | "low" | "none"; reason?: string }
        | undefined;
      const out: OdometerScan = {
        dataUrl,
        odometer: res?.odometer ?? null,
        confidence: res?.confidence ?? "none",
        reason: res?.reason,
      };
      setResult(out);
      onScan(out);
    } catch (err) {
      setError((err instanceof Error && err.message) || "The photo couldn't be read. Type the reading in instead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop an odometer photo to read it"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !busy) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) void handle(e.dataTransfer.files?.[0]);
        }}
        className={`vch-press flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-3 transition-colors ${
          dragging ? "border-[#ff6a00] bg-[#ff6a00]/10" : "border-[#ff6a00]/40 bg-[#ff6a00]/[0.04] hover:bg-[#ff6a00]/10"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            void handle(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {preview ? (
          <img src={preview} alt="Odometer" className="h-14 w-20 shrink-0 rounded-md object-cover ring-1 ring-white/15" />
        ) : (
          <div className="grid h-14 w-20 shrink-0 place-items-center rounded-md bg-[#ff6a00]/15">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-[#ff8a3d]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 14l4-4" />
              <path d="M3.34 19a10 10 0 1 1 17.32 0" />
            </svg>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">
            {busy ? "Reading the odometer…" : result ? "Photo read" : "Drop a dashboard photo here"}
          </div>
          <div className="truncate text-[11px] text-[#8b95a8]">
            {busy ? "This takes a few seconds" : "Tap to take a photo or choose one. The reading fills in below."}
          </div>
        </div>
        {busy ? (
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[#ff6a00] border-t-transparent" />
        ) : result ? (
          <span className="shrink-0 text-[11px] font-semibold text-[#ff8a3d]">Use another</span>
        ) : null}
      </div>

      {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">{error}</div>}

      {result && !busy && (
        <div
          className={`vch-enter rounded-lg border px-3 py-2 text-[12px] ${
            result.odometer && result.confidence === "high"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          {result.odometer ? (
            <>
              <span className="font-semibold">AI reading: {result.odometer.toLocaleString("en-GB")} miles</span>
              {result.confidence === "high" ? " · clear read" : " · please check it against the photo"}
              {result.reason && result.confidence !== "high" ? <div className="mt-0.5 opacity-80">{result.reason}</div> : null}
            </>
          ) : (
            <>The odometer couldn't be read from this photo. Type the reading in, or try a sharper photo of the ODO display.</>
          )}
        </div>
      )}
    </div>
  );
}
