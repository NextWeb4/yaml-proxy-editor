import type { WorkbenchDocument } from "../../types/domain";
import { readYamlFile, type YamlFileContent } from "./desktopBridge";

export function isYamlFilename(nameOrPath: string): boolean {
  return /\.(ya?ml)$/i.test(nameOrPath.trim());
}

export function filterYamlDropPaths(paths: string[]): string[] {
  return paths.filter(isYamlFilename);
}

export function getPathBasename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "config.yaml";
}

export function browserFilesToYamlFiles(fileList?: FileList | File[] | null): File[] {
  return Array.from(fileList ?? []).filter((file) => isYamlFilename(file.name));
}

export async function readBrowserYamlFiles(fileList?: FileList | File[] | null): Promise<YamlFileContent[]> {
  const files = browserFilesToYamlFiles(fileList);
  return Promise.all(files.map(readBrowserYamlFile));
}

export async function readDroppedYamlPaths(paths: string[]): Promise<WorkbenchDocument[]> {
  const yamlPaths = filterYamlDropPaths(paths);
  return Promise.all(
    yamlPaths.map(async (path) => ({
      path,
      name: getPathBasename(path),
      content: await readYamlFile(path),
      dirty: false,
    })),
  );
}

function readBrowserYamlFile(file: File): Promise<YamlFileContent> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        content: String(reader.result ?? ""),
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error(`无法读取 ${file.name}`));
    reader.readAsText(file, "utf-8");
  });
}
