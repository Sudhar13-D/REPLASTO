// Replasto Hardware & Tag Scanner Controller
// Supports live camera stream, BarcodeDetector API, offline jsQR decoder, image upload, and USB barcode guns.

import { API } from "./api.js";
import { showToast, openModal, closeModal, renderStreamBadge, formatKg } from "./components.js";
import { navigateTo, appState } from "./app.js";

let videoStream = null;
let scanInterval = null;
let currentFacingMode = "environment";
let isScanning = false;
let barcodeDetector = null;

// Initialize native BarcodeDetector if available
if ("BarcodeDetector" in window) {
  try {
    barcodeDetector = new BarcodeDetector({
      formats: ["qr_code", "code_128", "code_39", "ean_13", "data_matrix"]
    });
  } catch (e) {
    console.warn("Native BarcodeDetector format error, falling back to jsQR:", e);
  }
}

export function initScanner() {
  const modal = document.getElementById("scannerModal");
  if (!modal) return;

  // Scanner launch buttons
  document.getElementById("scanBaleTopBtn")?.addEventListener("click", openScanner);
  document.getElementById("nav-scan-bale")?.addEventListener("click", openScanner);

  // Close buttons
  document.getElementById("closeScannerModal")?.addEventListener("click", closeScanner);
  document.getElementById("cancelScanner")?.addEventListener("click", closeScanner);

  // Keyboard shortcut: Alt + S or 's' (when not in an input/textarea)
  document.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      openScanner();
    }
  });

  // Tab switching inside modal
  const tabs = modal.querySelectorAll(".scanner-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const target = tab.getAttribute("data-tab");
      modal.querySelectorAll(".scanner-panel").forEach(p => p.classList.remove("active"));
      const activePanel = modal.querySelector(`.scanner-panel[data-panel="${target}"]`);
      if (activePanel) activePanel.classList.add("active");

      if (target === "camera") {
        startCamera();
      } else {
        stopCamera();
      }

      if (target === "samples") {
        loadSampleBales();
      }

      if (target === "manual") {
        setTimeout(() => {
          document.getElementById("manualBaleInput")?.focus();
        }, 100);
      }
    });
  });

  // Switch camera (front/back)
  document.getElementById("switchCameraBtn")?.addEventListener("click", () => {
    currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
    startCamera();
  });

  // Manual input form
  const manualForm = document.getElementById("manualScanForm");
  manualForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = document.getElementById("manualBaleInput")?.value?.trim();
    if (val) {
      processScannedCode(val);
    }
  });

  // Image Upload / Drag and Drop
  const fileInput = document.getElementById("scannerFileInput");
  const dropZone = document.getElementById("scannerDropZone");

  dropZone?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });

  ["dragenter", "dragover"].forEach(evt => {
    dropZone?.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(evt => {
    dropZone?.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
    });
  });

  dropZone?.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  // Check URL parameters on page load for deep-link scanning (e.g. ?bale=BAL-26-1001 or #bale=BAL-26-1001)
  checkUrlForBaleLink();
}

export function openScanner() {
  openModal("scannerModal");
  // Default to camera tab
  const cameraTab = document.querySelector('.scanner-tab[data-tab="camera"]');
  cameraTab?.click();
}

export function closeScanner() {
  stopCamera();
  closeModal("scannerModal");
  // Reset scan feedback
  const feedback = document.getElementById("scannerFeedback");
  if (feedback) {
    feedback.style.display = "none";
    feedback.innerHTML = "";
  }
}

