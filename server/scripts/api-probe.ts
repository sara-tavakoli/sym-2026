// API probe (run against a live server, e.g. BASE=http://localhost:4950 npx tsx server/scripts/api-probe.ts): auth, cross-user isolation, public endpoints, malformed input.
const base = process.env.BASE ?? "http://localhost:4950";
type R = { status: number; data: any; headers: Headers };
async function call(cookie: string, method: string, path: string, body?: unknown, raw?: string): Promise<R & { cookie: string }> {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie }, body: method === "GET" ? undefined : raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const txt = await res.text();
  let data: any = txt; try { data = JSON.parse(txt); } catch {}
  return { status: res.status, data, headers: res.headers, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? cookie };
}
const fails: string[] = [];
const check = (cond: boolean, msg: string) => { if (!cond) { fails.push(msg); console.log("FAIL", msg); } };

async function register(tag: string) {
  const r = await call("", "POST", "/api/auth/register", { name: tag, email: `${tag}-${Date.now()}@example.com`, password: "probe-pass-123" });
  if (r.status !== 201 && r.status !== 200) throw new Error(`register ${r.status} ${JSON.stringify(r.data)}`);
  return r.cookie;
}
const A = (await call("", "POST", "/api/demo")).cookie;
const B = await register("probe-b");

const appts = (await call(A, "GET", "/api/appointments?scope=upcoming&page=1&pageSize=8")).data.items;
const gp = appts.find((a: any) => a.prep_status === "confirmed");
const share = await call(A, "POST", `/api/appointments/${gp.id}/shares`, { expires_in_days: 7 });
const token = share.data.path.split("/").pop();
const shares = (await call(A, "GET", `/api/appointments/${gp.id}/shares`)).data;
const shareId = shares.shares[0].id;
const qid = shares.questions[0].id;
await call("", "POST", `/api/share/${token}/plan`, { author: "Dr X", text: "Blood test in 5 days." });
const plans = (await call(A, "GET", `/api/appointments/${gp.id}/clinician-plans`)).data.plans;
const inv = await call(A, "POST", "/api/circle/invites", { name: "Inv", email: "inv@example.com", role: "viewer" });
const circle = (await call(A, "GET", "/api/circle")).data;
const memberId = circle.members[0]?.id;
const saved = await call(A, "POST", "/api/fit-finder/saved", { name: "S", prefs: { category: "gp", radius_km: 10 } });
const draft = await call(A, "POST", "/api/drafts", {});
const tasks = (await call(A, "GET", `/api/dashboard`)).data;
const task = await call(A, "POST", `/api/appointments/${gp.id}/tasks`, { title: "probe task" });
const supporting = (await call(A, "GET", "/api/supporting")).data.items;
const joeId = supporting[0]?.owner_id;
console.log("setup:", share.status, inv.status, saved.status, draft.status, task.status, !!memberId, !!joeId);

