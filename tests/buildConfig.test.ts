import { describe, expect, it } from "vitest";
import config from "../vite.config";

describe("vite build configuration", () => {
  it("keeps generated editor CSS out of the first HTML response", () => {
    expect(collectPluginNames(config.plugins)).toContain("defer-editor-html-assets");
  });

  it("keeps Monaco/YAML editor code split away from the main workbench", () => {
    expect(config.build?.rolldownOptions?.output).toMatchObject({
      codeSplitting: {
        groups: expect.arrayContaining([
          expect.objectContaining({ name: "vendor-monaco-editor" }),
          expect.objectContaining({ name: "vendor-monaco-yaml" }),
          expect.objectContaining({ name: "vendor-yaml-core" }),
        ]),
      },
    });
  });

  it("emits a bundled dependency license manifest during production builds", () => {
    expect(config.build?.license).toEqual({
      fileName: ".vite/third-party-licenses.md",
    });
  });

  it("keeps deferred editor assets out of HTML entry preloads", () => {
    const resolveDependencies = config.build?.modulePreload && typeof config.build.modulePreload === "object"
      ? config.build.modulePreload.resolveDependencies
      : undefined;

    expect(resolveDependencies?.("index.html", [
      "assets/index.js",
      "assets/vendor-monaco-editor.js",
      "assets/vendor-monaco-yaml.js",
      "assets/YamlEditor.js",
      "assets/vendor-yaml-core.js",
    ], { hostId: "index.html", hostType: "html" })).toEqual([
      "assets/index.js",
      "assets/vendor-yaml-core.js",
    ]);
  });
});

function collectPluginNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectPluginNames);
  if (!value || typeof value !== "object") return [];
  if (!("name" in value) || typeof value.name !== "string") return [];

  return [value.name];
}
