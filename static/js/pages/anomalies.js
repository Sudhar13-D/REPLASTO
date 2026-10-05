import { API } from "../api.js";
import { formatKg, renderStreamBadge } from "../components.js";

export async function renderAnomalies(container, state) {
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
      <div>
        <h2 style="font-size:20px; font-weight:800; color:var(--color-text-main);">Unsupervised Anomaly Detection</h2>
        <p style="font-size:12px; color:var(--color-text-muted);">Multivariate Isolation Forest scoring unusual bale weights, off-shift hours, and weighbridge deltas</p>
      </div>
      <div>
        <span class="chip chip-assumption">Evaluated on synthetic benchmark data</span>
      </div>
    </div>

    <!-- Machine Learning Benchmark Panel (Honesty & Metrics) -->
    <div class="card" style="border-left: 4px solid var(--color-primary); background-color:#FAFCFA; margin-bottom: 24px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
        <div>
          <div style="font-weight:800; font-size:15px; color:var(--color-text-main);">
            Model Evaluation: Precision@K Benchmark
          </div>
          <div style="font-size:12px; color:var(--color-text-dim); margin-top:2px;">
            Honest scoring against injected synthetic anomalies (unusual weight, midnight operation, weighbridge jumps).
          </div>
        </div>
        <div class="filter-group">
          <label for="topKSelector">Evaluate Top-K:</label>
          <select class="select-input" id="topKSelector">
            <option value="6">Top-6</option>
            <option value="10" selected>Top-10</option>
            <option value="15">Top-15</option>
            <option value="20">Top-20</option>
          </select>
        </div>
      </div>

      <!-- Metric Pills -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
        <div style="background:#FFFFFF; border:1px solid var(--color-border); border-radius:8px; padding:10px 14px;">
          <div style="font-size:11px; color:var(--color-text-dim); text-transform:uppercase;">Precision@K</div>
          <div style="font-size:22px; font-weight:800; color:var(--color-primary);" id="mlPrecisionVal">—</div>
          <div style="font-size:11px; color:var(--color-text-dim);" id="mlPrecisionSub">on synthetic data</div>
        </div>
        <div style="background:#FFFFFF; border:1px solid var(--color-border); border-radius:8px; padding:10px 14px;">
          <div style="font-size:11px; color:var(--color-text-dim); text-transform:uppercase;">Recall@K</div>
          <div style="font-size:22px; font-weight:800; color:var(--color-text-main);" id="mlRecallVal">—</div>
          <div style="font-size:11px; color:var(--color-text-dim);">of injected anomalies</div>
        </div>
        <div style="background:#FFFFFF; border:1px solid var(--color-border); border-radius:8px; padding:10px 14px;">
          <div style="font-size:11px; color:var(--color-text-dim); text-transform:uppercase;">Injected Captured</div>
          <div style="font-size:22px; font-weight:800; color:var(--color-accent);" id="mlCapturedCount">—</div>
          <div style="font-size:11px; color:var(--color-text-dim);" id="mlTotalInjectedSub">— total injected</div>
        </div>
        <div style="background:#FFFFFF; border:1px solid var(--color-border); border-radius:8px; padding:10px 14px;">
          <div style="font-size:11px; color:var(--color-text-dim); text-transform:uppercase;">Total Dataset Evaluated</div>
          <div style="font-size:22px; font-weight:800; color:var(--color-text-main);" id="mlDatasetTotal">—</div>
          <div style="font-size:11px; color:var(--color-text-dim);">batches across 60 days</div>
        </div>
      </div>
      
      <!-- Feature Notice -->
      <div style="margin-top:12px; font-size:11px; color:var(--color-text-muted); background:var(--color-surface-subtle); padding:6px 12px; border-radius:4px;">
        <strong>Features Evaluated:</strong> <code>bale_weight_kg</code>, <code>hour_of_day</code>, <code>buyer_variance_pct</code>, <code>delta_kg</code>. (No camera computer vision or polymer recognition claimed).
      </div>
    </div>

    <!-- Top Anomalies Table -->
    <div class="card" style="padding:0; overflow:hidden;">
      <div class="table-responsive">
        <table class="data-table" id="anomaliesTable">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Score (0-100)</th>
              <th>Bale ID</th>
              <th>Synthetic Label</th>
              <th>Village</th>
              <th>Stream</th>
              <th>Weight</th>
              <th>Time</th>
              <th>Weighbridge Δ%</th>
              <th>Driving Anomaly Explanation</th>
            </tr>
          </thead>
          <tbody id="anomaliesTableBody">
            <tr>
              <td colspan="10" style="text-align:center; padding:30px; color:var(--color-text-dim);">Computing Isolation Forest anomaly scores...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  async function loadAnomalies() {
    const k = Number(document.getElementById("topKSelector")?.value || 10);
    const tbody = document.getElementById("anomaliesTableBody");
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px;">Fitting Isolation Forest on synthetic features...</td></tr>`;

    try {
      const data = await API.getAnomalies(k);

      document.getElementById("mlPrecisionVal").textContent = `${data.precision_at_k}%`;
      document.getElementById("mlRecallVal").textContent = `${data.recall_at_k}%`;
      document.getElementById("mlCapturedCount").textContent = `${data.injected_detected_in_top_k} / ${data.total_injected_anomalies}`;
      document.getElementById("mlTotalInjectedSub").textContent = `${data.total_injected_anomalies} injected test anomalies`;
      document.getElementById("mlDatasetTotal").textContent = `${data.total_batches_analyzed} batches`;

      if (!data.top_anomalies || data.top_anomalies.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px;">No anomalies detected.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.top_anomalies.map(a => {
        const isInjected = a.is_injected;
        const scoreColor = a.anomaly_score >= 80 ? "var(--color-danger)" : a.anomaly_score >= 60 ? "var(--color-accent)" : "var(--color-primary)";

        return `
          <tr class="clickable-row" data-batch-id="${a.bale_id}">
            <td style="font-weight:800; color:var(--color-text-muted);">#${a.rank}</td>
            <td>
              <div style="font-weight:800; font-size:14px; color:${scoreColor};">${a.anomaly_score}</div>
              <div class="fill-progress-track" style="width:60px; height:4px; margin:2px 0;">
                <div class="fill-progress-bar" style="width:${a.anomaly_score}%; background:${scoreColor};"></div>
              </div>
            </td>
            <td style="font-weight:700;">${a.bale_id}</td>
            <td>
              ${isInjected ? 
                `<span style="background:#FEE2E2; color:#991B1B; padding:2px 6px; border-radius:4px; font-weight:700; font-size:10px; border:1px solid #FECACA;">INJECTED TEST ANOMALY</span>` :
                `<span style="background:#F3F4F6; color:#4B5563; padding:2px 6px; border-radius:4px; font-weight:600; font-size:10px;">Natural Distribution Tail</span>`}
            </td>
            <td>${a.village_id}</td>
            <td>${renderStreamBadge(a.stream)}</td>
            <td style="font-weight:700;">${a.kg_node} kg</td>
            <td style="font-size:11px;"><code>${a.hour}</code></td>
            <td style="font-weight:700; color:${a.variance_pct > 3.0 ? 'var(--color-danger)' : 'inherit'};">${a.variance_pct}%</td>
            <td style="font-size:12px; color:var(--color-text-main); font-weight:500;">
              ${a.explanation}
            </td>
          </tr>
        `;
      }).join("");

      // Allow clicking row to open drawer
      tbody.querySelectorAll(".clickable-row").forEach(tr => {
        tr.addEventListener("click", async () => {
          const baleId = tr.getAttribute("data-batch-id");
          // Search batch id by bale id
          try {
            const bData = await API.getBatches({ search: baleId });
            if (bData.batches && bData.batches.length > 0) {
              window.dispatchEvent(new CustomEvent("open-batch-drawer", { detail: { batchId: bData.batches[0].id } }));
            }
          } catch (e) {
            console.error(e);
          }
        });
      });

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--color-danger);">${err.message}</td></tr>`;
    }
  }

  document.getElementById("topKSelector")?.addEventListener("change", loadAnomalies);
  loadAnomalies();
}
