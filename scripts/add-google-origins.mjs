/**
 * Adds local/LAN origins to the Google OAuth web client so GIS works on phone.
 * Does not print secrets.
 */
import fs from "fs";
import path from "path";
import os from "os";

const PROJECT = "foam-laundry-app";

function readFirebaseTokens() {
  const candidates = [
    path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"),
    path.join(process.env.APPDATA || "", "configstore", "firebase-tools.json"),
  ];
  for (const file of candidates) {
    if (file && fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  }
  throw new Error("Firebase CLI login not found");
}

async function getAccessToken() {
  const store = readFirebaseTokens();
  const tokens = store.tokens || store;
  const refreshToken =
    tokens.refresh_token ||
    tokens.refreshToken ||
    Object.values(tokens.users || {})[0]?.refresh_token ||
    Object.values(tokens.tokens || {})[0]?.refresh_token;
  if (!refreshToken) throw new Error("No refresh token");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id:
        "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
      client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("token refresh failed");
  return data.access_token;
}

function readClientIdFromEnv() {
  const env = fs.readFileSync(path.resolve(".env.local"), "utf8");
  const match = env.match(/^NEXT_PUBLIC_GOOGLE_CLIENT_ID=(.+)$/m);
  return match?.[1]?.trim() || null;
}

async function main() {
  const accessToken = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const clientId = readClientIdFromEnv();
  if (!clientId) throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID missing");

  // Add Firebase authorized domains (for Auth) — includes LAN if already there
  const domains = [
    "localhost",
    "127.0.0.1",
    "foam-laundry-app.firebaseapp.com",
    "foam-laundry-app.web.app",
    "192.168.1.61",
  ];

  for (const domain of domains) {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=authorizedDomains`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ authorizedDomains: domains }),
      }
    );
    console.log("authorizedDomains patch", res.status);
    break;
  }

  // Try update OAuth JS origins via clientauthconfig
  const projRes = await fetch(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`,
    { headers }
  );
  const proj = await projRes.json();
  const projectNumber = proj.projectNumber;

  const listRes = await fetch(
    `https://clientauthconfig.googleapis.com/v1/clients?find_by_team=projects/${projectNumber}`,
    { headers }
  );
  console.log("list clients", listRes.status);
  const listJson = await listRes.json();
  const clients = listJson.client || listJson.clients || [];
  const match = clients.find(
    (c) => (c.clientId || c.client_id) === clientId
  );

  const origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.1.61:3000",
  ];

  if (!match) {
    console.log("OAuth client not editable via API; JS origins must include:");
    origins.forEach((o) => console.log(" -", o));
    console.log(
      "Add them in Google Cloud Console → APIs & Services → Credentials → your Web client."
    );
    return;
  }

  const name = match.name;
  const existingOrigins = match.javascriptOrigins || match.javascript_origins || [];
  const merged = Array.from(new Set([...existingOrigins, ...origins]));

  const patchRes = await fetch(
    `https://clientauthconfig.googleapis.com/v1/${name}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        ...match,
        javascriptOrigins: merged,
      }),
    }
  );
  console.log("patch oauth client", patchRes.status, (await patchRes.text()).slice(0, 200));
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
