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
      if (!(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
      }
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

  async function listProjects() {
    return apiFetch("/api/projects/", { method: "GET" });
  }

  async function listProjectLatest(params) {
    const query = params && typeof params === "object"
      ? Object.keys(params)
          .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
          .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
          .join("&")
      : "";
    const path = query ? `/api/projects/latest/?${query}` : "/api/projects/latest/";
    return apiFetch(path, { method: "GET" });
  }

  async function listProjectsFiltered(params) {
    if (!params || typeof params !== "object") {
      return listProjects();
    }
    const query = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join("&");
    const path = query ? `/api/projects/?${query}` : "/api/projects/";
    return apiFetch(path, { method: "GET" });
  }

  async function getProject(projectId) {
    const id = encodeURIComponent(projectId);
    return apiFetch(`/api/projects/${id}/`, { method: "GET" });
  }

  async function createProject(payload) {
    return apiFetch("/api/projects/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  }

  async function deleteProject(projectId) {
    const id = encodeURIComponent(projectId);
    return apiFetch(`/api/projects/${id}/`, { method: "DELETE" });
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
  async function uploadGpkg(projectId, file) {
    const id = encodeURIComponent(projectId);
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch(`/api/projects/${id}/import/upload/`, {
      method: "POST",
      body: formData,
    });
  }

  async function listProjectLayers(projectId) {
    const id = encodeURIComponent(projectId);
    return apiFetch(`/api/projects/${id}/layers/`, { method: "GET" });
  }

  async function getProjectLayerDetails(projectId, layerId) {
    const id = encodeURIComponent(projectId);
    const lid = encodeURIComponent(layerId);
    return apiFetch(`/api/projects/${id}/layers/${lid}/`, { method: "GET" });
  }

  async function discoverLayers(projectId) {
    const id = encodeURIComponent(projectId);
    return apiFetch(`/api/projects/${id}/import/discover/`, { method: "POST" });
  }

  async function importLayers(projectId, selectedLayers) {
    const id = encodeURIComponent(projectId);
    return apiFetch(`/api/projects/${id}/import/import/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected_layers: selectedLayers }),
    });
  }

  async function listJobs(params) {
    const query = params && typeof params === "object"
      ? Object.keys(params)
          .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
          .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
          .join("&")
      : "";
    const path = query ? `/api/assignments/jobs/?${query}` : "/api/assignments/jobs/";
    return apiFetch(path, { method: "GET" });
  }

  async function listAssignments(params) {
    const query = params && typeof params === "object"
      ? Object.keys(params)
          .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
          .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
          .join("&")
      : "";
    const path = query ? `/api/assignments/?${query}` : "/api/assignments/";
    return apiFetch(path, { method: "GET" });
  }

  async function createAssignment(payload) {
    return apiFetch("/api/assignments/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  }

  async function getAssignment(assignmentId) {
    const id = encodeURIComponent(assignmentId);
    return apiFetch(`/api/assignments/${id}/`, { method: "GET" });
  }

  async function updateAssignment(assignmentId, payload) {
    const id = encodeURIComponent(assignmentId);
    return apiFetch(`/api/assignments/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  }

  async function deleteAssignment(assignmentId) {
    const id = encodeURIComponent(assignmentId);
    return apiFetch(`/api/assignments/${id}/`, { method: "DELETE" });
  }

  async function getAssignmentsSummary(params) {
    const query = params && typeof params === "object"
      ? Object.keys(params)
          .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
          .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
          .join("&")
      : "";
    const path = query ? `/api/assignments/summary/?${query}` : "/api/assignments/summary/";
    return apiFetch(path, { method: "GET" });
  }

  // Engineer Activity APIs
  async function getEngineerActivity(engineerId, params) {
    const id = encodeURIComponent(engineerId);
    const query = params && typeof params === "object"
      ? Object.keys(params)
          .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
          .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
          .join("&")
      : "";
    const path = query ? `/api/engineer/${id}/activity/?${query}` : `/api/engineer/${id}/activity/`;
    return apiFetch(path, { method: "GET" });
  }

  async function getEngineerStats(engineerId, params) {
    const id = encodeURIComponent(engineerId);
    const query = params && typeof params === "object"
      ? Object.keys(params)
          .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
          .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
          .join("&")
      : "";
    const path = query ? `/api/engineer/${id}/stats/?${query}` : `/api/engineer/${id}/stats/`;
    return apiFetch(path, { method: "GET" });
  }

  async function updateFeatureFieldData(featureId, payload) {
    const id = encodeURIComponent(featureId);
    return apiFetch(`/api/features/${id}/field-measurements/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  }

  async function submitFeatureForReview(featureId) {
    const id = encodeURIComponent(featureId);
    return apiFetch(`/api/features/${id}/submit/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
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
    listProjects,
    listProjectLatest,
    listProjectsFiltered,
    getProject,
    createProject,
    createEngineer,
    deleteEngineer,
    deleteProject,
    uploadGpkg,
    listProjectLayers,
    getProjectLayerDetails,
    discoverLayers,
    importLayers,
    listJobs,
    listAssignments,
    createAssignment,
    getAssignment,
    updateAssignment,
    deleteAssignment,
    getAssignmentsSummary,
    getEngineerActivity,
    getEngineerStats,
    updateFeatureFieldData,
    submitFeatureForReview,
    apiFetch,
  };

  window.FiberAuth = FiberAuth;
})();
