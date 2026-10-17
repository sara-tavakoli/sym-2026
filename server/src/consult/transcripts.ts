// Fictional consultation transcripts for the demo. Nothing here is real patient data or medical advice.
// {dr} is replaced with the practitioner's name and {pt} with the patient's first name.

export interface SampleTranscript { key: string; title: string; transcript: string }

const GP_HEADACHES = `{dr}: Hi {pt}, come in. Thanks for sharing your notes before today, that really helps.
{pt}: Thanks. It's mostly the headaches in the afternoons, and I'm tired even after a full night's sleep.
{dr}: How long has this been going on?
{pt}: About three weeks. It's worse after long days on the laptop.
{dr}: Any vomiting, weakness, or changes in your vision?
{pt}: No, nothing like that. I take paracetamol now and then and it helps a bit.
{dr}: You mentioned your iron was a bit low last year. Did you take anything for it?
{pt}: I took iron tablets for a month and then stopped.
{dr}: OK. Let me check a few things. Your blood pressure is 118 over 76, which is normal. Your eyes and neck examination look normal today.
{pt}: Could my screen time be causing the headaches?
{dr}: It could be part of it. Long screen sessions and reading glasses that are out of date are a common cause of afternoon headaches. Low iron could explain the tiredness, so I want to check rather than guess.
{dr}: Please get a blood test this week for a full blood count, iron studies and thyroid function. The form will be at reception.
{dr}: Book an eye test with an optometrist, since your reading glasses are a couple of years old.
{dr}: Try taking a screen break every 20 minutes and look at something far away for 20 seconds.
{dr}: Keep a simple headache diary for the next two weeks, with the time, what you were doing and how bad it was.
{dr}: Please avoid starting iron tablets again until we have seen the results.
{dr}: You can continue paracetamol when you need it, but no more than the packet says.
{dr}: Book a review with me in two weeks so we can go through the results together.
{dr}: If you get a sudden severe headache, weakness, or changes in your vision, call 000 or go to the emergency department straight away.
{pt}: That's really clear, thank you.`;

const DENTAL = `{dr}: Hi {pt}, have a seat. Anything bothering you since your last visit?
{pt}: Not really, my gums bleed a little when I brush sometimes.
{dr}: OK, let's have a look. Your gums are a little inflamed along the bottom front teeth, and there is a small cavity starting on a back tooth on the upper left.
{pt}: Is that bad?
{dr}: It's small and very fixable. Catching it now is the good news.
{dr}: Please book a 30-minute appointment in the next month so we can do a small filling on that tooth.
{dr}: Use a soft toothbrush and brush twice a day for two minutes, and floss once a day, especially around the bottom front teeth.
{dr}: Use a high-fluoride toothpaste at night and spit, don't rinse, afterwards.
{dr}: Try to avoid sugary drinks between meals.
{dr}: Return for your next check-up and clean in six months.
{dr}: If you get swelling in your face or a toothache that keeps you up at night, call the clinic the same day.
{pt}: Great, thanks.`;

const GP_GENERAL = `{dr}: Hi {pt}, thanks for coming in and for sharing your notes. What would you like to cover today?
{pt}: Mostly a general check-up. I've been feeling a bit run down and I'd like to make sure everything is OK.
{dr}: Any particular symptoms, like pain, fevers or weight changes?
{pt}: Not really. I've been sleeping badly and not exercising much lately.
{dr}: Let me check a few things. Your blood pressure is 124 over 80, and your heart and chest sound normal today.
{pt}: Do I need any tests?
{dr}: It's been a while since your last bloods, so it's reasonable to check.
{dr}: Please get a fasting blood test in the next two weeks for cholesterol, blood sugar and a full blood count.
{dr}: Try to get 30 minutes of walking on most days of the week.
{dr}: Keep a regular bedtime and avoid screens for the hour before bed.
{dr}: Continue your usual medicines as you are taking them now.
{dr}: Book a review with me in three weeks to go through the results.
{dr}: If you notice chest pain, shortness of breath or you feel very unwell, call 000 straight away.
{pt}: Will do, thanks.`;

const TEMPLATES = {
  "gp-headaches": { title: "Fictional GP consult: headaches and tiredness (5 min)", text: GP_HEADACHES },
  dental: { title: "Fictional dental check-up (3 min)", text: DENTAL },
  "gp-general": { title: "Fictional GP consult: general check-up (4 min)", text: GP_GENERAL },
} as const;

/** Picks a transcript that fits the appointment: dental by service type, the headaches consult when the visit is about that, else a generic GP one. */
export function pickSample(appt: { service_type: string; practitioner_name: string; purpose?: string | null }, patientFirstName: string, briefText = ""): SampleTranscript {
  const about = `${appt.purpose ?? ""} ${briefText}`.toLowerCase();
  const key: keyof typeof TEMPLATES = /dent/i.test(appt.service_type) ? "dental"
    : /headache|tired|iron|fatigue/.test(about) ? "gp-headaches" : "gp-general";
  const dr = appt.practitioner_name.trim() || "Doctor";
  const pt = patientFirstName.trim() || "Patient";
  return { key, title: TEMPLATES[key].title, transcript: TEMPLATES[key].text.replaceAll("{dr}", dr).replaceAll("{pt}", pt) };
}
