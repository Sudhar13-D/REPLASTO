import { API } from "../api.js";
import { formatKg, formatInr, renderStreamBadge } from "../components.js";

export async function renderEconomics(container, state) {
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
      <div>
        <h2 style="font-size:20px; font-weight:800; color:var(--color-text-main);">Cluster Economics & Net Realization</h2>
        <p style="font-size:12px; color:var(--color-text-muted);">
          Financial yield breakdown: <code>Net Realization = Sale Value − Handling Cost − Transport Freight</code>
        </p>
      </div>
      <div>
        <span class="chip chip-assumption">Cost & Price Assumptions Editable in Settings</span>
      </div>
    </div>

    <!-- Financial KPI Cards -->
    <div class="grid-kpi" style="margin-bottom:24px;">
      <div class="kpi-card">
        <div class="kpi-label">Gross Revenue</div>
        <div class="kpi-value" id="econGrossSale">—</div>
        <div class="kpi-subtext" id="econDeliveredKg">Loading...</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Handling Opex Deducted</div>
        <div class="kpi-value" id="econHandlingCost" style="color:var(--color-text-muted);">—</div>
        <div class="kpi-subtext" id="econHandlingRate">Assumption ₹1.50/kg</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Transport Freight Paid</div>
        <div class="kpi-value" id="econTransportCost" style="color:var(--color-accent);">—</div>
        <div class="kpi-subtext" id="econTransportRate">Assumption ₹18.00/km</div>
      </div>
      <div class="kpi-card" style="border-left:4px solid var(--color-primary);">
        <div class="kpi-label">Net Cluster Realization</div>
        <div class="kpi-value" id="econNetRealization" style="color:var(--color-primary);">—</div>
        <div class="kpi-subtext" id="econAvgPerKg">Average ₹/kg yield</div>
      </div>
    </div>

    <!-- Inventory Action Suggestions: Sell now / Hold / Pool with neighbour -->
    <div class="card" style="margin-bottom:28px;">
      <div class="card-header">
        <div>
          <div class="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Explainable Inventory Dispatch Recommendations
          </div>
          <div class="card-subtitle">
            Rule-based suggestions (Sell now / Hold / Pool with neighbour) balancing freight economics against shed storage limits
          </div>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px;" id="econRecommendationsGrid">
        <div style="text-align:center; padding:20px; color:var(--color-text-dim);">Evaluating inventory dispatch rules...</div>
      </div>
    </div>

    <!-- Summaries Split Grid -->
    <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:24px; margin-bottom:28px;">
      
      <!-- Per-Village Summary -->
      <div class="card" style="margin-bottom:0; padding:0; overflow:hidden;">
        <div style="padding:14px 18px; border-bottom:1px solid var(--color-border); font-weight:700; font-size:14px;">
          Village Shed Realization Summary
        </div>
        <div class="table-responsive" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Village Shed</th>
                <th>Delivered</th>
                <th>Total Mass</th>
                <th>Gross Sale</th>
                <th>Transport</th>
                <th>Net Realization</th>
                <th>Avg ₹/kg</th>
              </tr>
            </thead>
            <tbody id="villageSummaryBody">
              <tr><td colspan="7" style="text-align:center; padding:20px;">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Per-Buyer Summary -->
      <div class="card" style="margin-bottom:0; padding:0; overflow:hidden;">
        <div style="padding:14px 18px; border-bottom:1px solid var(--color-border); font-weight:700; font-size:14px;">
          Buyer Offtake & Procurement Summary
        </div>
        <div class="table-responsive" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Buyer Destination</th>
                <th>Category</th>
                <th>Batches</th>
                <th>Total Mass</th>
                <th>Gross Invoiced</th>
              </tr>
            </thead>
            <tbody id="buyerSummaryBody">
              <tr><td colspan="5" style="text-align:center; padding:20px;">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- Sample Batch Economics Table -->
    <div class="card" style="padding:0; overflow:hidden;">
      <div style="padding:14px 18px; border-bottom:1px solid var(--color-border); font-weight:700; font-size:14px;">
        Recent Dispatched Batches: Unit Economics
      </div>
      <div class="table-responsive" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Bale ID</th>
              <th>Shed</th>
              <th>Stream</th>
              <th>Weight</th>
              <th>Sale Value</th>
              <th>Handling Cost</th>
              <th>Transport Cost</th>
              <th>Net Realization</th>
              <th>Net ₹/kg</th>
            </tr>
          </thead>
          <tbody id="batchEconBody">
            <tr><td colspan="9" style="text-align:center; padding:20px;">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  async function loadEconomics() {
    const params = {};
    if (state.dateRange && state.dateRange !== "ALL") {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(state.dateRange));
      params.start_date = d.toISOString().split("T")[0];
    }

    try {
      const data = await API.getEconomics(params);

      // Financial KPIs
      document.getElementById("econGrossSale").textContent = formatInr(data.kpis.total_gross_sale);
      document.getElementById("econDeliveredKg").textContent = `${formatKg(data.kpis.total_delivered_kg)} delivered to buyers`;
      document.getElementById("econHandlingCost").textContent = formatInr(data.kpis.total_handling_cost);
      document.getElementById("econHandlingRate").textContent = `Assumption: ₹${data.assumptions.handling_cost_per_kg}/kg`;
      document.getElementById("econTransportCost").textContent = formatInr(data.kpis.total_transport_cost);
      document.getElementById("econTransportRate").textContent = `Assumption: ₹${data.assumptions.transport_cost_per_km}/km`;
      document.getElementById("econNetRealization").textContent = formatInr(data.kpis.total_net_realization);
      document.getElementById("econAvgPerKg").textContent = `Avg Net: ₹${data.kpis.avg_net_realization_per_kg}/kg`;

      // Recommendations Cards
      const recGrid = document.getElementById("econRecommendationsGrid");
      recGrid.innerHTML = data.shed_recommendations.map(r => `
        <div style="background:#FFFFFF; border:1px solid var(--color-border); border-radius:8px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-weight:700; font-size:14px;">${r.shed_name}</span>
              <span class="${r.badge_class}" style="font-size:11px;">${r.action}</span>
            </div>
            <div style="font-size:12px; color:var(--color-text-muted); margin-bottom:6px;">
              Stock: <strong>${r.current_kg} kg</strong> (${r.fill_pct}% capacity)
            </div>
            <div style="font-size:11px; background:var(--color-surface-subtle); padding:6px 8px; border-radius:4px; border-left:3px solid var(--color-primary); font-family:var(--font-mono); color:var(--color-text-main); line-height:1.4;">
              ${r.rule_fired}
            </div>
          </div>
          <div style="font-size:11px; color:var(--color-text-dim);">
            ${r.detail}
          </div>
        </div>
      `).join("");

      // Village Summary Table
      const vBody = document.getElementById("villageSummaryBody");
      vBody.innerHTML = data.village_summaries.map(v => `
        <tr>
          <td style="font-weight:700;">${v.shed_name}</td>
          <td>${v.delivered_batches}</td>
          <td>${formatKg(v.total_kg)}</td>
          <td>${formatInr(v.gross_sale)}</td>
          <td style="color:var(--color-text-dim);">${formatInr(v.transport_cost)}</td>
          <td style="font-weight:700; color:var(--color-primary);">${formatInr(v.net_realization)}</td>
          <td style="font-weight:700;">₹${v.avg_realization_per_kg}/kg</td>
        </tr>
      `).join("");

      // Buyer Summary Table
      const bBody = document.getElementById("buyerSummaryBody");
      bBody.innerHTML = data.buyer_summaries.map(b => `
        <tr>
          <td style="font-weight:700;">${b.buyer_name}</td>
          <td><span class="chip chip-neutral" style="font-size:10px;">${b.buyer_type}</span></td>
          <td>${b.batches_count}</td>
          <td>${formatKg(b.total_kg)}</td>
          <td style="font-weight:700; color:var(--color-primary);">${formatInr(b.gross_sale)}</td>
        </tr>
      `).join("");

      // Batch Economics Table
      const batchBody = document.getElementById("batchEconBody");
      batchBody.innerHTML = data.batch_economics.map(be => `
        <tr class="clickable-row" data-batch-id="${be.batch_id}">
          <td style="font-weight:700;">${be.bale_id}</td>
          <td>${be.shed_name || be.village_id}</td>
          <td>${renderStreamBadge(be.stream)}</td>
          <td style="font-weight:600;">${formatKg(be.kg_node)}</td>
          <td>${formatInr(be.sale_value)}</td>
          <td style="color:var(--color-text-dim);">${formatInr(be.handling_cost)}</td>
          <td style="color:var(--color-text-dim);">${formatInr(be.transport_cost)}</td>
          <td style="font-weight:700; color:var(--color-primary);">${formatInr(be.net_realization)}</td>
          <td style="font-weight:700;">₹${be.net_per_kg}/kg</td>
        </tr>
      `).join("");

      batchBody.querySelectorAll(".clickable-row").forEach(tr => {
        tr.addEventListener("click", () => {
          const id = tr.getAttribute("data-batch-id");
          window.dispatchEvent(new CustomEvent("open-batch-drawer", { detail: { batchId: id } }));
        });
      });

    } catch (err) {
      container.innerHTML = `<div class="card" style="color:var(--color-danger);">${err.message}</div>`;
    }
  }

  loadEconomics();
}
