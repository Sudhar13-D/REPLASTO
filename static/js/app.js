// Replasto Main Single-Page Application Controller
import { API } from "./api.js";
import { showToast, openModal, closeModal, formatKg, formatDate, renderStatusChip, renderStreamBadge } from "./components.js";

import { renderOverview } from "./pages/overview.js";
import { renderBatches } from "./pages/batches.js";
import { renderCollection } from "./pages/collection.js";
import { renderReconciliation } from "./pages/reconciliation.js";
import { renderAnomalies } from "./pages/anomalies.js";
import { renderEconomics } from "./pages/economics.js";
import { renderIntegrity } from "./pages/integrity.js";
import { renderOffline } from "./pages/offline.js";
import { renderSettings } from "./pages/settings.js";
import { initScanner, openScanner } from "./scanner.js";

const routes = {
  "overview": { title: "Executive Overview", render: renderOverview },
  "batches": { title: "Bale Batches Register", render: renderBatches },
  "collection": { title: "Collection & Suggested Routes", render: renderCollection },
  "reconciliation": { title: "Weighbridge Reconciliation", render: renderReconciliation },
  "anomalies": { title: "Isolation Forest Anomalies", render: renderAnomalies },
  "economics": { title: "Economics & Realization", render: renderEconomics },
  "integrity": { title: "Chain Integrity & Calibration", render: renderIntegrity },
  "offline": { title: "Offline Simulation", render: renderOffline },
  "settings": { title: "System Assumptions & Settings", render: renderSettings }
};

export const appState = {
  currentPage: "overview",
  dateRange: "ALL",
  activeBatchId: null,
  scannedBale: null
};

document.addEventListener("DOMContentLoaded", async () => {
  initNavigation();
  initOfflineMode();
  initTopBarControls();
  initBatchDrawer();
  initModals();
  initGlobalReference();
  initScanner();

  // Navigate to initial page
  navigateTo("overview");
});

function initNavigation() {
  const sidebar = document.getElementById("sidebar");
  const navItems = document.querySelectorAll(".nav-item");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const page = item.getAttribute("data-page");
      if (!page) {
        if (item.getAttribute("data-action") === "scan") {
          openScanner();
          if (window.innerWidth <= 1024) {
            sidebar.classList.remove("open");
          }
        }
        return;
      }
      navigateTo(page);

      // On mobile, close sidebar after clicking
      if (window.innerWidth <= 1024) {
        sidebar.classList.remove("open");
      }
    });
  });

  // Mobile menu button
  const menuBtn = document.getElementById("menuToggleBtn");
  menuBtn?.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

export function navigateTo(pageKey) {
  if (!routes[pageKey]) pageKey = "overview";
  appState.currentPage = pageKey;

  // Update navigation items active state
  document.querySelectorAll(".nav-item").forEach(el => {
    if (el.getAttribute("data-page") === pageKey) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });

  // Update top bar page title
  const titleEl = document.getElementById("topPageTitle");
  if (titleEl) {
    titleEl.textContent = routes[pageKey].title;
  }

  // Render Page Content
  const container = document.getElementById("appView");
  if (container) {
    container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--color-text-dim);">Loading view...</div>`;
    routes[pageKey].render(container, appState);
  }
}

function initOfflineMode() {
  const toggle = document.getElementById("offlineModeToggle");
  const badge = document.getElementById("offlineQueueBadge");

  function updateBadge(count) {
    if (!badge) return;
    badge.textContent = `Queued: ${count}`;
    badge.style.display = count > 0 || API.isOfflineSimulated() ? "inline-block" : "none";
  }

  if (toggle) {
    toggle.checked = API.isOfflineSimulated();
    toggle.addEventListener("change", (e) => {
      const isOff = e.target.checked;
      API.setOfflineSimulated(isOff);
      updateBadge(API.getOfflineQueue().length);
      showToast(`Offline simulation ${isOff ? 'ENABLED' : 'DISABLED'}`, isOff ? "warning" : "success");
      
      // If currently on offline page, re-render
      if (appState.currentPage === "offline") {
        navigateTo("offline");
      }
    });
  }

  window.addEventListener("offline-queue-updated", (e) => {
    updateBadge(e.detail.count);
  });

  window.addEventListener("offline-mode-changed", (e) => {
    if (toggle) toggle.checked = e.detail.offline;
    updateBadge(API.getOfflineQueue().length);
  });

  updateBadge(API.getOfflineQueue().length);
}

function initTopBarControls() {
  const dateRangeSelect = document.getElementById("globalDateRange");
  dateRangeSelect?.addEventListener("change", (e) => {
    appState.dateRange = e.target.value;
    // Re-render current page
    navigateTo(appState.currentPage);
  });

  // Listen for settings change
  window.addEventListener("settings-updated", () => {
    // If on a page affected by settings, refresh it
    navigateTo(appState.currentPage);
  });
}

