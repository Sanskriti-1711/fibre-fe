// Completion Card Component for displaying project completion metrics
// Usage: CompletionCard.create(projectId, containerElement)

const CompletionCard = {
  /**
   * Create a completion card with standard and dynamic metrics
   * @param {string} projectId - Project UUID
   * @param {Object} options - Configuration options
   * @param {boolean} options.showWeights - Show weight configuration button (default: true for admins)
   * @param {boolean} options.compact - Compact mode for lists (default: false)
   * @returns {HTMLElement} Completion card element
   */
  async create(projectId, options = {}) {
    const {
      showWeights = true,
      compact = false
    } = options;

    const container = document.createElement('div');
    container.className = 'completion-card';
    container.style.cssText = compact ? this._compactStyles() : this._defaultStyles();

    // Loading state
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #6B7280;">
        <div style="font-size: 14px;">Loading completion metrics...</div>
      </div>
    `;

    try {
      const data = await window.FiberApi.getProjectCompletion(projectId);
      container.innerHTML = '';
      container.appendChild(this._buildContent(data, projectId, { showWeights, compact }));
    } catch (err) {
      container.innerHTML = `
        <div style="padding: 16px; color: #DC2626; font-size: 13px;">
          Failed to load completion: ${err.message}
        </div>
      `;
    }

    return container;
  },

  /**
   * Build the card content from completion data
   */
  _buildContent(data, projectId, options) {
    const { showWeights, compact } = options;
    const wrapper = document.createElement('div');

    if (compact) {
      wrapper.appendChild(this._buildCompactView(data));
    } else {
      wrapper.appendChild(this._buildFullView(data, projectId, showWeights));
    }

    return wrapper;
  },

  _buildCompactView(data) {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; align-items: center; gap: 12px;';

    // Standard completion circle
    const standardCircle = this._createMiniCircle(
      data.standard_completion,
      '#3B82F6',
      'S'
    );

    // Dynamic completion circle (only if weights defined)
    if (data.weights_defined) {
      const dynamicCircle = this._createMiniCircle(
        data.dynamic_completion,
        '#10B981',
        'D'
      );
      container.appendChild(dynamicCircle);
    }

    container.appendChild(standardCircle);

    // Stats text
    const stats = document.createElement('div');
    stats.style.cssText = 'font-size: 11px; color: #6B7280; line-height: 1.4;';
    stats.innerHTML = `
      <div>${data.approved_features}/${data.total_features} approved</div>
      ${data.weights_defined ? '<div style="color: #10B981;">Weighted</div>' : ''}
    `;
    container.appendChild(stats);

    return container;
  },

  _createMiniCircle(percentage, color, label) {
    const size = 36;
    const stroke = 3;
    const radius = (size - stroke) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (percentage / 100) * circumference;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      position: relative;
      width: ${size}px;
      height: ${size}px;
      flex-shrink: 0;
    `;

    wrapper.innerHTML = `
      <svg width="${size}" height="${size}" style="transform: rotate(-90deg);">
        <circle
          cx="${size/2}" cy="${size/2}" r="${radius}"
          fill="none" stroke="#E5E7EB" stroke-width="${stroke}"
        />
        <circle
          cx="${size/2}" cy="${size/2}" r="${radius}"
          fill="none" stroke="${color}" stroke-width="${stroke}"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${offset}"
          stroke-linecap="round"
          style="transition: stroke-dashoffset 0.5s ease;"
        />
      </svg>
      <div style="
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        font-size: 10px;
        font-weight: 700;
        color: ${color};
      ">${Math.round(percentage)}%</div>
    `;

    return wrapper;
  },

  _buildFullView(data, projectId, showWeights) {
    const container = document.createElement('div');

    // Header with title and weights button
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid #E5E7EB;
    `;

    const title = document.createElement('h3');
    title.textContent = 'Project Completion';
    title.style.cssText = 'margin: 0; font-size: 16px; font-weight: 600; color: #111827;';
    header.appendChild(title);

    if (showWeights) {
      const weightsBtn = document.createElement('button');
      weightsBtn.textContent = data.weights_defined ? 'Edit Weights' : 'Set Weights';
      weightsBtn.style.cssText = `
        padding: 6px 12px;
        font-size: 12px;
        background: ${data.weights_defined ? '#10B981' : '#F59E0B'};
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      `;
      weightsBtn.onclick = () => this._openWeightManager(projectId);
      header.appendChild(weightsBtn);
    }

    container.appendChild(header);

    // Main metrics grid
    const metricsGrid = document.createElement('div');
    metricsGrid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    `;

    // Standard completion card
    metricsGrid.appendChild(this._createMetricCard(
      'Standard Completion',
      data.standard_completion,
      '#3B82F6',
      'Simple count-based progress'
    ));

    // Dynamic completion card
    metricsGrid.appendChild(this._createMetricCard(
      'Dynamic Completion',
      data.dynamic_completion,
      '#10B981',
      data.weights_defined ? 'Weight-based calculation' : 'Set weights to enable',
      data.weights_defined
    ));

    // Stats card
    const statsCard = document.createElement('div');
    statsCard.style.cssText = `
      background: #F9FAFB;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    `;
    statsCard.innerHTML = `
      <div style="font-size: 24px; font-weight: 700; color: #111827;">
        ${data.approved_features}
      </div>
      <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">
        of ${data.total_features} features approved
      </div>
    `;
    metricsGrid.appendChild(statsCard);

    container.appendChild(metricsGrid);

    // Layer breakdown (if not empty and has layers)
    if (data.layers && data.layers.length > 0) {
      const breakdown = this._buildLayerBreakdown(data.layers);
      container.appendChild(breakdown);
    }

    return container;
  },

  _createMetricCard(title, value, color, subtitle, enabled = true) {
    const card = document.createElement('div');
    card.style.cssText = `
      background: ${enabled ? '#F9FAFB' : '#F3F4F6'};
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      border: 2px solid ${enabled ? color : 'transparent'};
    `;

    card.innerHTML = `
      <div style="font-size: 28px; font-weight: 700; color: ${enabled ? color : '#9CA3AF'};">
        ${Number(value).toFixed(1)}%
      </div>
      <div style="font-size: 12px; font-weight: 600; color: #374151; margin-top: 4px;">
        ${title}
      </div>
      <div style="font-size: 10px; color: #6B7280; margin-top: 4px;">
        ${subtitle}
      </div>
    `;

    return card;
  },

  _buildLayerBreakdown(layers) {
    const container = document.createElement('div');
    container.style.cssText = 'margin-top: 20px;';

    const header = document.createElement('h4');
    header.textContent = 'Layer Breakdown';
    header.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #374151;';
    container.appendChild(header);

    const table = document.createElement('div');
    table.style.cssText = `
      display: grid;
      gap: 8px;
    `;

    layers.forEach(layer => {
      const row = document.createElement('div');
      row.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 60px 80px 80px;
        gap: 12px;
        align-items: center;
        padding: 8px 12px;
        background: white;
        border-radius: 6px;
        font-size: 12px;
      `;

      row.innerHTML = `
        <div style="font-weight: 500; color: #374151;">${layer.layer_name}</div>
        <div style="color: #6B7280;">${layer.weight.toFixed(0)}%</div>
        <div>
          <div style="
            height: 6px;
            background: #E5E7EB;
            border-radius: 3px;
            overflow: hidden;
          ">
            <div style="
              height: 100%;
              width: ${layer.progress_percentage}%;
              background: #3B82F6;
              border-radius: 3px;
            "></div>
          </div>
        </div>
        <div style="text-align: right; color: #6B7280;">
          ${layer.approved_features}/${layer.total_features}
        </div>
      `;

      table.appendChild(row);
    });

    container.appendChild(table);
    return container;
  },

  _openWeightManager(projectId) {
    // Dispatch custom event for weight manager
    const event = new CustomEvent('open-weight-manager', {
      detail: { projectId }
    });
    document.dispatchEvent(event);
  },

  _defaultStyles() {
    return `
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border: 1px solid #E5E7EB;
    `;
  },

  _compactStyles() {
    return `
      background: #F9FAFB;
      border-radius: 8px;
      padding: 12px;
      border: 1px solid #E5E7EB;
    `;
  }
};

// Export for module systems or attach to window
if (typeof window !== 'undefined') {
  window.CompletionCard = CompletionCard;
}
