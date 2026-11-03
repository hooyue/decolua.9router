export default {
  id: "volcengine-agent",
  priority: 271,
  alias: "aap",
  aliases: [
    "volcengine-agent",
    "agent-plan",
  ],
  uiAlias: "aap",
  display: {
    name: "Ark Agent Plan",
    icon: "smart_toy",
    color: "#1677FF",
    textIcon: "AAP",
    website: "https://www.volcengine.com/activity/agentplan",
    notice: {
      apiKeyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions",
    // Control-plane quota API (Volcengine Signature V4 with AK/SK) — read by
    // open-sse/services/usage/volcengine-agent.js via U("volcengine-agent").
    usage: {
      url: "https://open.volcengineapi.com",
      action: "GetAFPUsage",
      version: "2024-01-01",
      region: "cn-beijing",
      service: "ark",
    },
  },
  // Multi-endpoint: pick the transport matching client sourceFormat to skip translation.
  // The Agent Plan endpoint serves both OpenAI Chat Completions and the Responses API.
  transports: [
    {
      format: "openai",
      baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions",
      auth: { combined: true, header: "Authorization", scheme: "bearer" },
    },
    {
      format: "openai-responses",
      baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3/responses",
      auth: { combined: true, header: "Authorization", scheme: "bearer" },
    },
  ],
  models: [
    { id: "doubao-seed-evolving", name: "Doubao Seed Evolving" },
    { id: "doubao-seed-2.1-turbo", name: "Doubao Seed 2.1 Turbo" },
    { id: "doubao-seed-2.0-lite", name: "Doubao Seed 2.0 Lite" },
    { id: "doubao-seed-2.0-mini", name: "Doubao Seed 2.0 Mini" },
    { id: "glm-5.3-flash", name: "GLM 5.3 Flash" },
    { id: "glm-5.3", name: "GLM 5.3" },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
    { id: "kimi-k3", name: "Kimi K3" },
    { id: "kimi-k2.7-code", name: "Kimi K2.7 Code" },
    { id: "minimax-m3", name: "MiniMax M3" },
  ],
  // Quota card needs per-connection AccessKeyId/SecretAccessKey (Volcengine IAM)
  // on top of the ark- API key, so the UI renders extra credential fields.
  hasProviderSpecificData: true,
  features: {
    usage: true,
    usageApikey: true,
  },
};
