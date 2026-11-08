(function () {
  'use strict';

  // The field app stores the span inspection beside the ordinary readings in
  // `field_measurements` ({key: {value}}). Review screens should not make a
  // planner read those raw keys: they get the same labelled sections the
  // inspector filled in, with the pass/fail checks called out explicitly.

  var SPAN_DETAILS = [
    ['inspection_project_id', 'Project ID'],
    ['inspection_span_id', 'Span ID'],
    ['inspection_sub_span_id', 'Sub Span ID'],
    ['inspection_trench_id', 'Trench ID'],
    ['inspection_inspector_name', 'Inspector Name'],
    ['inspection_date', 'Inspection Date'],
    ['inspection_gps_start', 'GPS Start Location'],
    ['inspection_gps_end', 'GPS End Location'],
  ];

  var FIELD_CAPTURE = [
    ['trench_type', 'Trench Type', ''],
    ['start_gps', 'Start GPS Coordinate', ''],
    ['end_gps', 'End GPS Coordinate', ''],
    ['measured_length_m', 'Measured Length', ' m'],
    ['actual_depth_mm', 'Actual Depth', ' mm'],
    ['actual_width_mm', 'Actual Width', ' mm'],
    ['surface_type', 'Surface Type', ''],
    ['existing_utilities', 'Existing Utilities Encountered', ''],
    ['utility_distance', 'Distance from Utility', ''],
    ['joint_pit_locations', 'Joint / Pit Locations', ''],
  ];

  var LLD_CHECKS = [
    ['check_lld_trench_available', 'Trench available in approved LLD'],
    ['check_route_matches_alignment', 'Route matches approved alignment'],
    ['check_span_matches_drawing', 'Span ID matches drawing'],
    ['check_start_matches_design', 'Start location matches design'],
    ['check_end_matches_design', 'End location matches design'],
    ['check_trench_length_matches_lld', 'Trench length matches LLD'],
  ];

  var CONSTRUCTION_CHECKS = [
    ['check_trench_depth_standard', 'Trench depth as per standard'],
    ['check_trench_width_standard', 'Trench width as per standard'],
    ['check_straight_alignment', 'Straight alignment maintained'],
    ['check_no_utility_damage', 'No utility damage'],
    ['check_warning_tape', 'Warning tape installed'],
    ['check_trace_wire', 'Trace wire installed'],
    ['check_backfilling', 'Backfilling completed'],
    ['check_compaction', 'Compaction completed'],
    ['check_surface_reinstated', 'Surface reinstated'],
    ['check_safety_barricading', 'Safety barricading provided'],
  ];

  var INSPECTION_KEYS = {};
  SPAN_DETAILS.concat(FIELD_CAPTURE, LLD_CHECKS, CONSTRUCTION_CHECKS).forEach(function (entry) {
    INSPECTION_KEYS[entry[0]] = true;
  });

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function entryValue(entry) {
    if (entry && typeof entry === 'object' && 'value' in entry) return entry.value;
    return entry;
  }

  function valueText(feature, key) {
    var measurements = (feature && feature.field_measurements) || {};
    var value = entryValue(measurements[key]);
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  function isInspectionKey(key) {
    return Boolean(INSPECTION_KEYS[key]) || String(key || '').indexOf('inspection_') === 0;
  }

  function hasInspection(feature) {
    var measurements = feature && feature.field_measurements;
    if (!measurements || typeof measurements !== 'object') return false;
    return Object.keys(measurements).some(isInspectionKey);
  }

  function visibleValue(feature, key, suffix) {
    var value = valueText(feature, key);
    return value ? esc(value + (suffix || '')) : '&mdash;';
  }

  function checkState(feature, key) {
    var value = valueText(feature, key).toLowerCase();
    return value === 'pass' || value === 'fail' ? value : 'pending';
  }

  function checkCounts(feature, checks) {
    var counts = { pass: 0, fail: 0, pending: 0 };
    checks.forEach(function (entry) {
      counts[checkState(feature, entry[0])] += 1;
    });
    counts.total = checks.length;
    return counts;
  }

  function checkBadge(state) {
    var label = state === 'pass' ? 'Pass' : state === 'fail' ? 'Fail' : 'Not checked';
    return '<span class="si-badge ' + state + '">' + label + '</span>';
  }

  function checkRows(feature, checks) {
    return checks
      .map(function (entry) {
        var state = checkState(feature, entry[0]);
        return (
          '<div class="si-check">' +
          '<span class="si-check__label">' +
          esc(entry[1]) +
          '</span>' +
          checkBadge(state) +
          '</div>'
        );
      })
      .join('');
  }

  function fieldGrid(feature, fields) {
    return fields
      .map(function (entry) {
        return (
          '<div class="si-item">' +
          '<span class="si-item__label">' +
          esc(entry[1]) +
          '</span>' +
          '<span class="si-item__value' +
          (valueText(feature, entry[0]) ? '' : ' is-empty') +
          '">' +
          visibleValue(feature, entry[0], entry[2]) +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function summary(feature) {
    var has = hasInspection(feature);
    var allFields = SPAN_DETAILS.concat(FIELD_CAPTURE);
    var lld = checkCounts(feature, LLD_CHECKS);
    var construction = checkCounts(feature, CONSTRUCTION_CHECKS);
    var recorded = allFields.filter(function (entry) {
      return valueText(feature, entry[0]) !== '';
    }).length;
    return {
      has: has,
      fieldsRecorded: recorded,
      fieldsTotal: allFields.length,
      lld: lld,
      construction: construction,
      checksPassed: lld.pass + construction.pass,
      checksFailed: lld.fail + construction.fail,
      checksTotal: lld.total + construction.total,
    };
  }

  function stat(label, value, hint) {
    return (
      '<div class="si-stat">' +
      '<span class="si-stat__label">' +
      esc(label) +
      '</span>' +
      '<span class="si-stat__value">' +
      esc(value) +
      '</span>' +
      (hint ? '<span class="si-stat__hint">' + esc(hint) + '</span>' : '') +
      '</div>'
    );
  }

  function render(feature) {
    var data = summary(feature);
    if (!data.has) return '';

    var lld = data.lld;
    var construction = data.construction;
    var remarks = ((feature && feature.comparison_notes) || '').trim();
    var lldSummary = lld.pass + ' pass' + (lld.fail ? ' · ' + lld.fail + ' fail' : '');
    var lldStatus = lld.pending ? lld.pending + ' not checked' : 'all answered';
    var constructionSummary =
      construction.pass + ' pass' + (construction.fail ? ' · ' + construction.fail + ' fail' : '');
    var constructionStatus = construction.pending
      ? construction.pending + ' not checked'
      : 'all answered';

    return (
      '<div class="si">' +
      '<div class="si-summary">' +
      stat('Inspection fields', data.fieldsRecorded + ' / ' + data.fieldsTotal, 'recorded') +
      stat('LLD checks', lldSummary, lldStatus) +
      stat('Construction checks', constructionSummary, constructionStatus) +
      '</div>' +
      '<section class="si-section">' +
      '<h4 class="si-section__title">Span details</h4>' +
      '<div class="si-grid">' +
      fieldGrid(feature, SPAN_DETAILS) +
      '</div>' +
      '</section>' +
      '<section class="si-section">' +
      '<h4 class="si-section__title">LLD compliance checks</h4>' +
      '<div class="si-checks">' +
      checkRows(feature, LLD_CHECKS) +
      '</div>' +
      '</section>' +
      '<section class="si-section">' +
      '<h4 class="si-section__title">Field capture</h4>' +
      '<div class="si-grid">' +
      fieldGrid(feature, FIELD_CAPTURE) +
      '</div>' +
      '</section>' +
      '<section class="si-section">' +
      '<h4 class="si-section__title">Construction checks</h4>' +
      '<div class="si-checks">' +
      checkRows(feature, CONSTRUCTION_CHECKS) +
      '</div>' +
      '</section>' +
      '<section class="si-section">' +
      '<h4 class="si-section__title">Remarks</h4>' +
      (remarks
        ? '<p class="si-remarks">' + esc(remarks) + '</p>'
        : '<p class="si-empty">No remarks recorded.</p>') +
      '</section>' +
      '</div>'
    );
  }

  window.SpanInspection = {
    render: render,
    summary: summary,
    hasInspection: hasInspection,
    isInspectionKey: isInspectionKey,
    keys: Object.keys(INSPECTION_KEYS),
  };
})();
