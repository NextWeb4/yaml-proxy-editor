import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

const MONACO_YAML_DEPENDENCIES = [
  "@vscode[\\\\/]l10n",
  "monaco-yaml",
  "monaco-worker-manager",
  "monaco-languageserver-types",
  "monaco-marker-data-provider",
  "monaco-types",
  "vscode-languageserver-textdocument",
  "vscode-languageserver-types",
  "vscode-uri",
  "jsonc-parser",
  "path-browserify",
  "proxy-disposable",
  "prettier",
].join("|");

const deferredEditorAssetPattern =
  /(?:^|[\\/])(?:YamlEditor|vendor-monaco-editor|vendor-monaco-yaml|editor\.worker|yaml\.worker)(?:-|[.])/;
const deferredEditorStyleLinkPattern =
  /^\s*<link rel="stylesheet" crossorigin href="\/assets\/vendor-monaco-editor-[^"]+\.css">\r?\n?/gm;
const monacoYamlDependencyPattern = new RegExp(`node_modules[\\\\/](${MONACO_YAML_DEPENDENCIES})[\\\\/]`);

function deferEditorHtmlAssets(): Plugin {
  return {
    name: "defer-editor-html-assets",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type === "asset" && asset.fileName.endsWith(".html") && typeof asset.source === "string") {
          asset.source = asset.source.replace(deferredEditorStyleLinkPattern, "");
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), deferEditorHtmlAssets()],
  clearScreen: false,
  build: {
    modulePreload: {
      resolveDependencies(_filename, deps, context) {
        if (context.hostType !== "html") return deps;

        return deps.filter((dep) => !deferredEditorAssetPattern.test(dep));
      },
    },
    license: {
      fileName: ".vite/third-party-licenses.md",
    },
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor-monaco-editor",
              test: /node_modules[\\/]monaco-editor[\\/]/,
              priority: 30,
            },
            {
              name: "vendor-monaco-yaml",
              test: monacoYamlDependencyPattern,
              priority: 20,
            },
            {
              name: "vendor-yaml-core",
              test: /node_modules[\\/]yaml[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    strictPort: true,
    host: "127.0.0.1",
    port: 1420,
  },
  envPrefix: ["VITE_", "TAURI_"],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
