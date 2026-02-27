window.FiberAuth.requireLogin();

function setEngineersError(message) {
  const el = document.getElementById("engineersError");
  if (!message) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.textContent = message;
  el.style.display = "block";
}

function pickId(u) {
  return (u && (u.uuid || u.id || u.user_uuid || u.pk)) || null;
}

function pickName(u) {
  const first = (u && (u.first_name || u.firstName)) || "";
  const last = (u && (u.last_name || u.lastName)) || "";
  const full = `${first} ${last}`.trim();
  return full || (u && (u.name || u.username)) || "-";
}

function pickEmail(u) {
  return (u && u.email) || "-";
}

function pickActive(u) {
  if (!u) return true;
  if (typeof u.is_active === "boolean") return u.is_active;
  if (typeof u.active === "boolean") return u.active;
  if (typeof u.isActive === "boolean") return u.isActive;
  return true;
}

function pickLastActive(u) {
  const v = (u && (u.last_login || u.lastLogin || u.last_active || u.lastActive)) || null;
  if (!v) return "-";
  try {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  } catch (_) {}
  return String(v);
}

async function loadEngineers() {
  setEngineersError("");

  const tbody = document.getElementById("engineersTbody");
  tbody.innerHTML = "";

  try {
    const data = await window.FiberApi.listEngineers();
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : []);

    if (!list.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="5" style="padding:16px;color:#6B7280;">No engineers found</td>';
      tbody.appendChild(tr);
      return;
    }

    list.forEach((u) => {
      const id = pickId(u);
      const email = pickEmail(u);
      const name = pickName(u);
      const active = pickActive(u);
      const lastActive = pickLastActive(u);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(email)}</td>
        <td class="status ${active ? "active" : "inactive"}">${active ? "Active" : "Inactive"}</td>
        <td>${escapeHtml(lastActive)}</td>
        <td>
          <a href="engineer-activity.html">View Activity</a>
          ${id ? `&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#" data-id="${encodeURIComponent(id)}" class="deleteLink">Remove</a>` : ""}
        </td>
      `;
      tbody.appendChild(tr);
    });

    Array.from(document.querySelectorAll(".deleteLink")).forEach((a) => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const engineerId = a.getAttribute("data-id");
        if (!engineerId) return;
        if (!confirm("Remove this engineer?")) return;

        try {
          await window.FiberApi.deleteEngineer(decodeURIComponent(engineerId));
          await loadEngineers();
        } catch (err) {
          setEngineersError(err && err.message ? err.message : "Failed to remove engineer");
        }
      });
    });
  } catch (e) {
    setEngineersError(e && e.message ? e.message : "Failed to load engineers");
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

loadEngineers();
