// Common reusable UI components and formatters for Replasto

export function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast-error" : type === "warning" ? "toast-warning" : ""}`;
  
  const icon = type === "error" ? "⚠️" : type === "warning" ? "🔔" : "✓";
  toast.innerHTML = `<span style="font-weight: bold;">${icon}</span> <span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export function formatKg(val) {
  if (val === null || val === undefined) return "—";
  return `${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
}

export function formatInr(val) {
  if (val === null || val === undefined) return "—";
  return `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPct(val) {
  if (val === null || val === undefined) return "—";
  return `${Number(val).toFixed(1)}%`;
}

export function formatDate(dtStr) {
  if (!dtStr) return "—";
  const d = new Date(dtStr.replace(" ", "T"));
  if (isNaN(d.getTime())) return dtStr;
  return d.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function renderStatusChip(status) {
  if (!status) return `<span class="chip chip-neutral">—</span>`;
  
  const clean = status.trim();
  if (clean === "Verified" || clean === "OK") {
    return `<span class="chip chip-ok">✓ ${clean}</span>`;
  }
  if (clean === "Flagged" || clean.startsWith("Flagged")) {
    return `<span class="chip chip-flagged">⚠️ ${clean}</span>`;
  }
  if (clean.includes("unverified") || clean === "Unverified") {
    return `<span class="chip chip-unverified">⏳ Recorded (unverified)</span>`;
  }
  if (clean === "Recorded") {
    return `<span class="chip chip-recorded">📦 Recorded</span>`;
  }
  return `<span class="chip chip-neutral">${clean}</span>`;
}

export function renderStreamBadge(stream) {
  const colors = {
    "MLP": { bg: "#DCFCE7", text: "#166534" },
    "HDPE": { bg: "#FEF3C7", text: "#92400E" },
    "LDPE": { bg: "#ECFCCB", text: "#3F6212" },
    "PET": { bg: "#CCFBF1", text: "#115E59" },
    "Mixed": { bg: "#F1F5F9", text: "#334155" }
  };
  const c = colors[stream] || { bg: "#F1F5F9", text: "#334155" };
  return `<span style="background:${c.bg}; color:${c.text}; padding:2px 7px; border-radius:4px; font-weight:700; font-size:11px;">${stream}</span>`;
}

export function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add("active");
}

export function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.remove("active");
}
