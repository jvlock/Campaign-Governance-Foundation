import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a! >= 224) return false;
  if (a === 100 && b! >= 64 && b! <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b! >= 16 && b! <= 31) return false;
  if (a === 192 && [0, 168].includes(b!)) return false;
  if (a === 198 && [18, 19, 51].includes(b!)) return false;
  if (a === 203 && b === 0) return false;
  return true;
}

function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPublicIpv4(normalized.slice(7));
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return first >= 0x2000
    && first <= 0x3fff
    && !normalized.startsWith("2001:")
    && !normalized.startsWith("2002:");
}

export async function postDeliveryPayload(
  endpointUrl: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const url = new URL(endpointUrl);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Delivery endpoint resolved to a non-public network address");
  }
  const selected = addresses.find(({ family }) => family === 4) ?? addresses[0]!;
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = request({
      protocol: "https:",
      host: selected.address,
      family: selected.family,
      servername: url.hostname,
      port: url.port ? Number(url.port) : 443,
      path: url.pathname,
      method: "POST",
      headers: {
        ...headers,
        host: url.host,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body).toString(),
      },
      timeout: 15_000,
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        responseBody += chunk;
        if (responseBody.length > 1_000_000) req.destroy(new Error("Delivery platform response exceeded 1 MB"));
      });
      response.on("end", () => {
        const status = response.statusCode ?? 502;
        let parsed: unknown = null;
        try { parsed = responseBody ? JSON.parse(responseBody) : null; } catch { parsed = null; }
        if (status < 200 || status >= 300) {
          reject(new Error(`Delivery platform returned HTTP ${status}`));
          return;
        }
        resolve({ status, body: parsed });
      });
    });
    req.on("timeout", () => req.destroy(new Error("Delivery platform request timed out")));
    req.on("error", reject);
    req.end(body);
  });
}