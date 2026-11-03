/**
 * Extract the CodeBuddy enterprise id from a Keycloak JWT access token.
 *
 * Enterprise (WorkBuddy) tokens carry `ent-member:<id>` / `ent-plugin-enabled:<id>`
 * realm roles; personal tokens don't. Returns null for personal tokens, API keys,
 * or anything that isn't a parseable JWT.
 */
export function extractEnterpriseIdFromToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    const roles = payload?.realm_access?.roles;
    if (Array.isArray(roles)) {
      for (const role of roles) {
        if (
          typeof role === "string" &&
          (role.startsWith("ent-member:") || role.startsWith("ent-plugin-enabled:"))
        ) {
          return role.split(":")[1] || null;
        }
      }
    }
  } catch {
    // Non-JWT or malformed base64 — treat as personal credential
  }
  return null;
}
