/**
 * FTTH HLD — Shared State Manager
 *
 * Stores the active project_id, pipeline results, and polling state
 * across pages via a simple global object + optional localStorage persistence.
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // In-memory state
  // ------------------------------------------------------------------

  const _state = {
    projectId: null,        // current / most-recent project UUID
    results: null,          // cached pipeline result object
    polling: false,         // is a polling loop active?
    pollTimerId: null,      // setInterval handle
    onStatusChange: null,   // callback(prevStatus, nextStatus)
  };

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  const STORAGE_KEY = 'ftth_hld_state';

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ projectId: _state.projectId })
      );
    } catch (_) { /* quota exceeded — silent */ }
  }

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.projectId) {
          _state.projectId = parsed.projectId;
        }
      }
    } catch (_) { /* ignore */ }
  }

  // Load on script boot so projectId survives simple navigation.
  loadPersisted();

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  function setProjectId(id) {
    _state.projectId = id || null;
    persist();
  }

  function getProjectId() {
    return _state.projectId;
  }

  function setResults(data) {
    _state.results = data;
  }

  function getResults() {
    return _state.results;
  }

  /**
   * Start polling pipeline status.
   *
   * @param {string}   projectId
   * @param {Function} onMessage    - called with each status payload
   * @param {Function} onComplete   - called with final payload when done
   * @param {Function} onError      - called with Error on failure
   * @param {number}   [intervalMs] - polling interval in ms (default 3000)
   * @returns {Function}            - call to stop polling
   */
  function startPolling(projectId, onMessage, onComplete, onError, intervalMs) {
    if (_state.polling) stopPolling();

    _state.projectId = projectId;
    _state.polling = true;
    persist();

    const ms = intervalMs || 3000;

    async function tick() {
      if (!_state.polling) return;
      try {
        const data = await window.FtthApi.getPipelineStatus(projectId);
        if (!_state.polling) return; // stopped while fetch was in-flight

        _state.results = data;
        onMessage && onMessage(data);

        if (data.status === 'completed' || data.status === 'failed' || data.status === 'error') {
          _state.polling = false;
          clearInterval(_state.pollTimerId);
          _state.pollTimerId = null;
          onComplete && onComplete(data);
        }
      } catch (err) {
        if (!_state.polling) return;
        onError && onError(err);
      }
    }

    // Fire immediately, then every `ms`
    tick();
    _state.pollTimerId = setInterval(tick, ms);

    // Return a stop handle
    return function stop() {
      _state.polling = false;
      if (_state.pollTimerId) {
        clearInterval(_state.pollTimerId);
        _state.pollTimerId = null;
      }
    };
  }

  function stopPolling() {
    _state.polling = false;
    if (_state.pollTimerId) {
      clearInterval(_state.pollTimerId);
      _state.pollTimerId = null;
    }
  }

  function isPolling() {
    return _state.polling;
  }

  // ------------------------------------------------------------------
  // Exports
  // ------------------------------------------------------------------

  window.FtthState = {
    setProjectId,
    getProjectId,
    setResults,
    getResults,
    startPolling,
    stopPolling,
    isPolling,
  };
})();
