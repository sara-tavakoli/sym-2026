// Types and FICTIONAL sample confirmations for "Import from a booking confirmation".
// Samples are generated relative to today so they are always upcoming. No real people or clinics.

export type ImportFieldKey = "starts_at" | "practitioner_name" | "service_type" | "clinic_name" | "location" | "purpose";
export interface ImportField { value: string | null; source: string | null; confidence: "high" | "medium" | "low" | "not_found"; via: "parser" | "ai" | null; note?: string }
export interface ImportResult { format: "ics" | "text"; timezone: string; fields: Record<ImportFieldKey, ImportField>; warnings: string[]; ai_used: boolean }

export const IMPORT_LABELS: Record<ImportFieldKey, string> = {
  starts_at: "Date and time", practitioner_name: "Practitioner", service_type: "Service type", clinic_name: "Clinic", location: "Location", purpose: "Purpose",
};
const REQUIRED: ImportFieldKey[] = ["starts_at", "practitioner_name", "service_type", "clinic_name"];

/** Hint shown under a pre-filled form field: the exact text it came from, or why it's empty. */
export function sourceHint(f: ImportField | undefined, key: ImportFieldKey): string | undefined {
  if (!f) return undefined;
  if (f.value && f.source) {
    const ai = f.via === "ai" ? " (AI suggestion, please check)" : f.confidence === "low" || f.confidence === "medium" ? " (please check)" : "";
    return `From your confirmation: “${f.source}”${ai}${f.note ? ` · ${f.note}` : ""}`;
  }
  if (f.note) return f.source ? `${f.note} Found: “${f.source}”` : f.note;
  return REQUIRED.includes(key) ? "Not found in your confirmation. Please fill this in." : undefined;
}

const TZ = "Australia/Sydney";
function parts(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 864e5);
  const get = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-AU", { timeZone: TZ, ...o });
  return {
    weekdayLong: get({ weekday: "long" }), weekdayShort: get({ weekday: "short" }), day: get({ day: "numeric" }),
    monthLong: get({ month: "long" }), monthShort: get({ month: "short" }), year: get({ year: "numeric" }),
    ymd: `${get({ year: "numeric" })}${get({ month: "2-digit" })}${get({ day: "2-digit" })}`,
  };
}

export interface Sample { id: string; label: string; text: () => string }

export const SAMPLES: Sample[] = [
  {
    id: "email", label: "Sample email",
    text: () => {
      const p = parts(4);
      return `Subject: Your appointment is confirmed

Hi Alex,

Your appointment with Dr Priya Example at Wattle Grove Medical Centre is confirmed.

When: ${p.weekdayLong}, ${p.day} ${p.monthLong} ${p.year} at 10:15am
Appointment type: Standard consultation
Practitioner: Dr Priya Example
Address: Level 1, 24 Demo Street, Sampletown NSW 2000

Need to cancel or reschedule? Please let the practice know at least 2 hours beforehand.

(Fictional sample confirmation for the CarePath demo. Not a real booking.)`;
    },
  },
  {
    id: "sms", label: "Sample SMS",
    text: () => {
      const p = parts(9);
      return `Reminder: Sam, you're booked with Dr Tom Placeholder at Riverbend Health Clinic on ${p.weekdayShort} ${p.day} ${p.monthShort}, 2:30 pm. Reason for visit: Skin check. Address: 5/88 Sample Rd, Exampleville VIC 3999. Reply C to confirm. (Fictional sample)`;
    },
  },
  {
    id: "ics", label: "Sample calendar (.ics)",
    text: () => {
      const p = parts(12);
      return [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CarePath demo//Fictional sample//EN", "BEGIN:VEVENT",
        "UID:fictional-sample-0001@carepath.example",
        `DTSTART;TZID=Australia/Sydney:${p.ymd}T091500`,
        `DTEND;TZID=Australia/Sydney:${p.ymd}T093000`,
        "SUMMARY:Appointment with Dr Mei Sample",
        "LOCATION:Bayview Family Practice\\, 3 Harbour Parade\\, Seaside NSW 2999",
        "DESCRIPTION:Appointment type: Long consultation\\nReason for visit: Review b",
        " lood test results\\n(Fictional sample for the CarePath demo.)",
        "END:VEVENT", "END:VCALENDAR",
      ].join("\r\n");
    },
  },
];
