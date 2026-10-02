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
  const full = (u && u.full_name) || "";
  if (full) return full;
  const first = (u && (u.first_name || u.firstName)) || "";
  const last = (u && (u.last_name || u.lastName)) || "";
  const fullName = `${first} ${last}`.trim();
  return fullName || (u && (u.name || u.username)) || "-";
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
      tr.innerHTML = '<td colspan="5" style="padding:16px;color:#616A75;">No engineers found</td>';
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
          <a href="${id ? 'engineer-activity.html?engineer=' + encodeURIComponent(id) : 'engineer-activity.html'}" class="action-link">View Activity</a>
          ${id ? `&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#" data-id="${encodeURIComponent(id)}" class="action-link deleteLink">Remove</a>` : ""}
        </td>
      `;
      tbody.appendChild(tr);
    });

    Array.from(document.querySelectorAll(".deleteLink")).forEach((a) => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const engineerId = a.getAttribute("data-id");
        if (!engineerId) return;
        const row = a.closest("tr");
        const who = row && row.cells[0] ? row.cells[0].textContent.trim() : "this engineer";
        const ok = await window.FtthUI.confirm({
          title: "Remove " + who + "?",
          message: "They lose access to every project they were assigned to.",
          lines: [
            "Their assignment history is kept for audit.",
            "Past survey and LLD work they recorded is not deleted."
          ],
          danger: true,
          confirmLabel: "Remove engineer"
        });
        if (!ok) return;

        try {
          await window.FiberApi.deleteEngineer(decodeURIComponent(engineerId));
          await loadEngineers();
        } catch (err) {
          setEngineersError(FtthUI.humanize(err));
        }
      });
    });
  } catch (e) {
    setEngineersError(FtthUI.humanize(e));
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
