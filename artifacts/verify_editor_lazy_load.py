from pathlib import Path

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
BEFORE = ROOT / "artifacts" / "editor-lazy-before.png"
AFTER = ROOT / "artifacts" / "editor-lazy-after.png"
EDITOR_MARKERS = ("YamlEditor", "monaco-editor", "monaco-yaml", "editor.worker", "yaml.worker")


def has_editor_marker(url: str) -> bool:
    return any(marker in url for marker in EDITOR_MARKERS)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 920})
    requests: list[str] = []
    console_errors: list[str] = []

    page.on("request", lambda request: requests.append(request.url))
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)

    page.goto("http://127.0.0.1:1420")
    page.wait_for_load_state("networkidle")

    expect(page.locator(".plain-yaml-editor")).to_be_visible()
    expect(page.locator(".editor-host")).to_have_count(0)

    before_editor_requests = [url for url in requests if has_editor_marker(url)]
    assert before_editor_requests == [], f"Editor assets loaded before opt-in: {before_editor_requests}"
    page.screenshot(path=str(BEFORE), full_page=True)

    page.locator(".editor-mode-bar button").click()
    expect(page.locator(".editor-host")).to_be_visible(timeout=20_000)
    expect(page.locator(".plain-yaml-editor")).to_have_count(0)

    after_editor_requests = [url for url in requests if has_editor_marker(url)]
    assert after_editor_requests, "Monaco/YamlEditor assets were not requested after opt-in"
    assert not console_errors, f"Browser console errors: {console_errors}"
    page.screenshot(path=str(AFTER), full_page=True)
    browser.close()
