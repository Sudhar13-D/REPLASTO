import { API } from "../api.js";
import { formatDate } from "../components.js";

export async function renderIntegrity(container, state) {
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
      <div>
        <h2 style="font-size:20px; font-weight:800; color:var(--color-text-main);">Cryptographic Chain Integrity & Node Calibrations</h2>
        <p style="font-size:12px; color:var(--color-text-muted);">
          SHA-256 tamper-evident hash chaining across rural hardware weighments and scale calibration telemetry
        </p>
      </div>
      <div>
        <span class="chip chip-ok" style="font-size:11px;">Algorithm: SHA-256 Tamper-Evident Chain</span>
      </div>
    </div>

    <!-- Verification Control Panel -->
    <div class="card" style="border-top:4px solid var(--color-primary); margin-bottom:24px;">
      <div class="card-header" style="flex-wrap:wrap; gap:12px;">
        <div>
          <div class="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            Cryptographic Chain Verification
          </div>
          <div class="card-subtitle">
            Recomputes <code>H_n = SHA-256(bale_id || village_id || stream || kg_node || timestamp || operator || H_{n-1})</code> from genesis
          </div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-primary" id="verifyChainBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>Verify Chain Integrity</span>
          </button>
          <button class="btn btn-warning" id="simulateTamperBtn" title="Checks a tampered in-memory copy without altering database">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            <span>Simulate Tamper (Demo Only)</span>
          </button>
        </div>
      </div>

      <!-- Verification Result Display Box -->
      <div id="verifyResultBox" style="padding:16px; border-radius:8px; background:var(--color-surface-subtle); border:1px solid var(--color-border); margin-top:8px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:22px;">🛡️</span>
          <div>
            <div style="font-weight:700; font-size:14px; color:var(--color-text-main);">Click "Verify Chain Integrity" to audit all records.</div>
            <div style="font-size:12px; color:var(--color-text-dim);">Sequential proof guarantees zero undetected insertions, deletions, or weight modifications.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Educational Honesty Callout -->
    <div class="card" style="background:#F0FDF4; border:1px solid #BBF7D0; margin-bottom:24px; padding:14px 18px;">
      <div style="display:flex; gap:12px; align-items:flex-start;">
        <div style="font-size:20px;">💡</div>
        <div>
          <div style="font-weight:700; color:#166534; font-size:13px; margin-bottom:2px;">
            Honesty Note: Tamper-Evident Architecture vs "Immutable"
          </div>
          <div style="font-size:12px; color:#14532D; line-height:1.5;">
            Replasto is designed as a <strong>tamper-evident</strong> system. Any alteration to scale weights, dates, or plastic categories immediately cascades into a cryptographic mismatch in subsequent SHA-256 blocks. We deliberately avoid marketing terms like "immutable blockchain" because offline nodes run in physical rural environments requiring authorized, audited versioning corrections.
          </div>
        </div>
      </div>
    </div>

    <!-- Scale & Load Cell Calibration Log -->
    <div class="card" style="padding:0; overflow:hidden;">
      <div style="padding:14px 18px; border-bottom:1px solid var(--color-border); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:700; font-size:14px;">Hardware Node Calibration Events (ISO/IEC Standards)</div>
          <div style="font-size:11px; color:var(--color-text-dim);">Traceable zero-tare and span calibration logs for shed load cells</div>
        </div>
        <span class="chip chip-ok" style="font-size:10px;">Load Cell Tolerances: &plusmn;0.05%</span>
      </div>
      <div class="table-responsive" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Log #</th>
              <th>Node Scale ID</th>
              <th>Timestamp</th>
              <th>Calibration Type</th>
              <th>Reference Mass</th>
              <th>Scale Reading</th>
              <th>Accuracy Variance</th>
              <th>Certifying Operator</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody id="calibrationsTableBody">
            <tr><td colspan="9" style="text-align:center; padding:25px;">Loading calibration log...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Verify chain button click
  document.getElementById("verifyChainBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("verifyChainBtn");
    const box = document.getElementById("verifyResultBox");
    btn.disabled = true;
    btn.textContent = "Verifying hashes...";

    try {
      const res = await API.verifyChain();
      if (res.valid) {
        box.style.background = "#F0FDF4";
        box.style.borderColor = "#86EFAC";
        box.innerHTML = `
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="font-size:24px; color:var(--color-success);">✓</div>
            <div>
              <div style="font-weight:800; font-size:14px; color:var(--color-success);">
                CHAIN INTEGRITY VERIFIED (PASS)
              </div>
              <div style="font-size:12px; color:var(--color-text-main); margin-top:2px;">
                ${res.message}
              </div>
              <div style="font-size:11px; color:var(--color-text-muted); margin-top:4px;">
                Chain Head Hash: <code>${res.chain_head}</code>
              </div>
            </div>
          </div>
        `;
      } else {
        box.style.background = "#FEF2F2";
        box.style.borderColor = "#FECACA";
        box.innerHTML = `
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="font-size:24px; color:var(--color-danger);">⚠️</div>
            <div>
              <div style="font-weight:800; font-size:14px; color:var(--color-danger);">
                CRYPTOGRAPHIC TAMPER DETECTED (FAIL)
              </div>
              <div style="font-size:12px; color:var(--color-text-main); margin-top:2px;">
                ${res.reason}
              </div>
              <div style="font-size:11px; color:var(--color-danger); margin-top:4px;">
                First Broken Index: <strong>Record #${res.broken_index}</strong> (${res.bale_id})
              </div>
            </div>
          </div>
        `;
      }
    } catch (err) {
      box.innerHTML = `<div style="color:var(--color-danger);">${err.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>Verify Chain Integrity</span>`;
    }
  });

  // Simulate tamper button click (Demo only)
  document.getElementById("simulateTamperBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("simulateTamperBtn");
    const box = document.getElementById("verifyResultBox");
    btn.disabled = true;
    btn.textContent = "Testing in-memory copy...";

    try {
      const res = await API.simulateTamper();
      const r = res.verification_result;

      box.style.background = "#FFFBEB";
      box.style.borderColor = "#FDE68A";
      box.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:20px;">🧪</span>
            <div style="font-weight:800; font-size:14px; color:var(--color-accent-dark);">
              SIMULATED TAMPER DEMONSTRATION (IN-MEMORY TEST COPY)
            </div>
          </div>
          
          <div style="font-size:12px; color:var(--color-text-main); background:#FFFFFF; padding:10px; border-radius:6px; border:1px solid #FDE68A;">
            <div>Target Record: <strong>#${res.tampered_index} (${res.bale_id})</strong></div>
            <div>Original Scale Mass: <code>${res.original_payload.kg_node} kg</code> &rarr; Tampered Mass: <code style="color:var(--color-danger); font-weight:bold;">${res.tampered_payload.kg_node} kg</code></div>
            <div style="margin-top:6px; color:var(--color-danger); font-weight:700;">
              Result: ${r.reason}
            </div>
          </div>

          <div style="font-size:11px; color:#92400E; font-weight:600;">
            🔒 ${res.note}
          </div>
        </div>
      `;
    } catch (err) {
      box.innerHTML = `<div style="color:var(--color-danger);">${err.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> <span>Simulate Tamper (Demo Only)</span>`;
    }
  });

  // Load Calibrations
  try {
    const data = await API.getCalibrations();
    const tbody = document.getElementById("calibrationsTableBody");
    tbody.innerHTML = data.calibrations.map(c => {
      const variance = (c.measured_kg - c.reference_kg).toFixed(2);
      const sign = variance > 0 ? "+" : "";

      return `
        <tr>
          <td>#${c.id}</td>
          <td style="font-weight:700;">${c.node_id}</td>
          <td style="font-size:11px; color:var(--color-text-muted);">${formatDate(c.ts)}</td>
          <td><span class="chip chip-neutral" style="font-size:10px;">${c.type}</span></td>
          <td style="font-weight:600;">${c.reference_kg.toFixed(2)} kg</td>
          <td style="font-weight:600;">${c.measured_kg.toFixed(2)} kg</td>
          <td style="font-size:11px; color:var(--color-text-muted);">${sign}${variance} kg</td>
          <td style="font-size:12px;">${c.operator_id}</td>
          <td><span class="chip chip-ok" style="font-size:10px;">${c.status}</span></td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error(err);
  }
}
