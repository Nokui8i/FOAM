/**
 * Delete DEMO docs from Firestore (orders, tracks, contact messages, staff).
 *
 * Usage (PowerShell):
 *   $env:GCLOUD_ACCESS_TOKEN = (gcloud auth print-access-token)
 *   node scripts/purge-demo-data.mjs
 */
const PROJECT = "foam-laundry-app";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const token = process.env.GCLOUD_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("Missing GCLOUD_ACCESS_TOKEN");
  process.exit(1);
}

async function listDocs(collectionId) {
  const out = [];
  let pageToken = "";
  do {
    const url = new URL(`${BASE}/${collectionId}`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(
        `List ${collectionId} failed: ${res.status} ${await res.text()}`
      );
    }
    const json = await res.json();
    for (const doc of json.documents ?? []) {
      const id = doc.name.split("/").pop();
      out.push({ id, fields: doc.fields ?? {} });
    }
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

async function deleteDocPath(collectionId, id) {
  const res = await fetch(`${BASE}/${collectionId}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `Delete ${collectionId}/${id}: ${res.status} ${await res.text()}`
    );
  }
}

function str(fields, key) {
  return fields?.[key]?.stringValue ?? "";
}

function mapStr(fields, mapKey, key) {
  return fields?.[mapKey]?.mapValue?.fields?.[key]?.stringValue ?? "";
}

function isDemoOrder(doc) {
  const id = doc.id || "";
  const email = mapStr(doc.fields, "contact", "email").toLowerCase();
  const name = mapStr(doc.fields, "contact", "name");
  const notes = mapStr(doc.fields, "pickup", "notes");
  const orderNotes = str(doc.fields, "orderNotes");
  const batch = str(doc.fields, "demoBatch");
  return (
    id.startsWith("demo-") ||
    batch.startsWith("volume-") ||
    email.startsWith("demo.") ||
    email.includes("@example.com") ||
    /^DEMO\b/i.test(name) ||
    /^Demo\b/i.test(name) ||
    /DEMO\b/.test(notes) ||
    /DEMO\b/.test(orderNotes)
  );
}

function isDemoContact(doc) {
  const id = doc.id || "";
  const email = str(doc.fields, "email").toLowerCase();
  const name = str(doc.fields, "name");
  const topic = str(doc.fields, "topic");
  const message = str(doc.fields, "message");
  const batch = str(doc.fields, "demoBatch");
  return (
    id.startsWith("demo-") ||
    batch.startsWith("volume-") ||
    email.startsWith("demo.") ||
    email.includes("@example.com") ||
    /^DEMO\b/i.test(name) ||
    /^Demo\b/i.test(name) ||
    /DEMO\b/.test(topic) ||
    /DEMO\b/.test(message)
  );
}

function isDemoStaff(doc) {
  const id = doc.id || "";
  const email = str(doc.fields, "email").toLowerCase();
  const displayName = str(doc.fields, "displayName");
  return (
    id.startsWith("demo-") ||
    email.startsWith("demo.") ||
    email.includes("@example.com") ||
    /^DEMO\b/i.test(displayName)
  );
}

let deleted = 0;

const orders = await listDocs("orders");
for (const order of orders) {
  if (!isDemoOrder(order)) continue;
  const trackKey = str(order.fields, "trackKey");
  if (trackKey) {
    await deleteDocPath("orderTracks", trackKey);
    console.log("deleted track", trackKey);
  }
  await deleteDocPath("orders", order.id);
  console.log("deleted order", order.id);
  deleted += 1;
}

const contacts = await listDocs("contactMessages");
for (const contact of contacts) {
  if (!isDemoContact(contact)) continue;
  await deleteDocPath("contactMessages", contact.id);
  console.log("deleted contact", contact.id);
  deleted += 1;
}

const staff = await listDocs("staff");
for (const row of staff) {
  if (!isDemoStaff(row)) continue;
  await deleteDocPath("staff", row.id);
  console.log("deleted staff", row.id, str(row.fields, "email"));
  deleted += 1;
}

try {
  const bans = await listDocs("staffBanned");
  for (const row of bans) {
    const email = (row.id || str(row.fields, "email")).toLowerCase();
    if (!email.startsWith("demo.") && !email.includes("@example.com")) continue;
    await deleteDocPath("staffBanned", row.id);
    console.log("deleted ban", row.id);
    deleted += 1;
  }
} catch (error) {
  console.warn("staffBanned skip:", error.message || error);
}

console.log(`Done. Deleted ${deleted} demo document(s).`);
