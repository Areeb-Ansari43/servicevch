export type VehicleDisplayInput = { make?: string | null; model?: string | null };

export const VEHICLE_FAMILY_NAMES = [
  "Tesla Model 3",
  "Jaguar I-Pace",
  "Hyundai Ioniq",
  "Hyundai Santa Fe",
  "Ford Tourneo Custom",
  "Mercedes-Benz E220D",
  "Mercedes-Benz E300",
  "Mercedes-Benz EQE",
  "Mercedes-Benz EQS",
  "Mercedes-Benz Vito",
  "Mercedes-Benz V-Class",
  "Toyota Auris Estate",
  "Toyota Corolla",
  "Toyota Prius",
] as const;

export type VehicleFamilyName = (typeof VEHICLE_FAMILY_NAMES)[number];

export function simplifyVehicleName(
  vehicle: VehicleDisplayInput | string,
  model?: string,
): VehicleFamilyName | string {
  const input = typeof vehicle === "string" ? { make: vehicle, model } : vehicle;
  const text = `${input.make ?? ""} ${input.model ?? ""}`
    .toUpperCase()
    .replace(/[\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.includes("MODEL 3")) return "Tesla Model 3";
  if (text.includes("I PACE")) return "Jaguar I-Pace";
  if (text.includes("IONIQ")) return "Hyundai Ioniq";
  if (text.includes("SANTA FE") || text.includes("SANTAFE")) return "Hyundai Santa Fe";
  if (text.includes("TOURNEO")) return "Ford Tourneo Custom";
  if (text.includes("EQE")) return "Mercedes-Benz EQE";
  if (text.includes("EQS")) return "Mercedes-Benz EQS";
  if (text.includes("V CLASS") || text.includes("V-CLASS")) return "Mercedes-Benz V-Class";
  if (text.includes("VITO")) return "Mercedes-Benz Vito";
  if (text.includes("E 220") || text.includes("E220")) return "Mercedes-Benz E220D";
  if (text.includes("E 300") || text.includes("E300")) return "Mercedes-Benz E300";
  if (text.includes("COROLLA")) return "Toyota Corolla";
  if (text.includes("AURIS")) return "Toyota Auris Estate";
  if (text.includes("PRIUS")) return "Toyota Prius";
  if (text.includes("MG 5") || text.includes("MG5")) return "MG 5 EV";
  return `${input.make ?? ""} ${input.model ?? ""}`.trim();
}

export function vehicleArtworkPath(vehicle: VehicleDisplayInput): string | null {
  switch (simplifyVehicleName(vehicle)) {
    case "Tesla Model 3":
      return "/vehicle-artwork/tesla-model3-transparent.png";
    case "Jaguar I-Pace":
      return "/vehicle-artwork/jaguar-ipace-transparent.png";
    case "Hyundai Ioniq":
      return "/vehicle-artwork/hyundai-ioniq-transparent.png";
    case "Hyundai Santa Fe":
      return "/vehicle-artwork/hyundai-santa-fe-transparent.png";
    case "Ford Tourneo Custom":
      return "/vehicle-artwork/ford-tourneo-custom-transparent.png";
    case "Mercedes-Benz E220D":
    case "Mercedes-Benz E300":
      return "/vehicle-artwork/mercedes-eclass-transparent.png";
    case "Mercedes-Benz EQE":
      return "/vehicle-artwork/mercedes-eqe-transparent.png";
    case "Mercedes-Benz EQS":
      return "/vehicle-artwork/mercedes-eqe-transparent.png";
    case "Mercedes-Benz Vito":
      return "/vehicle-artwork/mercedes-vito-transparent.png";
    case "Toyota Auris Estate":
      return "/vehicle-artwork/toyota-auris-estate-transparent.png";
    case "Toyota Corolla":
      return "/vehicle-artwork/toyota-corolla-estate-transparent.png";
    case "Toyota Prius":
      return "/vehicle-artwork/toyota-prius-transparent.png";
    case "MG 5 EV":
      return "/vehicle-artwork/mg5-ev-transparent.png";
    default:
      return null;
  }
}
