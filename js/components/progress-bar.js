// Progress Bar Component for Completion Metrics
// Usage: ProgressBar.create(65.5, { height: '8px', showLabel: true })

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
    container.className = `progress-bar-container ${className}`;
    container.style.cssText = `
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const track = document.createElement('div');
    track.className = 'progress-bar-track';
    track.style.cssText = `
      flex: 1;
      height: ${height};
      background: #E5E7EB;
      border-radius: 4px;
      overflow: hidden;
    `;

    const fill = document.createElement('div');
    fill.className = 'progress-bar-fill';
    fill.style.cssText = `
      height: 100%;
      width: ${value}%;
      background: ${color};
      border-radius: 4px;
      transition: width 0.3s ease;
    `;

    track.appendChild(fill);
    container.appendChild(track);

    if (showLabel) {
      const label = document.createElement('span');
      label.className = 'progress-bar-label';
      label.textContent = `${value.toFixed(1)}%`;
      label.style.cssText = `
        font-size: 12px;
        font-weight: 600;
        color: #374151;
        min-width: 45px;
        text-align: right;
      `;
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
    container.className = 'dual-progress-container';
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
    `;

    const { showLabels = true } = options;

    // Standard row
    const standardRow = this._createLabeledRow('Standard', standard, '#3B82F6', showLabels);
    container.appendChild(standardRow);

    // Dynamic row
    const dynamicRow = this._createLabeledRow('Dynamic', dynamic, '#10B981', showLabels, true);
    container.appendChild(dynamicRow);

    return container;
  },

  _createLabeledRow(label, value, color, showLabel, showBadge = false) {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
    `;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      font-size: 11px;
      color: #6B7280;
      min-width: 55px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    `;
    row.appendChild(labelEl);

    const bar = this.create(value, { height: '6px', color });
    bar.style.flex = '1';
    row.appendChild(bar);

    if (showLabel) {
      const valueEl = document.createElement('span');
      valueEl.textContent = `${Number(value).toFixed(1)}%`;
      valueEl.style.cssText = `
        font-size: 11px;
        font-weight: 600;
        color: #374151;
        min-width: 40px;
        text-align: right;
      `;
      row.appendChild(valueEl);
    }

    if (showBadge) {
      const badge = document.createElement('span');
      badge.textContent = 'W';
      badge.title = 'Weighted';
      badge.style.cssText = `
        font-size: 9px;
        font-weight: 700;
        color: #10B981;
        background: #D1FAE5;
        padding: 2px 4px;
        border-radius: 3px;
        margin-left: 4px;
      `;
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
