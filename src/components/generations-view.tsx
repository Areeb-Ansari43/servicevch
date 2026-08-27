import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import jsPDF from "jspdf";
import { FileText, ScanLine, CarFront, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { scanDrivingLicence } from "@/lib/generations.functions";
import { VCHLETTER_FLEET, normalizeVchReg } from "@/lib/vchletter-fleet";
import type { DriverTrack, Vehicle } from "@/lib/fleet-data";

const panel = "rounded-2xl border border-white/[0.12] bg-white/[0.055] shadow-[0_20px_70px_rgba(0,0,0,.22)] backdrop-blur-xl";
const input = "w-full rounded-xl border border-white/[0.1] bg-[#142131] px-3 py-2.5 text-sm text-[#eef2f8] outline-none transition placeholder:text-[#738096] focus:border-[#ff8a3d]/70 focus:ring-2 focus:ring-[#ff8a3d]/15";

type Props = { vehicles: Vehicle[]; drivers: DriverTrack[]; toast: (message: string, type?: "success" | "error" | "info") => void };
type Scan = { fullName: string; licence: string; address: string; postcode: string; dob: string; expiry: string };

function Field({ label, value, onChange, multiline = false, type = "text" }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; type?: string }) {
  return <label className="block space-y-1.5"><span className="text-xs font-semibold text-[#d7dce6]">{label}</span>{multiline ? <textarea className={`${input} min-h-24 resize-y`} value={value} onChange={(e) => onChange(e.target.value)} /> : <input className={input} type={type} value={value} onChange={(e) => onChange(e.target.value)} />}</label>;
}

function base64(file: File) {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
}

function imageData(url: string) {
  return new Promise<string>((resolve, reject) => { const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => { const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext("2d")?.drawImage(image, 0, 0); resolve(canvas.toDataURL("image/png")); }; image.onerror = reject; image.src = url; });
}

