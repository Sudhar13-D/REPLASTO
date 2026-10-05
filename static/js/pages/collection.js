import { API } from "../api.js";
import { formatKg, formatInr, formatPct } from "../components.js";

export async function renderCollection(container, state) {
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
      <div>
        <h2 style="font-size:20px; font-weight:800; color:var(--color-text-main);">Collection & Dynamic Route Dispatch</h2>
        <p style="font-size:12px; color:var(--color-text-muted);">Shed telemetry, Holt-Winters fill-rate forecasting, and capacity-constrained dispatch sequencing</p>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="chip chip-assumption" id="thresholdNoticeChip">Threshold: 70%</span>
      </div>
    </div>

    <!-- Suggested Pickup Panel (Top Focus) -->
    <div class="card" style="border: 2px solid var(--color-primary-border); background-color:#FAFCFA; margin-bottom: 28px;">
      <div class="card-header" style="flex-wrap:wrap; gap:12px;">
        <div>
          <div class="card-title" style="color:var(--color-primary); font-size:16px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
            Suggested Pickup Dispatch Sequence
          </div>
          <div class="card-subtitle" id="routeSubheading">
            Sequences candidate sheds exceeding fill threshold to minimize freight dead-mileage
          </div>
        </div>
        
        <!-- Controls for Dispatch Simulation -->
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div class="filter-group">
            <label for="routeVehicleCapacity">Vehicle Payload:</label>
            <select class="select-input" id="routeVehicleCapacity">
              <option value="1500">1,500 kg (Tata Ace)</option>
              <option value="3500" selected>3,500 kg (Eicher Pro)</option>
              <option value="4500">4,500 kg (Ashok Leyland Partner)</option>
              <option value="6000">6,000 kg (Multi-axle Heavy)</option>
            </select>
          </div>
          <button class="btn btn-primary btn-sm" id="replanRouteBtn">Recalculate Route</button>
        </div>
      </div>

      <!-- Route Metrics Summary -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:16px;" id="routeMetricsBar">
        <div style="background:#FFFFFF; border:1px solid var(--color-border); border-radius:8px; padding:10px 14px;">
          <div style="font-size:11px; color:var(--color-text-dim); text-transform:uppercase;">Eligible Sheds</div>
          <div style="font-size:18px; font-weight:800; color:var(--color-text-main);" id="routeEligibleSheds">—</div>
        </div>
        <div style="background:#FFFFFF; border:1px solid var(--color-border); border-radius:8px; padding:10px 14px;">
          <div style="font-size:11px; color:var(--color-text-dim); text-transform:uppercase;">Payload Collected</div>
          <div style="font-size:18px; font-weight:800; color:var(--color-primary);" id="routeCollectedKg">—</div>
        </div>
        <div style="background:#FFFFFF; border:1px solid var(--color-border); border-radius:8px; padding:10px 14px;">
          <div style="font-size:11px; color:var(--color-text-dim); text-transform:uppercase;">Total Circuit Loop</div>
          <div style="font-size:18px; font-weight:800; color:var(--color-text-main);" id="routeDistanceKm">—</div>
        </div>
        <div style="background:#FFFFFF; border:1px solid var(--color-border); border-radius:8px; padding:10px 14px;">
          <div style="font-size:11px; color:var(--color-text-dim); text-transform:uppercase;">Estimated Freight</div>
          <div style="font-size:18px; font-weight:800; color:var(--color-accent);" id="routeCostInr">—</div>
        </div>
        <div style="background:#FFFFFF; border:1px solid var(--color-border); border-radius:8px; padding:10px 14px;">
          <div style="font-size:11px; color:var(--color-text-dim); text-transform:uppercase;">Capacity Utilization</div>
          <div style="font-size:18px; font-weight:800; color:var(--color-text-main);" id="routeUtilizationPct">—</div>
        </div>
      </div>

      <!-- Stop Sequence Timeline -->
      <div id="routeTimelineContainer">
        <div style="text-align:center; padding:20px; color:var(--color-text-dim);">Planning optimal loop...</div>
      </div>
    </div>

    <!-- Sheds Fill Level & Holt-Winters Forecast Cards -->
    <h3 style="font-size:16px; font-weight:700; margin-bottom:14px; display:flex; align-items:center; gap:8px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"></path><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path></svg>
      Village Shed Telemetry & Holt-Winters Predictive Forecast
    </h3>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:18px;" id="shedCardsGrid">
      <div style="text-align:center; padding:30px; color:var(--color-text-dim);">Loading shed statuses...</div>
    </div>
  `;

  async function loadCollectionData() {
    try {
      const data = await API.getCollection();
      
      document.getElementById("thresholdNoticeChip").textContent = `Pickup Trigger: &ge; ${data.fill_threshold_pct}% Fill`;
      document.getElementById("routeVehicleCapacity").value = String(data.vehicle_capacity_kg || 3500);

      renderRoutePlan(data.suggested_route, data.fill_threshold_pct);
      renderShedCards(data.sheds, data.fill_threshold_pct);

    } catch (err) {
      container.innerHTML = `<div class="card" style="color:var(--color-danger);">${err.message}</div>`;
    }
  }

  function renderRoutePlan(route, thresholdPct) {
    document.getElementById("routeEligibleSheds").textContent = `${route.stops_count || 0} sheds (${route.candidate_count || 0} &ge; ${thresholdPct}%)`;
    document.getElementById("routeCollectedKg").textContent = formatKg(route.total_kg_collected);
    document.getElementById("routeDistanceKm").textContent = `${route.total_distance_km || 0} km`;
    document.getElementById("routeCostInr").textContent = formatInr(route.total_cost_inr);
    document.getElementById("routeUtilizationPct").textContent = formatPct(route.capacity_utilization_pct);

    const timeline = document.getElementById("routeTimelineContainer");
    if (!route.stops || route.stops.length === 0) {
      timeline.innerHTML = `
        <div style="padding:24px; text-align:center; background:#FFFFFF; border:1px dashed var(--color-border); border-radius:8px;">
          <div style="font-weight:700; color:var(--color-success); font-size:14px;">✓ ${route.message}</div>
          <div style="font-size:12px; color:var(--color-text-dim); margin-top:4px;">No trucks dispatched to save operational expenditure.</div>
        </div>
      `;
      return;
    }

    timeline.innerHTML = `
      <div style="background:#FFFFFF; border:1px solid var(--color-border); border-radius:8px; overflow:hidden;">
        <div style="padding:10px 14px; background:var(--color-surface-subtle); border-bottom:1px solid var(--color-border); font-size:12px; font-weight:700; color:var(--color-text-muted);">
          SEQUENCED STOPS (SOLVER: ${route.solver.toUpperCase()})
        </div>
        <div style="display:flex; flex-direction:column;">
          ${route.stops.map((stop, idx) => `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:${idx === route.stops.length - 1 ? 'none' : '1px solid var(--color-border-light)'}; gap:12px; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:26px; height:26px; border-radius:50%; background:${idx === 0 || idx === route.stops.length - 1 ? 'var(--color-dark-pine)' : 'var(--color-primary)'}; color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px;">
                  ${stop.stop_number}
                </div>
                <div>
                  <div style="font-weight:700; font-size:13px; color:var(--color-text-main);">${stop.name}</div>
                  <div style="font-size:11px; color:var(--color-text-muted);">${stop.action}</div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:16px; font-size:12px;">
                <div>Leg: <strong>${stop.leg_distance_km} km</strong></div>
                <div>Cum: <strong>${stop.cumulative_distance_km} km</strong></div>
                ${stop.pickup_kg > 0 ? `<div style="background:var(--color-primary-light); color:var(--color-primary); padding:2px 8px; border-radius:4px; font-weight:700;">+${stop.pickup_kg} kg</div>` : ""}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderShedCards(sheds, thresholdPct) {
    const grid = document.getElementById("shedCardsGrid");
    grid.innerHTML = sheds.map(s => {
      const isUrgent = s.fill_pct >= thresholdPct;
      const days = s.forecast.days_to_full;
      const forecastColor = days <= 2 ? "var(--color-danger)" : days <= 5 ? "var(--color-accent)" : "var(--color-success)";

      return `
        <div class="card" style="margin-bottom:0; display:flex; flex-direction:column; justify-content:space-between; ${isUrgent ? 'border-top: 4px solid var(--color-accent);' : ''}">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
              <div>
                <div style="font-weight:800; font-size:15px; color:var(--color-text-main);">${s.name}</div>
                <div style="font-size:11px; color:var(--color-text-dim);">ID: ${s.id} &bull; GPS: ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</div>
              </div>
              ${isUrgent ? `<span class="chip chip-flagged" style="font-size:10px;">&ge; ${thresholdPct}% Full</span>` : `<span class="chip chip-ok" style="font-size:10px;">Normal Capacity</span>`}
            </div>

            <!-- Fill Bar -->
            <div style="margin: 14px 0;">
              <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                <span style="font-weight:600; color:var(--color-text-muted);">Current Storage Fill</span>
                <span style="font-weight:800; color:${isUrgent ? 'var(--color-danger)' : 'var(--color-primary)'};">${s.fill_pct}% (${s.current_kg} / ${s.capacity_kg} kg)</span>
              </div>
              <div class="fill-progress-track">
                <div class="fill-progress-bar ${isUrgent ? 'urgent' : ''}" style="width: ${Math.min(100, s.fill_pct)}%;"></div>
              </div>
            </div>

            <!-- Holt-Winters Predictive Forecast -->
            <div style="background:var(--color-surface-subtle); border:1px solid var(--color-border); border-radius:8px; padding:10px 12px; margin-top:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11px; font-weight:700; color:var(--color-text-muted); text-transform:uppercase;">Holt-Winters Forecast</span>
                <span style="font-weight:800; font-size:12px; color:${forecastColor};">${s.forecast.forecast_status}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--color-text-dim); margin-top:6px;">
                <span>Daily inflow velocity:</span>
                <span style="font-weight:600; color:var(--color-text-main);">~${s.forecast.burn_rate_kg_per_day} kg/day</span>
              </div>
              <div style="font-size:10px; color:var(--color-text-dim); margin-top:4px; font-style:italic;">
                Model: ${s.forecast.model}
              </div>
            </div>
          </div>

          <div style="margin-top:16px; display:flex; justify-content:space-between; align-items:center; font-size:11px; color:var(--color-text-dim); border-top:1px solid var(--color-border-light); padding-top:8px;">
            <span>Residual capacity: <strong>${Math.max(0, s.capacity_kg - s.current_kg).toFixed(1)} kg</strong></span>
            <span>Telemetry: <strong>30d active</strong></span>
          </div>
        </div>
      `;
    }).join("");
  }

  // Handle route recalculation
  document.getElementById("replanRouteBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("replanRouteBtn");
    btn.disabled = true;
    btn.textContent = "Calculating...";
    try {
      const cap = Number(document.getElementById("routeVehicleCapacity").value);
      const res = await API.planRoute({ vehicle_capacity_kg: cap });
      renderRoutePlan(res, res.threshold_pct);
    } catch (err) {
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = "Recalculate Route";
    }
  });

  // Initial load
  loadCollectionData();
}
