from pathlib import Path

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parent
SIDEBAR_MIN_WIDTH = 300
STRUCTURE_ROW_MIN_HEIGHT = 28


def assert_sidebar_expanded(page):
    expect(page.locator(".sidebar-yaml-index")).to_be_visible()
    expect(page.locator(".sidebar-format-card")).to_be_visible()
    expect(page.locator(".sidebar-structure-list button")).to_have_count(10)
    expect(page.locator(".sidebar-inventory-list")).to_have_count(0)
    expect(page.locator(".sidebar-inventory-section")).to_have_count(0)
    expect(page.locator(".sidebar-empty")).to_have_count(0)

    box = page.locator(".sidebar").bounding_box()
    assert box and box["width"] >= SIDEBAR_MIN_WIDTH, f"sidebar collapsed to {box}"

    first_row = page.locator(".sidebar-structure-list button").first.bounding_box()
    assert first_row and first_row["height"] >= STRUCTURE_ROW_MIN_HEIGHT, f"structure row collapsed to {first_row}"


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    console_errors: list[str] = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    page.goto("http://127.0.0.1:1420")
    page.wait_for_load_state("networkidle")
    assert_sidebar_expanded(page)

    structure_labels = page.locator(".sidebar-structure-list button b").all_inner_texts()
    for label in structure_labels:
        page.locator(".sidebar-structure-list button", has_text=label).click()
        page.wait_for_timeout(100)
        assert_sidebar_expanded(page)

    nav_labels = page.locator(".nav-item span").all_inner_texts()
    for label in nav_labels:
        page.locator(".nav-item", has_text=label).click()
        page.wait_for_timeout(100)
        assert_sidebar_expanded(page)

    page.locator(".sidebar-structure-list button", has_text="代理订阅").click()
    expect(page.locator(".nav-item.active")).to_contain_text("订阅管理")
    page.screenshot(path=str(ROOT / "sidebar-index-compact.png"), full_page=True)

    page.set_viewport_size({"width": 1000, "height": 820})
    page.locator(".nav-item", has_text="节点管理").click()
    page.wait_for_timeout(100)
    assert_sidebar_expanded(page)
    page.screenshot(path=str(ROOT / "sidebar-index-after-click-1000.png"), full_page=True)

    browser.close()

    assert not console_errors, "\n".join(console_errors)