function initBatchDrawer() {
  const drawer = document.getElementById("batchDrawer");
  const backdrop = document.getElementById("drawerBackdrop");
  const closeBtn = document.getElementById("drawerCloseBtn");

  function closeDrawer() {
    drawer.classList.remove("open");
    backdrop.classList.remove("active");
    appState.activeBatchId = null;
  }

  closeBtn?.addEventListener("click", closeDrawer);
  backdrop?.addEventListener("click", closeDrawer);

  window.addEventListener("open-batch-drawer", async (e) => {
    const batchId = e.detail.batchId;
    const baleId = e.detail.baleId;
    if (!batchId && !baleId) return;

    appState.activeBatchId = batchId || baleId;
    const body = document.getElementById("drawerBody");
    const title = document.getElementById("drawerTitle");

    drawer.classList.add("open");
    backdrop.classList.add("active");

    title.textContent = "Loading Bale...";
    body.innerHTML = `<div style="text-align:center; padding:40px; color:var(--color-text-dim);">Fetching tamper-evident cryptographic record...</div>`;

    try {
      let data;
      if (typeof batchId === "number" || (typeof batchId === "string" && /^\d+$/.test(batchId))) {
        data = await API.getBatchDetail(batchId);
      } else {
        data = await API.lookupBatch(batchId || baleId);
      }
      title.textContent = `Bale: ${data.bale_id}`;

      const photoUrl = data.photo_path || "/static/assets/bales/default.svg";
      const qrUrl = `/api/batches/${data.id}/qr`;

      body.innerHTML = `
        <!-- Bale Camera Snapshot -->
        <div style="border:1px solid var(--color-border); border-radius:8px; overflow:hidden; background:#1C2E24; height:180px; position:relative;">
          <img src="${photoUrl}" alt="Node Camera Bale Snapshot" style="width:100%; height:100%; object-fit:contain;" onerror="this.src='/static/assets/bales/default.svg'">
          <div style="position:absolute; bottom:6px; left:8px; background:rgba(0,0,0,0.6); color:#4ADE80; font-family:var(--font-mono); font-size:10px; padding:2px 6px; border-radius:3px;">
            HARDWARE CAMERA PLATFORM CAPTURE
          </div>
        </div>

        <!-- Key Characteristics -->
        <div>
          <div style="font-size:12px; font-weight:700; color:var(--color-text-muted); text-transform:uppercase; margin-bottom:6px;">
            Node Telemetry & Mass
          </div>
          <div class="kv-row"><span class="kv-key">Bale ID</span><span class="kv-val">${data.bale_id}</span></div>
          <div class="kv-row"><span class="kv-key">Village Shed</span><span class="kv-val">${data.shed_name || data.village_id} (${data.village_id})</span></div>
          <div class="kv-row"><span class="kv-key">Stream</span><span class="kv-val">${renderStreamBadge(data.stream)}</span></div>
          <div class="kv-row"><span class="kv-key">Scale Weight (Node)</span><span class="kv-val" style="font-size:15px; color:var(--color-primary);">${formatKg(data.kg_node)}</span></div>
          <div class="kv-row"><span class="kv-key">Timestamp</span><span class="kv-val">${formatDate(data.created_at)}</span></div>
          <div class="kv-row"><span class="kv-key">Operator</span><span class="kv-val">${data.operator_id}</span></div>
          <div class="kv-row"><span class="kv-key">Record Version</span><span class="kv-val">Version ${data.version}</span></div>
          <div class="kv-row"><span class="kv-key">Status</span><span class="kv-val">${renderStatusChip(data.status)}</span></div>
        </div>

        <!-- Destination Weighbridge Reconciliation -->
        <div style="background:var(--color-surface-subtle); padding:12px; border-radius:8px; border:1px solid var(--color-border);">
          <div style="font-size:12px; font-weight:700; color:var(--color-text-main); margin-bottom:8px; display:flex; justify-content:space-between;">
            <span>Weighbridge Slip Reconciliation</span>
            ${renderStatusChip(data.status)}
          </div>
          <div class="kv-row"><span class="kv-key">Buyer Destination</span><span class="kv-val">${data.buyer_name || "Not yet dispatched"}</span></div>
          <div class="kv-row"><span class="kv-key">Slip Reference</span><span class="kv-val"><code>${data.slip_ref || "Awaiting slip"}</code></span></div>
          <div class="kv-row"><span class="kv-key">Buyer Scale Weight</span><span class="kv-val">${data.kg_buyer ? `${data.kg_buyer} kg` : "—"}</span></div>
          <div class="kv-row"><span class="kv-key">Discrepancy Variance %</span><span class="kv-val" style="color:${data.is_within_tolerance ? 'var(--color-success)' : 'var(--color-danger)'};">${data.variance_pct !== null ? `${data.variance_pct}% (Tolerance: ${data.tolerance_pct}%)` : "—"}</span></div>
        </div>

        <!-- Cryptographic Proof & QR Code -->
        <div style="border:1px solid var(--color-border); border-radius:8px; padding:12px;">
          <div style="font-size:12px; font-weight:700; color:var(--color-text-muted); text-transform:uppercase; margin-bottom:8px;">
            Tamper-Evident SHA-256 Seal & QR
          </div>
          <div style="display:flex; gap:12px; align-items:center;">
            <div style="width:100px; height:100px; border:1px solid var(--color-border); border-radius:6px; overflow:hidden; flex-shrink:0;">
              <img src="${qrUrl}" alt="Tamper-evident bale QR" style="width:100%; height:100%;">
            </div>
            <div style="font-size:11px; overflow:hidden;">
              <div style="color:var(--color-text-dim); margin-bottom:2px;">Current Hash $H_n$:</div>
              <code style="word-break:break-all; font-size:10px; display:block; margin-bottom:6px;">${data.hash}</code>
              <div style="color:var(--color-text-dim); margin-bottom:2px;">Previous Hash $H_{n-1}$:</div>
              <code style="word-break:break-all; font-size:10px; display:block;">${data.prev_hash.substring(0, 24)}...</code>
            </div>
          </div>
        </div>

        <!-- Version Audit Trail -->
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-size:12px; font-weight:700; color:var(--color-text-muted); text-transform:uppercase;">
              Version Audit History (${data.version_history.length})
            </div>
            <button class="btn btn-secondary btn-sm" id="drawerEditBtn">
              + New Version
            </button>
          </div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${data.version_history.map(v => `
              <div style="padding:8px 10px; background:${v.version === data.version ? 'var(--color-primary-light)' : 'var(--color-surface-subtle)'}; border-radius:6px; border:1px solid ${v.version === data.version ? 'var(--color-primary-border)' : 'var(--color-border)'}; font-size:12px;">
                <div style="display:flex; justify-content:space-between; font-weight:700;">
                  <span>Version ${v.version} (${v.stream} &bull; ${v.kg_node} kg)</span>
                  <span style="font-size:10px; color:var(--color-text-dim);">${formatDate(v.created_at)}</span>
                </div>
                ${v.edit_reason ? `<div style="font-size:11px; color:var(--color-text-main); margin-top:2px;">Audit Note: <em>${v.edit_reason}</em></div>` : `<div style="font-size:11px; color:var(--color-text-dim); margin-top:2px;">Genesis field weighment</div>`}
              </div>
            `).join("")}
          </div>
        </div>
      `;

      // Attach Edit Version Button Listener
      document.getElementById("drawerEditBtn")?.addEventListener("click", () => {
        document.getElementById("editBatchId").value = data.id;
        document.getElementById("editStream").value = data.stream;
        document.getElementById("editKg").value = data.kg_node;
        document.getElementById("editReason").value = "";
        openModal("editVersionModal");
      });

    } catch (err) {
      body.innerHTML = `<div style="color:var(--color-danger);">${err.message}</div>`;
    }
  });
}

