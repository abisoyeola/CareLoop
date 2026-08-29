import "dotenv/config";

/**
 * End-to-end smoke test — `npm run smoke` (server must be running).
 *
 * Drives the entire care loop through the public HTTP API as four different
 * users: patient intake and assessment, clinician accept/prescribe/complete,
 * pharmacy fulfilment, and back to the patient. It asserts the state machine at
 * each step rather than just checking for 200s.
 *
 * Costs a few cents per run, because the intake really does call the model.
 */

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const PASSWORD = process.env.SEED_PASSWORD || "CareLoop!2026";

let cookie = "";
let step = 0;

function pass(label: string, detail = "") {
  console.log(`  ${String(++step).padStart(2)}. ok   ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, detail: string): never {
  console.error(`  ${String(++step).padStart(2)}. FAIL ${label} — ${detail}`);
  process.exit(1);
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function login(email: string) {
  cookie = "";
  const { status, data } = await api("POST", "/api/auth/login", { email, password: PASSWORD });
  if (status !== 200) fail(`sign in as ${email}`, JSON.stringify(data));
  pass(`signed in as ${email}`);
}

async function main() {
  console.log(`\nCareLoop smoke test against ${BASE}\n`);

  // ---------------------------------------------------------- patient
  await login("patient@careloop.test");

  const created = await api("POST", "/api/conversations");
  if (created.status !== 201) fail("start conversation", JSON.stringify(created.data));
  const conversationId = (created.data as { conversation: { id: string } }).conversation.id;
  pass("started a health chat", conversationId);

  const first = await api("POST", `/api/conversations/${conversationId}/messages`, {
    content: "I've got a really bad headache.",
  });
  if (first.status !== 200) fail("send opening message", JSON.stringify(first.data));
  pass("sent an ambiguous opening message");

  /**
   * Feed the red-flag detail, then keep answering until the agent locks. How
   * many follow-ups it asks is a judgement call it is allowed to make, so the
   * test asserts that it locks and where it routes — not the turn count.
   */
  const replies = [
    "It came on completely suddenly about two hours ago, like being hit on the back of " +
      "the head. It's the worst headache of my life, I've vomited twice, my neck feels " +
      "stiff and bright light is painful.",
    "I'd say 10 out of 10.",
    "No, I haven't hit my head or had any injury.",
    "No regular medications and no allergies.",
  ];

  let assessment: { finalPathway: string; aiPathway: string } | undefined;

  for (const [i, content] of replies.entries()) {
    const turn = await api("POST", `/api/conversations/${conversationId}/messages`, { content });
    if (turn.status !== 200) fail(`send follow-up ${i + 1}`, JSON.stringify(turn.data));

    const detail = await api("GET", `/api/conversations/${conversationId}`);
    assessment = (detail.data as { assessment?: { finalPathway: string; aiPathway: string } })
      .assessment;
    if (assessment) break;
  }

  if (!assessment) {
    fail("assessment lock", `no assessment after ${replies.length} red-flag turns`);
  }
  if (assessment.finalPathway !== "RED") {
    fail("assessment pathway", `expected RED, got ${assessment.finalPathway}`);
  }
  pass("assessment locked at RED", `model said ${assessment.aiPathway}`);

  const routed = await api("POST", `/api/conversations/${conversationId}/request-clinician`);
  if (routed.status !== 201) fail("request a clinician", JSON.stringify(routed.data));
  const consultationId = (routed.data as { consultation: { id: string } }).consultation.id;
  pass("routed to the clinician queue", consultationId);

  // -------------------------------------------------------- clinician
  await login("clinician@careloop.test");

  const queue = await api("GET", "/api/consultations");
  const rows = (queue.data as { consultations: { id: string; pathway: string }[] }).consultations;
  if (!rows.some((r) => r.id === consultationId)) fail("case appears in queue", "not found");
  pass("case is visible in the clinician queue", `${rows.length} case(s) total`);

  const accepted = await api("POST", `/api/consultations/${consultationId}/accept`);
  if (accepted.status !== 200) fail("accept the case", JSON.stringify(accepted.data));
  pass("clinician accepted the case");

  const msg = await api("POST", `/api/consultations/${consultationId}/messages`, {
    content: "I've read your summary. Please go to the emergency department now.",
  });
  if (msg.status !== 201) fail("message the patient", JSON.stringify(msg.data));
  pass("clinician messaged the patient");

  const prescribed = await api("POST", `/api/consultations/${consultationId}/prescribe`, {
    items: [
      { name: "Paracetamol", dose: "1 g", frequency: "Four times daily", duration: "3 days" },
    ],
    notes: "For pain relief only. This does not replace the emergency assessment.",
  });
  if (prescribed.status !== 201) fail("issue a prescription", JSON.stringify(prescribed.data));
  const prescriptionId = (prescribed.data as { prescription: { id: string } }).prescription.id;
  pass("clinician issued a prescription", prescriptionId);

  const duplicate = await api("POST", `/api/consultations/${consultationId}/prescribe`, {
    items: [{ name: "Ibuprofen", dose: "400 mg", frequency: "TDS", duration: "3 days" }],
  });
  if (duplicate.status !== 409) fail("reject a second prescription", `expected 409, got ${duplicate.status}`);
  pass("a second prescription on the same consultation is rejected");

  const completed = await api("POST", `/api/consultations/${consultationId}/complete`, {
    clinicianPathway: "RED",
    clinicianNotes: "Agree with the assessment. Sent to emergency department.",
  });
  if (completed.status !== 200) fail("complete the consultation", JSON.stringify(completed.data));
  pass("clinician completed the consultation", "pathway confirmed as RED");

  // ---------------------------------------------- patient picks pharmacy
  await login("patient@careloop.test");

  const pharmacies = await api("GET", "/api/pharmacies");
  const list = (pharmacies.data as { pharmacies: { id: string; name: string }[] }).pharmacies;
  if (!list.length) fail("verified pharmacies available", "none returned — run npm run seed");
  pass("verified pharmacies listed", list.map((p) => p.name).join(", "));

  const ordered = await api("POST", `/api/prescriptions/${prescriptionId}/order`, {
    pharmacyUserId: list[0].id,
    fulfillmentMethod: "PICKUP",
  });
  if (ordered.status !== 201) fail("send to pharmacy", JSON.stringify(ordered.data));
  const orderId = (ordered.data as { order: { id: string } }).order.id;
  pass("prescription sent to a pharmacy", `${list[0].name} · pickup`);

  // --------------------------------------------------------- pharmacy
  await login("pharmacy@careloop.test");

  const orders = await api("GET", "/api/orders");
  const mine = (orders.data as { orders: { id: string; status: string }[] }).orders;
  if (!mine.some((o) => o.id === orderId)) fail("order reaches the pharmacy", "not in queue");
  pass("order is in the pharmacy queue");

  // An illegal jump must be refused by the transition map, not silently applied.
  const illegal = await api("POST", `/api/orders/${orderId}/status`, { status: "COMPLETED" });
  if (illegal.status !== 409) fail("reject illegal transition", `expected 409, got ${illegal.status}`);
  pass("PENDING -> COMPLETED is refused", "state machine holds");

  for (const status of ["ACCEPTED", "PREPARING", "READY", "COMPLETED"]) {
    const res = await api("POST", `/api/orders/${orderId}/status`, { status });
    if (res.status !== 200) fail(`move order to ${status}`, JSON.stringify(res.data));
  }
  pass("order walked through to COMPLETED");

  // ------------------------------------------------------ back to patient
  await login("patient@careloop.test");
  const finalView = await api("GET", "/api/prescriptions");
  const p = (
    finalView.data as { prescriptions: { id: string; order: { status: string } | null }[] }
  ).prescriptions.find((x) => x.id === prescriptionId);

  if (p?.order?.status !== "COMPLETED") {
    fail("patient sees fulfilment", `expected COMPLETED, got ${p?.order?.status}`);
  }
  pass("patient sees the order as COMPLETED");

  console.log("\n  All checks passed — the full care loop is intact.\n");
}

main().catch((err) => {
  console.error("\nSmoke test crashed:", err);
  process.exit(1);
});
