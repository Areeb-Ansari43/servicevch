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

export function exportDriverInvoicePdf(driver: DriverTrack, vehicle?: Vehicle) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  header(doc, "DRIVER STATEMENT / INVOICE", driver.registration);

  const agreedDeposit = Number(driver.deposit_total || 0);
  const totalPaidDeposit = (driver.deposit_payments || []).reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );

  let depositStatusStr = "Unpaid";
  if (agreedDeposit > 0 && totalPaidDeposit >= agreedDeposit) {
    depositStatusStr = "Fully Paid";
  } else if (totalPaidDeposit > 0) {
    depositStatusStr = `Partially Paid (£${totalPaidDeposit.toFixed(2)} of £${agreedDeposit.toFixed(2)})`;
  } else if (agreedDeposit === 0) {
    depositStatusStr = "None Set";
  }

  const driverMeta: Array<[string, string]> = [
    ["Driver Name", driver.driver_name],
    ["Vehicle Registration", driver.registration],
    ["Vehicle Model", vehicle ? `${vehicle.make} ${vehicle.model}` : "—"],
    ["Phone Number", driver.phone || "—"],
    ["Email Address", driver.email || "—"],
    ["Contract Start Date", driver.start_date || "—"],
    ["Weekly Rent", `£${Number(driver.weekly_rent || 0).toFixed(2)} / week (${driver.rent_due_day || "Monday"})`],
    ["Deposit Status", depositStatusStr],
    ["Agreed Deposit Amount", `£${agreedDeposit.toFixed(2)}`],
    ["Total Deposit Paid", `£${totalPaidDeposit.toFixed(2)}`],
  ];

  autoTable(doc, {
    startY: 80,
    head: [["Driver & Account Summary", ""]],
    body: driverMeta,
    headStyles: { fillColor: INK, textColor: 255 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 170, textColor: [100, 116, 139] } },
    margin: { left: 40, right: 40 },
    styles: { fontSize: 10, cellPadding: 5 },
  });

  const charges = driver.charges || [];
  const totalCharges = charges.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const y1 = (doc as any).lastAutoTable.finalY + 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text("Itemised Charges Breakdown", 40, y1);

  if (charges.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("No extra charges recorded.", 40, y1 + 16);
  } else {
    autoTable(doc, {
      startY: y1 + 8,
      head: [["Date", "Description", "Amount"]],
      body: charges.map((c) => [
        new Date(c.created_at).toLocaleDateString("en-GB"),
        c.description,
        `£${Number(c.amount).toFixed(2)}`,
      ]),
      headStyles: { fillColor: ORANGE, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
      styles: { fontSize: 9, cellPadding: 6 },
    });
  }

  const lastY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 20 : y1 + 30;

  doc.setFillColor(245, 247, 250);
  doc.rect(40, lastY, doc.internal.pageSize.getWidth() - 80, 56, "F");
  doc.setDrawColor(220, 225, 230);
  doc.rect(40, lastY, doc.internal.pageSize.getWidth() - 80, 56, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(`Weekly Rent: £${Number(driver.weekly_rent || 0).toFixed(2)}`, 54, lastY + 22);
  doc.text(`Itemised Extra Charges: £${totalCharges.toFixed(2)}`, 54, lastY + 40);

  doc.setFontSize(12);
  doc.setTextColor(...ORANGE);
  doc.text(
    `TOTAL BALANCE DUE: £${Number(driver.balance_due || 0).toFixed(2)}`,
    doc.internal.pageSize.getWidth() - 54,
    lastY + 32,
    { align: "right" }
  );

  footer(doc);
  doc.save(
    `vch-invoice-${driver.registration.replace(/\s+/g, "")}-${driver.driver_name.replace(/\s+/g, "_")}.pdf`
  );
}
