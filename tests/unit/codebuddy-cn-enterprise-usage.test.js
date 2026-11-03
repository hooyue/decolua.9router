// CodeBuddy CN enterprise (WorkBuddy) accounts keep their quota under the
// enterprise billing endpoint, not personal resource packages. The usage handler
// must prefer get-enterprise-user-usage when the credential carries an
// ent-member:<id> role, and chat requests must forward X-Enterprise-Id.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(),
}));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getCodeBuddyCnUsage } from "../../open-sse/services/usage/codebuddy-cn.js";
import { CodeBuddyExecutor } from "../../open-sse/executors/codebuddy-cn.js";
import { extractEnterpriseIdFromToken } from "../../open-sse/utils/enterpriseId.js";
import codebuddyCnOAuth from "../../src/lib/oauth/providers/codebuddy-cn.js";

function jwtWithRoles(roles) {
  const payload = roles ? { realm_access: { roles } } : {};
  return `hdr.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ENTERPRISE_TOKEN = jwtWithRoles(["default-roles", "ent-member:corp123"]);
const PERSONAL_TOKEN = jwtWithRoles(["offline_access"]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractEnterpriseIdFromToken", () => {
  it("extracts id from ent-member and ent-plugin-enabled roles", () => {
    expect(extractEnterpriseIdFromToken(ENTERPRISE_TOKEN)).toBe("corp123");
    expect(extractEnterpriseIdFromToken(jwtWithRoles(["ent-plugin-enabled:abc"]))).toBe("abc");
  });

  it("returns null for personal tokens / non-JWT credentials", () => {
    expect(extractEnterpriseIdFromToken(PERSONAL_TOKEN)).toBeNull();
    expect(extractEnterpriseIdFromToken(jwtWithRoles([]))).toBeNull();
    expect(extractEnterpriseIdFromToken("cbk-plain-apikey")).toBeNull();
    expect(extractEnterpriseIdFromToken(null)).toBeNull();
  });
});

describe("CodeBuddyExecutor.buildHeaders enterprise header", () => {
  it("injects X-Enterprise-Id from token roles", () => {
    const headers = new CodeBuddyExecutor().buildHeaders({ accessToken: ENTERPRISE_TOKEN });
    expect(headers["X-Enterprise-Id"]).toBe("corp123");
  });

  it("prefers explicit providerSpecificData.enterpriseId over the token", () => {
    const headers = new CodeBuddyExecutor().buildHeaders({
      accessToken: ENTERPRISE_TOKEN,
      providerSpecificData: { enterpriseId: "explicit" },
    });
    expect(headers["X-Enterprise-Id"]).toBe("explicit");
  });

  it("omits the header for personal credentials", () => {
    const headers = new CodeBuddyExecutor().buildHeaders({ accessToken: PERSONAL_TOKEN });
    expect(headers["X-Enterprise-Id"]).toBeUndefined();
  });
});

describe("getCodeBuddyCnUsage enterprise path", () => {
  it("prefers the enterprise endpoint and maps credit/limitNum", async () => {
    proxyAwareFetch.mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        data: {
          // credit = consumed (已用), NOT remaining — matches the official console
          credit: 2987.33,
          limitNum: 5000,
          cycleStartTime: "2026-08-20 00:00:00",
          cycleResetTime: "2026-09-21 00:00:00",
        },
      })
    );

    const out = await getCodeBuddyCnUsage(ENTERPRISE_TOKEN, null, {});
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(proxyAwareFetch.mock.calls[0][0]).toBe(
      "https://www.codebuddy.cn/billing/meter/get-enterprise-user-usage"
    );
    expect(proxyAwareFetch.mock.calls[0][1].headers["X-Enterprise-Id"]).toBe("corp123");

    expect(out.plan).toBe("Enterprise");
    const q = out.quotas.Enterprise;
    expect(q.used).toBe(2987.33);
    expect(q.total).toBe(5000);
    expect(q.recurring).toBe(true);
    expect(q.resetAt).toBe("2026-09-20T16:00:00.000Z");
  });

  it("falls back to personal packages when the enterprise endpoint fails", async () => {
    proxyAwareFetch
      .mockResolvedValueOnce(jsonResponse({ code: 10001, msg: "uid or enterpriseID is empty" }, 400))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          data: {
            Response: {
              Data: {
                Accounts: [
                  {
                    PackageName: "基础体验包",
                    CycleCapacitySizePrecise: "500",
                    CycleCapacityUsedPrecise: "6.54",
                    CycleStartTime: "2026-08-01 00:00:00",
                    CycleEndTime: "2026-08-31 23:59:59",
                    DeductionEndTime: 1796000000000,
                  },
                ],
              },
            },
          },
        })
      );

    const out = await getCodeBuddyCnUsage(ENTERPRISE_TOKEN, null, {});
    expect(proxyAwareFetch).toHaveBeenCalledTimes(2);
    expect(out.quotas.Monthly).toBeDefined();
    expect(out.quotas.Enterprise).toBeUndefined();
  });

  it("personal tokens skip the enterprise endpoint entirely", async () => {
    proxyAwareFetch.mockResolvedValueOnce(
      jsonResponse({ code: 0, data: { Response: { Data: { Accounts: [] } } } })
    );

    const out = await getCodeBuddyCnUsage(PERSONAL_TOKEN, null, {});
    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    expect(proxyAwareFetch.mock.calls[0][0]).not.toContain("get-enterprise-user-usage");
    expect(out.message).toBe("CodeBuddy CN connected. No credit package found.");
  });
});

describe("oauth mapTokens persists enterpriseId", () => {
  it("stores enterpriseId in providerSpecificData for enterprise tokens", () => {
    const mapped = codebuddyCnOAuth.mapTokens({
      access_token: ENTERPRISE_TOKEN,
      refresh_token: "r",
      expires_in: 60,
    });
    expect(mapped.providerSpecificData).toEqual({ enterpriseId: "corp123" });
  });

  it("leaves providerSpecificData empty for personal tokens", () => {
    const mapped = codebuddyCnOAuth.mapTokens({ access_token: PERSONAL_TOKEN });
    expect(mapped.providerSpecificData).toEqual({});
  });
});
