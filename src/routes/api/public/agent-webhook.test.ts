import { expect, test, describe } from "bun:test";
import {
  parseCarEligibility,
  isAvailable,
  uniqueAvailableVehicles,
  normalizeModelKey,
  availableYears,
  isOutsideUKBusinessHours,
  getWelcomeMenuText,
  simplifyVehicleName,
  isPositiveConfirmation,
  isNegativeConfirmation,
  isMenuReset,
  parseAccidentIdentity,
  isOffScriptQuestion,
  applyAntiRepetition,
} from "./agent-webhook";

describe("Car Eligibility Parsing & Warnings", () => {
  test("answers 'No' to penalty points sets points = 0 (no warning/default answer)", () => {
    const res = parseCarEligibility("1. Yes 2. Yes 3. No");
    expect(res.ageEligible).toBe(true);
    expect(res.pcoBadge).toBe(true);
    expect(res.points).toBe(0);
    expect(res.completed).toBe(true);
  });

  test("answers 'No' to age sets ageEligible = false and completed = true when all answered", () => {
    const res = parseCarEligibility("1. No 2. Yes 3. 0 points");
    expect(res.ageEligible).toBe(false);
    expect(res.pcoBadge).toBe(true);
    expect(res.points).toBe(0);
    expect(res.completed).toBe(true);
  });

  test("answers 'No' to PCO badge sets pcoBadge = false", () => {
    const res1 = parseCarEligibility("1. Yes 2. No 3. No");
    expect(res1.ageEligible).toBe(true);
    expect(res1.pcoBadge).toBe(false);
    expect(res1.points).toBe(0);

    const res2 = parseCarEligibility("Yes, No, 0 points");
    expect(res2.ageEligible).toBe(true);
    expect(res2.pcoBadge).toBe(false);
    expect(res2.points).toBe(0);
  });

  test("penalty points specified correctly", () => {
    const res = parseCarEligibility("1. Yes 2. Yes 3. 3 points");
    expect(res.ageEligible).toBe(true);
    expect(res.pcoBadge).toBe(true);
    expect(res.points).toBe(3);

    const highPoints = parseCarEligibility("1. Yes 2. Yes 3. 7 points");
    expect(highPoints.points).toBe(7);
  });
});

describe("Out-of-Hours Check", () => {
  test("isOutsideUKBusinessHours returns correct status for given UK hours", () => {
    const daytime = new Date("2025-08-28T14:00:00Z"); // 2pm UTC / BST
    const nighttime = new Date("2025-08-28T22:00:00Z"); // 10pm UTC / BST
    expect(isOutsideUKBusinessHours(daytime)).toBe(false);
    expect(isOutsideUKBusinessHours(nighttime)).toBe(true);
  });

  test("getWelcomeMenuText appends out-of-hours message when outside 9am-6pm", () => {
    const nighttime = new Date("2025-08-28T22:00:00Z");
    const menu = getWelcomeMenuText(nighttime);
    expect(menu).toContain("Virtual Car Hire is unable to connect you to an agent");
  });
});

describe("Fleet Availability & Model Deduplication", () => {
  test("isAvailable correctly identifies available vs unavailable vehicles", () => {
    expect(
      isAvailable({
        reg: "A1",
        make: "Mercedes",
        model: "E20",
        year: 2022,
        fuel_type: "Petrol",
        status: "available",
        next_mot_date: null,
        pco_expiry_date: null,
      }),
    ).toBe(true);
    expect(
      isAvailable({
        reg: "A2",
        make: "Mercedes",
        model: "E20",
        year: 2022,
        fuel_type: "Petrol",
        status: "Active",
        next_mot_date: null,
        pco_expiry_date: null,
      }),
    ).toBe(true);
    expect(
      isAvailable({
        reg: "A3",
        make: "Mercedes",
        model: "E20",
        year: 2022,
        fuel_type: "Petrol",
        status: "rented",
        next_mot_date: null,
        pco_expiry_date: null,
      }),
    ).toBe(false);
    expect(
      isAvailable({
        reg: "A4",
        make: "Mercedes",
        model: "E20",
        year: 2022,
        fuel_type: "Petrol",
        status: "In Service",
        next_mot_date: null,
        pco_expiry_date: null,
      }),
    ).toBe(false);
    expect(
      isAvailable({
        reg: "A5",
        make: "Mercedes",
        model: "E20",
        year: 2022,
        fuel_type: "Petrol",
        status: "off_road",
        next_mot_date: null,
        pco_expiry_date: null,
      }),
    ).toBe(false);
  });

  test("simplifyVehicleName simplifies long raw vehicle names correctly to Make and Model only", () => {
    expect(simplifyVehicleName("MERCEDES-BENZ", "VITO 114 BLUETEC TOURER PRO")).toEqual({
      make: "Mercedes-Benz",
      model: "Vito",
    });
    expect(simplifyVehicleName("MERCEDES-BENZ", "E 220 D SE AUTO (2018, 2019)")).toEqual({
      make: "Mercedes-Benz",
      model: "E220d",
    });
    expect(simplifyVehicleName("TESLA", "MODEL 3 LONG RANGE AWD")).toEqual({
      make: "Tesla",
      model: "Model 3",
    });
    expect(simplifyVehicleName("TOYOTA", "COROLLA ICON VVT-I HEV CVT")).toEqual({
      make: "Toyota",
      model: "Corolla Estate",
    });
    expect(simplifyVehicleName("MG", "MG 5 EXCITE EV")).toEqual({ make: "MG", model: "MG5 EV" });
  });

  test("uniqueAvailableVehicles deduplicates identical or slightly varied models with simplified names", () => {
    const fleet = [
      {
        reg: "A1",
        make: "Mercedes-Benz",
        model: "E 220 D SE AUTO",
        year: 2018,
        fuel_type: "Petrol",
        status: "available",
        next_mot_date: null,
        pco_expiry_date: null,
      },
      {
        reg: "A2",
        make: "Mercedes-Benz",
        model: "E 220 D AMG LINE AUTO",
        year: 2019,
        fuel_type: "Petrol",
        status: "available",
        next_mot_date: null,
        pco_expiry_date: null,
      },
      {
        reg: "A3",
        make: "Mercedes-Benz",
        model: "Vito 114 Tourer",
        year: 2019,
        fuel_type: "Petrol",
        status: "available",
        next_mot_date: null,
        pco_expiry_date: null,
      },
      {
        reg: "B1",
        make: "Toyota",
        model: "Prius",
        year: 2020,
        fuel_type: "Hybrid",
        status: "rented",
        next_mot_date: null,
        pco_expiry_date: null,
      },
    ];

    const unique = uniqueAvailableVehicles(fleet);
    expect(unique.length).toBe(2);
    expect(unique[0].make).toBe("Mercedes-Benz");
    expect(unique[0].model).toBe("E220d");
    expect(unique[1].make).toBe("Mercedes-Benz");
    expect(unique[1].model).toBe("Vito");

    const years = availableYears(fleet, unique[0]);
    expect(years).toBe("2018, 2019");
  });
});

