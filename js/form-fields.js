/**
 * Form fields — planner-added engineer fields with a scope.
 *
 * The planner picks a layer type and a scope (all projects, or one project),
 * adds fields, and saves. The backend appends them to the layer's own schema,
 * so the field app and job-detail.html render them without a second change.
 *
 * The layer's design fields are shown read-only: this page only adds fields.
 * Changing an existing field stays in Layer Details → Field Configuration.
 */
(function () {
  'use strict';

  window.FiberAuth.requireLogin();

  var user = window.FiberAuth.getUser && window.FiberAuth.getUser();
  if (user && user.role && user.role !== 'SUBADMIN') {
    window.location.replace('dashboard.html');
    return;
  }

  var TYPE_OPTIONS = [
    ['number', 'Number + unit'],
    ['text', 'Text / QC'],
    ['location', 'Location (X, Y)'],
    ['textarea', 'Notes (long text)'],
  ];

  var state = {
    projects: [],
    templates: [],
    base: [],
    extras: [],
    templateId: null,
    meta: {},
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function api(path, options) {
    return window.FiberApi.apiFetch(path, options || {});
  }

  function errorText(error) {
    if (window.FtthUI && typeof window.FtthUI.humanize === 'function') {
      return window.FtthUI.humanize(error);
    }
    return String((error && error.message) || error || 'Something went wrong');
  }

  function setStatus(message, isError) {
    var el = qs('status');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = isError ? 'var(--danger)' : 'var(--muted)';
  }

  function setBusy(busy) {
    ['saveBtn', 'reloadBtn', 'deleteBtn', 'addFieldBtn'].forEach(function (id) {
      var el = qs(id);
      if (el) el.disabled = busy;
    });
  }

  function currentKind() {
    return qs('layerKind').value;
  }

  function currentScope() {
    return qs('scopeSelect').value;
  }

  function currentProjectId() {
    return qs('projectSelect').value;
  }

  /** Map a stored spec (role/widget) back to the editor's input type. */
  function typeOf(field) {
    if (field.type) return field.type;
    if (field.role === 'measurement_text') return 'location';
    if (field.role === 'note' || field.widget === 'textarea') return 'textarea';
    if (field.role === 'measurement' || field.widget === 'number') return 'number';
    return 'text';
  }

  function editorField(field) {
    return {
      key: field.key,
      label: field.label || field.key,
      type: typeOf(field),
    };
  }

  function findTemplate(scope, projectId, kind) {
    return (
      state.templates.find(function (template) {
        if (template.layer_kind !== kind || template.scope !== scope) return false;
        if (scope === 'global') return true;
        return String(template.project) === String(projectId);
      }) || null
    );
  }

  function renderBase() {
    var list = qs('baseFields');
    if (!state.base.length) {
      list.innerHTML =
        '<li class="ff-empty">No design fields found for this layer type yet. You can still add extra fields.</li>';
      return;
    }
    list.innerHTML = state.base
      .map(function (field) {
        var flag = field.editable ? 'Engineer fills' : 'Read-only';
        return (
          '<li><span>' +
          esc(field.label || field.key) +
          '</span><span class="ff-key">' +
          esc(field.key) +
          ' · ' +
          flag +
          '</span></li>'
        );
      })
      .join('');
  }

  function renderExtras() {
    var body = qs('extraFields');
    if (!state.extras.length) {
      body.innerHTML =
        '<tr><td colspan="4" class="ff-empty">No extra fields yet. Add one to extend the form.</td></tr>';
      renderPreview();
      return;
    }

    body.innerHTML = state.extras
      .map(function (field, index) {
        var options = TYPE_OPTIONS.map(function (option) {
          return (
            '<option value="' +
            option[0] +
            '"' +
            (option[0] === field.type ? ' selected' : '') +
            '>' +
            option[1] +
            '</option>'
          );
        }).join('');
        return (
          '<tr class="ff-extra" data-index="' +
          index +
          '">' +
          '<td><input type="text" data-role="label" value="' +
          esc(field.label) +
          '" aria-label="Field label" /></td>' +
          '<td class="ff-key">' +
          esc(field.key) +
          '</td>' +
          '<td><select data-role="type" aria-label="Input type">' +
          options +
          '</select></td>' +
          '<td><button type="button" class="btn btn-outline btn-sm" data-role="remove">Remove</button></td>' +
          '</tr>'
        );
      })
      .join('');

    Array.prototype.forEach.call(body.querySelectorAll('tr[data-index]'), function (row) {
      var index = Number(row.getAttribute('data-index'));
      row.querySelector('[data-role="label"]').addEventListener('input', function (event) {
        state.extras[index].label = event.target.value;
        renderPreview();
      });
      row.querySelector('[data-role="type"]').addEventListener('change', function (event) {
        state.extras[index].type = event.target.value;
        renderPreview();
      });
      row.querySelector('[data-role="remove"]').addEventListener('click', function () {
        state.extras.splice(index, 1);
        renderExtras();
      });
    });

    renderPreview();
  }

  function renderPreview() {
    var box = qs('previewFields');
    var rows = state.base
      .map(function (field) {
        return { label: field.label || field.key, type: typeOf(field) };
      })
      .concat(
        state.extras.map(function (field) {
          return { label: field.label || field.key, type: field.type };
        })
      );

    if (!rows.length) {
      box.innerHTML = '<p class="ff-empty">Nothing to preview yet.</p>';
      return;
    }

    box.innerHTML = rows
      .map(function (row) {
        var input =
          row.type === 'textarea'
            ? '<textarea rows="2" disabled placeholder="Notes"></textarea>'
            : '<input type="text" disabled placeholder="' +
              (row.type === 'number' ? '0.00' : '—') +
              '" />';
        return '<div><label>' + esc(row.label) + '</label>' + input + '</div>';
      })
      .join('');

    var kindSelect = qs('layerKind');
    var kindLabel = kindSelect.selectedOptions[0]
      ? kindSelect.selectedOptions[0].textContent
      : currentKind();
    var scopeLabel = currentScope() === 'global' ? 'all projects' : 'this project';
    var meta = qs('previewMeta');
    meta.textContent =
      'Preview for ' +
      kindLabel +
      ' · ' +
      scopeLabel +
      (state.meta.layer_name ? ' · sample layer ' + state.meta.layer_name : '');
  }

  function addField() {
    var used = {};
    state.base.concat(state.extras).forEach(function (field) {
      if (field.key) used[field.key] = true;
    });

    var next = state.extras.length + 1;
    var key = 'custom_' + next;
    while (used[key]) {
      next += 1;
      key = 'custom_' + next;
    }

    state.extras.push({ key: key, label: 'New field', type: 'number' });
    renderExtras();
  }

  async function loadProjects() {
    try {
      var data = await window.FiberApi.listProjects();
      state.projects = Array.isArray(data) ? data : (data && data.results) || [];
    } catch {
      state.projects = [];
    }

    var select = qs('projectSelect');
    if (!state.projects.length) {
      select.innerHTML = '<option value="">No projects yet</option>';
      return;
    }
    select.innerHTML = state.projects
      .map(function (project) {
        return (
          '<option value="' +
          esc(project.id) +
          '">' +
          esc(project.name || project.title || project.id) +
          '</option>'
        );
      })
      .join('');
  }

  async function reload() {
    var scope = currentScope();
    var projectId = scope === 'project' ? currentProjectId() : '';
    qs('projectWrap').hidden = scope !== 'project';

    if (scope === 'project' && !projectId) {
      setStatus('Choose a project to see its fields.', true);
      return;
    }

    setBusy(true);
    try {
      var templates = await api(
        '/api/field-templates/' + (projectId ? '?project=' + encodeURIComponent(projectId) : '')
      );
      state.templates = (templates && templates.templates) || [];

      var preview = await api(
        '/api/field-templates/preview/?layer_kind=' +
          encodeURIComponent(currentKind()) +
          (projectId ? '&project=' + encodeURIComponent(projectId) : '')
      );
      state.base = (preview && preview.base) || [];
      state.meta = preview || {};

      var saved = findTemplate(scope, projectId, currentKind());
      state.templateId = saved ? saved.id : null;
      state.extras = saved
        ? (saved.fields || [])
            .filter(function (field) {
              return field && field.key;
            })
            .map(editorField)
        : [];

      qs('deleteBtn').hidden = !state.templateId;
      renderBase();
      renderExtras();
      setStatus(
        saved
          ? 'Loaded the saved fields for this choice.'
          : 'No saved fields for this choice yet — add some, then save.'
      );
    } catch (error) {
      setStatus(errorText(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    var scope = currentScope();
    var projectId = scope === 'project' ? currentProjectId() : '';
    if (scope === 'project' && !projectId) {
      setStatus('Choose a project first.', true);
      return;
    }

    setBusy(true);
    try {
      var body = {
        scope: scope,
        layer_kind: currentKind(),
        fields: state.extras.map(function (field, index) {
          return {
            key: field.key,
            label: field.label || field.key,
            type: field.type || 'number',
            editable: true,
            order: index,
          };
        }),
      };
      if (scope === 'project') body.project = projectId;

      await api('/api/field-templates/', { method: 'PUT', body: JSON.stringify(body) });
      await reload();
      setStatus('Saved. Engineers see these fields on their next load.');
    } catch (error) {
      setStatus('Could not save: ' + errorText(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function removeSaved() {
    if (!state.templateId) return;

    setBusy(true);
    try {
      await api('/api/field-templates/' + encodeURIComponent(state.templateId) + '/', {
        method: 'DELETE',
      });
      await reload();
      setStatus('Removed the saved fields for this choice.');
    } catch (error) {
      setStatus('Could not remove: ' + errorText(error), true);
    } finally {
      setBusy(false);
    }
  }

  qs('addFieldBtn').addEventListener('click', addField);
  qs('saveBtn').addEventListener('click', save);
  qs('deleteBtn').addEventListener('click', removeSaved);
  qs('reloadBtn').addEventListener('click', reload);
  qs('layerKind').addEventListener('change', reload);
  qs('scopeSelect').addEventListener('change', reload);
  qs('projectSelect').addEventListener('change', reload);

  loadProjects().then(reload);
})();
