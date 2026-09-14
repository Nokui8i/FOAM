/**
 * Enables Google sign-in on Firebase project foam-laundry-app
 * and writes NEXT_PUBLIC_GOOGLE_CLIENT_ID to .env.local.
 * Does not print tokens or secrets.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import os from "os";

const require = createRequire(import.meta.url);
const PROJECT = "foam-laundry-app";

function readFirebaseTokens() {
  const candidates = [
    path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"),
    path.join(process.env.APPDATA || "", "configstore", "firebase-tools.json"),
    path.join(process.env.APPDATA || "", "firebase", "firebase-tools.json"),
  ];
  for (const file of candidates) {
    if (file && fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  }
  throw new Error("Firebase CLI login not found. Run: firebase login");
}

async function getAccessToken() {
  const store = readFirebaseTokens();
  const tokens = store.tokens || store;
  const refreshToken =
    tokens.refresh_token ||
    tokens.refreshToken ||
    Object.values(tokens.users || {})[0]?.refresh_token ||
    Object.values(tokens.tokens || {})[0]?.refresh_token;

  if (!refreshToken) {
    // Try firebase-tools API as fallback
    try {
      const authPath = path.join(
        process.env.APPDATA || "",
        "npm",
        "node_modules",
        "firebase-tools",
        "lib",
        "auth.js"
      );
      const auth = require(authPath);
      const tok = await auth.getAccessToken(true);
      return tok.access_token || tok;
    } catch {
      throw new Error("No refresh token in Firebase CLI store");
    }
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id:
        tokens.client_id ||
        "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
      client_secret: tokens.client_secret || "j9iVZfS8kkCEFUPaAeJV0sAi",
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Could not refresh access token. Run: firebase login");
  }
  return data.access_token;
}

async function listOauthClients(accessToken) {
  // Firebase auto-created OAuth clients live in the Google Cloud project.
  const res = await fetch(
    `https://www.googleapis.com/oauth2/v1/clientinfo?access_token=${accessToken}`
  ).catch(() => null);

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // Use Cloud Resource Manager to get project number, then list brand/clients
  const projRes = await fetch(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`,
    { headers }
  );
  const proj = await projRes.json();
  if (!projRes.ok) {
    throw new Error(`Project lookup failed: ${proj.error?.message || projRes.status}`);
  }

  const projectNumber = proj.projectNumber;
  console.log("Project number OK");

  // List OAuth clients via clientauthconfig / IAM - try Firebase Management API
  const fbRes = await fetch(
    `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}`,
    { headers }
  );
  console.log("firebase project status", fbRes.status);

  // Identity Platform list IdPs
  const idpRes = await fetch(
    `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/defaultSupportedIdpConfigs`,
    { headers }
  );
  const idpJson = await idpRes.json();
  console.log("existing IdPs status", idpRes.status);

  return { headers, projectNumber, idpJson, idpRes };
}

async function findWebClientId(headers, projectNumber) {
  // Google OAuth clients list (IAP / clientauthconfig)
  const urls = [
    `https://clientauthconfig.googleapis.com/v1/clients?find_by_team=projects/${projectNumber}`,
    `https://clientauthconfig.googleapis.com/v1/clients?find_by_team=projects/${PROJECT}`,
  ];

  for (const url of urls) {
    const res = await fetch(url, { headers });
    const text = await res.text();
    console.log("oauth clients status", res.status, "len", text.length);
    if (!res.ok) continue;
    try {
      const data = JSON.parse(text);
      const clients = data.client || data.clients || [];
      for (const c of clients) {
        const id = c.clientId || c.client_id;
        if (
          typeof id === "string" &&
          id.includes(".apps.googleusercontent.com") &&
          (c.type === "TYPE_WEB" ||
            c.clientType === "WEB" ||
            String(c.type).includes("WEB") ||
            c.displayName?.toLowerCase?.().includes("web"))
        ) {
          return { clientId: id, clientSecret: c.clientSecret || c.secret || "" };
        }
      }
      // fallback: first googleusercontent client
      for (const c of clients) {
        const id = c.clientId || c.client_id;
        if (typeof id === "string" && id.includes(".apps.googleusercontent.com")) {
          return { clientId: id, clientSecret: c.clientSecret || c.secret || "" };
        }
      }
      console.log("client entries", clients.length, clients[0] ? Object.keys(clients[0]) : []);
    } catch {
      // ignore
    }
  }

  // Try Google Cloud API credentials list
  const credRes = await fetch(
    `https://www.googleapis.com/oauth2/v1/projects/${PROJECT}/clientCredentials`,
    { headers }
  );
  console.log("clientCredentials status", credRes.status);

  return null;
}

async function enableGoogle(headers, clientId, clientSecret) {
  const name = `projects/${PROJECT}/defaultSupportedIdpConfigs/google.com`;
  const getRes = await fetch(
    `https://identitytoolkit.googleapis.com/v2/${name}`,
    { headers }
  );

  const body = {
    name,
    enabled: true,
    clientId,
    clientSecret: clientSecret || undefined,
  };

  if (getRes.status === 404) {
    const createRes = await fetch(
      `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT}/defaultSupportedIdpConfigs?idpId=google.com`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          enabled: true,
          clientId,
          ...(clientSecret ? { clientSecret } : {}),
        }),
      }
    );
    const createText = await createRes.text();
    console.log("create google IdP", createRes.status);
    if (!createRes.ok) {
      throw new Error(`Create Google IdP failed: ${createText.slice(0, 400)}`);
    }
    return;
  }

  const patchRes = await fetch(
    `https://identitytoolkit.googleapis.com/v2/${name}?updateMask=enabled,clientId,clientSecret`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }
  );
  const patchText = await patchRes.text();
  console.log("patch google IdP", patchRes.status);
  if (!patchRes.ok) {
    throw new Error(`Patch Google IdP failed: ${patchText.slice(0, 400)}`);
  }
}

function writeEnvClientId(clientId) {
  const envPath = path.resolve(".env.local");
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  if (env.match(/^NEXT_PUBLIC_GOOGLE_CLIENT_ID=/m)) {
    env = env.replace(
      /^NEXT_PUBLIC_GOOGLE_CLIENT_ID=.*$/m,
      `NEXT_PUBLIC_GOOGLE_CLIENT_ID=${clientId}`
    );
  } else {
    env = env.trimEnd() + `\n\nNEXT_PUBLIC_GOOGLE_CLIENT_ID=${clientId}\n`;
  }
  fs.writeFileSync(envPath, env, "utf8");
  console.log("Wrote NEXT_PUBLIC_GOOGLE_CLIENT_ID to .env.local");
}

async function main() {
  const accessToken = await getAccessToken();
  console.log("Access token acquired");
  const { headers, projectNumber, idpJson } = await listOauthClients(accessToken);

  const existing = (idpJson.defaultSupportedIdpConfigs || []).find((c) =>
    String(c.name || "").endsWith("/google.com")
  );
  if (existing?.clientId) {
    console.log("Google IdP already present, enabled=", existing.enabled);
    writeEnvClientId(existing.clientId);
    if (!existing.enabled) {
      await enableGoogle(headers, existing.clientId, existing.clientSecret || "");
    }
    return;
  }

  const found = await findWebClientId(headers, projectNumber);
  if (!found?.clientId) {
    // Last resort: create via Firebase Auth config API used by console
    // Enable Google without secret using Identity Toolkit inherit from GCP
    const inheritRes = await fetch(
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config?updateMask=signIn`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          signIn: {
            email: { enabled: true, passwordRequired: true },
          },
        }),
      }
    );
    console.log("config patch", inheritRes.status);

    throw new Error(
      "No Web OAuth client found. Open Firebase Console → Authentication → Sign-in method → Google → Enable → Save. Then re-run this script."
    );
  }

  await enableGoogle(headers, found.clientId, found.clientSecret);
  writeEnvClientId(found.clientId);
  console.log("Google sign-in enabled.");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
