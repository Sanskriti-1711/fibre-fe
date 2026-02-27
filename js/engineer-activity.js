window.FiberAuth.requireLogin();

// State
let currentEngineer = null;
let engineersList = [];
let assignmentsData = [];
let currentQueueFilter = 'ready';
let currentPeriod = 'week';

// DOM Elements
const engineerSelect = document.getElementById('engineerSelect');
const refreshBtn = document.getElementById('refreshBtn');
const errorMessage = document.getElementById('errorMessage');
const activityContent = document.getElementById('activityContent');
const noSelectionState = document.getElementById('noSelectionState');
const engineerName = document.getElementById('engineerName');
const engineerSubtitle = document.getElementById('engineerSubtitle');

// Filter Elements
const filterProject = document.getElementById('filterProject');
const filterScope = document.getElementById('filterScope');
const filterStatus = document.getElementById('filterStatus');
const searchAssignments = document.getElementById('searchAssignments');

// Modal Elements
const fieldWorkModal = document.getElementById('fieldWorkModal');
const closeModal = document.getElementById('closeModal');
const modalFeatureId = document.getElementById('modalFeatureId');
const fieldMeasurements = document.getElementById('fieldMeasurements');
const comparisonNotes = document.getElementById('comparisonNotes');
const saveFieldWork = document.getElementById('saveFieldWork');
const submitForReview = document.getElementById('submitForReview');

let currentEditingFeature = null;

// Utility Functions
function showError(message) {
  if (!message) {
    errorMessage.style.display = 'none';
    errorMessage.textContent = '';
    return;
  }
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  setTimeout(() => showError(''), 5000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return '-';
  }
}

function getStatusClass(status) {
  const statusMap = {
    'PENDING': 'pending',
    'ASSIGNED': 'assigned',
    'UNDER_REVIEW': 'review',
    'APPROVED': 'approved',
    'REDO': 'redo'
  };
  return statusMap[status] || 'pending';
}

function getStatusLabel(status) {
  const labelMap = {
    'PENDING': 'Pending',
    'ASSIGNED': 'Assigned',
    'UNDER_REVIEW': 'Under Review',
    'APPROVED': 'Approved',
    'REDO': 'Redo'
  };
  return labelMap[status] || status;
}

