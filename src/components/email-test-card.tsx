import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  sendTestEmailFn,
  type TestEmailKind,
  type TestEmailResult,
} from "@/lib/email-admin.functions";

type Toast = (m: string, t?: "success" | "error" | "info") => void;

const BUTTONS: { kind: TestEmailKind; title: string; sender: string; color: string }[] = [
  {
    kind: "2fa_code",
    title: "2FA Verification Code",
    sender: "auth@fa-ibi.co.uk",
    color: "text-[#ff8a3d]",
  },
  {
    kind: "fleet_summary",
    title: "Fleet-Wide MOT/PCO Summary",
    sender: "notifications@fa-ibi.co.uk",
    color: "text-sky-400",
  },
  {
    kind: "driver_licence_summary",
    title: "Driver Licence Expiry Summary",
    sender: "notifications@fa-ibi.co.uk",
    color: "text-sky-400",
  },
  {
    kind: "rent_due_tomorrow",
    title: "Rent-Due-Tomorrow Reminder",
    sender: "notifications@fa-ibi.co.uk",
    color: "text-sky-400",
  },
  {
    kind: "driver_alert",
    title: "Driver Portal Alert (MOT/PCO Notice)",
    sender: "driver-alerts@fa-ibi.co.uk",
    color: "text-emerald-400",
  },
];

type ButtonState = { status: "idle" | "sending" } | { status: "done"; result: TestEmailResult };

export function EmailTestCard({ email, toast }: { email: string; toast: Toast }) {
  const sendFn = useServerFn(sendTestEmailFn);
  const [state, setState] = useState<Record<string, ButtonState>>({});

  const send = async (kind: TestEmailKind, title: string) => {
    setState((s) => ({ ...s, [kind]: { status: "sending" } }));
    let result: TestEmailResult;
    try {
      result = await sendFn({ data: { kind } });
    } catch (err: any) {
      result = {
        ok: false,
        kind,
        recipient: email,
        error: err?.message || "Request failed",
        logged: false,
      };
    }
    setState((s) => ({ ...s, [kind]: { status: "done", result } }));
    if (result.ok) toast(`${title} test sent to ${result.recipient}`);
    else toast(`${title} test failed: ${result.error}`, "error");
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#10141d] p-5">
      <h2 className="text-base font-bold text-white">Email Template Previews</h2>
      <p className="mt-1 text-xs text-[#9aa5b8]">
        Each button sends a real test email to your own address ({email}) through the live sending
        path, and records it in the email log.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BUTTONS.map(({ kind, title, sender, color }) => {
          const st = state[kind];
          const sending = st?.status === "sending";
          const result = st?.status === "done" ? st.result : null;
          return (
            <div
              key={kind}
              className="flex flex-col rounded-xl border border-white/10 bg-black/20 p-3.5"
              data-test-email={kind}
            >
              <div className="text-xs font-bold text-white">{title}</div>
              <div className="mt-1 text-[11px] text-[#8b95a8]">
                Sent via <span className={`font-semibold ${color}`}>{sender}</span>
              </div>
              <button
                type="button"
                disabled={sending}
                onClick={() => send(kind, title)}
                className="mt-3 self-start rounded-lg border border-[#ff6a00]/30 bg-[#ff6a00]/10 px-2.5 py-1 text-[10px] font-bold text-[#ff8a3d] transition hover:bg-[#ff6a00]/20 disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send Test Email →"}
              </button>
              {result && (
                <div
                  role="status"
                  className={`mt-2 break-words rounded-lg border p-2 text-[11px] ${
                    result.ok
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-red-500/30 bg-red-500/10 text-red-300"
                  }`}
                >
                  {result.ok ? (
                    <>
                      Sent to {result.recipient}
                      {result.resendId ? (
                        <span className="block font-mono text-[10px] opacity-80">
                          id {result.resendId}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>Failed: {result.error}</>
                  )}
                  {!result.logged && (
                    <span className="mt-1 block text-amber-300">
                      Not recorded in email_log{result.logError ? `: ${result.logError}` : ""}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
