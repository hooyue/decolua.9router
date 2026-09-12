import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(),
}));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getUsageForProvider } from "../../open-sse/services/usage.js";
import { USAGE_SUPPORTED_PROVIDERS, USAGE_APIKEY_PROVIDERS, AI_PROVIDERS } from "../../src/shared/constants/providers.js";
import { PROVIDERS } from "../../open-sse/providers/index.js";
import { PROVIDER_MODELS } from "../../open-sse/config/providerModels.js";
import { signVolcengineV4 } from "../../open-sse/services/usage/volcengine-agent.js";
import { parseQuotaData } from "../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

const USAGE_URL = "https://open.volcengineapi.com/?Action=GetAFPUsage&Version=2024-01-01";

const AFP_RESPONSE = {
  ResponseMetadata: {
    RequestId: "req-1",
    Action: "GetAFPUsage",
    Version: "2024-01-01",
    Service: "ark",
    Region: "cn-beijing",
  },
  Result: {
    PlanType: "medium",
    AFPFiveHour: { Quota: 10000, Used: 0.0584, SubscribeTime: 1788687063000, ResetTime: 1788705063000 },
    AFPDaily: { Quota: 50000, Used: 0, SubscribeTime: 1788624000000, ResetTime: 1788710400000 },
    AFPWeekly: { Quota: 35000, Used: 0.0584, SubscribeTime: 1788105600000, ResetTime: 1788710400000 },
    AFPMonthly: { Quota: 100000, Used: 0.0584, SubscribeTime: 1788623999000, ResetTime: 1791215999000 },
  },
};

