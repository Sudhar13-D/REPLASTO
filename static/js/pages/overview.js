import { API } from "../api.js";
import { formatKg, formatInr, formatPct, renderStreamBadge } from "../components.js";

let weeklyChartInstance = null;

export async function renderOverview(container, state) {
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
      <div>
        <h2 style="font-size:20px; font-weight:800; color:var(--color-text-main);">Cluster Executive Overview</h2>
        <p style="font-size:12px; color:var(--color-text-muted);">Real-time weighbridge reconciliation, shed capacity telemetry, and material traceability</p>
      </div>
      <div style="font-size:12px; color:var(--color-text-dim); display:flex; align-items:center; gap:6px;">
        <span class="chip chip-ok" style="font-size:10px;">Hardware Nodes Online</span>
        <span>• 6 Sheds Monitored</span>
      </div>
    </div>

    <!-- KPI Metrics -->
    <div class="grid-kpi" id="overviewKpiGrid">
      <div class="kpi-card">
        <div class="kpi-label">Total Verified Mass</div>
        <div class="kpi-value" id="kpiTotalKg">—</div>
        <div class="kpi-subtext" id="kpiBatchesCount">Loading period data...</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Verified Batches %</div>
        <div class="kpi-value" id="kpiVerifiedPct">—</div>
        <div class="kpi-subtext">Within tolerance threshold</div>
      </div>
      <div class="kpi-card kpi-warning" id="kpiFlagsCard">
        <div class="kpi-label">Open Discrepancy Flags</div>
        <div class="kpi-value" id="kpiOpenFlags" style="color:var(--color-accent);">—</div>
        <div class="kpi-subtext">Requires supervisor review</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Avg Net Realization</div>
        <div class="kpi-value" id="kpiAvgRealization">—</div>
        <div class="kpi-subtext">After handling & freight</div>
      </div>
      <div class="kpi-card" id="kpiShedsCard">
        <div class="kpi-label">Sheds Near Capacity</div>
        <div class="kpi-value" id="kpiShedsNearFull">—</div>
        <div class="kpi-subtext" id="kpiShedsSubtext">Fill &ge; threshold %</div>
      </div>
    </div>

    <!-- Chart & Flags Layout -->
    <div style="display:grid; grid-template-columns: 2fr 1.3fr; gap: 24px; margin-bottom: 24px;">
      
      <!-- Weekly kg Chart -->
      <div class="card" style="margin-bottom:0;">
        <div class="card-header">
          <div>
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
              Weekly Material Intake by Stream
            </div>
            <div class="card-subtitle">Aggregated rural shed node weighments (kg / week)</div>
          </div>
        </div>
        <div style="position:relative; height: 320px; width: 100%;">
          <canvas id="weeklyKgChart"></canvas>
        </div>
      </div>

      <!-- Recent Flags List -->
      <div class="card" style="margin-bottom:0; display:flex; flex-direction:column;">
        <div class="card-header">
          <div>
            <div class="card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              Active Reconciliation Flags
            </div>
            <div class="card-subtitle">Delivered batches with &gt; tolerance discrepancy</div>
          </div>
        </div>
        <div style="flex:1; overflow-y:auto; max-height:320px;">
          <div id="overviewFlagsList" style="display:flex; flex-direction:column; gap:8px;">
            <div style="text-align:center; padding:20px; color:var(--color-text-dim);">Loading flags...</div>
          </div>
        </div>
      </div>

    </div>
  `;

  // Fetch data
  try {
    const params = {};
    if (state.dateRange && state.dateRange !== "ALL") {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(state.dateRange));
      params.start_date = d.toISOString().split("T")[0];
    }

    const data = await API.getOverview(params);

    // Update KPIs
    document.getElementById("kpiTotalKg").textContent = formatKg(data.kpis.total_kg_period);
    document.getElementById("kpiBatchesCount").textContent = `${data.kpis.total_batches_period} total bale records`;
    document.getElementById("kpiVerifiedPct").textContent = formatPct(data.kpis.verified_batches_pct);
    document.getElementById("kpiOpenFlags").textContent = data.kpis.open_flags_count;
    document.getElementById("kpiAvgRealization").textContent = `${formatInr(data.kpis.avg_net_realization_inr_per_kg)}/kg`;
    document.getElementById("kpiShedsNearFull").textContent = `${data.kpis.sheds_near_full_count} / ${data.kpis.total_sheds_monitored}`;

    if (data.kpis.sheds_near_full_count > 0) {
      document.getElementById("kpiShedsCard").classList.add("kpi-warning");
    }

    // Render Weekly Bar Chart
    const ctx = document.getElementById("weeklyKgChart").getContext("2d");
    if (weeklyChartInstance) {
      weeklyChartInstance.destroy();
    }

    // Chart.js without external CDN
    weeklyChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.chart_data.labels,
        datasets: data.chart_data.datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 12,
              font: { family: "system-ui", size: 11, weight: "600" }
            }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()} kg`
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { family: "system-ui", size: 10 } }
          },
          y: {
            stacked: true,
            title: {
              display: true,
              text: "Recorded Weight (kg)",
              font: { family: "system-ui", size: 11, weight: "600" }
            },
            grid: { color: "#E2E8F0" },
            ticks: { font: { family: "system-ui", size: 10 } }
          }
        }
      }
    });

    // Render Flags List
    const flagsContainer = document.getElementById("overviewFlagsList");
    if (!data.flags_list || data.flags_list.length === 0) {
      flagsContainer.innerHTML = `
        <div style="text-align:center; padding:30px; color:var(--color-success); font-weight:600;">
          ✓ All delivered weighments are within tolerance! No open flags.
        </div>
      `;
    } else {
      flagsContainer.innerHTML = data.flags_list.map(f => `
        <div class="card clickable-row" data-batch-id="${f.batch_id}" style="margin-bottom:0; padding:10px 12px; border-left:3px solid var(--color-danger); cursor:pointer; background-color:#FAFAF9;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <div style="font-weight:700; font-size:13px; color:var(--color-text-main);">
              ${f.bale_id}
            </div>
            <span class="chip chip-flagged" style="font-size:10px; padding:1px 6px;">Δ ${f.variance_pct}%</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--color-text-muted); margin-bottom:4px;">
            <span>${renderStreamBadge(f.stream)} &bull; ${f.shed_name || f.village_id}</span>
            <span>Scale: ${f.kg_node}kg &rarr; Buyer: ${f.kg_buyer}kg</span>
          </div>
          <div style="font-size:11px; color:var(--color-danger); font-weight:500;">
            ${f.reason}
          </div>
        </div>
      `).join("");

      // Attach click to open detail drawer
      flagsContainer.querySelectorAll(".clickable-row").forEach(el => {
        el.addEventListener("click", () => {
          const batchId = el.getAttribute("data-batch-id");
          window.dispatchEvent(new CustomEvent("open-batch-drawer", { detail: { batchId } }));
        });
      });
    }

  } catch (err) {
    container.innerHTML = `
      <div class="card" style="border-left:4px solid var(--color-danger); padding:20px;">
        <h3 style="color:var(--color-danger);">Error Loading Overview Data</h3>
        <p style="color:var(--color-text-muted); font-size:13px; margin-top:8px;">${err.message}</p>
        <button class="btn btn-secondary btn-sm" style="margin-top:12px;" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}
