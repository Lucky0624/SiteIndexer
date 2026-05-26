const BASE = "http://localhost:7842";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? res.statusText);
  }
  return res.json();
}

export const api = {
  // Sites
  getSites: () => req<any[]>("GET", "/api/sites"),
  getSiteStats: (name: string) => req<any>("GET", `/api/sites/${name}/stats`),
  createSite: (body: any) => req<any>("POST", "/api/sites", body),
  updateSite: (name: string, body: any) => req<any>("PUT", `/api/sites/${name}`, body),
  deleteSite: (name: string) => req<any>("DELETE", `/api/sites/${name}`),

  // URLs
  getCategories: (name: string) => req<{categories: string[]}>("GET", `/api/sites/${name}/categories`),
  getUrls: (name: string, filter = "all", page = 1, pageSize = 100, search = "", category = "all", channel = "google") =>
    req<any>("GET", `/api/sites/${name}/urls?filter=${filter}&page=${page}&page_size=${pageSize}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&channel=${channel}`),
  fetchUrls: (name: string) => req<any>("POST", `/api/sites/${name}/fetch-urls`),
  markIndexed: (name: string, urls: string[]) =>
    req<any>("POST", `/api/sites/${name}/mark-indexed`, { urls }),
  resetUrls: (name: string, urls: string[]) =>
    req<any>("POST", `/api/sites/${name}/reset`, { urls }),
  setPriority: (name: string, urls: string[], priority: string) =>
    req<any>("POST", `/api/sites/${name}/set-priority`, { urls, priority }),

  // History
  getHistory: (site = "", limit = 50) =>
    req<any[]>("GET", `/api/history?site=${encodeURIComponent(site)}&limit=${limit}`),
  clearHistory: () => req<any>("DELETE", "/api/history"),

  // Credentials
  getCredentials: () => req<any[]>("GET", "/api/credentials"),
  deleteCredential: (filename: string) => req<any>("DELETE", `/api/credentials/${filename}`),

  // IndexNow (Bing)
  getIndexNowConfig: () => req<any>("GET", "/api/indexnow/config"),
  saveIndexNowConfig: (key: string, keyLocation: string) => req<any>("POST", "/api/indexnow/config", { key, keyLocation }),
  submitBingStreamUrl: (name: string) => `${BASE}/api/sites/${name}/submit-bing/stream`,

  // SSE URLs (opened by EventSource, not fetch)
  runStreamUrl: (name: string) => `${BASE}/api/sites/${name}/run/stream`,
  syncGscStreamUrl: (name: string) => `${BASE}/api/sites/${name}/sync-gsc/stream`,
  inspectPendingStreamUrl: (name: string) => `${BASE}/api/sites/${name}/inspect-pending/stream`,

  // Run selected URLs via POST + fetch streaming
  runSelectedStream: (name: string, urls: string[], signal?: AbortSignal) =>
    fetch(`${BASE}/api/sites/${name}/run/selected/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
      signal,
    }),

  inspectStream: (name: string, urls: string[], signal?: AbortSignal) =>
    fetch(`${BASE}/api/sites/${name}/inspect/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
      signal,
    }),
};
