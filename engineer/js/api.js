/**
 * Engineer API Module
 * Localized API functions for engineer pages
 * Based on API docs: /docs/apis.md
 */

(function() {
  const BASE_URL = "https://fiberbackend.zeabur.app";

  // Import auth from parent fiber-api.js
  const FiberAuth = window.FiberAuth || {
    getAccess: () => {
      const raw = localStorage.getItem("fiber_auth");
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed?.access || null;
      } catch (_) {
        return null;
      }
    },
    getUser: () => {
      const raw = localStorage.getItem("fiber_auth");
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed?.user || null;
      } catch (_) {
        return null;
      }
    },
    requireLogin: () => {
      const token = FiberAuth.getAccess?.() || FiberAuth.getAccess();
      if (!token) {
        window.location.href = "index.html";
      }
    }
  };

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

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const access = FiberAuth.getAccess();

    if (access) {
      headers.set("Authorization", `Bearer ${access}`);
    }

    if (!headers.has("Content-Type") && options.body) {
      if (!(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
      }
    }

    const url = path.startsWith("http") ? path : `${BASE_URL}${path.startsWith("/") ? path : "/" + path}`;
    const response = await fetch(url, { ...options, headers });

    if (response.status === 204) return null;

    const body = await parseBody(response);

    if (!response.ok) {
      throw new Error(toErrorMessage(response, body));
    }

    return body;
  }

  // ===== Projects API =====

  /**
   * Get Single Project
   * GET /api/projects/{proj_id}/
   */
  async function getProject(projectId) {
    const id = encodeURIComponent(projectId);
    return apiFetch(`/api/projects/${id}/`, { method: "GET" });
  }

  // ===== Features API =====

  /**
   * Fetch Single Feature
   * GET /api/projects/{proj_id}/features/{feature_id}/
   */
  async function getFeature(projectId, featureId) {
    const pid = encodeURIComponent(projectId);
    const fid = encodeURIComponent(featureId);
    return apiFetch(`/api/projects/${pid}/features/${fid}/`, { method: "GET" });
  }

  /**
   * Update Field Measurements
   * PATCH /api/features/{feature_id}/field-measurements/
   * 
   * Body: {
   *   "field_measurements": { "length": 120.5, "width": 50.2 },
   *   "comparison_notes": "Verified measurements on site"
   * }
   */
  async function updateFieldMeasurements(featureId, payload) {
    const id = encodeURIComponent(featureId);
    return apiFetch(`/api/features/${id}/field-measurements/`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }

  /**
   * Submit Features for Review
   * POST /api/features/submit/
   * 
   * Body: {
   *   "feature_ids": ["feature_uuid_1", "feature_uuid_2"],
   *   "engineer": "engineer_uuid"
   * }
   * 
   * Response: {
   *   "submitted_count": 2,
   *   "feature_ids": [...],
   *   "new_status": "under_review",
   *   "status_display": "Under Review"
   * }
   */
  async function submitFeatures(featureIds, engineerId) {
    return apiFetch(`/api/features/submit/`, {
      method: "POST",
      body: JSON.stringify({
        feature_ids: Array.isArray(featureIds) ? featureIds : [featureIds],
        engineer: engineerId
      })
    });
  }

  // ===== Assignment Jobs API =====

  /**
   * List Jobs
   * GET /api/assignments/jobs/
   * 
   * Query params:
   * - project={proj_id}
   * - engineer={engineer_uuid}
   * - status=pending|assigned|under_review|approved|redo
   * - scope=project|layer|feature
   * - page, page_size
   */
  async function listJobs(params = {}) {
    const query = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join("&");
    const path = query ? `/api/assignments/jobs/?${query}` : "/api/assignments/jobs/";
    return apiFetch(path, { method: "GET" });
  }

  /**
   * Get Single Job/Assignment
   * GET /api/assignments/{job_id}/
   */
  async function getAssignment(jobId) {
    const id = encodeURIComponent(jobId);
    return apiFetch(`/api/assignments/${id}/`, { method: "GET" });
  }

  // ===== Engineer Stats API =====

  /**
   * Get Engineer Stats
   * GET /api/engineer/stats/
   * 
   * Query: engineer={uuid}, days={number}
   */
  async function getEngineerStats(engineerId, params = {}) {
    const queryParams = { engineer: engineerId, ...params };
    const query = Object.keys(queryParams)
      .filter((k) => queryParams[k] !== undefined && queryParams[k] !== null)
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
      .join("&");
    return apiFetch(`/api/engineer/stats/?${query}`, { method: "GET" });
  }

  // ===== File Upload API =====

  /**
   * Upload Feature Photo
   * POST /api/features/{feature_id}/upload-photo/
   * (Note: Check if this endpoint exists in backend)
   */
  async function uploadFeaturePhoto(featureId, file) {
    const id = encodeURIComponent(featureId);
    const formData = new FormData();
    formData.append("photo", file);  // Backend expects 'photo' field name
    return apiFetch(`/api/features/${id}/upload-photo/`, {
      method: "POST",
      body: formData
    });
  }

  // Export API module
  window.EngineerApi = {
    // Auth (re-exported for convenience)
    getUser: FiberAuth.getUser,
    requireLogin: FiberAuth.requireLogin,

    // Projects
    getProject,

    // Features
    getFeature,
    updateFieldMeasurements,
    submitFeatures,
    uploadFeaturePhoto,

    // Assignments
    listJobs,
    getAssignment,

    // Stats
    getEngineerStats,

    // Raw fetch for custom calls
    apiFetch
  };
})();
