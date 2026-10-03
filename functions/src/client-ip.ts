type RateLimitRequest = {
  rawRequest?: {
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
  };
};

/**
 * Cloud Run / the Google front end appends the address it actually observed,
 * then its own hop. A caller can only prepend X-Forwarded-For values.
 * Express `req.ip` is the leftmost of those, so it is not used.
 * Trailing non-public hops (the Cloud Run sandbox proxy) are removed first.
 * The platform client is then the second-to-last remaining address.
 * One remaining address is the emulator or a front end that set only the client.
 */
export function requestClientIp(request: RateLimitRequest): string {
  const header = request.rawRequest?.headers?.["x-forwarded-for"];
  const raw = Array.isArray(header) ? header.join(",") : String(header || "");
  const hops = raw
    .split(",")
    .map((part) => part.trim())
    .filter(isIpLiteral);
  while (hops.length > 0 && !isPublicIp(hops[hops.length - 1])) hops.pop();
  if (hops.length >= 2) return hops[hops.length - 2].slice(0, 64);
  if (hops.length === 1) return hops[0].slice(0, 64);
  return "";
}

function isIpLiteral(value: string) {
  return isIpv4(value) || isIpv6(value);
}

function isIpv4(value: string) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!match) return false;
  return match.slice(1).every((part) => Number(part) <= 255);
}

function isIpv6(value: string) {
  return value.includes(":") && /^[0-9a-fA-F:]+$/.test(value);
}

function isPublicIp(value: string) {
  if (value.includes(":")) {
    const lower = value.toLowerCase();
    if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
      return false;
    }
    return true;
  }
  const [a, b] = value.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}