// Data Loading
async function loadEngineers() {
  try {
    const data = await window.FiberApi.listEngineers();
    engineersList = Array.isArray(data) ? data : (data && Array.isArray(data.results) ? data.results : []);
    
    engineerSelect.innerHTML = '<option value="">Select Engineer...</option>';
    engineersList.forEach(eng => {
      const id = eng.uuid || eng.id || eng.user_uuid || eng.pk;
      const name = `${eng.first_name || ''} ${eng.last_name || ''}`.trim() || eng.name || eng.username || eng.email;
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${name} (${eng.email})`;
      engineerSelect.appendChild(option);
    });
  } catch (e) {
    showError('Failed to load engineers: ' + (e.message || 'Unknown error'));
  }
}

async function loadEngineerActivity(engineerId) {
  if (!engineerId) {
    activityContent.style.display = 'none';
    noSelectionState.style.display = 'block';
    return;
  }

  showError('');
  currentEngineer = engineersList.find(e => 
    (e.uuid || e.id || e.user_uuid || e.pk) === engineerId
  );

  if (currentEngineer) {
    const name = `${currentEngineer.first_name || ''} ${currentEngineer.last_name || ''}`.trim() || 
                 currentEngineer.name || currentEngineer.username || currentEngineer.email;
    engineerName.textContent = name;
    engineerSubtitle.textContent = currentEngineer.email;
  }

  try {
    // Load assignments for this engineer
    const assignments = await window.FiberApi.listAssignments({ assignee: engineerId });
    assignmentsData = Array.isArray(assignments) ? assignments : (assignments?.results || []);

    // Load stats if available
    let stats = {};
    try {
      stats = await window.FiberApi.getAssignmentsSummary({ assignee: engineerId }) || {};
    } catch (_) {
      // Stats endpoint may not exist yet
    }

    // Load activity timeline if available
    let activity = [];
    try {
      const activityData = await window.FiberApi.getEngineerActivity(engineerId);
      activity = Array.isArray(activityData) ? activityData : (activityData?.results || []);
    } catch (_) {
      // Activity endpoint may not exist yet
    }

    updateDashboard(stats, activity);
    activityContent.style.display = 'block';
    noSelectionState.style.display = 'none';
  } catch (e) {
    showError('Failed to load activity: ' + (e.message || 'Unknown error'));
  }
}

// Dashboard Updates
function updateDashboard(stats, activity) {
  updateKPICards(stats);
  updateStatusBreakdown();
  updateWorkQueue();
  updateAssignmentsTable();
  updateProjectFilter();
  updateAnalytics(stats);
  updateProjectOverview();
  updateActivityTimeline(activity);
}

function updateKPICards(stats) {
  // Calculate from assignments data
  const projects = new Set();
  const layers = new Set();
  let featureCount = 0;

  assignmentsData.forEach(a => {
    if (a.project) projects.add(a.project.id || a.project);
    if (a.layer) layers.add(a.layer.id || a.layer);
    if (a.scope === 'FEATURE') featureCount++;
  });

  document.getElementById('statProjects').textContent = stats.total_projects || projects.size || 0;
  document.getElementById('statLayers').textContent = stats.total_layers || layers.size || 0;
  document.getElementById('statFeatures').textContent = stats.total_features || featureCount || assignmentsData.length || 0;
}

function updateStatusBreakdown() {
  const counts = {
    PENDING: 0,
    ASSIGNED: 0,
    UNDER_REVIEW: 0,
    APPROVED: 0,
    REDO: 0
  };

  assignmentsData.forEach(a => {
    const status = a.status || 'PENDING';
    if (counts.hasOwnProperty(status)) {
      counts[status]++;
    }
  });

  document.getElementById('statusPending').textContent = counts.PENDING;
  document.getElementById('statusAssigned').textContent = counts.ASSIGNED;
  document.getElementById('statusReview').textContent = counts.UNDER_REVIEW;
  document.getElementById('statusApproved').textContent = counts.APPROVED;
  document.getElementById('statusRedo').textContent = counts.REDO;
}

function updateWorkQueue() {
  const queueList = document.getElementById('workQueueList');
  
  const statusFilter = {
    'ready': ['ASSIGNED', 'PENDING'],
    'review': ['UNDER_REVIEW'],
    'redo': ['REDO']
  }[currentQueueFilter] || ['ASSIGNED', 'PENDING'];

  const filtered = assignmentsData.filter(a => statusFilter.includes(a.status));

  if (filtered.length === 0) {
    queueList.innerHTML = '<div class="empty-state">No items in this queue</div>';
    return;
  }

  queueList.innerHTML = filtered.slice(0, 10).map(a => {
    const projectName = a.project?.name || a.project_name || 'Unknown Project';
    const scope = a.scope || 'PROJECT';
    const target = a.target_details || {};
    const targetName = target.name || target.feature_id || a.target_id || scope;
    
    return `
      <div class="queue-item">
        <div class="queue-info">
          <span class="queue-project">${escapeHtml(projectName)}</span>
          <span class="queue-scope">${escapeHtml(scope)}: ${escapeHtml(targetName)}</span>
        </div>
        <div class="queue-actions">
          <button class="btn-icon" data-action="field" data-id="${a.id}" title="Field Work">📝</button>
          ${currentQueueFilter === 'ready' ? `<button class="btn-icon" data-action="submit" data-id="${a.id}" title="Submit for Review">📤</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners
  queueList.querySelectorAll('[data-action="field"]').forEach(btn => {
    btn.addEventListener('click', () => openFieldWorkModal(btn.dataset.id));
  });
  queueList.querySelectorAll('[data-action="submit"]').forEach(btn => {
    btn.addEventListener('click', () => submitAssignmentForReview(btn.dataset.id));
  });
}

function updateAssignmentsTable() {
  const tbody = document.getElementById('assignmentsTbody');
  
  const projectFilter = filterProject.value;
  const scopeFilter = filterScope.value;
  const statusFilter = filterStatus.value;
  const searchTerm = searchAssignments.value.toLowerCase();

  let filtered = assignmentsData.filter(a => {
    if (projectFilter && String(a.project?.id || a.project) !== projectFilter) return false;
    if (scopeFilter && a.scope !== scopeFilter) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    if (searchTerm) {
      const projectName = (a.project?.name || a.project_name || '').toLowerCase();
      const targetName = (a.target_details?.name || a.target_id || '').toLowerCase();
      const layerName = (a.layer?.name || a.layer_name || '').toLowerCase();
      if (!projectName.includes(searchTerm) && !targetName.includes(searchTerm) && !layerName.includes(searchTerm)) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No assignments found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const projectName = a.project?.name || a.project_name || 'Unknown';
    const scope = a.scope || 'PROJECT';
    const target = a.target_details || {};
    const targetName = target.name || target.feature_id || a.target_id || scope;
    const status = a.status || 'PENDING';
    const assignedDate = a.assigned_at || a.created_at;

    return `
      <tr>
        <td>${escapeHtml(projectName)}</td>
        <td><span class="scope-badge ${scope.toLowerCase()}">${escapeHtml(scope)}</span></td>
        <td><span class="status-badge ${getStatusClass(status)}">${getStatusLabel(status)}</span></td>
        <td>${formatDate(assignedDate)}</td>
        <td class="actions-cell">
          <button class="btn-sm" data-action="view" data-id="${a.id}">View</button>
          <button class="btn-sm" data-action="field" data-id="${a.id}">Field Work</button>
          ${status === 'ASSIGNED' || status === 'PENDING' ? `<button class="btn-sm btn-primary" data-action="submit" data-id="${a.id}">Submit</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  // Add event listeners
  tbody.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', () => viewAssignmentDetails(btn.dataset.id));
  });
  tbody.querySelectorAll('[data-action="field"]').forEach(btn => {
    btn.addEventListener('click', () => openFieldWorkModal(btn.dataset.id));
  });
  tbody.querySelectorAll('[data-action="submit"]').forEach(btn => {
    btn.addEventListener('click', () => submitAssignmentForReview(btn.dataset.id));
  });
}

function updateProjectFilter() {
  const projects = new Map();
  assignmentsData.forEach(a => {
    const id = a.project?.id || a.project;
    const name = a.project?.name || a.project_name;
    if (id && name && !projects.has(String(id))) {
      projects.set(String(id), name);
    }
  });

  const currentValue = filterProject.value;
  filterProject.innerHTML = '<option value="">All Projects</option>';
  projects.forEach((name, id) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    filterProject.appendChild(option);
  });
  filterProject.value = currentValue;
}

function updateAnalytics(stats) {
  // Calculate analytics from assignments
  const completed = assignmentsData.filter(a => a.status === 'APPROVED').length;
  const totalReviewed = assignmentsData.filter(a => 
    a.status === 'APPROVED' || a.status === 'REDO'
  ).length;
  const redoCount = assignmentsData.filter(a => a.status === 'REDO').length;

  const approvalRate = totalReviewed > 0 ? Math.round((completed / totalReviewed) * 100) : 0;
  const redoRate = totalReviewed > 0 ? Math.round((redoCount / totalReviewed) * 100) : 0;

  // Calculate velocity (features per day in current period)
  const days = currentPeriod === 'week' ? 7 : 30;
  const velocity = days > 0 ? (completed / days).toFixed(1) : '0';

  document.getElementById('analyticsCompleted').textContent = stats.completed_count || completed;
  document.getElementById('analyticsApprovalRate').textContent = (stats.approval_rate || approvalRate) + '%';
  document.getElementById('analyticsRedoRate').textContent = (stats.redo_rate || redoRate) + '%';
  document.getElementById('analyticsVelocity').textContent = (stats.velocity || velocity) + '/day';

  // Project contribution
  const projectStats = {};
  assignmentsData.forEach(a => {
    const pid = a.project?.id || a.project || 'unknown';
    const pname = a.project?.name || a.project_name || 'Unknown';
    if (!projectStats[pid]) {
      projectStats[pid] = { name: pname, total: 0, completed: 0 };
    }
    projectStats[pid].total++;
    if (a.status === 'APPROVED') {
      projectStats[pid].completed++;
    }
  });

  const contributionList = document.getElementById('projectContribution');
  const contributions = Object.values(projectStats).slice(0, 5);
  
  if (contributions.length === 0) {
    contributionList.innerHTML = '<div class="empty-state">No project data</div>';
  } else {
    contributionList.innerHTML = contributions.map(p => {
      const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
      return `
        <div class="contribution-item">
          <span class="contribution-name">${escapeHtml(p.name)}</span>
          <div class="contribution-bar">
            <div class="contribution-fill" style="width: ${pct}%"></div>
          </div>
          <span class="contribution-value">${p.completed}/${p.total}</span>
        </div>
      `;
    }).join('');
  }
}

function updateProjectOverview() {
  const overviewList = document.getElementById('projectOverviewList');
  
  const projectStats = {};
  assignmentsData.forEach(a => {
    const pid = a.project?.id || a.project || 'unknown';
    const pname = a.project?.name || a.project_name || 'Unknown Project';
    if (!projectStats[pid]) {
      projectStats[pid] = { 
        name: pname, 
        total: 0, 
        completed: 0, 
        layers: new Set(),
        lastActivity: null 
      };
    }
    projectStats[pid].total++;
    if (a.layer) projectStats[pid].layers.add(a.layer.id || a.layer);
    if (a.status === 'APPROVED') projectStats[pid].completed++;
    
    const activityDate = a.updated_at || a.assigned_at;
    if (activityDate) {
      const date = new Date(activityDate);
      if (!projectStats[pid].lastActivity || date > projectStats[pid].lastActivity) {
        projectStats[pid].lastActivity = date;
      }
    }
  });

  const projects = Object.values(projectStats);
  if (projects.length === 0) {
    overviewList.innerHTML = '<div class="empty-state">No project assignments</div>';
    return;
  }

  overviewList.innerHTML = projects.map(p => {
    const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
    const lastActivity = p.lastActivity ? p.lastActivity.toLocaleDateString() : '-';
    return `
      <div class="overview-item">
        <div class="overview-header">
          <span class="overview-name">${escapeHtml(p.name)}</span>
          <span class="overview-percentage">${pct}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${pct}%"></div>
        </div>
        <div class="overview-meta">
          <span>${p.completed}/${p.total} completed</span>
          <span>${p.layers.size} layers</span>
          <span>Last: ${lastActivity}</span>
        </div>
      </div>
    `;
  }).join('');
}

function updateActivityTimeline(activity) {
  const timeline = document.getElementById('activityTimeline');
  
  // Build timeline from activity data or assignments
  let events = [];
  
  if (activity && activity.length > 0) {
    events = activity.map(a => ({
      type: a.type || 'status_change',
      title: a.title || 'Activity',
      description: a.description || '',
      timestamp: a.timestamp || a.created_at,
      status: a.status
    }));
  } else {
    // Build from assignments data
    assignmentsData.slice(0, 20).forEach(a => {
      if (a.assigned_at) {
        events.push({
          type: 'assignment',
          title: 'Assigned',
          description: `${a.scope || 'Project'} assignment created`,
          timestamp: a.assigned_at,
          status: 'ASSIGNED'
        });
      }
      if (a.updated_at && a.status !== 'PENDING' && a.status !== 'ASSIGNED') {
        events.push({
          type: 'status_change',
          title: `Status: ${getStatusLabel(a.status)}`,
          description: `Assignment status updated`,
          timestamp: a.updated_at,
          status: a.status
        });
      }
    });
  }

  // Sort by timestamp descending
  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  events = events.slice(0, 10);

  if (events.length === 0) {
    timeline.innerHTML = '<div class="empty-state">No recent activity</div>';
    return;
  }

  timeline.innerHTML = events.map(e => `
    <div class="timeline-item">
      <div class="timeline-dot ${getStatusClass(e.status)}"></div>
      <div class="timeline-content">
        <div class="timeline-title">${escapeHtml(e.title)}</div>
        <div class="timeline-desc">${escapeHtml(e.description)}</div>
        <div class="timeline-time">${formatDate(e.timestamp)}</div>
      </div>
    </div>
  `).join('');
}

// Actions
function viewAssignmentDetails(id) {
  const assignment = assignmentsData.find(a => String(a.id) === String(id));
  if (!assignment) return;
  
  // Navigate to assignment detail or show in modal
  if (assignment.target_id) {
    window.location.href = `feature-details.html?id=${encodeURIComponent(assignment.target_id)}`;
  }
}

async function openFieldWorkModal(id) {
  const assignment = assignmentsData.find(a => String(a.id) === String(id));
  if (!assignment) return;

  currentEditingFeature = assignment;
  modalFeatureId.textContent = assignment.target_id || assignment.target_details?.feature_id || id;
  
  // Load field data if available
  if (assignment.target_details?.field_measurements) {
    fieldMeasurements.value = JSON.stringify(assignment.target_details.field_measurements, null, 2);
  } else {
    fieldMeasurements.value = '';
  }
  
  if (assignment.target_details?.comparison_notes) {
    comparisonNotes.value = assignment.target_details.comparison_notes;
  } else {
    comparisonNotes.value = '';
  }

  fieldWorkModal.style.display = 'flex';
}

function closeFieldWorkModal() {
  fieldWorkModal.style.display = 'none';
  currentEditingFeature = null;
}

async function saveFieldWorkData() {
  if (!currentEditingFeature) return;

  try {
    let fieldData = {};
    try {
      const val = fieldMeasurements.value.trim();
      if (val) fieldData = JSON.parse(val);
    } catch (e) {
      showError('Invalid JSON in field measurements');
      return;
    }

    const payload = {
      field_measurements: fieldData,
      comparison_notes: comparisonNotes.value.trim()
    };

    await window.FiberApi.updateFeatureFieldData(currentEditingFeature.target_id || currentEditingFeature.id, payload);
    showError('Field work data saved successfully');
    closeFieldWorkModal();
    await loadEngineerActivity(currentEngineer?.uuid || currentEngineer?.id);
  } catch (e) {
    showError('Failed to save field work: ' + (e.message || 'Unknown error'));
  }
}

async function submitAssignmentForReview(id) {
  if (!confirm('Submit this assignment for review?')) return;

  try {
    await window.FiberApi.submitFeatureForReview(id);
    showError('Assignment submitted for review');
    await loadEngineerActivity(engineerSelect.value);
  } catch (e) {
    showError('Failed to submit: ' + (e.message || 'Unknown error'));
  }
}

// Event Listeners
engineerSelect.addEventListener('change', (e) => {
  loadEngineerActivity(e.target.value);
});

refreshBtn.addEventListener('click', () => {
  if (engineerSelect.value) {
    loadEngineerActivity(engineerSelect.value);
  }
});

// Filter listeners
[filterProject, filterScope, filterStatus].forEach(el => {
  el.addEventListener('change', updateAssignmentsTable);
});

searchAssignments.addEventListener('input', debounce(updateAssignmentsTable, 300));

// Queue tab buttons
document.querySelectorAll('[data-queue]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-queue]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentQueueFilter = btn.dataset.queue;
    updateWorkQueue();
  });
});

// Period buttons
document.querySelectorAll('[data-period]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-period]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    updateAnalytics({});
  });
});

// Modal listeners
closeModal.addEventListener('click', closeFieldWorkModal);
fieldWorkModal.addEventListener('click', (e) => {
  if (e.target === fieldWorkModal) closeFieldWorkModal();
});
saveFieldWork.addEventListener('click', saveFieldWorkData);
submitForReview.addEventListener('click', async () => {
  if (currentEditingFeature) {
    await saveFieldWorkData();
    await submitAssignmentForReview(currentEditingFeature.id);
    closeFieldWorkModal();
  }
});

// Utility: Debounce
function debounce(fn, ms) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

// Initialize
loadEngineers();
