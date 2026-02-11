window.FiberAuth.requireLogin();

function qs(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = qs(id);
  if (!el) return;
  el.textContent = value;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "-";
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  } catch (_) {}
  return String(value);
}

function setLoading(isLoading) {
  const loader = qs("pageLoader");
  const kpi = qs("kpiSection");
  if (loader) loader.style.display = isLoading ? "block" : "none";
  if (kpi) kpi.style.display = isLoading ? "none" : "grid";
}

function setError(message) {
  const el = qs("layerError");
  if (!el) return;
  if (!message) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  el.textContent = message;
}

function getParams() {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("project_id") || params.get("proj_id") || params.get("project");
  const layerId = params.get("layer_id") || params.get("layer") || params.get("id");
  return { projectId, layerId };
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("approve") || s.includes("complete") || s.includes("pass")) return "completed";
  if (s.includes("fail") || s.includes("redo") || s.includes("reject")) return "failed";
  if (s.includes("review")) return "in-progress";
  if (s.includes("assign")) return "in-progress";
  return "pending";
}

function abbreviateKey(key) {
  const k = String(key || "");
  const normalized = k.toLowerCase();

  const map = {
    diameter: "D",
    width: "W",
    height: "H",
    length: "L",
    start_x: "SX",
    start_y: "SY",
    end_x: "EX",
    end_y: "EY",
    depth: "DEP",
    radius: "R",
  };

  if (map[normalized]) return map[normalized];

  const parts = k.split(/[_\s]+/).filter(Boolean);
  if (parts.length === 1) return k.length <= 4 ? k : k.slice(0, 4).toUpperCase();
  return parts.map((p) => p[0]).join("").toUpperCase();
}

function buildKeyValuePreview(obj, options) {
  if (!obj || typeof obj !== "object") return "-";
  const omitKeys = (options && options.omitKeys) || [];
  const maxItems = (options && options.maxItems) || 5;
  const abbreviate = options && options.abbreviate;

  const keys = Object.keys(obj).filter((k) => !omitKeys.includes(String(k).toLowerCase()));
  if (!keys.length) return "-";

  const preferred = (options && options.preferred) || [];
  const ordered = preferred.filter((k) => keys.includes(k)).concat(keys.filter((k) => !preferred.includes(k)));
  const picked = ordered.slice(0, maxItems);

  return picked
    .map((k) => {
      const v = obj[k];
      const rendered = v === null || v === undefined ? "-" : String(v);
      const label = abbreviate ? abbreviateKey(k) : k;
      return `${escapeHtml(label)}: ${escapeHtml(rendered)}`;
    })
    .join(", ");
}

function buildPropertiesPreview(properties) {
  return buildKeyValuePreview(properties, {
    omitKeys: ["id", "name"],
    maxItems: 6,
    abbreviate: true,
    preferred: ["length", "diameter", "width", "height", "start_x", "start_y", "end_x", "end_y"],
  });
}

function buildDetectedPreview(fieldMeasurements) {
  if (!fieldMeasurements) return "-";
  if (typeof fieldMeasurements === "string") return escapeHtml(fieldMeasurements);
  if (Array.isArray(fieldMeasurements)) return escapeHtml(fieldMeasurements.join(", "));
  return buildKeyValuePreview(fieldMeasurements, {
    omitKeys: ["id", "name"],
    maxItems: 6,
    abbreviate: true,
    preferred: ["length", "diameter", "width", "height", "start_x", "start_y", "end_x", "end_y"],
  });
}

