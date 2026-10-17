# CarePath AI — 3-minute live demo + Q&A prep (all data fictional)

**Before you go on (5 min):** open the live link in a signed-out browser; click **Try the live demo** once to confirm it loads and run one **Generate brief** to confirm the AI key works. Have a second tab (or a phone) ready to open the clinician link. Keep `docs/EVIDENCE.md` and `docs/SCOPE.md` open for questions.

| Time | Do | Say |
|---|---|---|
| 0:00 | Landing → scroll to **Booking is solved** stats | "HotDoc made booking easy. But patients forget 40 to 80% of what they're told, and in one BMJ study only 4 of 35 GP patients raised everything they came for. Booking is solved; what happens around the appointment isn't." |
| 0:20 | **Try the live demo** → dashboard **Needs attention** | "Every judge gets a private sandbox. Alex's blood test is overdue, the dentist is tomorrow and not prepared, and two instructions are unclear. HotDoc reminds you to turn up; we make sure the follow-through happens." |
| 0:40 | Appointments → **Import booking confirmation** → **Sample email** → Fill in the form → Create | "No retyping: paste the confirmation you already got, or the calendar file. Every field shows where it came from." |
| 1:00 | Open the GP appointment (20 Oct) → show the confirmed brief, expand a **source quote** | "The AI organises the patient's own words. The server throws away any point it can't trace back to what they typed, and anything that sounds like a diagnosis." *(If time: Prepare → Generate on the new appointment to show live AI.)* |
| 1:25 | **Share with your clinician** → Create link → open it in the second tab | "During the consult, the GP opens this. No account needed, the link expires, the patient can revoke it." |
| 1:40 | As the GP: tick two questions → write "Blood test within 5 days. Book a review in 2 weeks. Take vitamin D 1000 IU daily. Call if headaches get worse." → **Send** | "The questions get answered, and the plan comes straight back to the patient." |
| 2:00 | Back as Alex: refresh → **New plan from clinician** → **Turn into checklist** → Extract → Confirm | "It becomes a checklist with due dates. Medication wording is kept word-for-word and flagged. Vague items say 'confirm with your clinician'." |
| 2:25 | **Care circle** → Mia has taken the blood test; activity feed → **People I support** → Grandpa Joe | "Three million Australians are unpaid carers. Mia can see what's coming and take tasks on, and Alex helps their grandfather the same way." |
| 2:45 | Close | "Before, during and after: one loop around every appointment. We load-tested it locally at about 3,000 requests a second; the first thing to break at scale is AI throughput, so we have a queue design and automatic Gemini-to-Claude failover. And it never diagnoses." |

**If AI is slow or down:** the error is clear and nothing is lost. Skip the live generation and show the pre-confirmed brief; extraction can be shown from the seeded past visit.

## Likely questions (short answers; details in docs/EVIDENCE.md)
- **"Isn't this just HotDoc plus a notes app?"** HotDoc ends at the booking. The clinician loop and the care circle are two-sided, multi-user flows HotDoc doesn't have.
- **"Doesn't Heidi already send patients a summary?"** Yes, Heidi's patient recap. We don't replace the scribe; we close the loop around it: the patient's brief goes in, the plan comes back as a checklist with owners and due dates. A scribe could post to the same endpoint.
- **"Won't preparation make consults longer?"** A 2008 BMJ systematic review (Kinnersley et al.) found preparing before a consult slightly increased question-asking with no significant change in consultation length.
- **"Is this a medical device? Is it safe?"** It organises the patient's own words and never diagnoses. Safety is enforced in code (traceability checks, medication verbatim, injection filtering), not just prompts. No clinical validation yet.
- **"What breaks first at 100x?"** AI throughput (bounded queue, then job workers + quota), then single-node SQLite (→ Postgres; queries are already parameterised and per-user), then in-memory rate limits (→ Redis). See docs/ARCHITECTURE.md.
- **"Evidence from real users?"** Cite the interview notes the team collected today (docs/EVIDENCE.md §5), plus the studies.
- **"Privacy?"** Fictional data only. Share and invite tokens are stored hashed; supporters never see private notes; account deletion removes everything. AI text goes to the provider only when the user asks.
