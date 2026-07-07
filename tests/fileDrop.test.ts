import { describe, expect, it } from "vitest";
import { browserFilesToYamlFiles, filterYamlDropPaths, getPathBasename, isYamlFilename } from "../src/services/desktop/fileDrop";

describe("fileDrop", () => {
  it("accepts YAML filenames case-insensitively and rejects unrelated files", () => {
    expect(isYamlFilename("config.yaml")).toBe(true);
    expect(isYamlFilename("C:/configs/profile.YML")).toBe(true);
    expect(isYamlFilename("profile.yml.txt")).toBe(false);
    expect(isYamlFilename("profile.json")).toBe(false);
  });

  it("filters dropped paths before the desktop bridge reads them", () => {
    expect(
      filterYamlDropPaths([
        "C:/configs/openclash.yaml",
        "C:/configs/readme.txt",
        "D:/profiles/mihomo.YML",
        "D:/profiles/folder",
      ]),
    ).toEqual(["C:/configs/openclash.yaml", "D:/profiles/mihomo.YML"]);
  });

  it("derives a display name from Windows or POSIX paths", () => {
    expect(getPathBasename("C:\\configs\\openclash.yaml")).toBe("openclash.yaml");
    expect(getPathBasename("/tmp/mihomo.yml")).toBe("mihomo.yml");
    expect(getPathBasename("")).toBe("config.yaml");
  });

  it("filters browser File objects before reading", () => {
    const yamlFile = new File(["port: 7890\n"], "openclash.yaml", { type: "text/yaml" });
    const textFile = new File(["ignored"], "notes.txt", { type: "text/plain" });

    expect(browserFilesToYamlFiles([yamlFile, textFile])).toEqual([yamlFile]);
  });
});