describe("Menu Reset / Greeting Detection", () => {
  test("isMenuReset detects standard and informal greetings, typos, emojis and restart commands", () => {
    expect(isMenuReset("hello")).toBe(true);
    expect(isMenuReset("Hello!")).toBe(true);
    expect(isMenuReset("hi")).toBe(true);
    expect(isMenuReset("hiii")).toBe(true);
    expect(isMenuReset("helo")).toBe(true);
    expect(isMenuReset("hey")).toBe(true);
    expect(isMenuReset("yo")).toBe(true);
    expect(isMenuReset("hola")).toBe(true);
    expect(isMenuReset("goodmorning")).toBe(true);
    expect(isMenuReset("good morning")).toBe(true);
    expect(isMenuReset("👋")).toBe(true);
    expect(isMenuReset("Hello 👋")).toBe(true);
    expect(isMenuReset("menu")).toBe(true);
    expect(isMenuReset("start")).toBe(true);
    expect(isMenuReset("restart")).toBe(true);
    expect(isMenuReset("options")).toBe(true);
  });
});

describe("Accident Identity Extraction", () => {
  test("extracts name and registration when provided together in one message", () => {
    const res1 = parseAccidentIdentity("John Smith AB12 CDE");
    expect(res1).not.toBeNull();
    expect(res1?.name).toBe("John Smith");
    expect(res1?.registration).toBe("AB12 CDE");

    const res2 = parseAccidentIdentity("Muhammad Ali, LC70XYZ");
    expect(res2).not.toBeNull();
    expect(res2?.name).toBe("Muhammad Ali");
    expect(res2?.registration).toBe("LC70XYZ");

    const res3 = parseAccidentIdentity("David O'Connor - EF21GHI");
    expect(res3).not.toBeNull();
    expect(res3?.name).toBe("David O'Connor");
    expect(res3?.registration).toBe("EF21GHI");
  });

  test("returns null if registration is missing", () => {
    expect(parseAccidentIdentity("John Smith")).toBeNull();
  });
});

describe("Off-Script Question Detection & Anti-Repetition", () => {
  test("isOffScriptQuestion detects side questions like 'who is this'", () => {
    expect(isOffScriptQuestion("Btw who is this?")).toBe(true);
    expect(isOffScriptQuestion("who are you")).toBe(true);
    expect(isOffScriptQuestion("what are your opening hours")).toBe(true);
    expect(isOffScriptQuestion("where is your garage located")).toBe(true);
    expect(isOffScriptQuestion("can I call you?")).toBe(true);
    expect(isOffScriptQuestion("is this a bot")).toBe(true);
  });

  test("applyAntiRepetition prevents sending duplicate messages back to back", () => {
    const original = "🚨 Accident verification\n\nPlease send the missing detail: your full name.";
    const rephrased = applyAntiRepetition(original, original);
    expect(rephrased).not.toBe(original);
    expect(rephrased).toContain("Please let me know if you have any questions");

    const distinct = applyAntiRepetition("Driver details verified", original);
    expect(distinct).toBe("Driver details verified");
  });
});

describe("Confirmation Response Parsing", () => {
  test("isPositiveConfirmation correctly parses variations of affirmative input", () => {
    expect(isPositiveConfirmation("yes")).toBe(true);
    expect(isPositiveConfirmation("Yes")).toBe(true);
    expect(isPositiveConfirmation("yes correct")).toBe(true);
    expect(isPositiveConfirmation("yes it is")).toBe(true);
    expect(isPositiveConfirmation("confirm")).toBe(true);
    expect(isPositiveConfirmation("yeah")).toBe(true);
  });

  test("isNegativeConfirmation correctly parses variations of negative input", () => {
    expect(isNegativeConfirmation("no")).toBe(true);
    expect(isNegativeConfirmation("No")).toBe(true);
    expect(isNegativeConfirmation("not correct")).toBe(true);
    expect(isNegativeConfirmation("incorrect")).toBe(true);
  });
});
