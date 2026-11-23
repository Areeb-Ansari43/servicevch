/**
 * Checks and tidies what the AI read from a driving licence, so the Add Driver form only
 * fills in values that make sense, and flags anything staff should double-check.
 *
 * UK photocard fields: 1 surname, 2 first names, 3 date and place of birth, 4b expiry date,
 * 5 licence number. A GB licence number has 16 characters:
 *   SSSSS  first 5 letters of the surname (padded with 9)
 *   YMMDDY birth decade digit, month (+50 for women), day, year digit
 *   II     first-name initials (padded with 9)
 *   9      check digit (usually 9)
 *   AA     two computer check letters
 * The photocard prints a 2-digit issue number after it (e.g. "MORGA753116SM9IJ 35"); that is
 * not part of the number and is dropped.
 */

export type RawLicenceRead = {
  surname?: string | null;
  first_names?: string | null;
  full_name?: string | null;
  date_of_birth?: string | null;
  expiry_date?: string | null;
  licence_number?: string | null;
  country?: string | null;
  is_driving_licence?: boolean | null;
  readable?: boolean | null;
};

export type LicenceField<T> = { value: T | null; confidence: "high" | "check" | "missing" };

export type LicenceReadResult = {
  ok: boolean;
  fullName: LicenceField<string>;
  expiryDate: LicenceField<string>; // YYYY-MM-DD
  licenceNumber: LicenceField<string>;
  dateOfBirth: string | null;
  warnings: string[];
  error?: string;
};

const GB_NUMBER = /^[A-Z9]{5}\d{6}[A-Z9]{2}\d[A-Z]{2}$/;

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function titleCase(v: string): string {
  return v
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s'-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase())
    .replace(/\bMc([a-z])/g, (_m, ch) => "Mc" + ch.toUpperCase());
}

/** "MORGA753116SM9IJ 35" -> "MORGA753116SM9IJ"; drops spaces and the photocard issue number. */
export function normaliseLicenceNumber(raw: string): string {
  let v = clean(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "");
  const parts = v.split(/\s+/).filter(Boolean);
  if (
    parts.length > 1 &&
    /^\d{2}$/.test(parts[parts.length - 1]) &&
    parts.slice(0, -1).join("").length === 16
  ) {
    parts.pop();
  }
  v = parts.join("");
  if (v.length === 18 && GB_NUMBER.test(v.slice(0, 16)) && /^\d{2}$/.test(v.slice(16)))
    v = v.slice(0, 16);
  return v;
}

/** First 5 letters of the surname as the DVLA encodes them ("MacDonald" -> "MCDON", "Li" -> "LI999"). */
export function surnameCode(surname: string): string {
  const letters = clean(surname)
    .toUpperCase()
    .replace(/^MAC(?=[A-Z])/, "MC")
    .replace(/[^A-Z]/g, "");
  return (letters + "99999").slice(0, 5);
}

