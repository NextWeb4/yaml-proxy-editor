from pathlib import Path

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parent


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    console_errors: list[str] = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    page.goto("http://127.0.0.1:1420")
    page.wait_for_load_state("networkidle")

    page.locator(".nav-item", has_text="订阅管理").click()
    page.locator(".batch-subscription-input").fill(
        "机场A https://a.example/sub?token=secret\n"
        "机场B, https://b.example/sub\n"
    )
    page.locator(".batch-subscription-actions button", has_text="批量写入").click()
    expect(page.locator(".finding-list").first).to_contain_text("批量订阅已写入")
    expect(page.locator(".provider-editor-row", has_text="机场A")).to_be_visible()
    expect(page.locator(".provider-editor-row", has_text="机场B")).to_be_visible()
    page.screenshot(path=str(ROOT / "batch-subscription-import.png"), full_page=True)

    page.locator(".nav-item", has_text="节点管理").click()
    expect(page.locator(".export-format-controls select")).to_be_visible()
    page.locator(".export-format-controls select").select_option("share-links")
    expect(page.locator(".mini-code")).to_contain_text("ss://")
    expect(page.locator(".mini-code")).to_contain_text("trojan://")
    page.locator(".export-format-controls select").select_option("share-links-base64")
    expect(page.locator(".export-format-controls")).to_contain_text("V2Ray / Hiddify Base64 订阅")
    page.screenshot(path=str(ROOT / "node-export-formats.png"), full_page=True)

    browser.close()
    assert not console_errors, "\n".join(console_errors)
