import { describe, expect, it } from "vitest";
import { getClientIp } from "./clientIp";

function makeReq(opts: {
  ip?: string;
  cfConnectingIp?: string | string[];
}): { ip?: string; headers: Record<string, string | string[] | undefined> } {
  const headers: Record<string, string | string[] | undefined> = {};
  if (opts.cfConnectingIp !== undefined) {
    headers["cf-connecting-ip"] = opts.cfConnectingIp;
  }
  return { ip: opts.ip, headers };
}

describe("getClientIp", () => {
  it("prefers CF-Connecting-IP over req.ip when both are set", () => {
    // The whole point of the helper. In production both are populated
    // (CF sets the header, Express computes req.ip from XFF), and the
    // CF header is the only one guaranteed to be the real client.
    const req = makeReq({ ip: "104.21.1.2", cfConnectingIp: "73.224.55.208" });
    expect(getClientIp(req)).toBe("73.224.55.208");
  });

  it("falls back to req.ip when CF-Connecting-IP is missing", () => {
    // Local dev (no Cloudflare in front) and the defensive case where
    // Cloudflare somehow stops sending the header.
    const req = makeReq({ ip: "127.0.0.1" });
    expect(getClientIp(req)).toBe("127.0.0.1");
  });

  it("falls back to req.ip when CF-Connecting-IP is an empty string", () => {
    // Empty string is falsy and meaningless as an IP. Don't lump every
    // request with a malformed header into a "" bucket — fall through.
    const req = makeReq({ ip: "127.0.0.1", cfConnectingIp: "" });
    expect(getClientIp(req)).toBe("127.0.0.1");
  });

  it("returns the first array element when CF-Connecting-IP is an array", () => {
    // Cloudflare doesn't actually send arrays for this header, but
    // Node's IncomingHttpHeaders type allows string[] and we want to
    // be defensive rather than crashing on a type assertion mismatch.
    const req = makeReq({ ip: "104.21.1.2", cfConnectingIp: ["73.224.55.208", "ignored"] });
    expect(getClientIp(req)).toBe("73.224.55.208");
  });

  it("falls back to req.ip when CF-Connecting-IP is an empty array", () => {
    const req = makeReq({ ip: "127.0.0.1", cfConnectingIp: [] });
    expect(getClientIp(req)).toBe("127.0.0.1");
  });

  it("returns 'unknown' when neither CF-Connecting-IP nor req.ip is set", () => {
    // Single shared bucket is degraded but safe. The alternative —
    // throwing or returning empty string — would either crash the
    // request or give every malformed-request client a fresh bucket.
    const req = makeReq({});
    expect(getClientIp(req)).toBe("unknown");
  });

  it("returns 'unknown' when req.ip is empty and CF-Connecting-IP is missing", () => {
    const req = makeReq({ ip: undefined });
    expect(getClientIp(req)).toBe("unknown");
  });
});
