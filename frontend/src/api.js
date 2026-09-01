/**
 * Resolve the FastAPI base URL.
 * Production on Vercel must use same-origin `/api` so vercel.json can proxy to Railway.
 * Never fall back to localhost in a production build — that is why import/save looked dead.
 */
export function getApiUrl() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  if (import.meta.env.PROD) {
    return "/api";
  }
  return "http://localhost:8000";
}

function errorMessageFromBody(data, status) {
  const detail = data?.detail ?? data?.error ?? data?.message;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item).filter(Boolean).join(", ");
  }
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  return `Request failed (${status})`;
}

export async function apiJson(path, options = {}) {
  const url = `${getApiUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 25000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(errorMessageFromBody(data, response.status));
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("The server took too long to respond. Check Railway is awake, then try again.");
    }
    if (error instanceof TypeError) {
      throw new Error("Could not reach the API. Check the Vercel /api rewrite and Railway URL.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
