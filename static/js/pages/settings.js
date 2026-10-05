import { API } from "../api.js";
import { showToast } from "../components.js";

export async function renderSettings(container, state) {
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
      <div>
        <h2 style="font-size:20px; font-weight:800; color:var(--color-text-main);">System Configuration & Assumptions</h2>
        <p style="font-size:12px; color:var(--color-text-muted);">
          Operational thresholds and economic parameter assumptions governing reconciliation and route planning
        </p>
      </div>
      <div>
        <span class="chip chip-assumption">ALL PARAMETERS ARE EXPLICIT ASSUMPTIONS</span>
      </div>
    </div>

    <form id="settingsForm">
      
      <!-- Section 1: Reconciliation & Verification Thresholds -->
      <div class="card" style="margin-bottom:20px;">
        <div class="card-header">
          <div>
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
              Reconciliation Variance Tolerance (T)
            </div>
            <div class="card-subtitle">
              Delivered weighments with percentage discrepancy |W_node − W_buyer| / W_node &gt; T are automatically flagged
            </div>
          </div>
          <span class="chip chip-assumption">assumption</span>
        </div>

        <div style="max-width:400px;">
          <div class="form-group">
            <label for="setting_tolerance_pct">Weight Variance Tolerance Threshold T (%)</label>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="number" step="0.1" min="0.1" max="25" class="form-control" id="setting_tolerance_pct" required style="font-size:16px; font-weight:700;">
              <span style="font-weight:700; color:var(--color-text-dim);">%</span>
            </div>
            <div class="form-helper">
              Standard district default: <strong>3.0%</strong>. Changing this value immediately re-evaluates all batch statuses across Batches, Overview, and Reconciliation registers.
            </div>
          </div>
        </div>
      </div>

      <!-- Section 2: Shed Collection & Logistics Assumptions -->
      <div class="card" style="margin-bottom:20px;">
        <div class="card-header">
          <div>
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
              Collection Routing & Dispatch Thresholds
            </div>
            <div class="card-subtitle">
              Controls when sheds become eligible for vehicle collection runs
            </div>
          </div>
          <span class="chip chip-assumption">assumption</span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px;">
          <div class="form-group">
            <label for="setting_fill_threshold_pct">Shed Collection Trigger Threshold (%)</label>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="number" step="1" min="10" max="95" class="form-control" id="setting_fill_threshold_pct" required>
              <span style="font-weight:700; color:var(--color-text-dim);">%</span>
            </div>
            <div class="form-helper">Only sheds with fill percentage &ge; this value are sequenced for pickup. Default: 70%.</div>
          </div>

          <div class="form-group">
            <label for="setting_vehicle_capacity_kg">Default Vehicle Payload Capacity (kg)</label>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="number" step="100" min="500" max="15000" class="form-control" id="setting_vehicle_capacity_kg" required>
              <span style="font-weight:700; color:var(--color-text-dim);">kg</span>
            </div>
            <div class="form-helper">Maximum single-trip payload constraint (e.g. 3,500 kg for medium truck).</div>
          </div>
        </div>
      </div>

      <!-- Section 3: Cost & Valuation Assumptions -->
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header">
          <div>
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              Financial & Operational Assumptions
            </div>
            <div class="card-subtitle">
              Rates used to compute per-batch net realization and dispatch profitability
            </div>
          </div>
          <span class="chip chip-assumption">assumption</span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:18px; margin-bottom:16px;">
          <div class="form-group">
            <label for="setting_handling_cost_per_kg">Bale Handling Cost (₹/kg)</label>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:700; color:var(--color-text-dim);">₹</span>
              <input type="number" step="0.1" min="0" max="20" class="form-control" id="setting_handling_cost_per_kg" required>
            </div>
            <div class="form-helper">Includes manual sorting, strapping, and loading.</div>
          </div>

          <div class="form-group">
            <label for="setting_transport_cost_per_km">Freight Transport Rate (₹/km)</label>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:700; color:var(--color-text-dim);">₹</span>
              <input type="number" step="0.5" min="0" max="100" class="form-control" id="setting_transport_cost_per_km" required>
            </div>
            <div class="form-helper">Round-trip diesel and driver haulage freight rate.</div>
          </div>
        </div>

        <!-- Material Stream Value Assumptions -->
        <div style="font-size:13px; font-weight:700; color:var(--color-text-main); margin-bottom:10px; border-top:1px solid var(--color-border-light); padding-top:12px;">
          Material Benchmark Pricing Assumptions (₹/kg)
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px;">
          <div class="form-group">
            <label for="setting_price_mlp">MLP (Multi-Layer)</label>
            <input type="number" step="0.5" min="0" class="form-control" id="setting_price_mlp" required>
          </div>
          <div class="form-group">
            <label for="setting_price_hdpe">Rigid HDPE</label>
            <input type="number" step="0.5" min="0" class="form-control" id="setting_price_hdpe" required>
          </div>
          <div class="form-group">
            <label for="setting_price_ldpe">LDPE Film</label>
            <input type="number" step="0.5" min="0" class="form-control" id="setting_price_ldpe" required>
          </div>
          <div class="form-group">
            <label for="setting_price_pet">PET Bottles</label>
            <input type="number" step="0.5" min="0" class="form-control" id="setting_price_pet" required>
          </div>
          <div class="form-group">
            <label for="setting_price_mixed">Mixed Plastics</label>
            <input type="number" step="0.5" min="0" class="form-control" id="setting_price_mixed" required>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display:flex; justify-content:flex-end; gap:12px;">
        <button type="button" class="btn btn-secondary" id="resetDefaultsBtn">Reset Defaults</button>
        <button type="submit" class="btn btn-primary" id="saveSettingsBtn">Save Assumptions</button>
      </div>

    </form>
  `;

  // Load current settings from API
  async function loadSettings() {
    try {
      const data = await API.getSettings();
      for (const [key, item] of Object.entries(data)) {
        const input = document.getElementById(`setting_${key}`);
        if (input) {
          input.value = item.value;
        }
      }
    } catch (err) {
      showToast(`Error loading settings: ${err.message}`, "error");
    }
  }

  // Handle Form Submission
  document.getElementById("settingsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("saveSettingsBtn");
    btn.disabled = true;
    btn.textContent = "Saving...";

    const keys = [
      "tolerance_pct",
      "fill_threshold_pct",
      "vehicle_capacity_kg",
      "handling_cost_per_kg",
      "transport_cost_per_km",
      "price_mlp",
      "price_hdpe",
      "price_ldpe",
      "price_pet",
      "price_mixed"
    ];

    const updates = {};
    for (const k of keys) {
      const el = document.getElementById(`setting_${k}`);
      if (el) updates[k] = el.value;
    }

    try {
      await API.saveSettings(updates);
      window.dispatchEvent(new CustomEvent("settings-updated", { detail: updates }));
    } catch (err) {
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Assumptions";
    }
  });

  // Handle Reset to Defaults
  document.getElementById("resetDefaultsBtn")?.addEventListener("click", () => {
    if (confirm("Reset all assumptions to standard defaults?")) {
      document.getElementById("setting_tolerance_pct").value = "3.0";
      document.getElementById("setting_fill_threshold_pct").value = "70.0";
      document.getElementById("setting_vehicle_capacity_kg").value = "3500.0";
      document.getElementById("setting_handling_cost_per_kg").value = "1.50";
      document.getElementById("setting_transport_cost_per_km").value = "18.0";
      document.getElementById("setting_price_mlp").value = "8.0";
      document.getElementById("setting_price_hdpe").value = "24.0";
      document.getElementById("setting_price_ldpe").value = "18.0";
      document.getElementById("setting_price_pet").value = "22.0";
      document.getElementById("setting_price_mixed").value = "6.0";
      document.getElementById("settingsForm").dispatchEvent(new Event("submit"));
    }
  });

  loadSettings();
}
