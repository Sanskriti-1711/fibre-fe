/**
 * FTTH HLD — Reusable UI Components
 *
 * Pure-DOM helper functions — no framework dependency.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Utility
  // ------------------------------------------------------------------

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function timestamp() {
    return new Date().toLocaleTimeString();
  }

  // ------------------------------------------------------------------
  // 1. File Dropzone
  // ------------------------------------------------------------------

  /**
   * Create a styled drag-and-drop file upload zone.
   *
   * @param {Object}  options
   * @param {string}  options.label      - Display label
   * @param {string}  options.accept     - Accepted MIME / ext (e.g. ".xlsx")
   * @param {string}  options.hint       - Helper text
   * @param {string}  options.icon       - Emoji / SVG string
   * @param {Function} options.onChange  - callback(file | null)
   * @returns {HTMLElement}
   */
  function createDropzone(options) {
    const { label, accept, hint, icon, onChange } = options || {};

    const el = document.createElement('div');
    el.className = 'ftth-dropzone';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Upload ' + (label || 'file'));

    // State
    let currentFile = null;

    function render(file) {
      if (file) {
        el.classList.add('has-file');
        el.innerHTML = ''
          + '<div class="ftth-dropzone-icon">📄</div>'
          + '<div class="ftth-dropzone-name">' + escapeHtml(file.name) + '</div>'
          + '<div class="ftth-dropzone-size">' + formatSize(file.size) + '</div>'
          + '<button type="button" class="ftth-dropzone-remove" aria-label="Remove file">✕</button>';
        const rmBtn = el.querySelector('.ftth-dropzone-remove');
        rmBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          currentFile = null;
          render(null);
          onChange && onChange(null);
        });
      } else {
        el.classList.remove('has-file');
        el.innerHTML = ''
          + '<div class="ftth-dropzone-icon">' + (icon || '📂') + '</div>'
          + '<div class="ftth-dropzone-label">' + escapeHtml(label || 'Choose file') + '</div>'
          + '<div class="ftth-dropzone-hint">' + escapeHtml(hint || '') + '</div>';
      }
    }

    render(null);

    // Hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '';
    input.style.display = 'none';
    el.appendChild(input);

    input.addEventListener('change', function () {
      const f = input.files && input.files[0] ? input.files[0] : null;
      if (f) {
        currentFile = f;
        render(f);
        onChange && onChange(f);
      }
    });

    // Click to open file picker
    el.addEventListener('click', function (e) {
      if (e.target.closest('.ftth-dropzone-remove')) return;
      input.click();
    });

    // Drag-and-drop
    el.addEventListener('dragover', function (e) {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', function () {
      el.classList.remove('drag-over');
    });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      el.classList.remove('drag-over');
      const f = e.dataTransfer.files && e.dataTransfer.files[0] ? e.dataTransfer.files[0] : null;
      if (f) {
        currentFile = f;
        render(f);
        onChange && onChange(f);
      }
    });

    // Keyboard accessibility
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });

    return el;
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ------------------------------------------------------------------
  // 2. Terminal-like Log Viewer
  // ------------------------------------------------------------------

  /**
   * Create a scrollable terminal log container.
   * @param {Object} [options]
   * @param {number} [options.maxLines]  - Auto-truncate to this many lines
   * @returns {HTMLElement}  The log container element
   */
  function createLogViewer(options) {
    const maxLines = (options && options.maxLines) || 500;

    const el = document.createElement('div');
    el.className = 'ftth-log-viewer';
    el.setAttribute('role', 'log');
    el.setAttribute('aria-live', 'polite');

    let lineCount = 0;

    /**
     * Append a message to the log.
     * @param {string} text
     * @param {string} [level]  'info' | 'warn' | 'error' | 'success'
     */
    function append(text, level) {
      const line = document.createElement('div');
      line.className = 'ftth-log-line ftth-log-' + (level || 'info');

      const time = document.createElement('span');
      time.className = 'ftth-log-time';
      time.textContent = timestamp();

      const msg = document.createElement('span');
      msg.className = 'ftth-log-msg';
      msg.textContent = text;

      line.appendChild(time);
      line.appendChild(msg);
      el.appendChild(line);

      lineCount++;

      // Truncate old lines
      while (lineCount > maxLines && el.firstChild) {
        el.removeChild(el.firstChild);
        lineCount--;
      }

      // Auto-scroll to bottom
      el.scrollTop = el.scrollHeight;
    }

    /**
     * Append an array of backend messages in one batch.
     * @param {Array} messages - [{ text, level }]
     */
    function appendBatch(messages) {
      if (!messages || !messages.length) return;
      messages.forEach(function (m) {
        append(m.text || m.message || String(m), m.level || 'info');
      });
    }

    /**
     * Clear all log lines.
     */
    function clear() {
      el.innerHTML = '';
      lineCount = 0;
    }

    el._append = append;
    el._appendBatch = appendBatch;
    el._clear = clear;

    return el;
  }

  // ------------------------------------------------------------------
  // 3. Status Badge
  // ------------------------------------------------------------------

  /**
   * Create a status badge element.
   * @param {string} status  'running' | 'completed' | 'failed' | 'pending'
   * @returns {HTMLElement}
   */
  function createStatusBadge(status) {
    const el = document.createElement('span');
    el.className = 'ftth-status-badge';

    const s = (status || '').toLowerCase();

    let label = s;
    let dotColor = '#6B7280';
    let bg = '#F3F4F6';
    let textColor = '#374151';

    if (s === 'running' || s === 'processing') {
      label = 'Running';
      dotColor = '#3B82F6';
      bg = '#EFF6FF';
      textColor = '#1D4ED8';
    } else if (s === 'completed' || s === 'success') {
      label = 'Completed';
      dotColor = '#10B981';
      bg = '#ECFDF5';
      textColor = '#065F46';
    } else if (s === 'failed' || s === 'error') {
      label = 'Failed';
      dotColor = '#EF4444';
      bg = '#FEF2F2';
      textColor = '#991B1B';
    } else if (s === 'pending' || s === 'queued') {
      label = 'Pending';
      dotColor = '#F59E0B';
      bg = '#FFFBEB';
      textColor = '#92400E';
    }

    el.style.cssText = [
      'display: inline-flex; align-items: center; gap: 6px;',
      'padding: 6px 12px; border-radius: 999px;',
      'background: ' + bg + ';',
      'color: ' + textColor + ';',
      'font-size: 13px; font-weight: 600;',
      'border: 1px solid ' + dotColor + '33;',
    ].join(' ');

    el.innerHTML = ''
      + '<span style="'
      +   'width: 8px; height: 8px; border-radius: 50%;'
      +   'background: ' + dotColor + ';'
      +   (s === 'running' ? 'animation: ftth-pulse 1.5s ease-in-out infinite;' : '')
      + '"></span>'
      + '<span>' + escapeHtml(label) + '</span>';

    return el;
  }

  // ------------------------------------------------------------------
  // 4. Progress Bar
  // ------------------------------------------------------------------

  /**
   * Create a simple progress bar.
   * @param {number} [pct=0]  0–100
   * @param {Object} [options]
   * @returns {HTMLElement}
   */
  function createProgressBar(pct, options) {
    const value = Math.max(0, Math.min(100, Number(pct) || 0));
    const color = value >= 80 ? '#10B981' : value >= 40 ? '#F59E0B' : '#3B82F6';

    const el = document.createElement('div');
    el.className = 'ftth-progress-bar';
    el.style.cssText = 'width:100%; height:8px; background:#E5E7EB; border-radius:4px; overflow:hidden;';

    const fill = document.createElement('div');
    fill.className = 'ftth-progress-fill';
    fill.style.cssText = [
      'height:100%; width:' + value + '%;',
      'background:' + color + ';',
      'border-radius:4px;',
      'transition: width 0.4s ease, background 0.4s ease;',
    ].join(' ');
    el.appendChild(fill);

    return el;
  }

  /**
   * Update an existing progress bar's value.
   * @param {HTMLElement} barEl
   * @param {number}      pct
   */
  function updateProgressBar(barEl, pct) {
    if (!barEl) return;
    const fill = barEl.querySelector('.ftth-progress-fill');
    if (!fill) return;
    const value = Math.max(0, Math.min(100, Number(pct) || 0));
    const color = value >= 80 ? '#10B981' : value >= 40 ? '#F59E0B' : '#3B82F6';
    fill.style.width = value + '%';
    fill.style.background = color;
  }

  // ------------------------------------------------------------------
  // 5. Layer Toggle Checkbox
  // ------------------------------------------------------------------

  /**
   * Create a labeled checkbox for toggling a map layer.
   * @param {string}  name     - Layer display name
   * @param {number}  count    - Feature count
   * @param {boolean} checked  - Default visibility
   * @param {Function} onChange - callback(checked)
   * @returns {HTMLElement}
   */
  function createLayerToggle(name, count, checked, onChange) {
    const el = document.createElement('label');
    el.className = 'ftth-layer-toggle';
    el.style.cssText = [
      'display:flex; align-items:center; gap:10px;',
      'padding:8px 0; cursor:pointer;',
      'border-bottom:1px solid #E5E7EB;',
    ].join(' ');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked !== false;
    cb.style.cssText = 'width:16px; height:16px; accent-color:#E31837; cursor:pointer;';

    cb.addEventListener('change', function () {
      onChange && onChange(cb.checked);
    });

    const labelSpan = document.createElement('span');
    labelSpan.style.cssText = 'flex:1; font-size:13px; font-weight:600; color:#1F2937;';
    labelSpan.textContent = name;

    const countSpan = document.createElement('span');
    countSpan.style.cssText = 'font-size:11px; color:#6B7280; font-weight:500;';
    countSpan.textContent = count !== undefined ? (count + ' features') : '';

    el.appendChild(cb);
    el.appendChild(labelSpan);
    el.appendChild(countSpan);

    return el;
  }

  // ------------------------------------------------------------------
  // 6. Pipeline Step Wizard
  // ------------------------------------------------------------------

  /**
   * Pipeline step definitions (shared with the Django backend).
   * Each step has a name, display label, dependency, and output names.
   */
  var PIPELINE_STEPS = [
    { name: 'object',  label: 'Object Layer',    detail: 'Geocode addresses via Nominatim',
      outputs: ['Objects.gpkg'], dependsOn: null },
    { name: 'polygon', label: 'Polygon Layer',   detail: 'Generate coverage polygons from objects',
      outputs: ['Polygons.gpkg'], dependsOn: 'object' },
    { name: 'network', label: 'Network Layer',   detail: 'Assign PDPs and identify MFG location',
      outputs: ['PDPs.gpkg', 'MFG.gpkg'], dependsOn: 'polygon' },
    { name: 'trench',  label: 'Trench Layer',    detail: 'Route feeder, distribution, garden & drill trenches',
      outputs: ['Feeder_Trench.gpkg', 'Distribution_Trench.gpkg',
                'Garden_Trench.gpkg', 'Drill_Trench.gpkg', 'Final_Trenches.gpkg'],
      dependsOn: 'network' },
    { name: 'cable',   label: 'Cable Layer',     detail: 'Route feeder and distribution cables',
      outputs: ['Feeder_Cable.gpkg', 'Distribution_Cable.gpkg'],
      dependsOn: 'trench' },
    { name: 'duct',    label: 'Duct Layer',      detail: 'Route feeder and distribution ducts',
      outputs: ['Feeder_Ducts.gpkg', 'Distribution_Ducts.gpkg'],
      dependsOn: 'trench' },
  ];

  /**
   * Create a pipeline step wizard — a vertical timeline showing each
   * pipeline step, its status, and an action button.
   *
   * @param {Object}   options
   * @param {Object}   options.stepStates    - Map of step name -> { status, outputs, error }
   * @param {Function} options.onRunStep     - Called with (stepName) when user clicks Run
   * @param {boolean}  [options.isPolling]   - Show polling indicator
   * @param {string}   [options.projectId]   - Project ID for linking outputs
   * @returns {HTMLElement}
   */
  function createStepWizard(options) {
    var opts = options || {};
    var stepStates = opts.stepStates || {};
    var onRunStep = opts.onRunStep || function () {};
    var isPolling = opts.isPolling || false;
    var projectId = opts.projectId || '';

    var el = document.createElement('div');
    el.className = 'ftth-step-wizard';

    function render() {
      el.innerHTML = '';

      PIPELINE_STEPS.forEach(function (stepDef, index) {
        var state = stepStates[stepDef.name] || { status: 'pending' };
        var status = state.status || 'pending';
        var isCompleted = status === 'completed';
        var isRunning = status === 'running';
        var isFailed = status === 'failed';
        var isPending = status === 'pending';

        // Determine if this step can be run now:
        // - Not already completed or running
        // - Dependency is completed (or no dependency)
        var depName = stepDef.dependsOn;
        var depState = depName ? (stepStates[depName] || {}).status || 'pending' : 'completed';
        var canRun = !isCompleted && !isRunning && depState === 'completed' && !isPolling;

        // Build step row
        var row = document.createElement('div');
        row.className = 'ftth-step-row';
        if (isCompleted) row.classList.add('ftth-step-completed');
        if (isRunning) row.classList.add('ftth-step-running');
        if (isFailed) row.classList.add('ftth-step-failed');
        if (canRun) row.classList.add('ftth-step-actionable');

        // Status icon (numbered circle or checkmark)
        var icon = document.createElement('div');
        icon.className = 'ftth-step-icon';
        if (isCompleted) {
          icon.innerHTML = '<span style="color:#10B981;font-size:16px;">\u2713</span>';
          icon.style.background = '#ECFDF5';
          icon.style.borderColor = '#A7F3D0';
        } else if (isRunning) {
          icon.innerHTML = '<span class="ftth-step-spinner"></span>';
          icon.style.background = '#EFF6FF';
          icon.style.borderColor = '#93C5FD';
        } else if (isFailed) {
          icon.innerHTML = '<span style="color:#EF4444;font-size:16px;">\u2717</span>';
          icon.style.background = '#FEF2F2';
          icon.style.borderColor = '#FECACA';
        } else {
          icon.textContent = String(index + 1);
        }
        row.appendChild(icon);

        // Step info (name + detail + outputs)
        var info = document.createElement('div');
        info.className = 'ftth-step-info';

        var nameEl = document.createElement('div');
        nameEl.className = 'ftth-step-name';
        nameEl.textContent = stepDef.label;
        info.appendChild(nameEl);

        var detailEl = document.createElement('div');
        detailEl.className = 'ftth-step-detail';
        detailEl.textContent = isCompleted
          ? 'Outputs: ' + (state.outputs ? Object.keys(state.outputs).join(', ') : stepDef.outputs.join(', '))
          : stepDef.detail;
        info.appendChild(detailEl);

        // Error message if failed
        if (isFailed && state.error) {
          var errEl = document.createElement('div');
          errEl.className = 'ftth-step-error';
          errEl.textContent = String(state.error).substring(0, 120);
          info.appendChild(errEl);
        }

        row.appendChild(info);

        // Status badge + action button
        var actions = document.createElement('div');
        actions.className = 'ftth-step-actions';

        if (isCompleted) {
          var badge = document.createElement('span');
          badge.className = 'ftth-step-badge ftth-step-badge-ok';
          badge.textContent = 'Done';
          actions.appendChild(badge);
        } else if (isRunning) {
          var badge = document.createElement('span');
          badge.className = 'ftth-step-badge ftth-step-badge-running';
          badge.textContent = 'Running\u2026';
          actions.appendChild(badge);
        } else if (isFailed) {
          var retryBtn = document.createElement('button');
          retryBtn.className = 'ftth-step-run-btn ftth-step-retry-btn';
          retryBtn.type = 'button';
          retryBtn.textContent = '\u21BA Retry';
          retryBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            onRunStep(stepDef.name);
          });
          actions.appendChild(retryBtn);
        } else if (canRun) {
          var runBtn = document.createElement('button');
          runBtn.className = 'ftth-step-run-btn';
          runBtn.type = 'button';
          runBtn.textContent = '\u25B6 Run';
          runBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            onRunStep(stepDef.name);
          });
          actions.appendChild(runBtn);
        } else {
          // Pending but dependency not met
          var badge = document.createElement('span');
          badge.className = 'ftth-step-badge ftth-step-badge-pending';
          if (depName) {
            var depLabel = PIPELINE_STEPS.filter(function (s) { return s.name === depName; })[0];
            badge.textContent = 'Waiting for ' + (depLabel ? depLabel.label : depName);
          } else {
            badge.textContent = 'Pending';
          }
          actions.appendChild(badge);
        }

        row.appendChild(actions);
        el.appendChild(row);
      });
    }

    // Rerender when state changes
    el._update = function (newStates) {
      var keys = Object.keys(newStates || {});
      for (var i = 0; i < keys.length; i++) {
        stepStates[keys[i]] = newStates[keys[i]];
      }
      render();
    };

    render();
    return el;
  }

  // ------------------------------------------------------------------
  // Exports
  // ------------------------------------------------------------------

  window.FtthComponents = {
    createDropzone,
    createLogViewer,
    createStatusBadge,
    createProgressBar,
    updateProgressBar,
    createLayerToggle,
    createStepWizard,
    getStepStatesFromPipeline: _getStepStatesFromPipeline,
  };

  // ------------------------------------------------------------------
  // Internal: extract step states from pipeline_state JSON
  // ------------------------------------------------------------------

  /**
   * Convert the backend pipeline_state JSON into the stepStates format
   * expected by createStepWizard.
   */
  function _getStepStatesFromPipeline(pipelineState) {
    var result = {};
    if (!pipelineState || !pipelineState.steps) return result;
    var keys = Object.keys(pipelineState.steps);
    for (var i = 0; i < keys.length; i++) {
      var stepName = keys[i];
      var step = pipelineState.steps[stepName];
      result[stepName] = {
        status: step.status || 'pending',
        outputs: step.outputs || {},
        error: step.error || null,
        started_at: step.started_at || null,
        completed_at: step.completed_at || null,
      };
    }
    return result;
  }

})();
