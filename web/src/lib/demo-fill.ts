// Presentation defaults: forms on the booking path start filled with fictional details, so a timed demo is mostly
// "Continue". Everything stays editable. Set DEMO_FILL to false to start every form empty.
export const DEMO_FILL = true;

export const DEMO = {
  concern: "I have a headache and feel unsure what to do",
  duration: "weeks" as const,
  seen: "no" as const,
  location: "Macquarie Park",
  fitFinderRequest: "A GP around Macquarie Park on weekends, bulk billing if available, who speaks Mandarin",
  name: "Brenda Example",
  // Presenter account, created by the server at start-up (server/src/demo.ts).
  login: { email: "branda@example.com", password: "12345678" },
  profile: { date_of_birth: "1958-04-12", phone: "0400 123 456", emergency_name: "Mark Example", emergency_phone: "0400 654 321" },
  prep: {
    onset: "About three weeks ago",
    experiences: "The headaches are worse in the afternoon, especially after long days at the computer. I've been more tired than usual.",
    background: "",
    questions: "Should I keep a headache diary?\nCould my screen time be making it worse?\nDo I need any tests?",
    additional: "Bring my glasses and the list of medicines I take.",
  },
};

export const fill = <T,>(value: T): T | undefined => (DEMO_FILL ? value : undefined);
