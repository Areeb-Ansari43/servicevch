import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { readDrivingLicenceFn } from "@/lib/licence.functions";
import type { LicenceReadResult } from "@/lib/driving-licence";

export type LicenceValues = {
  fullName: string | null;
  expiryDate: string | null;
  licenceNumber: string | null;
  /** Fields staff should double-check ("check"), keyed by field. */
  check: { fullName: boolean; expiryDate: boolean; licenceNumber: boolean };
};

const MAX_BYTES = 9 * 1024 * 1024;

/** Big phone photos are scaled to 1600px (sharp enough for the small print) to upload fast. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = () => {
      const original = String(reader.result);
      if (!file.type.startsWith("image/") || /heic|heif/i.test(file.type)) return resolve(original);
      const img = new Image();
      img.onload = () => {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 3 * 1024 * 1024) return resolve(original);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      img.onerror = () => resolve(original);
      img.src = original;
    };
    reader.readAsDataURL(file);
  });
}

const fmtDate = (ymd: string) => ymd.split("-").reverse().join("/");

/**
 * "Drop a driving licence" box: reads the full name, expiry date (4b) and licence number (5)
 * and hands them to the form. Staff can still edit every field; anything the checks doubt is
 * marked "Check".
 */
export function LicenceScanner({ onRead }: { onRead: (v: LicenceValues) => void }) {
  const readFn = useServerFn(readDrivingLicenceFn);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<LicenceReadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      setError(null);
      setResult(null);
      if (
        !/^image\//.test(file.type) &&
        file.type !== "application/pdf" &&
        !/\.(heic|heif)$/i.test(file.name)
      ) {
        setError("Please use a photo or PDF of the licence.");
        return;
      }
      if (file.size > MAX_BYTES * 2) {
        setError("That file is too large. Please use a photo under 18 MB.");
        return;
      }
      setFileName(file.name);
      setBusy(true);
      try {
        let dataUrl = await fileToDataUrl(file);
        if (/\.(heic|heif)$/i.test(file.name) && !/^data:image\/hei[cf]/i.test(dataUrl)) {
          dataUrl = dataUrl.replace(/^data:[^;]*;/, "data:image/heic;");
        }
        setPreview(file.type.startsWith("image/") ? dataUrl : null);
        if (dataUrl.length > 12_400_000)
          throw new Error("That file is too large to read. Please use a smaller photo.");
        const res = (await readFn({ data: { file: dataUrl } })) as LicenceReadResult | undefined;
        if (!res || typeof res !== "object" || !res.fullName) {
          throw new Error(
            "The licence couldn't be read right now. Please try again or type the details in.",
          );
        }
        setResult(res);
        if (!res.ok) {
          setError(res.error || "Nothing could be read. Please try a clearer photo.");
          return;
        }
        onRead({
          fullName: res.fullName.value,
          expiryDate: res.expiryDate.value,
          licenceNumber: res.licenceNumber.value,
          check: {
            fullName: res.fullName.confidence !== "high",
            expiryDate: res.expiryDate.confidence !== "high",
            licenceNumber: res.licenceNumber.confidence !== "high",
          },
        });
      } catch (err) {
        setError(
          (err instanceof Error && err.message) ||
            "The licence couldn't be read. Please try again or type the details in.",
        );
      } finally {
        setBusy(false);
      }
    },
    [onRead, readFn],
  );

  const badge = (c: "high" | "check" | "missing") =>
    c === "high" ? (
      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
        Read ✓
      </span>
    ) : c === "check" ? (
      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
        Check
      </span>
    ) : (
      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-[#8b95a8]">
        Not found
      </span>
    );

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a driving licence to fill in the details"
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
          if (!busy) handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-3 transition-colors ${
          dragging
            ? "border-[#ff6a00] bg-[#ff6a00]/10"
            : "border-[#ff6a00]/40 bg-[#ff6a00]/[0.04] hover:bg-[#ff6a00]/10"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {preview ? (
          <img
            src={preview}
            alt="Licence"
            className="h-14 w-20 shrink-0 rounded-md object-cover ring-1 ring-white/15"
          />
        ) : (
          <div className="grid h-14 w-20 shrink-0 place-items-center rounded-md bg-[#ff6a00]/15 text-2xl">
            🪪
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white">
            {busy
              ? "Reading licence…"
              : result?.ok
                ? "Licence read. Check the details below"
                : "Drop a driving licence here"}
          </div>
          <div className="truncate text-[11px] text-[#8b95a8]">
            {busy
              ? fileName
              : "Fills in the full name, expiry date and licence number. Tap to take a photo or choose a file."}
          </div>
        </div>
        {busy ? (
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[#ff6a00] border-t-transparent" />
        ) : result ? (
          <span className="shrink-0 text-[11px] font-semibold text-[#ff8a3d]">Read another</span>
        ) : null}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
          {error}
        </div>
      )}

      {result?.ok && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 text-[12px]">
          <div className="grid gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#8b95a8]">Name</span>
              <span className="flex min-w-0 items-center gap-2 font-semibold text-white">
                <span className="truncate">{result.fullName.value ?? "—"}</span>{" "}
                {badge(result.fullName.confidence)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#8b95a8]">Expiry (4b)</span>
              <span className="flex items-center gap-2 font-semibold text-white">
                {result.expiryDate.value ? fmtDate(result.expiryDate.value) : "—"}{" "}
                {badge(result.expiryDate.confidence)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#8b95a8]">Licence no. (5)</span>
              <span className="flex min-w-0 items-center gap-2 font-mono font-semibold text-white">
                <span className="truncate">{result.licenceNumber.value ?? "—"}</span>{" "}
                {badge(result.licenceNumber.confidence)}
              </span>
            </div>
          </div>
          {result.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-white/10 pt-2 text-amber-200">
              {result.warnings.map((w) => (
                <li key={w}>⚠️ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
