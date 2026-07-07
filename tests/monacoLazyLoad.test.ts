import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Monaco lazy loading boundary", () => {
  it("does not initialize Monaco workers from the React entrypoint", () => {
    const mainSource = readFileSync(resolve("src/main.tsx"), "utf8");

    expect(mainSource).not.toContain("monacoWorkers");
    expect(mainSource).not.toContain("monaco-editor");
    expect(mainSource).not.toContain("monaco-yaml");
  });

  it("initializes Monaco workers only inside the lazy editor module", () => {
    const editorSource = readFileSync(resolve("src/components/editor/YamlEditor.tsx"), "utf8");

    expect(editorSource).toContain("../../app/monacoWorkers");
  });

  it("keeps the default editor page usable before the Monaco chunk is requested", () => {
    const appSource = readFileSync(resolve("src/App.tsx"), "utf8");

    expect(appSource).toContain("advancedEditorEnabled");
    expect(appSource).toContain("plain-yaml-editor");
    expect(appSource).toContain("setAdvancedEditorEnabled(true)");
  });
});
