// Completion Card Component for displaying project completion metrics
// Usage: CompletionCard.create(projectId, containerElement)
//
// Styled by the design system classes in css/main.css (.ds-completion-*),
// so it matches the rest of the platform.

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
    container.className = compact ? 'ds-completion ds-completion--compact' : 'ds-completion';

    // Loading state
    container.innerHTML = `
      <div class="ds-completion-loading">
        Loading completion metrics...
      </div>
    `;

    try {
      const data = await window.FiberApi.getProjectCompletion(projectId);
      container.innerHTML = '';
      container.appendChild(this._buildContent(data, projectId, { showWeights, compact }));
    } catch (err) {
      container.innerHTML = `
        <div class="ds-completion-error">
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
    container.className = 'ds-completion-compact';

    // Dynamic completion circle (only if weights defined)
    if (data.weights_defined) {
      const dynamicCircle = this._createMiniCircle(
        data.dynamic_completion,
        '#10B981',
        'D'
      );
      container.appendChild(dynamicCircle);
    }

    // Standard completion circle
    const standardCircle = this._createMiniCircle(
      data.standard_completion,
      '#3B82F6',
      'S'
    );
    container.appendChild(standardCircle);

    // Stats text
    const stats = document.createElement('div');
    stats.className = 'ds-completion-compact-stats';
    stats.innerHTML = `
      <div>${data.approved_features}/${data.total_features} approved</div>
      ${data.weights_defined ? '<div class="ds-completion-weighted">Weighted</div>' : ''}
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
    wrapper.className = 'ds-completion-mini';

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
      <div class="ds-completion-mini-label" style="color: ${color};">${Math.round(percentage)}%</div>
    `;

    return wrapper;
  },

  _buildFullView(data, projectId, showWeights) {
    const container = document.createElement('div');

    // Header with title and weights button
    const header = document.createElement('div');
    header.className = 'ds-completion-header';

    const title = document.createElement('h3');
    title.className = 'ds-completion-title';
    title.textContent = 'Project Completion';
    header.appendChild(title);

    if (showWeights) {
      const weightsBtn = document.createElement('button');
      weightsBtn.className = 'ds-completion-weights-btn';
      weightsBtn.textContent = data.weights_defined ? 'Edit Weights' : 'Set Weights';
      weightsBtn.style.background = data.weights_defined ? '#10B981' : '#F59E0B';
      weightsBtn.onclick = () => this._openWeightManager(projectId);
      header.appendChild(weightsBtn);
    }

    container.appendChild(header);

    // Main metrics grid
    const metricsGrid = document.createElement('div');
    metricsGrid.className = 'ds-completion-metrics';

    metricsGrid.appendChild(this._createMetricCard(
      'Standard Completion',
      data.standard_completion,
      '#3B82F6',
      'Simple count-based progress'
    ));

    metricsGrid.appendChild(this._createMetricCard(
      'Dynamic Completion',
      data.dynamic_completion,
      '#10B981',
      data.weights_defined ? 'Weight-based calculation' : 'Set weights to enable',
      data.weights_defined
    ));

    // Stats card
    const statsCard = document.createElement('div');
    statsCard.className = 'ds-completion-stats';
    statsCard.innerHTML = `
      <div class="ds-completion-stats-value">${data.approved_features}</div>
      <div class="ds-completion-stats-label">of ${data.total_features} features approved</div>
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
    card.className = 'ds-completion-metric';
    card.style.borderColor = enabled ? color : 'transparent';

    card.innerHTML = `
      <div class="ds-completion-metric-value" style="color: ${enabled ? color : '#9CA3AF'};">${Number(value).toFixed(1)}%</div>
      <div class="ds-completion-metric-title">${title}</div>
      <div class="ds-completion-metric-subtitle">${subtitle}</div>
    `;

    return card;
  },

  _buildLayerBreakdown(layers) {
    const container = document.createElement('div');
    container.className = 'ds-completion-breakdown';

    const header = document.createElement('h4');
    header.className = 'ds-completion-breakdown-title';
    header.textContent = 'Layer Breakdown';
    container.appendChild(header);

    const table = document.createElement('div');
    table.className = 'ds-completion-breakdown-list';

    layers.forEach(layer => {
      const row = document.createElement('div');
      row.className = 'ds-completion-breakdown-row';

      row.innerHTML = `
        <div class="ds-completion-breakdown-name">${layer.layer_name}</div>
        <div class="ds-completion-breakdown-weight">${layer.weight.toFixed(0)}%</div>
        <div class="ds-completion-breakdown-track">
          <div class="ds-completion-breakdown-fill" style="width: ${layer.progress_percentage}%; background: #3B82F6;"></div>
        </div>
        <div class="ds-completion-breakdown-count">${layer.approved_features}/${layer.total_features}</div>
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
  }
};

// Export for module systems or attach to window
if (typeof window !== 'undefined') {
  window.CompletionCard = CompletionCard;
}
