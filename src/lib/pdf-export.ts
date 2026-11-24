import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { DriverTrack, ServiceRecord, Vehicle } from "./fleet-data";
import { WEBSITE_DOMAIN } from "./domain-config";

const ORANGE: [number, number, number] = [255, 106, 0];
const INK: [number, number, number] = [15, 17, 21];

function header(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFillColor(...INK);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 60, "F");
  doc.setTextColor(...ORANGE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("VIRTUAL CAR HIRE  ·  FLEET TRACKER", 40, 26);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(title, 40, 46);
  if (subtitle) {
    doc.setTextColor(160, 174, 192);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(subtitle, doc.internal.pageSize.getWidth() - 40, 46, { align: "right" });
  }
}

function footer(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Generated ${new Date().toLocaleString("en-GB")}  ·  Page ${i} of ${pages}  ·  ${WEBSITE_DOMAIN}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: "center" },
    );
  }
}

export function exportServiceHistoryPdf(services: ServiceRecord[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  header(doc, "Service History Report", new Date().toLocaleDateString("en-GB"));

  const total = services.reduce((a, s) => a + (s.cost || 0), 0);

  autoTable(doc, {
    startY: 84,
    head: [["Date", "Reg", "Type", "Mileage", "Garage", "Cost"]],
    body: services.map((s) => [
      s.service_date,
      s.registration,
      s.service_type,
      `${s.mileage.toLocaleString()} mi`,
      s.garage || "—",
      `£${s.cost.toFixed(2)}`,
    ]),
    headStyles: { fillColor: ORANGE, textColor: 255, fontStyle: "bold" },
    bodyStyles: { textColor: INK },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 },
    styles: { fontSize: 9, cellPadding: 6 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(`Total Records: ${services.length}`, 40, finalY);
  doc.setTextColor(...ORANGE);
  doc.text(`Total Spend: £${total.toFixed(2)}`, doc.internal.pageSize.getWidth() - 40, finalY, {
    align: "right",
  });

  footer(doc);
  doc.save(`vch-service-history-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportVehiclePdf(v: Vehicle, services: ServiceRecord[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  header(doc, `${v.make} ${v.model}`, v.registration);

  const meta: Array<[string, string]> = [
    ["Registration", v.registration],
    ["Make / Model", `${v.make} ${v.model}`],
    ["Year", String(v.year)],
    ["Fuel Type", v.fuel_type],
    ["Status", v.status],
    ["Current Mileage", `${v.current_mileage.toLocaleString()} mi`],
    ["Next Service", v.next_service_date || "—"],
    ["Next MOT", v.next_mot_date || "—"],
    ["PCO License Expiry", v.insurance_expiry || "—"],
  ];

  autoTable(doc, {
    startY: 84,
    head: [["Vehicle Details", ""]],
    body: meta,
    headStyles: { fillColor: INK, textColor: 255 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 160, textColor: [100, 116, 139] } },
    margin: { left: 40, right: 40 },
    styles: { fontSize: 10, cellPadding: 6 },
  });

  const vehicleServices = services.filter(
    (s) => s.vehicle_id === v.id || s.registration === v.registration,
  );
  const total = vehicleServices.reduce((a, s) => a + (s.cost || 0), 0);

  const y1 = (doc as any).lastAutoTable.finalY + 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text("Service History", 40, y1);

  if (vehicleServices.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text("No service records on file.", 40, y1 + 18);
  } else {
    autoTable(doc, {
      startY: y1 + 8,
      head: [["Date", "Type", "Mileage", "Garage", "Notes", "Cost"]],
      body: vehicleServices.map((s) => [
        s.service_date,
        s.service_type,
        `${s.mileage.toLocaleString()} mi`,
        s.garage || "—",
        s.description || "—",
        `£${s.cost.toFixed(2)}`,
      ]),
      headStyles: { fillColor: ORANGE, textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
      styles: { fontSize: 9, cellPadding: 6 },
    });

    const yEnd = (doc as any).lastAutoTable.finalY + 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(`Records: ${vehicleServices.length}`, 40, yEnd);
    doc.setTextColor(...ORANGE);
    doc.text(`Total Spend: £${total.toFixed(2)}`, doc.internal.pageSize.getWidth() - 40, yEnd, {
      align: "right",
    });
  }

  footer(doc);
  doc.save(
    `vch-${v.registration.replace(/\s+/g, "")}-${new Date().toISOString().slice(0, 10)}.pdf`,
  );
}

/** Loads the logo for PDFs (null if it can't be loaded; the PDF still renders). */
async function loadLogo(): Promise<string | null> {
  try {
    if (typeof window === "undefined") return null;
    const res = await fetch("/logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const SLATE: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];
const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (d: string | Date) =>
  (typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00` : d) : d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Driver statement: what is owed now (rent + extra charges), with the deposit position. */
export async function exportDriverInvoicePdf(driver: DriverTrack, vehicle?: Vehicle) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const today = new Date();
  const reg = (driver.registration || "").replace(/\s+/g, "").toUpperCase();
  const number = `VCH-${reg || "DRV"}-${today.toISOString().slice(0, 10).replace(/-/g, "")}`;

  const { rentState } = await import("./rent-cycle");
  const rent = Number(driver.weekly_rent || 0);
  const state = rent > 0 && driver.rent_due_day ? rentState(driver as any) : null;
  const dueDate = state ? (state.paid ? state.nextDue : (state.currentDue ?? state.nextDue)) : null;

  const charges = driver.charges || [];
  const chargesTotal = charges.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const balance = Number(driver.balance_due || 0);
  const rentOwed = Math.max(0, balance - chargesTotal);

  // ---- Header: accent rule, logo + company, document title
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, W, 6, "F");
  const logo = await loadLogo();
  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, 34, 44, 44);
    } catch {
      /* logo optional */
    }
  }
  const tx = logo ? M + 56 : M;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Virtual Car Hire", tx, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  doc.text("FA-IBI LTD · The Vista Centre, 50 Salisbury Rd, Hounslow TW4 6JQ", tx, 66);
  doc.text(`info@fa-ibi.co.uk · +44 20 7294 6756 · ${WEBSITE_DOMAIN}`, tx, 78);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Statement", W - M, 54, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text(number, W - M, 70, { align: "right" });
  doc.text(`Issued ${longDate(today)}`, W - M, 82, { align: "right" });

  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.line(M, 104, W - M, 104);

  // ---- Bill to / Vehicle
  const col = (x: number, title: string, lines: string[]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...ORANGE);
    doc.text(title.toUpperCase(), x, 128);
    doc.setTextColor(...INK);
    doc.setFontSize(11);
    doc.text(lines[0] || "—", x, 146);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    lines.slice(1).forEach((l, i) => doc.text(l, x, 162 + i * 13));
  };
  col(M, "Bill to", [driver.driver_name, driver.email || "", driver.phone || ""].filter((x, i) => i === 0 || x));
  col(W / 2 - 40, "Vehicle", [
    reg || "—",
    vehicle ? `${vehicle.make} ${vehicle.model}`.replace(/\s+/g, " ") : "",
    rent ? `${money(rent)} a week · due ${driver.rent_due_day || "Monday"}` : "",
  ].filter((x, i) => i === 0 || x));
  col(W - M - 130, "Amount due", [money(balance), dueDate ? `by ${longDate(dueDate)}` : ""].filter(Boolean));

  // ---- Items
  const body: string[][] = [];
  if (rentOwed > 0) body.push([state?.currentDue ? longDate(state.currentDue) : longDate(today), "Weekly rent", money(rentOwed)]);
  for (const c of charges) body.push([longDate(c.created_at), c.description || "Extra charge", money(Number(c.amount || 0))]);
  if (!body.length) body.push(["", "Nothing owed at the moment", money(0)]);

  autoTable(doc, {
    startY: 206,
    head: [["Date", "Description", "Amount"]],
    body,
    theme: "plain",
    margin: { left: M, right: M },
    styles: { fontSize: 9.5, cellPadding: { top: 9, bottom: 9, left: 0, right: 0 }, textColor: INK, lineColor: LINE },
    headStyles: { fontSize: 8, fontStyle: "bold", textColor: SLATE, cellPadding: { top: 0, bottom: 8, left: 0, right: 0 } },
    columnStyles: { 0: { cellWidth: 120, textColor: SLATE }, 2: { halign: "right", fontStyle: "bold", cellWidth: 90 } },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index === 2) data.cell.styles.halign = "right";
    },
    didDrawCell: (data) => {
      if (data.section === "body" || data.section === "head") {
        doc.setDrawColor(...LINE);
        doc.setLineWidth(0.6);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
    },
  });

  // ---- Totals
  let y = (doc as any).lastAutoTable.finalY + 18;
  const tx2 = W - M - 220;
  const row = (label: string, value: string, strong = false) => {
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 11 : 9.5);
    doc.setTextColor(...(strong ? INK : SLATE));
    doc.text(label, tx2, y);
    doc.setTextColor(...INK);
    doc.text(value, W - M, y, { align: "right" });
    y += strong ? 0 : 18;
  };
  row("Rent", money(rentOwed));
  row("Extra charges", money(chargesTotal));
  y += 6;
  doc.setFillColor(255, 244, 235);
  doc.roundedRect(tx2 - 12, y - 6, W - M - tx2 + 12, 34, 6, 6, "F");
  y += 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("Total due", tx2, y);
  doc.setTextColor(...ORANGE);
  doc.setFontSize(14);
  doc.text(money(balance), W - M - 12, y + 1, { align: "right" });

  // ---- Deposit
  const agreed = Number(driver.deposit_total || 0);
  const paid = (driver.deposit_payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  y += 46;
  doc.setDrawColor(...LINE);
  doc.roundedRect(M, y, W - 2 * M, 54, 6, 6, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...ORANGE);
  doc.text("DEPOSIT", M + 14, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  const depStatus =
    agreed === 0 ? "No deposit set" : paid >= agreed ? "Paid in full" : `${money(agreed - paid)} still to pay`;
  doc.text(`Agreed ${money(agreed)}   ·   Paid ${money(paid)}   ·   ${depStatus}`, M + 14, y + 38);
  doc.setTextColor(...SLATE);
  doc.text("Held until the car is returned in good condition.", W - M - 14, y + 38, { align: "right" });

  // ---- Footer
  doc.setDrawColor(...LINE);
  doc.line(M, H - 70, W - M, H - 70);
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE);
  doc.text(
    dueDate ? `Please pay by ${longDate(dueDate)}. Questions about this statement? Message us on WhatsApp or call +44 20 7294 6756.` : "Questions about this statement? Message us on WhatsApp or call +44 20 7294 6756.",
    M,
    H - 52,
  );
  doc.text(`Virtual Car Hire is a trading name of FA-IBI LTD (Company No. 08844002) · ${number}`, M, H - 38);

  doc.save(`VCH-statement-${reg || "driver"}-${driver.driver_name.replace(/\s+/g, "_")}.pdf`);
}
