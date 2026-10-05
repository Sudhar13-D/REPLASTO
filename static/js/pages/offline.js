import { API } from "../api.js";
import { formatKg, formatDate, showToast } from "../components.js";

export async function renderOffline(container, state) {
  const isOffline = API.isOfflineSimulated();
  const queue = API.getOfflineQueue();

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
      <div>
        <h2 style="font-size:20px; font-weight:800; color:var(--color-text-main);">Offline-First Hardware Simulation</h2>
        <p style="font-size:12px; color:var(--color-text-muted);">
          Store-and-forward telemetry demonstration for rural village sheds with intermittent GSM cellular connectivity
        </p>
      </div>
      <div>
        <span class="chip ${isOffline ? 'chip-flagged' : 'chip-ok'}" id="offlineHubStatusChip">
          ${isOffline ? '● SIMULATING OFFLINE (DISCONNECTED)' : '● CONNECTED (ONLINE)'}
        </span>
      </div>
    </div>

    <!-- Offline Mode Control Card -->
    <div class="card" style="border-left:4px solid var(--color-accent); margin-bottom:24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div>
          <div style="font-weight:800; font-size:16px; color:var(--color-text-main);">
            Network Link State: <span id="offlineStateWord" style="color:${isOffline ? 'var(--color-accent)' : 'var(--color-success)'};">${isOffline ? 'Offline' : 'Online'}</span>
          </div>
          <div style="font-size:12px; color:var(--color-text-dim); margin-top:4px;">
            When offline, bale weighments from load cells are saved to local persistent storage (localStorage queue). Reconnecting syncs them in sequential order.
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px;">
          <label class="toggle-switch" style="width:48px; height:26px;">
            <input type="checkbox" id="offlineHubToggle" ${isOffline ? 'checked' : ''}>
            <span class="toggle-slider" style="border-radius:26px;"></span>
          </label>
          <span style="font-weight:700; font-size:13px;">Simulate Field Disconnect</span>
        </div>
      </div>
    </div>

    <!-- Two-column Layout: Offline Form & Queued Records -->
    <div style="display:grid; grid-template-columns:1fr 1.3fr; gap:24px;">
      
      <!-- Quick Record Form in Offline Mode -->
      <div class="card" style="margin-bottom:0;">
        <div class="card-header">
          <div>
            <div class="card-title">Record Weighment from Shed Scale</div>
            <div class="card-subtitle">Simulates ESP32/RPi logging bale into local buffer</div>
          </div>
        </div>
        <form id="offlineRecordForm">
          <div class="form-group">
            <label for="offShedSelect">Village Shed Node</label>
            <select class="form-control" id="offShedSelect" required>
              <option value="SHED-01">SHED-01: Ramanagara South Shed</option>
              <option value="SHED-02">SHED-02: Kanikere Gram Panchayat Shed</option>
              <option value="SHED-03">SHED-03: Bidadi Rural Material Shed</option>
              <option value="SHED-04">SHED-04: Harohalli Cluster Center</option>
              <option value="SHED-05">SHED-05: Kaggalipura Waste Depot</option>
              <option value="SHED-06">SHED-06: Magadi North Transit Shed</option>
            </select>
          </div>
          <div class="form-group">
            <label for="offStreamSelect">Plastic Material Stream</label>
            <select class="form-control" id="offStreamSelect" required>
              <option value="MLP">MLP (Multi-Layer Plastic)</option>
              <option value="HDPE">HDPE (High-Density Polyethylene)</option>
              <option value="LDPE">LDPE (Low-Density Film)</option>
              <option value="PET">PET (Bottles & Containers)</option>
              <option value="Mixed">Mixed Plastics</option>
            </select>
          </div>
          <div class="form-group">
            <label for="offMassInput">Scale Weight Mass (kg)</label>
            <input type="number" step="0.1" min="1" max="250" class="form-control" id="offMassInput" value="54.2" required>
          </div>
          <div class="form-group">
            <label for="offOperatorInput">Operator</label>
            <input type="text" class="form-control" id="offOperatorInput" value="OP-102 (Sunita)" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%; margin-top:8px;">
            Record Bale
          </button>
        </form>
      </div>

      <!-- Current Local Device Queue Table -->
      <div class="card" style="margin-bottom:0; display:flex; flex-direction:column;">
        <div class="card-header" style="flex-wrap:wrap; gap:10px;">
          <div>
            <div class="card-title">
              Local Hardware Queue
              <span class="offline-queue-badge" id="queueCountBadge">Queued: ${queue.length}</span>
            </div>
            <div class="card-subtitle">Batches pending cryptographic uplink to district server</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary btn-sm" id="syncNowBtn" ${queue.length === 0 ? 'disabled' : ''}>
              Sync Queue Now
            </button>
            <button class="btn btn-secondary btn-sm" id="clearQueueBtn" ${queue.length === 0 ? 'disabled' : ''}>
              Clear
            </button>
          </div>
        </div>

        <div style="flex:1; overflow-y:auto; max-height:360px;">
          <div class="table-responsive" style="border:none;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Queue #</th>
                  <th>Shed</th>
                  <th>Stream</th>
                  <th>Weight</th>
                  <th>Queued Timestamp</th>
                </tr>
              </thead>
              <tbody id="queueTableBody">
                <!-- Injected via helper -->
              </tbody>
            </table>
          </div>
        </div>

        <div style="padding:10px 14px; background:var(--color-surface-subtle); border-top:1px solid var(--color-border); font-size:11px; color:var(--color-text-dim);">
          When synced, batches are sequentially hashed starting from the latest server chain head $H_{last}$.
        </div>
      </div>

    </div>
  `;

  function renderQueueList() {
    const currentQueue = API.getOfflineQueue();
    const countBadge = document.getElementById("queueCountBadge");
    const syncBtn = document.getElementById("syncNowBtn");
    const clearBtn = document.getElementById("clearQueueBtn");

    if (countBadge) countBadge.textContent = `Queued: ${currentQueue.length}`;
    if (syncBtn) syncBtn.disabled = currentQueue.length === 0;
    if (clearBtn) clearBtn.disabled = currentQueue.length === 0;

    const tbody = document.getElementById("queueTableBody");
    if (!tbody) return;

    if (currentQueue.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:30px; color:var(--color-text-dim);">
            Device queue is empty. Turn on "Simulate Field Disconnect" and click "Record Bale" to queue items.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = currentQueue.map((item, idx) => `
      <tr>
        <td style="font-family:var(--font-mono); font-size:11px;">#${idx + 1}</td>
        <td style="font-weight:600;">${item.village_id}</td>
        <td><span class="chip chip-stream" style="font-size:10px;">${item.stream}</span></td>
        <td style="font-weight:700;">${item.kg_node} kg</td>
        <td style="font-size:11px; color:var(--color-text-muted);">${formatDate(item.queued_at)}</td>
      </tr>
    `).join("");
  }

  renderQueueList();

  // Toggle switch listener
  const toggle = document.getElementById("offlineHubToggle");
  toggle?.addEventListener("change", (e) => {
    const isNowOffline = e.target.checked;
    API.setOfflineSimulated(isNowOffline);
    
    // Sync header toggle if present
    const headerToggle = document.getElementById("offlineModeToggle");
    if (headerToggle) headerToggle.checked = isNowOffline;

    document.getElementById("offlineHubStatusChip").className = `chip ${isNowOffline ? 'chip-flagged' : 'chip-ok'}`;
    document.getElementById("offlineHubStatusChip").textContent = isNowOffline ? '● SIMULATING OFFLINE (DISCONNECTED)' : '● CONNECTED (ONLINE)';
    document.getElementById("offlineStateWord").textContent = isNowOffline ? 'Offline' : 'Online';
    document.getElementById("offlineStateWord").style.color = isNowOffline ? 'var(--color-accent)' : 'var(--color-success)';

    showToast(`Simulation mode switched to: ${isNowOffline ? 'OFFLINE' : 'ONLINE'}`, isNowOffline ? 'warning' : 'success');
  });

  // Offline form submit
  document.getElementById("offlineRecordForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      village_id: document.getElementById("offShedSelect").value,
      stream: document.getElementById("offStreamSelect").value,
      kg_node: parseFloat(document.getElementById("offMassInput").value),
      operator_id: document.getElementById("offOperatorInput").value,
      created_at: new Date().toISOString().replace("T", " ").substring(0, 19)
    };

    await API.createBatch(data);
    renderQueueList();
    
    // Reset weight with slight random variation for convenience
    document.getElementById("offMassInput").value = (50 + Math.random() * 20).toFixed(1);
  });

  // Sync queue now button
  document.getElementById("syncNowBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("syncNowBtn");
    btn.disabled = true;
    btn.textContent = "Syncing...";
    try {
      await API.syncOfflineQueue();
      renderQueueList();
    } catch (err) {
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = "Sync Queue Now";
    }
  });

  // Clear queue button
  document.getElementById("clearQueueBtn")?.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear the local un-synced offline queue?")) {
      API.clearOfflineQueue();
      renderQueueList();
      showToast("Offline queue cleared.", "warning");
    }
  });
}