export function GenerationsView({ vehicles, drivers, toast }: Props) {
  const [tab, setTab] = useState<"permission" | "contract">("permission");
  const [selectedReg, setSelectedReg] = useState("");
  const [scan, setScan] = useState<Scan>({ fullName: "", licence: "", address: "", postcode: "", dob: "", expiry: "" });
  const [scanBusy, setScanBusy] = useState(false);
  const [scanReview, setScanReview] = useState(false);
  const [scanPreview, setScanPreview] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [insurance, setInsurance] = useState("HAVFL-000211");
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [contractNo, setContractNo] = useState("");
  const [rent, setRent] = useState("250/-");
  const [rate, setRate] = useState("20/-");
  const [deposit, setDeposit] = useState("500/-");
  const [ownerSignature, setOwnerSignature] = useState("Muhammad Sohail Qureshi");
  const [fileName, setFileName] = useState("");
  const [contractStartTime, setContractStartTime] = useState("09:00");
  const [contractReturnTime, setContractReturnTime] = useState("17:00");
  const [generating, setGenerating] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [pdfLogs, setPdfLogs] = useState<Array<{ id: string; document_type: string; source_registration: string | null; storage_path: string; created_at: string }>>([]);
  const scanLicence = useServerFn(scanDrivingLicence);

  const sourceVehicle = useMemo(() => VCHLETTER_FLEET.find((v) => normalizeVchReg(v.reg) === normalizeVchReg(selectedReg)), [selectedReg]);
  const linkedVehicle = useMemo(() => vehicles.find((v) => normalizeVchReg(v.registration) === normalizeVchReg(selectedReg)), [vehicles, selectedReg]);
  const matchedDriver = useMemo(() => drivers.find((d) => d.driver_name.toLowerCase() === scan.fullName.toLowerCase()), [drivers, scan.fullName]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (cancelled || !user.user) return;
      const rows = VCHLETTER_FLEET.map((vehicle) => ({ user_id: user.user.id, source_repo: "Areeb-Ansari43/VCHLetter", source_revision: "main", source_registration: vehicle.reg, normalized_registration: normalizeVchReg(vehicle.reg), model: vehicle.model, crm_vehicle_id: vehicles.find((crm) => normalizeVchReg(crm.registration) === normalizeVchReg(vehicle.reg))?.id ?? null, sync_status: vehicles.some((crm) => normalizeVchReg(crm.registration) === normalizeVchReg(vehicle.reg)) ? "matched" : "imported" }));
      await supabase.from("vchletter_fleet" as never).upsert(rows as never, { onConflict: "user_id,normalized_registration" });
    })();
    return () => { cancelled = true; };
  }, [vehicles]);

  const modelText = sourceVehicle?.model ?? (linkedVehicle ? `${linkedVehicle.make} ${linkedVehicle.model}` : "");
  const modelParts = modelText.split(" ");
  const make = modelParts.shift() ?? "";
  const model = modelParts.join(" ");

  const onScan = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type) || file.size > 12_000_000) { toast("Upload a JPG or PNG licence image under 12 MB.", "error"); return; }
    setScanPreview(URL.createObjectURL(file)); setScanBusy(true); setScanReview(false);
    try {
      const raw = await base64(file);
      const result = await scanLicence({ data: { imageBase64: raw, mimeType: file.type as "image/jpeg" | "image/png" } });
      setScan({ fullName: result.fullName, licence: result.licence, address: result.address, postcode: result.postcode, dob: result.dob, expiry: result.expiry });
      const { data: user } = await supabase.auth.getUser();
      if (user.user) {
        const scanPath = `${user.user.id}/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "_")}`;
        const upload = await supabase.storage.from("generations-licence-scans").upload(scanPath, file, { contentType: file.type, upsert: false });
        if (!upload.error) await supabase.from("licence_scans" as never).insert({ user_id: user.user.id, driver_id: null, storage_path: scanPath, original_filename: file.name, mime_type: file.type, extracted_data: result, confidence_data: result.confidence, review_status: "needs_review" } as never);
      }
      setScanReview(true); toast("Azure extracted the licence fields. Review every value before saving or generating.", "success");
    } catch (error) { toast(error instanceof Error ? error.message : "Azure licence scan failed.", "error"); }
    finally { setScanBusy(false); }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => { const { data } = await supabase.from("generated_documents" as never).select("id,document_type,source_registration,storage_path,created_at").order("created_at", { ascending: false }).limit(100); if (!cancelled) setPdfLogs((data ?? []) as never); })();
    return () => { cancelled = true; };
  }, []);

  const selectDriver = (id: string) => { const d = drivers.find((x) => x.id === id); if (d) { setScan((s) => ({ ...s, fullName: d.driver_name })); setPhone(d.phone ?? ""); setSelectedReg(d.registration); } };

  const saveDocument = async (kind: "permission_letter" | "contract", blob: Blob, filename: string) => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error("You must be signed in.");
    const path = `${user.user.id}/${kind}/${Date.now()}-${filename}.pdf`;
    const { error: uploadError } = await supabase.storage.from("generations-documents").upload(path, blob, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    const { error } = await supabase.from("generated_documents" as never).insert({ user_id: user.user.id, document_type: kind, driver_id: matchedDriver?.id ?? null, vehicle_id: linkedVehicle?.id ?? null, source_registration: selectedReg, storage_path: path, template_version: "VCHLetter-main-74aeb66", created_by: user.user.id } as never);
    if (error) throw new Error(error.message);
  };

  const generate = async () => {
    setGenerating(true);
    if (!scan.fullName.trim() || !selectedReg.trim()) { setGenerating(false); toast("Add a driver name and select a vehicle first.", "error"); return; }
    if (!scanReview) { toast("Review and confirm the scanned fields first.", "error"); setGenerating(false); return; }
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    if (tab === "permission") {
      doc.addImage(await imageData("/assets/vchletter-permission-background.png"), "PNG", 0, 0, 612, 792);
      doc.setTextColor(25, 25, 25); doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.text(new Date(documentDate).toLocaleDateString("en-GB"), 480, 150);
      doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("PERMISSION LETTER", 205, 190);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      const permissionRows: Array<[string, string]> = [["Vehicle Registration", selectedReg], ["Make and Model", `${make} ${model}`], ["Driver Name", scan.fullName], ["Address", `${scan.address}, ${scan.postcode}`], ["Driving Licence No", scan.licence], ["Hire start date.", startDate], ["Hire end date", endDate], ["Insurance Policy No", insurance]];
      let py = 300; permissionRows.forEach(([label, value]) => { doc.text(`${label} :`, 54, py); doc.text(String(value || ""), 180, py); py += 22; });
      doc.text("Regards,", 54, 690); doc.setFont("helvetica", "bold"); doc.text(ownerSignature, 54, 716); doc.setFont("helvetica", "normal"); doc.text("Director (FA-IBI LTD)", 54, 734);
    } else {
      doc.addImage(await imageData("/assets/vchletter-contract-page-1.png"), "PNG", 0, 0, 612, 792);
      doc.setTextColor(20, 20, 20); doc.setFont("helvetica", "bold"); doc.setFontSize(8.8);
      const firstPage: Array<[string, string, number, number]> = [["contract_no", contractNo || `${selectedReg.replace(/\s/g, "")}/DRIVER/${new Date().getFullYear()}`, 335, 96], ["date", documentDate, 80, 744], ["driver", scan.fullName, 87, 132], ["dob", scan.dob, 494, 132], ["address", `${scan.address}, ${scan.postcode}`, 77, 156], ["licence", scan.licence, 92, 181], ["expiry", scan.expiry, 489, 181], ["phone", phone, 60, 210], ["email", email, 283, 210], ["rent", rent, 110, 412], ["rate", rate, 135, 447], ["deposit", deposit, 107, 480], ["start", `${startDate} ${contractStartTime}`, 108, 579], ["return", `${endDate} ${contractReturnTime}`, 185, 594], ["make", make, 68, 660], ["reg", selectedReg, 288, 660], ["model", model, 456, 660]];
      firstPage.forEach(([, value, x, y]) => { if (value) doc.text(String(value).slice(0, 42), x, y); });
      doc.addImage(await imageData("/assets/vchletter-contract-page-2.png"), "PNG", 0, 0, 612, 792); doc.text(contractNo || `${selectedReg.replace(/\s/g, "")}/DRIVER/${new Date().getFullYear()}`, 140, 69); doc.text(selectedReg, 375, 69); doc.text(documentDate, 280, 744);
    }
    const filename = (fileName.trim() || `${tab === "permission" ? "Permission-Letter" : "Contract"}-${selectedReg.replace(/\s/g, "")}`).replace(/[^a-z0-9 _-]/gi, "").trim() || "VCH-Document"; const blob = doc.output("blob");
    try { await saveDocument(tab === "permission" ? "permission_letter" : "contract", blob, filename); setPdfLogs((logs) => [{ id: crypto.randomUUID(), document_type: tab === "permission" ? "permission_letter" : "contract", source_registration: selectedReg, storage_path: filename, created_at: new Date().toISOString() }, ...logs]); doc.save(`${filename}.pdf`); toast(`${tab === "permission" ? "Permission letter" : "Contract"} generated and saved.`, "success"); } catch (error) { toast(error instanceof Error ? error.message : "Could not save document.", "error"); } finally { setGenerating(false); }
  };

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">Generations</h1><p className="mt-1 text-sm text-[#9aa5b8]">Permission letters and contracts generated from the VCHLetter fleet.</p></div><button type="button" onClick={() => setLogsOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white hover:border-[#ff8a3d]/50"><FileText className="h-4 w-4 text-[#ff8a3d]" /> Generated PDFs ({pdfLogs.length})</button></div>{logsOpen && <div className={`${panel} max-h-72 overflow-auto p-4`}><h2 className="mb-3 text-sm font-bold text-white">Generated PDF log</h2>{pdfLogs.length === 0 ? <p className="text-sm text-[#9aa5b8]">No generated documents yet.</p> : <div className="space-y-2">{pdfLogs.map((log) => <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-black/10 px-3 py-2 text-xs"><span className="font-semibold text-white">{log.document_type === "contract" ? "Contract" : "Permission Letter"}</span><span className="text-[#aab4c4]">{log.source_registration ?? "Manual"}</span><span className="text-[#8995a8]">{new Date(log.created_at).toLocaleString("en-GB")}</span></div>)}</div>}</div>}
    <div className={`${panel} p-4 sm:p-5`}><div className="mb-4 flex items-center gap-2 text-lg font-semibold"><ScanLine className="h-5 w-5 text-[#ff8a3d]" /> Shared Data Automation Panel</div><div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-white/[0.08] bg-[#101925] p-4"><label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 text-center hover:border-[#ff8a3d]/70"><ScanLine className="h-7 w-7 text-[#ff8a3d]" /><span className="text-sm font-semibold">Driver&apos;s Licence Scanner</span><span className="text-xs text-[#8995a8]">Upload JPG or PNG · Azure Document Intelligence</span><input className="sr-only" type="file" accept="image/jpeg,image/png" capture="environment" onChange={(e) => void onScan(e.target.files?.[0])} /></label>{scanBusy && <p className="mt-3 text-xs text-[#ffb37b]">Processing licence securely with Azure…</p>}{scanPreview && <img src={scanPreview} alt="Uploaded licence preview" className="mt-3 max-h-40 w-full rounded-lg object-contain" />}</div><div className="rounded-xl border border-white/[0.08] bg-[#101925] p-4"><label className="mb-2 flex items-center gap-2 text-sm font-semibold"><CarFront className="h-4 w-4 text-[#ff8a3d]" /> Select Fleet Vehicle</label><select className={input} value={selectedReg} onChange={(e) => setSelectedReg(e.target.value)}><option value="">— Manual Entry —</option>{VCHLETTER_FLEET.map((v) => <option key={v.reg} value={v.reg}>{v.reg} ({v.model})</option>)}</select><div className="mt-3 flex items-center gap-2 text-xs text-[#9aa5b8]"><span className="h-2 w-2 rounded-full bg-emerald-400" /> {VCHLETTER_FLEET.length} vehicles loaded from VCHLetter</div>{linkedVehicle && <p className="mt-2 text-xs text-[#9aa5b8]">CRM match: {linkedVehicle.make} {linkedVehicle.model} · {linkedVehicle.status}</p>}</div></div></div>
    <div className={`${panel} overflow-hidden`}><div className="flex border-b border-white/[0.1]"><button className={`flex-1 px-4 py-3 text-sm font-semibold ${tab === "permission" ? "border-b-2 border-[#ff6a00] text-[#ff8a3d]" : "text-[#aab4c4]"}`} onClick={() => setTab("permission")}>▧ Permission Letter</button><button className={`flex-1 px-4 py-3 text-sm font-semibold ${tab === "contract" ? "border-b-2 border-[#ff6a00] text-[#ff8a3d]" : "text-[#aab4c4]"}`} onClick={() => setTab("contract")}>▤ Contract Generator</button></div><div className="space-y-5 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{tab === "permission" ? "Permission Letter" : "Hirer Details"}</h2></div>{scanReview ? <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Azure fields extracted. Confirm by reviewing and editing the form before generating.</div> : <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"><AlertTriangle className="h-4 w-4" /> Licence extraction is assisted entry, not official DVLA validation.</div>}<div className="mb-4 max-w-md"><Field label="Output File Name" value={fileName} onChange={setFileName} /></div><div className="grid gap-4 md:grid-cols-2"><Field label={tab === "permission" ? "Document Date" : "Contract Date"} value={documentDate} onChange={setDocumentDate} type="date" /><Field label="Full Name" value={scan.fullName} onChange={(v) => setScan((s) => ({ ...s, fullName: v }))} /><Field label="Licence No" value={scan.licence} onChange={(v) => setScan((s) => ({ ...s, licence: v }))} /><Field label="Date of Birth" value={scan.dob} onChange={(v) => setScan((s) => ({ ...s, dob: v }))} /><Field label="Address" value={scan.address} onChange={(v) => setScan((s) => ({ ...s, address: v }))} multiline /><Field label="Postcode" value={scan.postcode} onChange={(v) => setScan((s) => ({ ...s, postcode: v }))} /><Field label="Licence Expiry" value={scan.expiry} onChange={(v) => setScan((s) => ({ ...s, expiry: v }))} /><Field label="Phone" value={phone} onChange={setPhone} /></div>{tab === "permission" ? <div className="grid gap-4 md:grid-cols-2"><Field label="Insurance Policy No" value={insurance} onChange={setInsurance} /><Field label="Vehicle Registration" value={selectedReg} onChange={setSelectedReg} /><Field label="Make & Model" value={`${make} ${model}`} onChange={() => undefined} /><Field label="Hire Start Date" value={startDate} onChange={setStartDate} type="date" /><Field label="Hire End Date" value={endDate} onChange={setEndDate} type="date" /></div> : <><div className="grid gap-4 md:grid-cols-2"><Field label="Email" value={email} onChange={setEmail} /><Field label="Contract Number" value={contractNo} onChange={setContractNo} /><Field label="Rent (£/week)" value={rent} onChange={setRent} /><Field label="Excess (pence/mile)" value={rate} onChange={setRate} /><Field label="Deposit (£)" value={deposit} onChange={setDeposit} /><Field label="Hire Start" value={startDate} onChange={setStartDate} type="date" /><Field label="Start Time" value={contractStartTime} onChange={setContractStartTime} type="time" /><Field label="Expected Return" value={endDate} onChange={setEndDate} type="date" /><Field label="Return Time" value={contractReturnTime} onChange={setContractReturnTime} type="time" /><Field label="Owner Signature" value={ownerSignature} onChange={setOwnerSignature} /></div><div className="grid gap-4 md:grid-cols-3"><Field label="Make" value={make} onChange={() => undefined} /><Field label="Reg" value={selectedReg} onChange={setSelectedReg} /><Field label="Model" value={model} onChange={() => undefined} /></div></>}<button disabled={generating || scanBusy} onClick={() => void generate()} className="inline-flex items-center gap-2 rounded-xl bg-[#ff6a00] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-950/30 transition hover:bg-[#ff7a21] active:scale-[.98] disabled:cursor-wait disabled:opacity-60"><Download className="h-4 w-4" /> {generating ? "Generating PDF…" : `Generate ${tab === "permission" ? "Permission Letter" : "2-Page Contract"} PDF`}</button></div></div>
  </section>;
}
