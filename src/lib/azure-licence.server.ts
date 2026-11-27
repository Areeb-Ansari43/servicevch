import { getRuntimeEnv } from "@/integrations/supabase/config";
import type { RawLicenceRead } from "@/lib/driving-licence";

/**
 * Reads a driving licence with Azure AI Document Intelligence's prebuilt ID model
 * ("prebuilt-idDocument", which supports UK photocard licences).
 *
 * Settings (environment variables, never in code):
 *   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT  e.g. https://vch-licences.cognitiveservices.azure.com
 *   AZURE_DOCUMENT_INTELLIGENCE_KEY       KEY 1 from the resource's "Keys and Endpoint" page
 * Nothing is stored by Azure beyond processing, and nothing from the licence is logged here.
 */
export const AZURE_API_VERSION = "2024-11-30";
const MODEL = "prebuilt-idDocument";

export function azureConfig(): { endpoint: string; key: string } | null {
  const endpoint = (
    getRuntimeEnv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT") ??
    getRuntimeEnv("AZURE_DOCINTEL_ENDPOINT") ??
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  const key = (
    getRuntimeEnv("AZURE_DOCUMENT_INTELLIGENCE_KEY") ??
    getRuntimeEnv("AZURE_DOCINTEL_KEY") ??
    ""
  ).trim();
  return endpoint && key && /^https:\/\//.test(endpoint) ? { endpoint, key } : null;
}

type AzureField = {
  content?: string;
  valueString?: string;
  valueDate?: string;
  valueCountryRegion?: string;
  confidence?: number;
};

export type AzureLicenceRead =
  | { ok: true; raw: RawLicenceRead; lowConfidence: string[] }
  | { ok: false; reason: string };

/** "2028-01-04" -> "04.01.2028", the format the licence checks expect. */
const ddmmyyyy = (iso?: string) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
};

/** Turns Azure's result into the same shape the Gemini reader gives (exported for tests). */
export function mapAzureResult(result: any, minConfidence = 0.8): AzureLicenceRead {
  const doc = result?.analyzeResult?.documents?.[0];
  if (!doc) return { ok: false, reason: "not_a_licence" };
  const f: Record<string, AzureField> = doc.fields ?? {};
  const text = (k: string) => (f[k]?.valueString ?? f[k]?.content ?? "").trim() || null;
  const date = (k: string) => ddmmyyyy(f[k]?.valueDate) ?? (f[k]?.content?.trim() || null);
  const lowConfidence = ["FirstName", "LastName", "DocumentNumber", "DateOfExpiration"].filter(
    (k) => f[k] && typeof f[k].confidence === "number" && f[k].confidence! < minConfidence,
  );
  const docType = String(doc.docType ?? "");
  return {
    ok: true,
    lowConfidence,
    raw: {
      is_driving_licence: !docType || /driverLicense/i.test(docType),
      readable: true,
      country: f.CountryRegion?.valueCountryRegion ?? text("CountryRegion"),
      surname: text("LastName"),
      first_names: text("FirstName"),
      date_of_birth: date("DateOfBirth"),
      expiry_date: date("DateOfExpiration"),
      licence_number: text("DocumentNumber"),
    },
  };
}

export async function readLicenceWithAzure(
  mimeType: string,
  base64: string,
  timeoutMs = 25000,
): Promise<AzureLicenceRead> {
  const cfg = azureConfig();
  if (!cfg) return { ok: false, reason: "azure_not_configured" };
  const started = Date.now();
  try {
    const res = await fetch(
      `${cfg.endpoint}/documentintelligence/documentModels/${MODEL}:analyze?api-version=${AZURE_API_VERSION}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Ocp-Apim-Subscription-Key": cfg.key },
        body: JSON.stringify({ base64Source: base64 }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (res.status !== 202) {
      const body = (await res.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ");
      console.warn(`[azure-licence] analyze -> ${res.status} (${mimeType}): ${body}`);
      return { ok: false, reason: `azure_http_${res.status}` };
    }
    const poll = res.headers.get("operation-location");
    if (!poll) return { ok: false, reason: "azure_no_operation" };
    // Azure works in the background; check every ~0.8s until it's done.
    while (Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, 800));
      const p = await fetch(poll, {
        headers: { "Ocp-Apim-Subscription-Key": cfg.key },
        signal: AbortSignal.timeout(10000),
      });
      if (!p.ok) {
        console.warn(`[azure-licence] poll -> ${p.status}`);
        return { ok: false, reason: `azure_http_${p.status}` };
      }
      const body = (await p.json()) as { status?: string };
      if (body.status === "succeeded") return mapAzureResult(body);
      if (body.status === "failed" || body.status === "canceled") {
        console.warn(`[azure-licence] analysis ${body.status}`);
        return { ok: false, reason: `azure_${body.status}` };
      }
    }
    return { ok: false, reason: "timeout" };
  } catch (err) {
    const timeout = err instanceof Error && /timeout|abort/i.test(err.name + err.message);
    console.warn(`[azure-licence] ${timeout ? "timeout" : "request failed"}`);
    return { ok: false, reason: timeout ? "timeout" : "azure_unreachable" };
  }
}
