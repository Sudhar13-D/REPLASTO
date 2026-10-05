import { API } from "../api.js";
import { formatKg, formatDate, renderStatusChip, renderStreamBadge } from "../components.js";

export async function renderReconciliation(container, state) {
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
      <div>
        <h2 style="font-size:20px; font-weight:800; color:var(--color-text-main);">Weighbridge Reconciliation Register</h2>
        <p style="font-size:12px; color:var(--color-text-muted);">Cross-verification of rural PWMU node scale weights against buyer destination weighbridge slips</p>
      </div>
      <div>
        <span class="chip chip-assumption" id="reconToleranceBadge">Tolerance T: 3.0%</span>
      </div>
    </div>

    <!-- Reconciliation KPI Cards -->
    <div class="grid-kpi" style="margin-bottom:20px;">
      <div class="kpi-card">
        <div class="kpi-label">Reconciled Verified (OK)</div>
        <div class="kpi-value" id="reconOkCount" style="color:var(--color-success);">—</div>
        <div class="kpi-subtext">Variance &le; Tolerance T</div>
      </div>
      <div class="kpi-card kpi-danger">
        <div class="kpi-label">Flagged Discrepancies</div>
        <div class="kpi-value" id="reconFlaggedCount" style="color:var(--color-danger);">—</div>
        <div class="kpi-subtext">Variance &gt; Tolerance T</div>
      </div>
      <div class="kpi-card kpi-warning">
        <div class="kpi-label">Recorded (Unverified)</div>
        <div class="kpi-value" id="reconUnverifiedCount" style="color:var(--color-warning);">—</div>
        <div class="kpi-subtext">Awaiting buyer weighbridge slip</div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="card" style="padding:14px 18px; margin-bottom:18px;">
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
        <div class="filter-group">
          <label for="reconStatusFilter">Status Filter:</label>
          <select class="select-input" id="reconStatusFilter">
            <option value="ALL">All Records</option>
            <option value="OK">OK (Within Tolerance)</option>
            <option value="Flagged">Flagged (Exceeds Tolerance)</option>
            <option value="Unverified">Recorded (unverified)</option>
          </select>
        </div>

        <div class="filter-group">
          <label for="reconStreamFilter">Stream:</label>
          <select class="select-input" id="reconStreamFilter">
            <option value="ALL">All Streams</option>
            <option value="MLP">MLP</option>
            <option value="HDPE">HDPE</option>
            <option value="LDPE">LDPE</option>
            <option value="PET">PET</option>
            <option value="Mixed">Mixed</option>
          </select>
        </div>

        <div style="font-size:12px; color:var(--color-text-dim); margin-left:auto;">
          Formula: <code>Variance % = |W_node − W_buyer| / W_node × 100</code>
        </div>
      </div>
    </div>

    <!-- Reconciliation Table -->
    <div class="card" style="padding:0; overflow:hidden;">
      <div class="table-responsive">
        <table class="data-table" id="reconTable">
          <thead>
            <tr>
              <th>Bale ID</th>
              <th>Origin Shed</th>
              <th>Stream</th>
              <th>Node Weight (W_node)</th>
              <th>Buyer Weight (W_buyer)</th>
              <th>Delta (kg)</th>
              <th>Variance %</th>
              <th>Status Chip</th>
              <th>Buyer Destination</th>
              <th>Slip Ref #</th>
              <th>Delivered Date</th>
            </tr>
          </thead>
          <tbody id="reconTableBody">
            <tr>
              <td colspan="11" style="text-align:center; padding:30px; color:var(--color-text-dim);">Loading reconciliation records...</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="padding:12px 18px; border-top:1px solid var(--color-border); display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--color-text-muted);">
        <span id="reconCountDisplay">Showing 0 rows</span>
        <span>Click any row to open full chain audit drawer</span>
      </div>
    </div>
  `;

  async function loadReconciliation() {
    const status = document.getElementById("reconStatusFilter")?.value || "ALL";
    const stream = document.getElementById("reconStreamFilter")?.value || "ALL";

    const params = { status, stream };
    if (state.dateRange && state.dateRange !== "ALL") {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(state.dateRange));
      params.start_date = d.toISOString().split("T")[0];
    }

    const tbody = document.getElementById("reconTableBody");
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px;">Loading reconciliation...</td></tr>`;

    try {
      const data = await API.getReconciliation(params);
      
      document.getElementById("reconToleranceBadge").textContent = `Tolerance T: ${data.tolerance_pct}% (Assumption)`;
      document.getElementById("reconOkCount").textContent = data.summary.ok_count;
      document.getElementById("reconFlaggedCount").textContent = data.summary.flagged_count;
      document.getElementById("reconUnverifiedCount").textContent = data.summary.unverified_count;
      document.getElementById("reconCountDisplay").textContent = `Displaying ${data.records.length} records evaluated against T=${data.tolerance_pct}%`;

      if (data.records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:35px; color:var(--color-text-dim);">No records match criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.records.map(r => {
        const isFlag = r.status_chip === "Flagged";
        const isOk = r.status_chip === "OK";
        const isUnverified = r.status_chip === "Unverified";

        const nodeKg = `${r.kg_node.toFixed(1)} kg`;
        const buyerKg = r.kg_buyer !== null ? `${r.kg_buyer.toFixed(1)} kg` : "—";
        const delta = r.delta_signed_kg !== null ? `${r.delta_signed_kg > 0 ? "+" : ""}${r.delta_signed_kg.toFixed(1)} kg` : "—";
        const varPct = r.variance_pct !== null ? `${r.variance_pct.toFixed(2)}%` : "—";

        return `
          <tr class="clickable-row" data-batch-id="${r.batch_id}">
            <td style="font-weight:700;">${r.bale_id}</td>
            <td>${r.shed_name || r.village_id}</td>
            <td>${renderStreamBadge(r.stream)}</td>
            <td style="font-weight:700;">${nodeKg}</td>
            <td style="font-weight:600;">${buyerKg}</td>
            <td style="font-size:12px; color:${isFlag ? 'var(--color-danger)' : 'inherit'};">${delta}</td>
            <td style="font-weight:800; color:${isFlag ? 'var(--color-danger)' : isOk ? 'var(--color-success)' : 'inherit'};">
              ${varPct}
            </td>
            <td>
              ${isOk ? '<span class="chip chip-ok">✓ OK</span>' :
                isFlag ? '<span class="chip chip-flagged">⚠️ Flagged</span>' :
                isUnverified ? '<span class="chip chip-unverified">⏳ Recorded (unverified)</span>' :
                '<span class="chip chip-recorded">📦 Recorded</span>'}
            </td>
            <td style="font-size:12px;">${r.buyer_name || "—"}</td>
            <td><code>${r.slip_ref || "None"}</code></td>
            <td style="font-size:11px; color:var(--color-text-muted);">${formatDate(r.delivered_at)}</td>
          </tr>
        `;
      }).join("");

      tbody.querySelectorAll(".clickable-row").forEach(tr => {
        tr.addEventListener("click", () => {
          const id = tr.getAttribute("data-batch-id");
          window.dispatchEvent(new CustomEvent("open-batch-drawer", { detail: { batchId: id } }));
        });
      });

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--color-danger);">${err.message}</td></tr>`;
    }
  }

  document.getElementById("reconStatusFilter")?.addEventListener("change", loadReconciliation);
  document.getElementById("reconStreamFilter")?.addEventListener("change", loadReconciliation);

  loadReconciliation();
}
