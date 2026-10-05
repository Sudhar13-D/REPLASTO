import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def run_e2e_verification():
    print("====================================================")
    print("  RUNNING COMPREHENSIVE PLAYWRIGHT E2E VERIFICATION")
    print("====================================================")

    console_errors = []
    page_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # Listen for console errors & unhandled exceptions
        def on_console(msg):
            if msg.type in ["error"]:
                # Ignore harmless favicon / resource warnings if any
                console_errors.append(msg.text)
                print(f"[BROWSER CONSOLE ERROR] {msg.text}")

        page.on("console", on_console)
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        print("\n[Step 1] Loading Replasto http://127.0.0.1:8000...")
        page.goto("http://127.0.0.1:8000", wait_until="networkidle")
        time.sleep(1)

        # Check title and persistent banner
        title = page.title()
        print(f"  Page Title: {title}")
        assert "Replasto" in title

        banner_text = page.locator("#demoBanner").inner_text()
        print(f"  Demo Banner: {banner_text}")
        assert "DEMO DATA: SYNTHETIC, NOT FIELD DATA" in banner_text.upper()

        # Step 2: Overview Page
        print("\n[Step 2] Verifying Overview Dashboard...")
        page.wait_for_selector("#kpiTotalKg")
        kpi_kg = page.locator("#kpiTotalKg").inner_text()
        kpi_verified = page.locator("#kpiVerifiedPct").inner_text()
        kpi_flags = page.locator("#kpiOpenFlags").inner_text()
        print(f"  KPI Total Kg: {kpi_kg} | Verified: {kpi_verified} | Flags: {kpi_flags}")
        assert len(kpi_kg) > 1
        
        # Verify canvas exists
        canvas = page.locator("#weeklyKgChart")
        assert canvas.count() > 0
        page.screenshot(path="static/assets/screenshot_overview.png")
        print("  Saved static/assets/screenshot_overview.png")

        # Step 3: Batches Page & Detail Drawer
        print("\n[Step 3] Verifying Batches Page & Detail Drawer...")
        page.click("#nav-batches")
        page.wait_for_selector("#batchesTableBody tr.clickable-row")
        rows = page.locator("#batchesTableBody tr.clickable-row")
        count = rows.count()
        print(f"  Found {count} batch rows")
        assert count > 0

        # Click first row to open drawer
        rows.first.click()
        page.wait_for_selector("#batchDrawer.open")
        time.sleep(0.5)
        drawer_title = page.locator("#drawerTitle").inner_text()
        print(f"  Drawer opened: {drawer_title}")
        assert "Bale:" in drawer_title

        # Check QR image & SHA-256 in drawer
        qr_img = page.locator("#drawerBody img[alt*='QR']")
        assert qr_img.count() > 0
        page.screenshot(path="static/assets/screenshot_batches.png")
        print("  Saved static/assets/screenshot_batches.png")

        # Close drawer
        page.click("#drawerCloseBtn")
        time.sleep(0.5)

        # Step 4: Collection Page
        print("\n[Step 4] Verifying Collection & Suggested Pickup...")
        page.click("#nav-collection")
        page.wait_for_selector("#shedCardsGrid .card")
        shed_cards = page.locator("#shedCardsGrid .card").count()
        print(f"  Shed cards rendered: {shed_cards}")
        assert shed_cards == 6

        # Check route summary
        route_stops = page.locator("#routeTimelineContainer").inner_text()
        print(f"  Route timeline preview: {route_stops[:120]}...")
        assert "PWMU" in route_stops

        # Test recalculation
        page.select_option("#routeVehicleCapacity", "4500")
        page.click("#replanRouteBtn")
        time.sleep(1)
        page.screenshot(path="static/assets/screenshot_collection.png")
        print("  Saved static/assets/screenshot_collection.png")

        # Step 5: Reconciliation Page
        print("\n[Step 5] Verifying Reconciliation Register...")
        page.click("#nav-reconciliation")
        page.wait_for_selector("#reconTableBody tr")
        recon_rows = page.locator("#reconTableBody tr").count()
        print(f"  Reconciliation rows: {recon_rows}")
        assert recon_rows > 0
        page.screenshot(path="static/assets/screenshot_reconciliation.png")
        print("  Saved static/assets/screenshot_reconciliation.png")

        # Step 6: Anomalies Page (ML)
        print("\n[Step 6] Verifying Isolation Forest Anomalies...")
        page.click("#nav-anomalies")
        page.wait_for_selector("#anomaliesTableBody tr")
        page.wait_for_function("document.getElementById('mlPrecisionVal') && document.getElementById('mlPrecisionVal').innerText !== '—'")
        prec_val = page.locator("#mlPrecisionVal").inner_text()
        print(f"  ML Precision@K on synthetic benchmark: {prec_val}")
        page.screenshot(path="static/assets/screenshot_anomalies.png")
        print("  Saved static/assets/screenshot_anomalies.png")

        # Step 7: Economics Page
        print("\n[Step 7] Verifying Economics & Explainable Rules...")
        page.click("#nav-economics")
        page.wait_for_selector("#econGrossSale")
        page.wait_for_function("document.getElementById('econGrossSale') && document.getElementById('econGrossSale').innerText !== '—'")
        gross = page.locator("#econGrossSale").inner_text()
        net = page.locator("#econNetRealization").inner_text()
        print(f"  Gross Sale: {gross} | Net Realization: {net}")
        recs = page.locator("#econRecommendationsGrid div").count()
        assert recs > 0
        page.screenshot(path="static/assets/screenshot_economics.png")
        print("  Saved static/assets/screenshot_economics.png")

        # Step 8: Chain Integrity & Tamper Demo
        print("\n[Step 8] Verifying Cryptographic Chain & Tamper Demo...")
        page.click("#nav-integrity")
        page.wait_for_selector("#verifyChainBtn")

        # Click verify
        page.click("#verifyChainBtn")
        time.sleep(1)
        verify_msg = page.locator("#verifyResultBox").inner_text()
        print(f"  Verify chain result: {verify_msg.replace(chr(10), ' ')}")
        assert "CHAIN INTEGRITY VERIFIED (PASS)" in verify_msg

        # Click simulate tamper
        page.click("#simulateTamperBtn")
        time.sleep(1)
        tamper_msg = page.locator("#verifyResultBox").inner_text()
        print(f"  Simulate tamper result: {tamper_msg.replace(chr(10), ' ')}")
        assert "SIMULATED TAMPER DEMONSTRATION" in tamper_msg
        assert "Real database records remain 100% unaltered" in tamper_msg

        # Re-verify real database
        page.click("#verifyChainBtn")
        time.sleep(1)
        reverify_msg = page.locator("#verifyResultBox").inner_text()
        assert "CHAIN INTEGRITY VERIFIED (PASS)" in reverify_msg
        print("  Confirmed real database chain is intact after tamper demo!")
        page.screenshot(path="static/assets/screenshot_integrity.png")
        print("  Saved static/assets/screenshot_integrity.png")

        # Step 9: Offline Demo & Sync
        print("\n[Step 9] Verifying Offline Simulation & Sequential Sync...")
        page.click("#nav-offline")
        page.wait_for_selector("#offlineRecordForm")

        # Turn on offline toggle
        page.evaluate("() => { const el = document.getElementById('offlineHubToggle'); el.checked = true; el.dispatchEvent(new Event('change')); }")
        time.sleep(0.5)

        # Submit offline record
        page.fill("#offMassInput", "63.5")
        page.click("#offlineRecordForm button[type='submit']")
        time.sleep(0.5)

        badge_text = page.locator("#queueCountBadge").inner_text()
        print(f"  Offline queue badge: {badge_text}")
        assert "Queued: 1" in badge_text

        # Click sync now
        page.click("#syncNowBtn")
        time.sleep(1)
        badge_after_sync = page.locator("#queueCountBadge").inner_text()
        print(f"  Offline queue after sync: {badge_after_sync}")
        assert "Queued: 0" in badge_after_sync

        # Turn off offline toggle
        page.evaluate("() => { const el = document.getElementById('offlineHubToggle'); el.checked = false; el.dispatchEvent(new Event('change')); }")
        time.sleep(0.5)
        page.screenshot(path="static/assets/screenshot_offline.png")
        print("  Saved static/assets/screenshot_offline.png")

        # Step 10: Settings & Dynamic Tolerance Re-evaluation
        print("\n[Step 10] Verifying Settings & Dynamic Tolerance Update...")
        page.click("#nav-settings")
        page.wait_for_selector("#setting_tolerance_pct")
        
        # Change tolerance T to 10.0%
        page.fill("#setting_tolerance_pct", "10.0")
        page.click("#saveSettingsBtn")
        time.sleep(1)

        # Go to reconciliation: flagged count should decrease significantly
        page.click("#nav-reconciliation")
        page.wait_for_selector("#reconFlaggedCount")
        flagged_with_high_tol = int(page.locator("#reconFlaggedCount").inner_text())
        print(f"  Flagged items with T=10%: {flagged_with_high_tol}")

        # Go back to settings and restore T to 3.0%
        page.click("#nav-settings")
        page.wait_for_selector("#setting_tolerance_pct")
        page.fill("#setting_tolerance_pct", "3.0")
        page.click("#saveSettingsBtn")
        time.sleep(1)

        page.click("#nav-reconciliation")
        page.wait_for_selector("#reconFlaggedCount")
        flagged_with_default_tol = int(page.locator("#reconFlaggedCount").inner_text())
        print(f"  Flagged items with T=3%: {flagged_with_default_tol}")
        assert flagged_with_default_tol >= flagged_with_high_tol
        page.screenshot(path="static/assets/screenshot_settings.png")
        print("  Saved static/assets/screenshot_settings.png")

        # Step 11: Responsiveness verification
        print("\n[Step 11] Verifying Responsive Layouts (1440px, 768px, 360px)...")
        # 768px tablet
        page.set_viewport_size({"width": 768, "height": 1024})
        time.sleep(0.5)
        page.screenshot(path="static/assets/screenshot_768px.png")
        print("  Saved static/assets/screenshot_768px.png (Tablet 768px)")

        # 360px mobile
        page.set_viewport_size({"width": 360, "height": 740})
        time.sleep(0.5)
        # Verify hamburger menu works
        page.click("#menuToggleBtn")
        time.sleep(0.5)
        assert page.locator("#sidebar.open").count() > 0
        page.screenshot(path="static/assets/screenshot_360px.png")
        print("  Saved static/assets/screenshot_360px.png (Mobile 360px with drawer open)")

        # Step 12: Verify Zero Console Errors
        print("\n[Step 12] Checking Browser Console Errors...")
        print(f"  Console error count: {len(console_errors)}")
        print(f"  Page error count: {len(page_errors)}")
        assert len(console_errors) == 0, f"Detected console errors: {console_errors}"
        assert len(page_errors) == 0, f"Detected unhandled page errors: {page_errors}"

        browser.close()

    print("\n====================================================")
    print("  ALL E2E BROWSER CHECKS & ACCEPTANCE CRITERIA PASSED!")
    print("====================================================")

if __name__ == "__main__":
    run_e2e_verification()