function renderFeatures(features, projectId, layerId) {
  const tbody = qs("featuresBody");
  if (!tbody) return;

  const list = Array.isArray(features) ? features : [];
  setText("featureMeta", list.length ? `${list.length} total` : "0 total");

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:16px;color:#6B7280;">No features found</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  list.forEach(function (f) {
    const id = (f && (f.properties && (f.properties.id || f.properties.ID))) || (f && f.id) || "-";
    const status = (f && f.status) || "-";
    const assignedTo = "-";
    const updated = (f && (f.updated_at || f.updatedAt)) || (f && (f.created_at || f.createdAt)) || null;
    const props = buildPropertiesPreview(f && f.properties);
    const detected = "-";
    const featureUuid = (f && f.id) || "";
    const viewHref = featureUuid
      ? ("feature-details.html?project_id="
          + encodeURIComponent(projectId || "")
          + "&layer_id="
          + encodeURIComponent(layerId || "")
          + "&feature_id="
          + encodeURIComponent(featureUuid))
      : "#";

    const tr = document.createElement("tr");
    tr.innerHTML = ""
      + "<td>" + escapeHtml(id) + "</td>"
      + "<td class=\"status " + statusClass(status) + "\">" + escapeHtml(String(status).replace(/_/g, " ")) + "</td>"
      + "<td>" + escapeHtml(assignedTo) + "</td>"
      + "<td>" + props + "</td>"
      + "<td>" + escapeHtml(detected) + "</td>"
      + "<td>" + escapeHtml(formatDate(updated)) + "</td>"
      + "<td><a class=\"action-link\" href=\"" + escapeHtml(viewHref) + "\">View</a></td>";
    tbody.appendChild(tr);
  });
}

function renderLayerSummary(layer, projectName) {
  const name = (layer && (layer.layer_name || layer.name)) || "Layer";
  const id = (layer && (layer.layer_id || layer.id)) || "";

  setText("layerTitle", name);
  if (projectName && id) {
    setText("layerSubtitle", `Project: ${projectName} • Layer ID: ${id}`);
  } else if (projectName) {
    setText("layerSubtitle", `Project: ${projectName}`);
  } else {
    setText("layerSubtitle", id ? `Layer ID: ${id}` : "");
  }

  const counts = (layer && layer.status_counts) || {};
  const featureCount = layer && (layer.feature_count || layer.featureCount);

  setText("kpiFeatureCount", featureCount !== undefined && featureCount !== null ? String(featureCount) : "--");
  setText("kpiPending", counts.pending !== undefined ? String(counts.pending) : "0");
  setText("kpiAssigned", counts.assigned !== undefined ? String(counts.assigned) : "0");
  setText("kpiUnderReview", counts.under_review !== undefined ? String(counts.under_review) : "0");
  setText("kpiApproved", counts.approved !== undefined ? String(counts.approved) : "0");
  setText("kpiRedo", counts.redo !== undefined ? String(counts.redo) : "0");
}

function setBackLink(projectId) {
  const a = qs("backToProjectBtn");
  if (!a) return;
  if (projectId) {
    a.href = `project-details.html?project_id=${encodeURIComponent(projectId)}`;
  } else {
    a.href = "projects.html";
  }
}

async function loadLayerDetails() {
  setError("");
  setLoading(true);

  const p = getParams();
  const projectId = p.projectId;
  const layerId = p.layerId;

  console.log('layer-details params:', { projectId, layerId });

  setBackLink(projectId);

  if (!projectId || !layerId) {
    setLoading(false);
    setError("Missing required query params. Use ?project_id=...&layer_id=...");
    const tbody = qs("featuresBody");
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:16px;color:#6B7280;">-</td></tr>';
    return;
  }

  try {
    const results = await Promise.all([
      window.FiberApi.getProject(projectId),
      window.FiberApi.getProjectLayerDetails(projectId, layerId),
    ]);
    const project = results[0];
    const data = results[1];
    console.log('getProject response:', project);
    console.log('getProjectLayerDetails response:', data);
    const layer = data && data.layer ? data.layer : null;
    const features = data && Array.isArray(data.features) ? data.features : [];
    const projectName = (project && (project.name || project.title || project.project_name)) || '';

    renderLayerSummary(layer, projectName);
    renderFeatures(features, projectId, layerId);
  } catch (e) {
    setError(e && e.message ? e.message : "Failed to load layer details");
    const tbody = qs("featuresBody");
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:16px;color:#6B7280;">Failed to load</td></tr>';
  } finally {
    setLoading(false);
  }
}

loadLayerDetails();
