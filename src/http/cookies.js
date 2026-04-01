import { config } from "../config.js";

export function parseCookies(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf("=");
        if (index === -1) {
          return [entry, ""];
        }
        return [entry.slice(0, index), decodeURIComponent(entry.slice(index + 1))];
      })
  );
}

export function setRefreshCookie(res, refreshToken) {
  const parts = [
    `${config.refreshCookieName}=${encodeURIComponent(refreshToken)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${capitalize(config.cookieSameSite)}`
  ];

  if (config.cookieSecure) {
    parts.push("Secure");
  }

  if (config.cookieDomain) {
    parts.push(`Domain=${config.cookieDomain}`);
  }

  const maxAgeSeconds = 60 * 60 * 24 * 30;
  parts.push(`Max-Age=${maxAgeSeconds}`);

  res.append("Set-Cookie", parts.join("; "));
}

export function clearRefreshCookie(res) {
  const parts = [
    `${config.refreshCookieName}=`,
    "Path=/",
    "HttpOnly",
    `SameSite=${capitalize(config.cookieSameSite)}`,
    "Max-Age=0"
  ];

  if (config.cookieSecure) {
    parts.push("Secure");
  }

  if (config.cookieDomain) {
    parts.push(`Domain=${config.cookieDomain}`);
  }

  res.append("Set-Cookie", parts.join("; "));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