async function startCamera() {
  stopCamera();
  const video = document.getElementById("scannerVideo");
  const errorContainer = document.getElementById("cameraErrorState");
  if (!video) return;

  if (errorContainer) errorContainer.style.display = "none";
  video.style.display = "block";

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Camera API is not supported in this browser environment.");
    }

    const constraints = {
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = videoStream;
    await video.play();

    isScanning = true;
    startDecodingLoop();
  } catch (err) {
    console.warn("Camera access failed or unavailable:", err);
    if (errorContainer) {
      errorContainer.style.display = "block";
      errorContainer.innerHTML = `
        <div style="font-size:13px; color:var(--color-accent); font-weight:700; margin-bottom:4px;">
          Camera Live Stream Inactive
        </div>
        <div style="font-size:12px; color:var(--color-text-muted); margin-bottom:12px;">
          ${err.name === "NotAllowedError" ? "Camera permission was denied. Please allow camera access in browser settings." : "Camera unavailable or unsupported. You can upload an image or select a test tag below."}
        </div>
        <div style="display:flex; gap:8px; justify-content:center;">
          <button type="button" class="btn btn-secondary btn-sm" id="switchToUploadBtn">
            Upload Bale Photo
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="switchToSamplesBtn">
            Use Demo Tags
          </button>
        </div>
      `;
      document.getElementById("switchToUploadBtn")?.addEventListener("click", () => {
        document.querySelector('.scanner-tab[data-tab="upload"]')?.click();
      });
      document.getElementById("switchToSamplesBtn")?.addEventListener("click", () => {
        document.querySelector('.scanner-tab[data-tab="samples"]')?.click();
      });
    }
  }
}

function stopCamera() {
  isScanning = false;
  if (scanInterval) {
    cancelAnimationFrame(scanInterval);
    scanInterval = null;
  }
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  const video = document.getElementById("scannerVideo");
  if (video) {
    video.srcObject = null;
  }
}

function startDecodingLoop() {
  const video = document.getElementById("scannerVideo");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  async function tick() {
    if (!isScanning) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      let foundCode = null;

      // 1. Try native BarcodeDetector API if supported
      if (barcodeDetector) {
        try {
          const barcodes = await barcodeDetector.detect(canvas);
          if (barcodes && barcodes.length > 0) {
            foundCode = barcodes[0].rawValue;
          }
        } catch (e) {
          // Fall back to jsQR
        }
      }

      // 2. Fall back to vendored offline jsQR
      if (!foundCode && window.jsQR) {
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert"
          });
          if (code && code.data) {
            foundCode = code.data;
          }
        } catch (e) {
          // ignore frame decode err
        }
      }

      if (foundCode) {
        isScanning = false;
        playScanFeedback();
        processScannedCode(foundCode);
        return;
      }
    }

    scanInterval = requestAnimationFrame(tick);
  }

  scanInterval = requestAnimationFrame(tick);
}

// Decode from uploaded image file
function handleImageFile(file) {
  if (!file.type.startsWith("image/")) {
    showToast("Please upload an image file (PNG, JPG, SVG)", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      let detectedText = null;

      // 1. Try native BarcodeDetector
      if (barcodeDetector) {
        try {
          const barcodes = await barcodeDetector.detect(canvas);
          if (barcodes && barcodes.length > 0) {
            detectedText = barcodes[0].rawValue;
          }
        } catch (err) {}
      }

      // 2. Try jsQR
      if (!detectedText && window.jsQR) {
        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qr = window.jsQR(imgData.data, imgData.width, imgData.height);
          if (qr && qr.data) {
            detectedText = qr.data;
          }
        } catch (err) {}
      }

      if (detectedText) {
        playScanFeedback();
        processScannedCode(detectedText);
      } else {
        showToast("No QR code or barcode detected in image. Please try another photo or enter manually.", "warning");
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Play pleasant scan beep and haptic pulse
function playScanFeedback() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.16);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    }
  } catch (e) {}

  if (navigator.vibrate) {
    try {
      navigator.vibrate([60, 40, 60]);
    } catch (e) {}
  }
}

