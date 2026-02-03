(function () {
  const BASE_URL = "https://fiberbackend.zeabur.app";
  const STORAGE_KEY = "fiber_auth";

  function buildUrl(path) {
    if (!path) return BASE_URL;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (!path.startsWith("/")) return `${BASE_URL}/${path}`;
    return `${BASE_URL}${path}`;
  }

  function loadAuth() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { access: null, refresh: null, user: null };
      const parsed = JSON.parse(raw);
      return {
        access: parsed && parsed.access ? parsed.access : null,
        refresh: parsed && parsed.refresh ? parsed.refresh : null,
        user: parsed && parsed.user ? parsed.user : null,
      };
    } catch (_) {
      return { access: null, refresh: null, user: null };
    }
  }

  function saveAuth(next) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        access: next && next.access ? next.access : null,
        refresh: next && next.refresh ? next.refresh : null,
        user: next && next.user ? next.user : null,
      })
    );
  }

  function clearAuth() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function getAccess() {
    return loadAuth().access;
  }

  function getRefresh() {
    return loadAuth().refresh;
  }

  function getUser() {
    return loadAuth().user;
  }

  async function parseBody(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch (_) {
        return null;
      }
    }

    try {
      return await response.text();
    } catch (_) {
      return null;
    }
  }

  function toErrorMessage(response, body) {
    if (body && typeof body === "object") {
      if (typeof body.detail === "string") return body.detail;
      if (typeof body.message === "string") return body.message;

      const firstKey = Object.keys(body)[0];
      if (firstKey) {
        const val = body[firstKey];
        if (Array.isArray(val) && typeof val[0] === "string") return val[0];
        if (typeof val === "string") return val;
      }
    }

    if (typeof body === "string" && body.trim()) return body;
    return `${response.status} ${response.statusText}`;
  }

  async function rawFetch(path, options) {
    const url = buildUrl(path);
    return fetch(url, options);
  }

  async function refreshAccessToken() {
    const refresh = getRefresh();
    if (!refresh) throw new Error("No refresh token available");

    const response = await rawFetch("/api/users/token/refresh/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });

    const body = await parseBody(response);

    if (!response.ok) {
      clearAuth();
      throw new Error(toErrorMessage(response, body));
    }

    const current = loadAuth();
    saveAuth({
      access: body && body.access ? body.access : current.access,
      refresh: body && body.refresh ? body.refresh : current.refresh,
      user: current.user,
    });

    return loadAuth().access;
  }

  async function apiFetch(path, options, _hasRetried) {
    const headers = new Headers((options && options.headers) || {});
    const access = getAccess();

    if (access) {
      headers.set("Authorization", `Bearer ${access}`);
    }

    if (!headers.has("Content-Type") && options && options.body) {
      headers.set("Content-Type", "application/json");
    }

    const response = await rawFetch(path, { ...options, headers });

    if (response.status === 401) {
      const refresh = getRefresh();
      if (refresh && !_hasRetried) {
        try {
          await refreshAccessToken();
          return apiFetch(path, options, true);
        } catch (_) {
          clearAuth();
          throw new Error("Session expired. Please login again.");
        }
      }
    }

    if (response.status === 204) return null;

    const body = await parseBody(response);

    if (!response.ok) {
      throw new Error(toErrorMessage(response, body));
    }

    return body;
  }

  async function login(email, password) {
    const response = await rawFetch("/api/users/login/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const body = await parseBody(response);

    if (!response.ok) {
      throw new Error(toErrorMessage(response, body));
    }

    saveAuth({
      access: body && body.access ? body.access : null,
      refresh: body && body.refresh ? body.refresh : null,
      user: body && body.user ? body.user : null,
    });

    return body;
  }

  async function listEngineers() {
    return apiFetch("/api/users/engineers/", { method: "GET" });
  }

  async function createEngineer(email, password, role) {
    return apiFetch("/api/users/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role: role || "ENGINEER" }),
    });
  }

  async function deleteEngineer(engineerUuid) {
    const id = encodeURIComponent(engineerUuid);
    return apiFetch(`/api/users/${id}/`, { method: "DELETE" });
  }

  const FiberAuth = {
    getAccess,
    getRefresh,
    getUser,
    clear: clearAuth,
    isLoggedIn: function () {
      const a = loadAuth();
      return Boolean(a && (a.access || a.refresh));
    },
    requireLogin: function () {
      if (!FiberAuth.isLoggedIn()) {
        window.location.href = "index.html";
      }
    },
  };

  window.FiberApi = {
    login,
    refreshAccessToken,
    listEngineers,
    createEngineer,
    deleteEngineer,
    apiFetch,
  };

  window.FiberAuth = FiberAuth;
})();