const CREDENTIALS = {
  accessKeyId: "AKLTTEST",
  secretAccessKey: "SKTEST",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CONNECTION = {
  provider: "volcengine-agent",
  apiKey: "ark-test",
  providerSpecificData: CREDENTIALS,
};

describe("volcengine-agent registry", () => {
  it("exposes usage + usageApikey so the apikey card appears on /quota", () => {
    expect(USAGE_SUPPORTED_PROVIDERS).toContain("volcengine-agent");
    expect(USAGE_APIKEY_PROVIDERS).toContain("volcengine-agent");
  });

  it("displays as Ark Agent Plan with the aap alias", () => {
    expect(AI_PROVIDERS["volcengine-agent"]?.name).toBe("Ark Agent Plan");
    expect(AI_PROVIDERS["volcengine-agent"]?.alias).toBe("aap");
  });

  it("declares the AFP usage endpoint (single source for the signer)", () => {
    const usage = PROVIDERS["volcengine-agent"]?.usage;
    expect(usage).toEqual({
      url: "https://open.volcengineapi.com",
      action: "GetAFPUsage",
      version: "2024-01-01",
      region: "cn-beijing",
      service: "ark",
    });
  });

  it("serves chat completions and Responses API via sourceFormat-matched transports", () => {
    const provider = PROVIDERS["volcengine-agent"];
    expect(provider.baseUrl).toBe("https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions");
    expect(provider.transports).toEqual([
      { format: "openai", baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions", auth: { combined: true, header: "Authorization", scheme: "bearer" } },
      { format: "openai-responses", baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3/responses", auth: { combined: true, header: "Authorization", scheme: "bearer" } },
    ]);
  });

  it("ships the Agent Plan model list", () => {
    const models = PROVIDER_MODELS["aap"];
    expect(models.length).toBe(11);
    expect(models.map((m) => m.id)).toContain("doubao-seed-evolving");
    expect(models.map((m) => m.id)).toContain("glm-5.3-flash");
    expect(models.map((m) => m.id)).not.toContain("kimi-k2.6");
  });
});

describe("signVolcengineV4", () => {
  // Golden value cross-checked against the live GetAFPUsage endpoint (200 OK).
  it("produces the exact Authorization header format and URL", () => {
    const { url, headers } = signVolcengineV4({
      accessKeyId: "AKLTTEST",
      secretAccessKey: "SKTEST",
      host: "open.volcengineapi.com",
      query: { Action: "GetAFPUsage", Version: "2024-01-01" },
      region: "cn-beijing",
      service: "ark",
      now: new Date("2026-09-06T09:40:33Z"),
    });

    expect(url).toBe(USAGE_URL);
    expect(headers["X-Date"]).toBe("20260906T094033Z");
    expect(headers.Authorization).toBe(
      "HMAC-SHA256 Credential=AKLTTEST/20260906/cn-beijing/ark/request, SignedHeaders=host;x-date, Signature=9e796b26901d59c862f0b693bbea27a7daf97c3d25f0679d00e6609258b7fd56"
    );
  });
});

describe("volcengine-agent usage handler", () => {
  beforeEach(() => {
    vi.mocked(proxyAwareFetch).mockReset();
  });

  it("parses the four AFP windows into quota rows", async () => {
    vi.mocked(proxyAwareFetch).mockResolvedValue(jsonResponse(AFP_RESPONSE));

    const usage = await getUsageForProvider(CONNECTION, null, {});

    expect(usage.plan).toBe("Agent Plan (medium)");
    const names = Object.keys(usage.quotas);
    expect(names).toEqual(["5-Hour AFP", "Daily AFP", "Weekly AFP", "Monthly AFP"]);
    expect(usage.quotas["5-Hour AFP"]).toEqual({
      used: 0.0584,
      total: 10000,
      resetAt: new Date(1788705063000).toISOString(),
      unlimited: false,
    });
    expect(usage.quotas["Daily AFP"].used).toBe(0);
    expect(usage.quotas["Daily AFP"].total).toBe(50000);
  });

  it("sends the signed GET to the control-plane endpoint", async () => {
    vi.mocked(proxyAwareFetch).mockResolvedValue(jsonResponse(AFP_RESPONSE));

    await getUsageForProvider(CONNECTION, null, {});

    expect(proxyAwareFetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(proxyAwareFetch).mock.calls[0];
    expect(url).toBe(USAGE_URL);
    expect(init.method).toBe("GET");
    expect(init.headers["X-Date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(init.headers.Authorization).toMatch(
      /^HMAC-SHA256 Credential=AKLTTEST\/\d{8}\/cn-beijing\/ark\/request, SignedHeaders=host;x-date, Signature=[0-9a-f]{64}$/
    );
  });

  it("returns a soft-fail message when IAM credentials are missing", async () => {
    const usage = await getUsageForProvider(
      { provider: "volcengine-agent", apiKey: "ark-test", providerSpecificData: null },
      null,
      {}
    );

    expect(usage.quotas).toBeUndefined();
    expect(usage.message).toMatch(/AccessKeyId/);
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });

  it("maps 401/403 to an auth-failed message", async () => {
    vi.mocked(proxyAwareFetch).mockResolvedValue(jsonResponse({}, 403));

    const usage = await getUsageForProvider(CONNECTION, null, {});

    expect(usage.message).toMatch(/authentication failed/);
  });

  it("surfaces ResponseMetadata.Error codes", async () => {
    vi.mocked(proxyAwareFetch).mockResolvedValue(
      jsonResponse({
        ResponseMetadata: { Error: { Code: "SignatureDoesNotMatch", Message: "mismatch" } },
      })
    );

    const usage = await getUsageForProvider(CONNECTION, null, {});

    expect(usage.message).toContain("SignatureDoesNotMatch");
  });
});

describe("parseQuotaData volcengine-agent", () => {
  it("normalizes AFP quota rows", () => {
    const rows = parseQuotaData("volcengine-agent", {
      plan: "Agent Plan (medium)",
      quotas: {
        "5-Hour AFP": { used: 12.5, total: 10000, resetAt: "2026-09-06T14:31:03.000Z", unlimited: false },
        "Daily AFP": { used: 0, total: 50000, resetAt: "2026-09-07T00:00:00.000Z", unlimited: false },
      },
    });

    expect(rows).toEqual([
      { name: "5-Hour AFP", used: 12.5, total: 10000, resetAt: "2026-09-06T14:31:03.000Z" },
      { name: "Daily AFP", used: 0, total: 50000, resetAt: "2026-09-07T00:00:00.000Z" },
    ]);
  });
});