// Process scanned string and transition to dashboard & bale details
export async function processScannedCode(rawCode) {
  const feedback = document.getElementById("scannerFeedback");
  if (feedback) {
    feedback.style.display = "block";
    feedback.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
        <div class="pulse-dot"></div>
        <span>Verifying bale in tamper-evident chain...</span>
      </div>
    `;
  }

  try {
    const data = await API.lookupBatch(rawCode);

    // Show temporary confirmation
    if (feedback) {
      feedback.innerHTML = `
        <div style="background:var(--color-primary-light); color:var(--color-dark-pine); padding:10px 14px; border-radius:6px; border:1px solid var(--color-primary-border); font-size:13px;">
          <div style="font-weight:700;">✓ Bale Tag Verified: ${data.bale_id}</div>
          <div style="font-size:12px; margin-top:2px;">${data.stream} &bull; ${formatKg(data.kg_node)} &bull; ${data.shed_name || data.village_id}</div>
        </div>
      `;
    }

    // Save scanned bale in state
    if (typeof appState !== "undefined") {
      appState.scannedBale = data;
      appState.activeBatchId = data.id;
    }

    // Update browser URL query param so it is shareable and directly links to this bale
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("bale", data.bale_id);
      window.history.replaceState({ bale: data.bale_id }, "", url.pathname + url.search);
    } catch (e) {}

    // Close scanner modal
    closeScanner();

    // Take user straight to the Overview Dashboard!
    navigateTo("overview");

    showToast(`Bale ${data.bale_id} verified! Loaded on Dashboard.`, "success");

    // Open the drawer with full details
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("open-batch-drawer", {
        detail: { batchId: data.id, baleId: data.bale_id }
      }));
    }, 200);

  } catch (err) {
    if (feedback) {
      feedback.style.display = "block";
      feedback.innerHTML = `
        <div style="background:var(--color-danger-bg); color:var(--color-danger); padding:10px 14px; border-radius:6px; border:1px solid var(--color-danger-border); font-size:12px;">
          ${err.message || "Bale not found in registry."}
        </div>
      `;
    }
    showToast(err.message || "Bale record not found", "error");
    // Resume camera if user wants to scan again
    setTimeout(() => {
      if (document.querySelector('.scanner-panel[data-panel="camera"].active')) {
        isScanning = true;
        startDecodingLoop();
      }
    }, 1800);
  }
}

// Populate sample tags for 1-click test scanning
async function loadSampleBales() {
  const container = document.getElementById("scannerSamplesContainer");
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--color-text-dim);">Loading sample bale tags...</div>`;

  try {
    const res = await API.getSampleBales();
    if (!res.samples || res.samples.length === 0) {
      container.innerHTML = `<div style="padding:16px; text-align:center;">No sample bales found.</div>`;
      return;
    }

    container.innerHTML = `
      <div style="font-size:12px; color:var(--color-text-muted); margin-bottom:10px;">
        Click any bale tag below to simulate a live physical scan. This loads the exact tamper-evident chain record into the dashboard:
      </div>
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap:10px;">
        ${res.samples.map(s => `
          <div class="sample-tag-card" data-bale-id="${s.bale_id}" style="border:1px solid var(--color-border); border-radius:8px; padding:10px 12px; background:var(--color-surface); cursor:pointer; transition:all 0.15s ease; box-shadow:var(--shadow-sm);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
              <span style="font-weight:700; color:var(--color-text-main); font-size:13px;">${s.bale_id}</span>
              ${renderStreamBadge(s.stream)}
            </div>
            <div style="font-size:12px; color:var(--color-text-muted); margin-bottom:6px;">
              ${s.shed_name || "Rural Shed"} &bull; <strong>${formatKg(s.kg_node)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed var(--color-border-light); padding-top:6px; margin-top:4px;">
              <span style="font-size:10px; font-family:var(--font-mono); color:var(--color-text-dim);">#${s.hash.substring(0, 8)}...</span>
              <button class="btn btn-secondary btn-sm" style="font-size:11px; padding:2px 8px;">Scan Tag &rarr;</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    container.querySelectorAll(".sample-tag-card").forEach(card => {
      card.addEventListener("click", () => {
        const baleId = card.getAttribute("data-bale-id");
        playScanFeedback();
        processScannedCode(baleId);
      });
    });

  } catch (err) {
    container.innerHTML = `<div style="color:var(--color-danger); padding:10px;">Failed to load sample tags: ${err.message}</div>`;
  }
}

// Deep linking support
function checkUrlForBaleLink() {
  const urlParams = new URLSearchParams(window.location.search);
  const baleFromQuery = urlParams.get("bale") || urlParams.get("bale_id");
  const scanTrigger = urlParams.get("scan");

  const hash = window.location.hash;
  let baleFromHash = null;
  if (hash.startsWith("#bale=")) {
    baleFromHash = hash.replace("#bale=", "").trim();
  } else if (hash === "#scan") {
    setTimeout(openScanner, 300);
  }

  const targetBale = baleFromQuery || baleFromHash;
  if (targetBale) {
    setTimeout(() => {
      processScannedCode(targetBale);
    }, 400);
  } else if (scanTrigger === "true" || scanTrigger === "1") {
    setTimeout(openScanner, 300);
  }
}
