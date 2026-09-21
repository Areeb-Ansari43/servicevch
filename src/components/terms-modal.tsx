import { useEffect, useState } from "react";

const TERMS_KEY = "vch_terms_accepted_v1";

export function TermsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const accepted = localStorage.getItem(TERMS_KEY);
      if (!accepted) {
        setOpen(true);
      }
    } catch {
      // In case localStorage is disabled or throws in restricted environments
    }
  }, []);

  const handleAcknowledge = () => {
    try {
      localStorage.setItem(TERMS_KEY, new Date().toISOString());
    } catch {
      // Ignore storage errors
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-title"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/20 bg-[#10141d] p-6 shadow-2xl md:p-8 space-y-6 animate-in zoom-in-95 duration-300">
        <div className="pointer-events-none absolute -top-24 -left-24 h-48 w-48 rounded-full bg-[#ff6a00]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-[#ff8a3d]/15 blur-3xl" />

        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff6a00] to-[#ff8a3d] text-white shadow-lg shadow-[#ff6a00]/30">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            <h2 id="terms-title" className="text-lg font-bold text-white">
              Driver Terms & Notifications
            </h2>
            <p className="text-xs text-[#8b95a8]">Important terms regarding your account</p>
          </div>
        </div>

        <div className="space-y-4 text-xs leading-relaxed text-[#c5cbd6]">
          <p className="text-sm font-medium text-white">
            Please review and acknowledge the following terms regarding automated email
            notifications and reminders for your vehicle rental:
          </p>

          <ul className="space-y-3">
            <li className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#ff6a00]/20 text-[#ff8a3d] font-bold text-xs">
                1
              </span>
              <div>
                <strong className="text-white block font-semibold mb-0.5">
                  Automated Email Reminders
                </strong>
                By default, you are enrolled in automated email notifications for upcoming MOT
                expiries, scheduled vehicle servicing, and PCO licence renewals.
              </div>
            </li>

            <li className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#ff6a00]/20 text-[#ff8a3d] font-bold text-xs">
                2
              </span>
              <div>
                <strong className="text-white block font-semibold mb-0.5">
                  Contract Expiry Unsubscribe
                </strong>
                Once your rental contract ends and is closed, these automated reminder emails will stop
                automatically with no manual action required.
              </div>
            </li>

            <li className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#ff6a00]/20 text-[#ff8a3d] font-bold text-xs">
                3
              </span>
              <div>
                <strong className="text-white block font-semibold mb-0.5">
                  Return Driver Re-enrollment
                </strong>
                If you return as an active driver at a later date, your automated notification
                preferences will automatically re-enroll to ensure seamless vehicle compliance.
              </div>
            </li>
          </ul>
        </div>

        <div className="pt-2 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={handleAcknowledge}
            className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff8a3d] px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#ff6a00]/30 hover:brightness-110 active:scale-[0.98] transition-all"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