/** The date of birth the number encodes, as YYYY-MM-DD (decade from the number, century guessed). */
export function birthDateFromNumber(num: string): string | null {
  if (!GB_NUMBER.test(num)) return null;
  const decade = Number(num[5]);
  let month = Number(num.slice(6, 8));
  if (month > 50) month -= 50;
  const day = Number(num.slice(8, 10));
  const yearDigit = Number(num[10]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const yy = decade * 10 + yearDigit;
  const nowYY = new Date().getUTCFullYear() % 100;
  const year = yy > nowYY - 16 ? 1900 + yy : 2000 + yy;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function validateGbLicenceNumber(
  num: string,
  opts: { surname?: string | null; dateOfBirth?: string | null } = {},
): { formatOk: boolean; surnameMatches: boolean | null; birthMatches: boolean | null } {
  const formatOk = GB_NUMBER.test(num);
  if (!formatOk) return { formatOk, surnameMatches: null, birthMatches: null };
  const surnameMatches = opts.surname ? num.slice(0, 5) === surnameCode(opts.surname) : null;
  let birthMatches: boolean | null = null;
  const fromNum = birthDateFromNumber(num);
  // Compare YY-MM-DD only: the number does not say which century.
  if (opts.dateOfBirth && fromNum) birthMatches = fromNum.slice(2) === opts.dateOfBirth.slice(2);
  return { formatOk, surnameMatches, birthMatches };
}

/** Licence dates: "01.02.2030", "01/02/30", "2030-02-01", "1 Feb 2030" -> "2030-02-01". */
export function parseLicenceDate(
  raw: string | null | undefined,
  kind: "expiry" | "birth" = "expiry",
): string | null {
  const v = clean(raw);
  if (!v) return null;
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = v.match(/^(\d{1,2})[-./ ](\d{1,2})[-./ ](\d{2}|\d{4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100)
      y =
        kind === "expiry" ? 2000 + y : y > new Date().getUTCFullYear() % 100 ? 1900 + y : 2000 + y;
  } else {
    const t = Date.parse(v);
    if (Number.isNaN(t)) return null;
    const dt = new Date(t);
    [y, m, d] = [dt.getFullYear(), dt.getMonth() + 1, dt.getDate()];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1900 || y > 2100) return null;
  return dt.toISOString().slice(0, 10);
}

export function assessLicenceRead(
  raw: RawLicenceRead,
  today = new Date().toISOString().slice(0, 10),
): LicenceReadResult {
  const warnings: string[] = [];
  const empty = <T>(): LicenceField<T> => ({ value: null, confidence: "missing" });

  if (raw.is_driving_licence === false) {
    return {
      ok: false,
      fullName: empty(),
      expiryDate: empty(),
      licenceNumber: empty(),
      dateOfBirth: null,
      warnings: [],
      error:
        "This doesn't look like a driving licence. Please use a clear photo of the front of the licence.",
    };
  }

  // Name: first names + surname, as people write it.
  const surname = clean(raw.surname);
  const firstNames = clean(raw.first_names);
  const nameRaw = firstNames || surname ? `${firstNames} ${surname}` : clean(raw.full_name);
  const fullName: LicenceField<string> = nameRaw
    ? { value: titleCase(nameRaw), confidence: firstNames && surname ? "high" : "check" }
    : empty();
  if (fullName.confidence === "check")
    warnings.push("Check the name: only part of it could be read.");

  // Expiry (4b)
  const expiry = parseLicenceDate(raw.expiry_date, "expiry");
  const expiryDate: LicenceField<string> = expiry ? { value: expiry, confidence: "high" } : empty();
  if (!expiry) warnings.push("The expiry date (4b) couldn't be read. Please type it in.");
  else if (expiry < today) {
    expiryDate.confidence = "check";
    warnings.push(`This licence expired on ${expiry.split("-").reverse().join("/")}.`);
  }

  // Licence number (5)
  const dob = parseLicenceDate(raw.date_of_birth, "birth");
  const num = raw.licence_number ? normaliseLicenceNumber(raw.licence_number) : "";
  let licenceNumber: LicenceField<string> = empty();
  if (num) {
    const country = clean(raw.country).toUpperCase();
    const looksGb = !country || /^(GB|UK|UNITED KINGDOM|NI)$/.test(country) || GB_NUMBER.test(num);
    if (looksGb) {
      const v = validateGbLicenceNumber(num, { surname, dateOfBirth: dob });
      if (!v.formatOk) {
        licenceNumber = { value: num, confidence: "check" };
        warnings.push(
          "The licence number doesn't look like a full 16-character UK number. Please check it against the licence.",
        );
      } else if (v.surnameMatches === false) {
        licenceNumber = { value: num, confidence: "check" };
        warnings.push("The licence number doesn't match the surname. Please check both.");
      } else if (v.birthMatches === false) {
        licenceNumber = { value: num, confidence: "check" };
        warnings.push("The licence number doesn't match the date of birth. Please check it.");
      } else {
        licenceNumber = { value: num, confidence: "high" };
      }
    } else {
      licenceNumber = { value: num, confidence: "check" };
      warnings.push("Non-UK licence: please check the number.");
    }
  } else {
    warnings.push("The licence number (5) couldn't be read. Please type it in.");
  }

  if (raw.readable === false)
    warnings.unshift("The photo is hard to read. Please check every field.");

  return {
    ok: Boolean(fullName.value || expiryDate.value || licenceNumber.value),
    fullName,
    expiryDate,
    licenceNumber,
    dateOfBirth: dob,
    warnings,
    error:
      fullName.value || expiryDate.value || licenceNumber.value
        ? undefined
        : "Nothing could be read from this photo. Please try a clearer photo of the front of the licence.",
  };
}
