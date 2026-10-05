import { API } from "../api.js";
import { formatKg, formatDate, renderStatusChip, renderStreamBadge } from "../components.js";

export async function renderBatches(container, state) {
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
      <div>
        <h2 style="font-size:20px; font-weight:800; color:var(--color-text-main);">Bale Batches Register</h2>
        <p style="font-size:12px; color:var(--color-text-muted);">Tamper-evident chain of custody records with cryptographic SHA-256 integrity</p>
      </div>
      <div>
        <button class="btn btn-primary" id="openAddBatchFromPageBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span>Record New Bale</span>
        </button>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="card" style="padding:14px 18px; margin-bottom:18px;">
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
        
        <div style="flex:1; min-width:200px;">
          <input type="text" class="text-input" id="batchSearchInput" placeholder="Search Bale ID, Operator, or Slip #..." style="width:100%;">
        </div>

        <div class="filter-group">
          <label for="filterStream">Stream:</label>
          <select class="select-input" id="filterStream">
            <option value="ALL">All Streams</option>
            <option value="MLP">MLP</option>
            <option value="HDPE">HDPE</option>
            <option value="LDPE">LDPE</option>
            <option value="PET">PET</option>
            <option value="Mixed">Mixed</option>
          </select>
        </div>

        <div class="filter-group">
          <label for="filterVillage">Shed:</label>
          <select class="select-input" id="filterVillage">
            <option value="ALL">All Sheds</option>
            <!-- Populated via reference API -->
          </select>
        </div>

        <div class="filter-group">
          <label for="filterStatus">Status:</label>
          <select class="select-input" id="filterStatus">
            <option value="ALL">All Statuses</option>
            <option value="Verified">Verified</option>
            <option value="Flagged">Flagged</option>
            <option value="Recorded (unverified)">Recorded (unverified)</option>
            <option value="Recorded">Recorded</option>
          </select>
        </div>

        <button class="btn btn-secondary btn-sm" id="resetFiltersBtn">Reset</button>
      </div>
    </div>

    <!-- Table Card -->
    <div class="card" style="padding:0; overflow:hidden;">
      <div class="table-responsive">
        <table class="data-table" id="batchesTable">
          <thead>
            <tr>
              <th class="sortable" data-sort="bale_id">Bale ID &uarr;&darr;</th>
              <th class="sortable" data-sort="village_id">Village Shed &uarr;&darr;</th>
              <th>Stream</th>
              <th class="sortable" data-sort="kg_node">Node Mass &uarr;&darr;</th>
              <th>Buyer Mass</th>
              <th>Variance %</th>
              <th class="sortable" data-sort="created_at">Timestamp &uarr;&darr;</th>
              <th>Operator</th>
              <th>Status</th>
              <th>Hash Link</th>
            </tr>
          </thead>
          <tbody id="batchesTableBody">
            <tr>
              <td colspan="10" style="text-align:center; padding:30px; color:var(--color-text-dim);">Loading batch records...</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="padding:12px 18px; border-top:1px solid var(--color-border); display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--color-text-muted);">
        <span id="batchCountLabel">Showing 0 records</span>
        <span>Click any row to inspect tamper-evident QR seal & audit trail</span>
      </div>
    </div>
  `;

  // Populate Sheds Dropdown
  try {
    const ref = await API.getReference();
    const villageSelect = document.getElementById("filterVillage");
    if (villageSelect && ref.sheds) {
      ref.sheds.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `${s.id}: ${s.name}`;
        villageSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.error("Reference load error", e);
  }

  let currentSort = "created_at";
  let currentDir = "desc";

  async function loadTable() {
    const search = document.getElementById("batchSearchInput")?.value || "";
    const stream = document.getElementById("filterStream")?.value || "ALL";
    const village = document.getElementById("filterVillage")?.value || "ALL";
    const status = document.getElementById("filterStatus")?.value || "ALL";

    const params = {
      search,
      stream,
      village_id: village,
      status,
      sort_by: currentSort,
      sort_dir: currentDir
    };

    if (state.dateRange && state.dateRange !== "ALL") {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(state.dateRange));
      params.start_date = d.toISOString().split("T")[0];
    }

    const tbody = document.getElementById("batchesTableBody");
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px;">Loading batches...</td></tr>`;

    try {
      const data = await API.getBatches(params);
      document.getElementById("batchCountLabel").textContent = `Showing ${data.batches.length} batch records (tolerance T = ${data.tolerance_pct_applied}%)`;

      if (data.batches.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="10" style="text-align:center; padding:35px; color:var(--color-text-dim);">
              No batches found matching the specified filters.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = data.batches.map(b => {
        const varDisplay = b.variance_pct !== null && b.variance_pct !== undefined ? `${b.variance_pct}%` : "—";
        const buyerKgDisplay = b.kg_buyer ? `${b.kg_buyer} kg` : "—";
        const isVer = b.status === "Verified";
        const isFlag = b.status === "Flagged";

        return `
          <tr class="clickable-row" data-batch-id="${b.id}">
            <td>
              <div style="font-weight:700; color:var(--color-text-main);">${b.bale_id}</div>
              ${b.version > 1 ? `<span style="font-size:10px; background:#E2E8F0; padding:1px 4px; border-radius:3px; font-weight:700;">v${b.version}</span>` : ""}
            </td>
            <td>
              <div style="font-weight:500;">${b.village_id}</div>
              <div style="font-size:11px; color:var(--color-text-dim);">${b.shed_name || ""}</div>
            </td>
            <td>${renderStreamBadge(b.stream)}</td>
            <td style="font-weight:700;">${formatKg(b.kg_node)}</td>
            <td>${buyerKgDisplay}</td>
            <td style="font-weight:600; color:${isFlag ? 'var(--color-danger)' : isVer ? 'var(--color-success)' : 'inherit'};">
              ${varDisplay}
            </td>
            <td style="font-size:11px; color:var(--color-text-muted);">${formatDate(b.created_at)}</td>
            <td style="font-size:12px;">${b.operator_id}</td>
            <td>${renderStatusChip(b.status)}</td>
            <td>
              <code title="SHA-256: ${b.hash}">${b.hash.substring(0, 8)}...</code>
            </td>
          </tr>
        `;
      }).join("");

      // Row click listener
      tbody.querySelectorAll(".clickable-row").forEach(tr => {
        tr.addEventListener("click", () => {
          const id = tr.getAttribute("data-batch-id");
          window.dispatchEvent(new CustomEvent("open-batch-drawer", { detail: { batchId: id } }));
        });
      });

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--color-danger);">${err.message}</td></tr>`;
    }
  }

  // Filter event listeners
  document.getElementById("batchSearchInput")?.addEventListener("input", debounce(loadTable, 300));
  document.getElementById("filterStream")?.addEventListener("change", loadTable);
  document.getElementById("filterVillage")?.addEventListener("change", loadTable);
  document.getElementById("filterStatus")?.addEventListener("change", loadTable);
  
  document.getElementById("resetFiltersBtn")?.addEventListener("click", () => {
    document.getElementById("batchSearchInput").value = "";
    document.getElementById("filterStream").value = "ALL";
    document.getElementById("filterVillage").value = "ALL";
    document.getElementById("filterStatus").value = "ALL";
    loadTable();
  });

  // Sorting handlers
  container.querySelectorAll("th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-sort");
      if (currentSort === col) {
        currentDir = currentDir === "asc" ? "desc" : "asc";
      } else {
        currentSort = col;
        currentDir = "desc";
      }
      loadTable();
    });
  });

  document.getElementById("openAddBatchFromPageBtn")?.addEventListener("click", () => {
    document.getElementById("quickAddBatchBtn")?.click();
  });

  // Initial load
  loadTable();
}

function debounce(fn, wait) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}