function initModals() {
  // Quick Add Batch Button
  const quickBtn = document.getElementById("quickAddBatchBtn");
  quickBtn?.addEventListener("click", () => openModal("addBatchModal"));

  document.getElementById("closeAddBatchModal")?.addEventListener("click", () => closeModal("addBatchModal"));
  document.getElementById("cancelAddBatch")?.addEventListener("click", () => closeModal("addBatchModal"));

  document.getElementById("closeEditVersionModal")?.addEventListener("click", () => closeModal("editVersionModal"));
  document.getElementById("cancelEditVersion")?.addEventListener("click", () => closeModal("editVersionModal"));

  // Add Batch Form Submit
  const addForm = document.getElementById("addBatchForm");
  addForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("submitAddBatch");
    btn.disabled = true;
    btn.textContent = "Saving...";

    const payload = {
      village_id: document.getElementById("newBatchVillage").value,
      stream: document.getElementById("newBatchStream").value,
      kg_node: parseFloat(document.getElementById("newBatchKg").value),
      operator_id: document.getElementById("newBatchOperator").value
    };

    try {
      await API.createBatch(payload);
      closeModal("addBatchModal");
      addForm.reset();
      // Re-render current page
      navigateTo(appState.currentPage);
    } catch (err) {
      showToast(`Error recording batch: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Weighment";
    }
  });

  // Edit Version Form Submit
  const editForm = document.getElementById("editVersionForm");
  editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const batchId = parseInt(document.getElementById("editBatchId").value);
    const newStream = document.getElementById("editStream").value;
    const newKg = parseFloat(document.getElementById("editKg").value);
    const reason = document.getElementById("editReason").value;

    const payload = {
      batch_id: batchId,
      stream: newStream,
      kg_node: newKg,
      edit_reason: reason,
      operator_id: "OP-SUPERVISOR (District Lead)"
    };

    try {
      await API.editBatchVersion(payload);
      closeModal("editVersionModal");
      // Refresh drawer
      window.dispatchEvent(new CustomEvent("open-batch-drawer", { detail: { batchId } }));
      // Refresh current page
      navigateTo(appState.currentPage);
    } catch (err) {
      showToast(`Error creating version: ${err.message}`, "error");
    }
  });
}

async function initGlobalReference() {
  try {
    const ref = await API.getReference();
    const villageSelect = document.getElementById("newBatchVillage");
    if (villageSelect && ref.sheds) {
      villageSelect.innerHTML = ref.sheds.map(s => `
        <option value="${s.id}">${s.id}: ${s.name}</option>
      `).join("");
    }
  } catch (err) {
    console.error("Reference load error", err);
  }
}
