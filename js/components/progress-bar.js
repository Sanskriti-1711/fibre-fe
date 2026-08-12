// Progress Bar Component for Completion Metrics
// Usage: ProgressBar.create(65.5, { height: '8px', showLabel: true })
//
// Styled by the design system classes in css/main.css (.ds-progress-*),
// so it matches the rest of the platform.

const ProgressBar = {
  /**
   * Create a progress bar element
   * @param {number} percentage - 0-100 value
   * @param {Object} options - Configuration options
   * @param {string} options.height - CSS height (default: '8px')
   * @param {boolean} options.showLabel - Show percentage label (default: false)
   * @param {string} options.color - Bar color (default: auto based on %)
   * @param {string} options.className - Additional CSS classes
   * @returns {HTMLElement} Progress bar container
   */
  create(percentage, options = {}) {
    const value = Math.max(0, Math.min(100, Number(percentage) || 0));
    const {
      height = '8px',
      showLabel = false,
      color = this._getColor(value),
      className = ''
    } = options;

    const container = document.createElement('div');
    container.className = `ds-progress ${className}`;

    const track = document.createElement('div');
    track.className = 'ds-progress-track';
    track.style.height = height;

    const fill = document.createElement('div');
    fill.className = 'ds-progress-fill';
    fill.style.width = `${value}%`;
    fill.style.background = color;

    track.appendChild(fill);
    container.appendChild(track);

    if (showLabel) {
      const label = document.createElement('span');
      label.className = 'ds-progress-label';
      label.textContent = `${value.toFixed(1)}%`;
      container.appendChild(label);
    }

    return container;
  },

  /**
   * Create a dual progress bar (standard + dynamic side by side)
   * @param {number} standard - Standard completion %
   * @param {number} dynamic - Dynamic completion %
   * @param {Object} options - Configuration
   * @returns {HTMLElement} Dual progress container
   */
  createDual(standard, dynamic, options = {}) {
    const container = document.createElement('div');
    container.className = 'ds-progress-dual';

    const { showLabels = true } = options;

    const standardRow = this._createLabeledRow('Standard', standard, '#3B82F6', showLabels);
    container.appendChild(standardRow);

    const dynamicRow = this._createLabeledRow('Dynamic', dynamic, '#10B981', showLabels, true);
    container.appendChild(dynamicRow);

    return container;
  },

  _createLabeledRow(label, value, color, showLabel, showBadge = false) {
    const row = document.createElement('div');
    row.className = 'ds-progress-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'ds-progress-row-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const bar = this.create(value, { height: '6px', color });
    bar.classList.add('ds-progress-row-bar');
    row.appendChild(bar);

    if (showLabel) {
      const valueEl = document.createElement('span');
      valueEl.className = 'ds-progress-row-value';
      valueEl.textContent = `${Number(value).toFixed(1)}%`;
      row.appendChild(valueEl);
    }

    if (showBadge) {
      const badge = document.createElement('span');
      badge.className = 'ds-progress-badge';
      badge.textContent = 'W';
      badge.title = 'Weighted';
      row.appendChild(badge);
    }

    return row;
  },

  _getColor(percentage) {
    if (percentage >= 80) return '#10B981'; // Green
    if (percentage >= 50) return '#F59E0B'; // Amber
    return '#EF4444'; // Red
  },

  /**
   * Quick render to string for simple use cases
   * @param {number} percentage 
   * @param {Object} options 
   * @returns {string} HTML string
   */
  render(percentage, options = {}) {
    const el = this.create(percentage, options);
    const wrapper = document.createElement('div');
    wrapper.appendChild(el);
    return wrapper.innerHTML;
  }
};

// Export for module systems or attach to window
if (typeof window !== 'undefined') {
  window.ProgressBar = ProgressBar;
}
