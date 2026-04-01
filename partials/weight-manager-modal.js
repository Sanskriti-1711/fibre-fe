// Weight Manager Modal Component
// Usage: WeightManagerModal.open(projectId, { onSave: () => {} })

const WeightManagerModal = {
  modal: null,
  projectId: null,
  callbacks: {},
  weights: {},
  layers: [],
  totalDefined: 0,

  /**
   * Open the weight manager modal
   * @param {string} projectId - Project UUID
   * @param {Object} options - Options including onSave callback
   */
  async open(projectId, options = {}) {
    this.projectId = projectId;
    this.callbacks = options;
    this.weights = {};
    this.layers = [];
    this.totalDefined = 0;

    this._createModal();
    this._showLoading();

    try {
      const data = await window.FiberApi.getLayerWeights(projectId);
      this.layers = data.layers || [];
      this.weights = { ...data.weights };
      this.totalDefined = data.total_defined_weight || 0;
      this._renderContent(data);
    } catch (err) {
      this._showError(err.message);
    }
  },

  close() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
    this.projectId = null;
    this.callbacks = {};
  },

  _createModal() {
    // Remove existing modal if any
    if (this.modal) this.modal.remove();

    this.modal = document.createElement('div');
    this.modal.className = 'weight-manager-modal';
    this.modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    `;

    // Close on backdrop click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    document.body.appendChild(this.modal);
  },

  _showLoading() {
    this.modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 40px;
        max-width: 500px;
        width: 100%;
        text-align: center;
      ">
        <div style="font-size: 14px; color: #6B7280;">Loading layer weights...</div>
      </div>
    `;
  },

  _showError(message) {
    this.modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        width: 100%;
      ">
        <div style="color: #DC2626; margin-bottom: 16px;">Error: ${message}</div>
        <button onclick="WeightManagerModal.close()" style="
          padding: 8px 16px;
          background: #374151;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        ">Close</button>
      </div>
    `;
  },

  _renderContent(data) {
    const undefinedCount = this.layers.filter(l => !l.has_weight).length;
    const remainingWeight = Math.max(0, 100 - this.totalDefined);
    const autoWeight = undefinedCount > 0 ? remainingWeight / undefinedCount : 0;

    const container = document.createElement('div');
    container.style.cssText = `
      background: white;
      border-radius: 12px;
      max-width: 560px;
      width: 100%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px 24px;
      border-bottom: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    header.innerHTML = `
      <div>
        <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">Configure Layer Weights</h3>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #6B7280;">
          Define importance of each layer for dynamic completion calculation
        </p>
      </div>
      <button onclick="WeightManagerModal.close()" style="
        background: none;
        border: none;
        font-size: 20px;
        color: #9CA3AF;
        cursor: pointer;
        padding: 4px;
      ">&times;</button>
    `;
    container.appendChild(header);

    // Info banner
    const infoBanner = document.createElement('div');
    infoBanner.style.cssText = `
      background: #F0FDF4;
      border-left: 4px solid #10B981;
      padding: 12px 16px;
      margin: 16px 24px 0 24px;
      border-radius: 4px;
      font-size: 12px;
      color: #065F46;
    `;
    infoBanner.innerHTML = `
      <strong>Partial weighting supported:</strong> Total can be ≤100%. 
      Undefined layers auto-split remaining ${remainingWeight.toFixed(1)}% equally (${undefinedCount > 0 ? autoWeight.toFixed(1) : 0}% each).
    `;
    container.appendChild(infoBanner);

    // Weight inputs
    const inputsContainer = document.createElement('div');
    inputsContainer.style.cssText = `
      padding: 20px 24px;
      overflow-y: auto;
      flex: 1;
    `;

    const inputsGrid = document.createElement('div');
    inputsGrid.style.cssText = `
      display: grid;
      gap: 12px;
    `;

    this.layers.forEach((layer, index) => {
      const row = document.createElement('div');
      row.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 100px 40px;
        gap: 12px;
        align-items: center;
        padding: 12px;
        background: ${layer.has_weight ? '#F0FDF4' : '#F9FAFB'};
        border-radius: 8px;
        border: 1px solid ${layer.has_weight ? '#A7F3D0' : '#E5E7EB'};
      `;

      const weight = this.weights[layer.layer_id] || 0;

      row.innerHTML = `
        <div>
          <div style="font-size: 13px; font-weight: 500; color: #374151;">${layer.layer_name}</div>
          <div style="font-size: 11px; color: #6B7280;">${layer.layer_id}</div>
        </div>
        <div style="position: relative;">
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value="${weight > 0 ? weight : ''}"
            placeholder="Auto"
            data-layer-id="${layer.layer_id}"
            onchange="WeightManagerModal._handleWeightChange(this)"
            oninput="WeightManagerModal._handleWeightInput(this)"
            style="
              width: 100%;
              padding: 8px 24px 8px 10px;
              border: 1px solid ${layer.has_weight ? '#10B981' : '#D1D5DB'};
              border-radius: 6px;
              font-size: 13px;
              text-align: right;
            "
          />
          <span style="
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 12px;
            color: #9CA3AF;
            pointer-events: none;
          ">%</span>
        </div>
        <div style="text-align: center;">
          ${layer.has_weight 
            ? '<span style="font-size: 11px; color: #10B981; font-weight: 600;">✓</span>'
            : `<span style="font-size: 10px; color: #9CA3AF;">~${autoWeight.toFixed(0)}%</span>`
          }
        </div>
      `;

      inputsGrid.appendChild(row);
    });

    inputsContainer.appendChild(inputsGrid);
    container.appendChild(inputsContainer);

    // Summary footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 16px 24px;
      border-top: 1px solid #E5E7EB;
      background: #F9FAFB;
      border-radius: 0 0 12px 12px;
    `;

    const totalRow = document.createElement('div');
    totalRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    `;

    const validation = this._validateWeights();

    totalRow.innerHTML = `
      <div style="font-size: 13px; color: #374151;">
        <strong>Total Defined:</strong> 
        <span id="totalWeightDisplay" style="font-weight: 600; color: ${validation.isValid ? '#10B981' : '#DC2626'};">
          ${this.totalDefined.toFixed(1)}%
        </span>
        ${!validation.isValid ? `<span style="color: #DC2626; margin-left: 8px; font-size: 12px;">${validation.message}</span>` : ''}
      </div>
      <div style="font-size: 12px; color: #6B7280;">
        Remaining: <span id="remainingWeightDisplay">${remainingWeight.toFixed(1)}%</span>
      </div>
    `;
    footer.appendChild(totalRow);

    // Action buttons
    const actions = document.createElement('div');
    actions.style.cssText = `
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    `;

    actions.innerHTML = `
      <button onclick="WeightManagerModal._resetToEqual()" style="
        padding: 8px 16px;
        font-size: 13px;
        background: white;
        border: 1px solid #D1D5DB;
        border-radius: 6px;
        cursor: pointer;
        color: #374151;
      ">Reset to Equal</button>
      <button onclick="WeightManagerModal._clearAll()" style="
        padding: 8px 16px;
        font-size: 13px;
        background: white;
        border: 1px solid #D1D5DB;
        border-radius: 6px;
        cursor: pointer;
        color: #374151;
      ">Clear All</button>
      <button 
        onclick="WeightManagerModal._save()" 
        id="saveWeightsBtn"
        style="
          padding: 8px 20px;
          font-size: 13px;
          background: ${validation.isValid ? '#10B981' : '#9CA3AF'};
          color: white;
          border: none;
          border-radius: 6px;
          cursor: ${validation.isValid ? 'pointer' : 'not-allowed'};
        "
        ${!validation.isValid ? 'disabled' : ''}
      ">Save Weights</button>
    `;

    footer.appendChild(actions);
    container.appendChild(footer);

    this.modal.innerHTML = '';
    this.modal.appendChild(container);
  },

  _handleWeightInput(input) {
    const layerId = input.dataset.layerId;
    let value = parseFloat(input.value);
    
    if (isNaN(value) || value < 0) value = 0;
    if (value > 100) value = 100;
    
    this.weights[layerId] = value;
    this._updateTotal();
  },

  _handleWeightChange(input) {
    this._handleWeightInput(input);
    this._refreshUI();
  },

  _updateTotal() {
    this.totalDefined = Object.values(this.weights).reduce((sum, w) => sum + (parseFloat(w) || 0), 0);
    this._updateSummaryDisplay();
  },

  _updateSummaryDisplay() {
    const totalDisplay = document.getElementById('totalWeightDisplay');
    const remainingDisplay = document.getElementById('remainingWeightDisplay');
    const saveBtn = document.getElementById('saveWeightsBtn');

    if (totalDisplay) {
      const validation = this._validateWeights();
      totalDisplay.textContent = `${this.totalDefined.toFixed(1)}%`;
      totalDisplay.style.color = validation.isValid ? '#10B981' : '#DC2626';
    }

    if (remainingDisplay) {
      const remaining = Math.max(0, 100 - this.totalDefined);
      remainingDisplay.textContent = `${remaining.toFixed(1)}%`;
    }

    if (saveBtn) {
      const validation = this._validateWeights();
      saveBtn.disabled = !validation.isValid;
      saveBtn.style.background = validation.isValid ? '#10B981' : '#9CA3AF';
      saveBtn.style.cursor = validation.isValid ? 'pointer' : 'not-allowed';
    }
  },

  _refreshUI() {
    // Update row styles based on weight presence
    const rows = this.modal.querySelectorAll('[data-layer-id]');
    rows.forEach(input => {
      const layerId = input.dataset.layerId;
      const hasWeight = this.weights[layerId] > 0;
      const row = input.closest('div[style*="grid-template-columns"]');
      
      if (row) {
        row.style.background = hasWeight ? '#F0FDF4' : '#F9FAFB';
        row.style.borderColor = hasWeight ? '#A7F3D0' : '#E5E7EB';
      }
      
      input.style.borderColor = hasWeight ? '#10B981' : '#D1D5DB';
    });

    this._updateSummaryDisplay();
  },

  _validateWeights() {
    if (this.totalDefined > 100) {
      return { isValid: false, message: `Total exceeds 100%` };
    }
    return { isValid: true, message: '' };
  },

  _resetToEqual() {
    const equalWeight = this.layers.length > 0 ? (100 / this.layers.length) : 0;
    
    this.layers.forEach(layer => {
      this.weights[layer.layer_id] = equalWeight;
    });
    
    this.totalDefined = 100;
    this._renderContent({ layers: this.layers });
  },

  _clearAll() {
    this.weights = {};
    this.totalDefined = 0;
    this._renderContent({ layers: this.layers });
  },

  async _save() {
    const validation = this._validateWeights();
    if (!validation.isValid) return;

    const saveBtn = document.getElementById('saveWeightsBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      // Filter out zero weights
      const weightsToSave = {};
      Object.entries(this.weights).forEach(([layerId, weight]) => {
        if (weight > 0) {
          weightsToSave[layerId] = weight;
        }
      });

      await window.FiberApi.updateLayerWeights(this.projectId, weightsToSave);
      
      if (this.callbacks.onSave) {
        this.callbacks.onSave();
      }
      
      this.close();
    } catch (err) {
      alert('Failed to save weights: ' + err.message);
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Weights';
      }
    }
  }
};

// Listen for custom events from CompletionCard
document.addEventListener('open-weight-manager', (e) => {
  const { projectId } = e.detail;
  WeightManagerModal.open(projectId, {
    onSave: () => {
      // Refresh page or trigger completion reload
      window.location.reload();
    }
  });
});

// Export
if (typeof window !== 'undefined') {
  window.WeightManagerModal = WeightManagerModal;
}
