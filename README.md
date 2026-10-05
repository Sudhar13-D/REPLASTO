# Replasto — Rural Plastic Waste Chain-of-Custody System

Replasto is an offline-first chain-of-custody and weighbridge reconciliation platform for rural plastic waste management units (PWMU) and village aggregation sheds, with dedicated tracking for Multi-Layer Plastics (MLP) and rigid polymer streams.

A hardware node (load cell + camera + ESP32/RPi) at a village shed or PWMU records each bale: village, stream, mass (kg), time, operator, photo, QR bale ID, and cryptographic SHA-256 hash chaining. Bales are transported to buyers (kilns, road contractors, aggregators), whose weighbridge slips are compared against the PWMU weight to detect loss, moisture variance, or fraudulent diversion.

---

## 🌿 Design & Color Palette Note

Per product specifications, **no blue** is used anywhere in the application. Replasto employs an organic, sustainable recycling and earth palette:
- **Primary Brand**: Deep Forest Green (`#166534`, `#14532D`, `#22C55E`)
- **Dark Neutral & Sidebar**: Dark Pine Charcoal (`#14281D`, `#112218`)
- **Accent & Alerts**: Warm Amber & Ochre (`#D97706`, `#B45309`)
- **Danger / Flagged**: Crimson Alert (`#B91C1C`)
- **Light Surfaces**: Clean Sage & Neutral Canvas (`#F5F7F5`, `#FFFFFF`, border `#D1DCD3`)

---

## 🚀 Quickstart (One Command Run)

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Launch the Application
```bash
python run.py
```
* Seeds the SQLite database idempotently on first start (~120 batches over 60 days, 6 village sheds, 4 buyers, 10 calibration logs, and 6 injected benchmark anomalies).
* Starts the local uvicorn server at **`http://127.0.0.1:8000`**.
* Serves Chart.js locally from `/static/vendor/chart.umd.min.js` (zero CDN calls, zero external network traffic, 100% offline capable).

---

## 🧪 Running Smoke Tests & E2E Tests

### Pytest Unit & Integration Tests (26 Tests)
```bash
python -m pytest -v
```

### Playwright Headless Browser E2E Test Suite
```bash
python verify_e2e.py
```
Executes automated browser verification across all 9 pages, tests detail drawers, verifies the cryptographic hash chain, runs the in-memory tamper simulation, tests offline store-and-forward syncing, adjusts settings tolerance, checks viewports (1440px, 768px, 360px), and asserts zero console errors.

---

## 📋 Acceptance Checklist

- [x] **`python run.py` starts cleanly from a fresh clone** (initializes database, seeds data, binds to port 8000).
- [x] **All 9 pages load with data and zero console errors**:
  1. *Overview*: KPI summary cards, stacked weekly kg intake bar chart, and clickable active reconciliation flags.
  2. *Batches*: Filterable, searchable, sortable register with sliding detail drawer (photo placeholder, live QR code, SHA-256 and previous hash, version history, and corrective version modal).
  3. *Collection*: Shed cards with fill-level bars, Holt-Winters forecast ("full in ~N days"), and suggested pickup sequence.
  4. *Reconciliation*: Node vs buyer weighbridge comparison with variance % and dynamic OK / Flagged / Recorded (unverified) chips.
  5. *Anomalies*: Multivariate Isolation Forest scoring, top-k list, precision@k panel on synthetic benchmark, and feature explanations.
  6. *Economics*: Per-batch net realization math ($R_{net} = V_{sale} - C_{handling} - C_{transport}$), village/buyer summaries, and explainable Sell now / Hold / Pool suggestions.
  7. *Integrity*: SHA-256 chain verification button (PASS) and safe in-memory tamper demo button.
  8. *Offline Demo*: Field disconnect simulation toggle, local device queue inspection, and sequential chain sync.
  9. *Settings*: Configurable parameters for tolerance $T$, fill threshold, vehicle capacity, and price/cost assumptions.
- [x] **Hash chain verifies; tamper demo detected without touching real data**: Recomputes $H_n = \text{SHA-256}(\text{record}_n \parallel H_{n-1})$ from genesis; simulation modifies an isolated copy in memory.
- [x] **Offline toggle queues records and syncs them with a valid chain**: Records are buffered locally and appended sequentially to the chain head upon reconnection.
- [x] **Reconciliation flags change dynamically when tolerance $T$ is changed in Settings**: E2E tests confirmed flags update when $T$ changes from 3.0% to 10.0%.
- [x] **Collection page only lists sheds above the fill threshold**: Routing logic filters candidates strictly where fill percentage $\ge$ configurable threshold.
- [x] **Demo-data banner visible on every page**: Persistent top banner `DEMO DATA: synthetic, not field data`.
- [x] **Works across viewports**: Tested and verified at 1440px (desktop), 768px (tablet), and 360px (mobile with drawer).
- [x] **All tests pass**: 26 pytest unit tests passing cleanly.

---

## ⚙️ Sensible Assumptions Made

1. **Tamper-Evident Architecture**: Described strictly as *tamper-evident*, avoiding the word "immutable". Corrective edits append a new version row with parent pointer and audit reason without overwriting history.
2. **Weighbridge Reconciliation Rules**:
   - $\text{Variance \%} = \frac{|W_{node} - W_{buyer}|}{W_{node}} \times 100$.
   - A batch is marked **Verified** only if a buyer weighbridge slip exists and variance $\le T$.
   - A delivered batch lacking a weighbridge slip is labelled **Recorded (unverified)**, never Verified.
3. **ML Honesty & Vision**:
   - No computer vision or automated polymer identification claimed from images.
   - Anomaly detection uses multivariate Isolation Forest over scale weight, hour of day, and weighbridge deltas.
   - Precision@K evaluated and labelled explicitly on synthetic benchmark data against 6 injected anomalies.
4. **Holt-Winters Forecasting**:
   - Uses `statsmodels.tsa.holtwinters.ExponentialSmoothing` over daily accumulation history to forecast days-to-full.
5. **Vehicle Routing**:
   - Greedy Nearest-Neighbour Traveling Salesman solver with vehicle capacity constraints starting and returning to Central PWMU Hub.
   - Excludes any shed below the collection fill threshold (default 70%).

---

## 🔍 What Was Verified (Self-Debug Loop)

1. **Backend & Test Suite**:
   - Verified idempotent database seeder generating 120 batches over 60 days, exactly 6 labelled injected anomalies, 6 village sheds, 4 buyers, and 10 calibration logs.
   - Ran `python -m pytest -v`: All 26 unit tests passed in 7.98 seconds.
2. **End-to-End Headless Browser Execution**:
   - Launched `python run.py` and executed `python verify_e2e.py` with Playwright Chromium.
   - Verified all 9 navigation tabs, detail drawers, QR generation, Chart.js rendering, in-memory tamper detection, offline queuing and sync, and settings updates.
   - Verified responsive design at 1440px, 768px, and 360px.
   - Verified zero console errors and zero unhandled page exceptions.
