from pathlib import Path

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parent


def assert_no_overlap(page, selectors):
    boxes = []
    for selector in selectors:
        box = page.locator(selector).bounding_box()
        assert box, f"missing box for {selector}"
        boxes.append((selector, box))

    for index, (left_selector, left) in enumerate(boxes):
        for right_selector, right in boxes[index + 1 :]:
            separated = (
                left["x"] + left["width"] <= right["x"]
                or right["x"] + right["width"] <= left["x"]
                or left["y"] + left["height"] <= right["y"]
                or right["y"] + right["height"] <= left["y"]
            )
            assert separated, f"{left_selector} overlaps {right_selector}: {left} / {right}"


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 920})
    console_errors: list[str] = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    page.goto("http://127.0.0.1:1420")
    page.wait_for_load_state("networkidle")
    page.locator(".nav-item", has_text="分流规则").click()

    expect(page.locator(".rule-tool-tabs")).to_be_visible()
    expect(page.locator(".website-rule-form")).to_be_visible()
    page.locator(".website-rule-form input").fill(
        "https://user:pass@WWW.Example.com:8443/private/path?token=secret"
    )
    expect(page.locator(".website-rule-preview code")).to_have_text(
        "DOMAIN-SUFFIX,www.example.com,节点选择"
    )
    page.locator(".website-rule-form button", has_text="应用网站规则").click()

    first_rule = page.locator(".rules-table tbody tr").first
    expect(first_rule).to_contain_text("DOMAIN-SUFFIX")
    expect(first_rule).to_contain_text("www.example.com")
    expect(first_rule).to_contain_text("节点选择")
    expect(page.locator(".rules-table")).not_to_contain_text("private/path")
    expect(page.locator(".rules-table")).not_to_contain_text("token=secret")
    page.screenshot(path=str(ROOT / "website-rule-desktop.png"), full_page=True)

    page.locator(".website-rule-form input").fill("www.example.com")
    page.locator(".rule-choice-control button", has_text="仅此域名").click()
    page.locator(".website-rule-form select").select_option("REJECT")
    page.locator(".website-rule-form button", has_text="应用网站规则").click()
    expect(page.locator(".rules-table tbody tr", has_text="www.example.com")).to_have_count(1)
    expect(page.locator(".rules-table tbody tr", has_text="www.example.com")).to_contain_text("DOMAIN")
    expect(page.locator(".rules-table tbody tr", has_text="www.example.com")).to_contain_text("REJECT")
    page.locator(".rule-filter-field input").fill("www.example.com")
    expect(page.locator(".rules-table tbody tr")).to_have_count(1)
    page.locator(".rule-filter-field input").fill("")

    page.set_viewport_size({"width": 1000, "height": 820})
    expect(page.locator(".sidebar-yaml-index")).to_be_visible()
    expect(page.locator(".rule-list-panel")).to_be_visible()
    expect(page.locator(".rule-tool-panel")).to_be_visible()
    page.screenshot(path=str(ROOT / "website-rule-1000.png"), full_page=True)

    page.set_viewport_size({"width": 680, "height": 820})
    expect(page.locator(".rule-filter-field")).to_be_visible()
    expect(page.locator(".rule-tool-tabs")).to_be_visible()
    assert_no_overlap(
        page,
        [
            ".rule-filter-field",
            ".rule-list-panel .panel-action-group > button",
        ],
    )
    page.screenshot(path=str(ROOT / "website-rule-narrow.png"), full_page=True)

    browser.close()
    assert not console_errors, "\n".join(console_errors)
