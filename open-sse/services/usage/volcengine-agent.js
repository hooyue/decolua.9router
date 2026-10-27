/**
 * Volcengine Agent Plan usage — GET https://open.volcengineapi.com/?Action=GetAFPUsage&Version=2024-01-01
 * Auth: Volcengine Signature V4 (account-level AccessKeyId/SecretAccessKey stored in
 * the connection's providerSpecificData — the ark- inference API key cannot call it).
 *
 * Response: { ResponseMetadata: { Error? }, Result: { PlanType, AFP{FiveHour,Daily,Weekly,Monthly}:
 * { Quota, Used, SubscribeTime, ResetTime } } }
 */

import { createHash, createHmac } from "node:crypto";
import { proxyAwareFetch } from "../../utils/proxyFetch.js";
import { U, parseResetTime, toFiniteNumber } from "./shared.js";

// Result keys → Quota Tracker row names, in display order.
const AFP_WINDOWS = [
  ["AFPFiveHour", "5-Hour AFP"],
  ["AFPDaily", "Daily AFP"],
  ["AFPWeekly", "Weekly AFP"],
  ["AFPMonthly", "Monthly AFP"],
];

function uriEscape(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");
const hmacBuf = (key, data) => createHmac("sha256", key).update(data).digest();

/**
 * Volcengine Signature V4 (mirrors volcengine-nodejs-sdk packages/sdk-core/src/utils/signer.ts).
 * Bodyless GET: signed headers are exactly host;x-date, payload hash is sha256("").
 * @param {Object} params
 * @param {string} params.accessKeyId
 * @param {string} params.secretAccessKey
 * @param {string} params.host
 * @param {Object} params.query
 * @param {string} params.region
 * @param {string} params.service
 * @param {Date} [params.now]
 * @returns {{ url: string, headers: Object }}
 */
export function signVolcengineV4({ accessKeyId, secretAccessKey, host, query, region, service, now = new Date() }) {
  const xDate = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:-]/g, "");
  const date = xDate.slice(0, 8);
  const payloadHash = sha256Hex("");

  const canonicalQuery = Object.keys(query)
    .filter((k) => query[k] !== undefined && query[k] !== null)
    .sort()
    .map((k) => `${uriEscape(k)}=${uriEscape(query[k])}`)
    .join("&");
  const canonicalHeaders = `host:${host}\nx-date:${xDate}\n`;
  const signedHeaders = "host;x-date";
  const canonicalRequest = [
    "GET",
    "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${date}/${region}/${service}/request`;
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacBuf(secretAccessKey, date);
  const kRegion = hmacBuf(kDate, region);
  const kService = hmacBuf(kRegion, service);
  const kSigning = hmacBuf(kService, "request");
  const signature = hmacBuf(kSigning, stringToSign).toString("hex");

  return {
    url: `https://${host}/?${canonicalQuery}`,
    headers: {
      "X-Date": xDate,
      Authorization: `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function parseAfpWindows(result) {
  const quotas = {};
  let found = false;
  for (const [key, name] of AFP_WINDOWS) {
    const window = result?.[key];
    if (!window || typeof window !== "object") continue;
    found = true;
    const total = Math.max(0, toFiniteNumber(window.Quota));
    const used = Math.max(0, toFiniteNumber(window.Used));
    // Never set absolute `remaining` — QuotaTable treats it as a 0-100 percentage.
    quotas[name] = {
      used,
      total,
      resetAt: parseResetTime(window.ResetTime),
      unlimited: false,
    };
  }
  return found ? quotas : null;
}

/**
 * @param {Object|null} providerSpecificData - { accessKeyId, secretAccessKey }
 * @param {Object|null} proxyOptions
 */
export async function getVolcengineAgentUsage(providerSpecificData = null, proxyOptions = null) {
  const accessKeyId = providerSpecificData?.accessKeyId?.trim();
  const secretAccessKey = providerSpecificData?.secretAccessKey?.trim();
  if (!accessKeyId || !secretAccessKey) {
    return {
      message: "Volcengine Agent Plan quota needs IAM credentials. Add AccessKeyId and SecretAccessKey to this connection.",
    };
  }

  const usage = U("volcengine-agent");
  const host = usage.url ? usage.url.replace(/^https?:\/\//, "") : "open.volcengineapi.com";
  const query = { Action: usage.action || "GetAFPUsage", Version: usage.version || "2024-01-01" };
  const region = usage.region || "cn-beijing";
  const service = usage.service || "ark";

  try {
    const { url, headers } = signVolcengineV4({ accessKeyId, secretAccessKey, host, query, region, service });
    const response = await proxyAwareFetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
    }, proxyOptions);

    if (response.status === 401 || response.status === 403) {
      return {
        plan: "Volcengine Agent",
        message: "Volcengine authentication failed. Check the AccessKeyId/SecretAccessKey.",
      };
    }

    const data = await response.json().catch(() => null);
    const error = data?.ResponseMetadata?.Error;
    if (error) {
      return {
        plan: "Volcengine Agent",
        message: `Volcengine ${error.Code || "API error"}: ${error.Message || "unknown error"}`.slice(0, 200),
      };
    }
    if (!response.ok) {
      return {
        plan: "Volcengine Agent",
        message: `Volcengine usage API error (${response.status})`,
      };
    }

    const result = data?.Result;
    const quotas = parseAfpWindows(result);
    if (!quotas) {
      return { plan: "Volcengine Agent", message: "Volcengine connected. No Agent Plan quota data returned." };
    }

    return {
      plan: result?.PlanType ? `Agent Plan (${result.PlanType})` : "Agent Plan",
      quotas,
    };
  } catch (error) {
    return { message: `Volcengine Agent usage error: ${error.message}` };
  }
}