// Cross-user: B must get 404 on A's things.
const cross: [string, string, unknown?][] = [
  ["GET", `/api/appointments/${gp.id}`],
  ["GET", `/api/appointments/${gp.id}/prep`],
  ["GET", `/api/appointments/${gp.id}/shares`],
  ["POST", `/api/appointments/${gp.id}/shares`, { expires_in_days: 7 }],
  ["POST", `/api/appointments/${gp.id}/shares/${shareId}/revoke`],
  ["GET", `/api/appointments/${gp.id}/clinician-plans`],
  ["POST", `/api/appointments/${gp.id}/clinician-plans/${plans[0]?.id}/imported`],
  ["GET", `/api/appointments/${gp.id}/follow-up`],
  ["POST", `/api/appointments/${gp.id}/tasks`, { title: "x" }],
  ["POST", `/api/appointments/${gp.id}/instructions/confirm`, { text: "Do x", tasks: [{ title: "x", source_text: "Do x", deadline: null, is_medication: false, needs_clarification: false, clarification_reason: null }] }],
  ["PATCH", `/api/tasks/${task.data.id}`, { title: "hacked" }],
  ["DELETE", `/api/tasks/${task.data.id}`],
  ["DELETE", `/api/circle/invites/${inv.data.invite?.id}`],
  ["PATCH", `/api/circle/members/${memberId}`, { role: "helper" }],
  ["DELETE", `/api/circle/members/${memberId}`],
  ["GET", `/api/supporting/${joeId}`],
  ["GET", `/api/supporting/${joeId}/appointments/x/brief`],
  ["DELETE", `/api/fit-finder/saved/${saved.data.id}`],
  ["GET", `/api/drafts/${draft.data.id}`],
  ["PUT", `/api/drafts/${draft.data.id}/notes`, { notes: {} }],
  ["DELETE", `/api/drafts/${draft.data.id}`],
  ["POST", `/api/drafts/${draft.data.id}/attach`, { appointment_id: gp.id }],
  ["PUT", `/api/appointments/${gp.id}`, { starts_at: gp.starts_at, practitioner_name: "h", service_type: "Dentist", clinic_name: "c" }],
  ["DELETE", `/api/appointments/${gp.id}`],
];
for (const [m, p, b] of cross) {
  const r = await call(B, m, p, b);
  check(r.status === 404, `cross-user ${m} ${p} -> ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
}
// B's lists must not include A's things
const bAttn = (await call(B, "GET", "/api/dashboard/attention")).data;
check(bAttn.items.length === 0, "B attention not empty");
check((await call(B, "GET", "/api/fit-finder/saved")).data.items.length === 0, "B saved searches leak");
check(((await call(B, "GET", "/api/drafts")).data.items ?? (await call(B, "GET", "/api/drafts")).data).length === 0, "B drafts leak");
// still intact for A
check((await call(A, "GET", `/api/appointments/${gp.id}`)).status === 200, "A lost appointment");
check((await call(A, "GET", `/api/drafts/${draft.data.id}`)).status === 200, "A lost draft");

// Unauthenticated: 401
const authPaths: [string, string][] = [["GET", "/api/appointments"], ["GET", "/api/dashboard"], ["GET", "/api/dashboard/attention"], ["GET", "/api/circle"], ["GET", "/api/circle/summary"], ["GET", "/api/circle/helpers"], ["POST", "/api/circle/invites"], ["GET", "/api/supporting"], ["POST", "/api/appointments/import/parse"], ["GET", "/api/fit-finder/saved"], ["GET", "/api/fit-finder/search?category=gp"], ["GET", "/api/fit-finder/meta"], ["GET", "/api/drafts"], ["POST", "/api/assistant/chat"], ["GET", `/api/appointments/${gp.id}/shares`], ["GET", `/api/appointments/${gp.id}/clinician-plans`], ["PATCH", `/api/tasks/${task.data.id}`], ["POST", `/api/circle/join/${"a".repeat(64)}`], ["DELETE", "/api/auth/account"], ["GET", "/api/tasks"]];
for (const [m, p] of authPaths) {
  const r = await call("", m, p, {});
  check(r.status === 401, `unauth ${m} ${p} -> ${r.status}`);
}

// Public share: no email, no ids of user
const pub = await call("", "GET", `/api/share/${token}`);
const pubTxt = JSON.stringify(pub.data);
check(pub.status === 200, "public share 200");
check(!/@/.test(pubTxt), "public share leaks an email: " + pubTxt.match(/[^"]*@[^"]*/)?.[0]);
check(!pubTxt.includes("user_id"), "public share leaks user_id");
check(!!pub.headers.get("ratelimit-limit") || !!pub.headers.get("ratelimit-policy") || !!pub.headers.get("ratelimit"), "public share has no rate-limit headers");
check(pub.headers.get("referrer-policy") === "no-referrer", "share referrer-policy " + pub.headers.get("referrer-policy"));
console.log("public share keys:", Object.keys(pub.data), "appointment:", Object.keys(pub.data.appointment ?? {}));
const join = await call("", "GET", inv.data.path.replace("/join/", "/api/circle/join/"));
check(join.status === 200 && !/@/.test(JSON.stringify(join.data)), "join leaks email or fails: " + JSON.stringify(join.data));
check(!!(join.headers.get("ratelimit-limit") || join.headers.get("ratelimit-policy") || join.headers.get("ratelimit")), "join endpoint has no rate limit");
const demo = await call("", "POST", "/api/demo");
check(!!(demo.headers.get("ratelimit-limit") || demo.headers.get("ratelimit-policy") || demo.headers.get("ratelimit")), "demo has no rate limit");

// Malformed input: 400 not 500
const bad: [string, string, unknown, string?][] = [
  ["POST", "/api/appointments", { starts_at: "garbage" }],
  ["POST", "/api/appointments", null, "{not json"],
  ["POST", "/api/appointments", [1, 2]],
  ["POST", `/api/appointments/${gp.id}/shares`, { expires_in_days: "lots" }],
  ["POST", `/api/appointments/${gp.id}/shares`, { expires_in_days: 9999 }],
  ["POST", "/api/appointments/import/parse", { text: 5 }],
  ["POST", "/api/appointments/import/parse", {}],
  ["POST", "/api/circle/invites", { name: "", email: "nope", role: "admin" }],
  ["PATCH", `/api/circle/members/${memberId}`, { role: "owner" }],
  ["POST", "/api/fit-finder/saved", { name: "x", prefs: "nope" }],
  ["POST", "/api/fit-finder/saved", { name: "x", prefs: { category: "gp", radius_km: -5 } }],
  ["GET", "/api/fit-finder/search?category=gp&radius_km=abc", undefined],
  ["GET", "/api/fit-finder/search?category=zzz", undefined],
  ["GET", "/api/fit-finder/search?category=gp&page=-1&pageSize=99999", undefined],
  ["GET", "/api/fit-finder/compare?ids=", undefined],
  ["GET", "/api/fit-finder/compare?ids=a,b,c,d,e,f", undefined],
  ["PATCH", `/api/tasks/${task.data.id}`, { status: "flying" }],
  ["PATCH", `/api/tasks/${task.data.id}`, { assignee_user_id: "not-a-member" }],
  ["PATCH", `/api/tasks/${task.data.id}`, {}],
  ["POST", `/api/appointments/${gp.id}/tasks`, { title: "" }],
  ["POST", `/api/appointments/${gp.id}/instructions/extract`, { text: "" }],
  ["POST", `/api/appointments/${gp.id}/instructions/confirm`, { text: "x", tasks: "no" }],
  ["PUT", `/api/drafts/${draft.data.id}/notes`, { notes: 5 }],
  ["POST", `/api/drafts/${draft.data.id}/attach`, { appointment_id: 5 }],
  ["POST", "/api/assistant/chat", { messages: "hi" }],
  ["POST", "/api/drafts/from-chat", { messages: [] }],
  ["GET", "/api/appointments?scope=zzz&page=abc&pageSize=-1", undefined],
  ["PUT", `/api/appointments/${gp.id}/brief`, { sections: "x" }],
  ["POST", "/api/fit-finder/extract", { text: 3 }],
];
for (const [m, p, b, raw] of bad) {
  const r = await call(A, m, p, b, raw);
  check(r.status < 500, `malformed ${m} ${p} ${raw ?? JSON.stringify(b)} -> ${r.status}`);
  if (r.status === 200 || r.status === 201) console.log("  note: accepted", m, p, JSON.stringify(b), r.status);
}
const pubBad: [string, string, unknown][] = [
  ["POST", `/api/share/${token}/questions/${qid}`, { addressed: "yes" }],
  ["POST", `/api/share/${token}/questions/nonexistent`, { addressed: true }],
  ["POST", `/api/share/${token}/plan`, { author: "", text: "" }],
  ["POST", `/api/share/${token}/plan`, { author: "x".repeat(500), text: "y" }],
  ["GET", `/api/share/short`, undefined],
  ["GET", `/api/circle/join/short`, undefined],
  ["POST", `/api/auth/login`, { email: 5 }],
  ["POST", `/api/auth/register`, { email: "x" }],
];
for (const [m, p, b] of pubBad) {
  const r = await call("", m, p, b);
  check(r.status < 500 && r.status !== 200 && r.status !== 201, `public malformed ${m} ${p} ${JSON.stringify(b)} -> ${r.status}`);
}
// helper assignment to a non-member (B) must fail
const assignB = await call(A, "PATCH", `/api/tasks/${task.data.id}`, { assignee_user_id: "x" });
check(assignB.status === 400 || assignB.status === 404, `assign non-member -> ${assignB.status}`);
// AI routes graceful 503
for (const [m, p, b] of [["POST", "/api/assistant/chat", { messages: [{ role: "user", content: "hi there" }] }], ["POST", `/api/appointments/${gp.id}/instructions/extract`, { text: "Book a review in 2 weeks" }], ["POST", "/api/fit-finder/extract", { text: "a gp near macquarie park" }]] as const) {
  const r = await call(A, m, p, b);
  check(r.status === 503 && typeof r.data.error === "string", `AI ${p} -> ${r.status} ${JSON.stringify(r.data).slice(0, 100)}`);
}
console.log(fails.length ? `\n${fails.length} problems` : "\nPROBE OK");
