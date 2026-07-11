import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CREATOR_INFO } from "../src/app/creatorInfo";

const EXPECTED_CREATOR = {
  name: "HaoXiang Huang",
  website: "https://nextweb4.github.io/",
  email: "didadida1688@gmail.com",
} as const;

describe("creator information lock", () => {
  it("keeps the app creator identity hard-coded", () => {
    expect(CREATOR_INFO).toEqual(EXPECTED_CREATOR);
    expect(Object.isFrozen(CREATOR_INFO)).toBe(true);
  });

  it("renders the locked creator identity from the app shell", () => {
    const appSource = readFileSync(resolve("src/App.tsx"), "utf8");

    expect(appSource).toContain("CreatorSignature");
    expect(appSource).toContain("CREATOR_INFO.name");
    expect(appSource).toContain("CREATOR_INFO.website");
    expect(appSource).toContain("CREATOR_INFO.email");
  });

  it("keeps npm package metadata aligned with the creator identity", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      author?: string;
      homepage?: string;
    };

    expect(packageJson.author).toBe(`${EXPECTED_CREATOR.name} <${EXPECTED_CREATOR.email}>`);
    expect(packageJson.homepage).toBe(EXPECTED_CREATOR.website);
  });

  it("keeps Rust package metadata aligned with the creator identity", () => {
    const cargoToml = readFileSync(resolve("src-tauri/Cargo.toml"), "utf8");

    expect(cargoToml).toContain(`authors = ["${EXPECTED_CREATOR.name} <${EXPECTED_CREATOR.email}>"]`);
    expect(cargoToml).toContain(`homepage = "${EXPECTED_CREATOR.website}"`);
  });

  it("keeps Windows installer publisher aligned with the creator identity", () => {
    const tauriConfig = JSON.parse(readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8")) as {
      bundle?: { publisher?: string };
    };

    expect(tauriConfig.bundle?.publisher).toBe(EXPECTED_CREATOR.name);
  });

  it("documents that AI coding tools must not modify the creator identity", () => {
    const readme = readFileSync(resolve("README.md"), "utf8");
    const agents = readFileSync(resolve("AGENTS.md"), "utf8");

    for (const value of Object.values(EXPECTED_CREATOR)) {
      expect(readme).toContain(value);
      expect(agents).toContain(value);
    }

    expect(readme).toContain("Codex");
    expect(readme).toContain("Claude Code");
    expect(agents).toContain("Codex");
    expect(agents).toContain("Claude Code");
  });

  it("keeps the app language toggle persisted locally", () => {
    const appSource = readFileSync(resolve("src/App.tsx"), "utf8");

    expect(appSource).toContain("LANGUAGE_STORAGE_KEY");
    expect(appSource).toContain("localStorage.setItem");
    expect(appSource).toContain("language-control");
  });
});
