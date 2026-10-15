// API Client and Offline Simulation Queue for Replasto
import { showToast } from "./components.js";

const OFFLINE_KEY = "replasto_simulate_offline";
const QUEUE_KEY = "replasto_offline_queue";

export const API = {
  isOfflineSimulated() {
    return localStorage.getItem(OFFLINE_KEY) === "true";
  },

  setOfflineSimulated(enabled) {
    localStorage.setItem(OFFLINE_KEY, enabled ? "true" : "false");
    window.dispatchEvent(new CustomEvent("offline-mode-changed", { detail: { offline: enabled } }));
  },

  getOfflineQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    } catch {
      return [];
    }
  },

  addToOfflineQueue(batchData) {
    const queue = this.getOfflineQueue();
    const queuedItem = {
      ...batchData,
      queued_at: new Date().toISOString(),
      offline_id: "OFFLINE-" + Date.now()
    };
    queue.push(queuedItem);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent("offline-queue-updated", { detail: { count: queue.length } }));
    return queuedItem;
  },

  clearOfflineQueue() {
    localStorage.removeItem(QUEUE_KEY);
    window.dispatchEvent(new CustomEvent("offline-queue-updated", { detail: { count: 0 } }));
  },

  async syncOfflineQueue() {
    const queue = this.getOfflineQueue();
    if (queue.length === 0) {
      return { count: 0, message: "Queue is empty." };
    }

    try {
      const response = await fetch("/api/batches/sync-offline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queue.map(q => ({
          village_id: q.village_id,
          stream: q.stream,
          kg_node: Number(q.kg_node),
          created_at: q.created_at || new Date().toISOString().replace("T", " ").substring(0, 19),
          operator_id: q.operator_id
        })))
      });

      if (!response.ok) {
        throw new Error(`Sync failed with HTTP ${response.status}`);
      }

      const res = await response.json();
      this.clearOfflineQueue();
      showToast(`Successfully synced ${res.synced_count} offline batches to server!`, "success");
      return res;
    } catch (err) {
      showToast(`Failed to sync offline queue: ${err.message}`, "error");
      throw err;
    }
  },

  async request(url, options = {}) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || `Request failed with status ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`API Error on [${url}]:`, err);
      throw err;
    }
  },

  // Endpoints
  async getOverview(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/overview${qs ? "?" + qs : ""}`);
  },

  async getBatches(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/batches${qs ? "?" + qs : ""}`);
  },

  async getBatchDetail(batchId) {
    return this.request(`/api/batches/${batchId}`);
  },

  async lookupBatch(query) {
    return this.request(`/api/batches/lookup?query=${encodeURIComponent(query)}`);
  },

  async getSampleBales() {
    return this.request("/api/batches/samples");
  },

  async createBatch(batchData) {
    if (this.isOfflineSimulated()) {
      const queued = this.addToOfflineQueue(batchData);
      showToast(`Node is OFFLINE: Batch stored in local device queue (#${queued.offline_id})`, "warning");
      return { offline: true, item: queued };
    }

    const res = await this.request("/api/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batchData)
    });
    showToast(`Batch ${res.bale_id} successfully recorded! SHA-256 seal verified.`, "success");
    return res;
  },

  async editBatchVersion(data) {
    const res = await this.request("/api/batches/edit-version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    showToast(`Created version ${res.version} for bale ${res.bale_id}. Audit trail updated.`, "success");
    return res;
  },

  async getCollection() {
    return this.request("/api/collection");
  },

  async planRoute(payload = {}) {
    return this.request("/api/collection/plan-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  },

  async getReconciliation(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/reconciliation${qs ? "?" + qs : ""}`);
  },

  async getAnomalies(topK = 10) {
    return this.request(`/api/anomalies?top_k=${topK}`);
  },

  async getEconomics(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/economics${qs ? "?" + qs : ""}`);
  },

  async verifyChain() {
    return this.request("/api/integrity/verify");
  },

  async simulateTamper() {
    return this.request("/api/integrity/simulate-tamper", { method: "POST" });
  },

  async getCalibrations() {
    return this.request("/api/integrity/calibrations");
  },

  async getSettings() {
    return this.request("/api/settings");
  },

  async saveSettings(settingsDict) {
    const res = await this.request("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: settingsDict })
    });
    showToast("Assumptions updated successfully. Recalculating metrics...", "success");
    return res;
  },

  async getReference() {
    return this.request("/api/reference");
  }
};
