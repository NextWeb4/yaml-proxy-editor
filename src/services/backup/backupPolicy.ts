export function makeBackupFileName(originalPath: string, date = new Date()): string {
  const filename = originalPath.split(/[\\/]/).pop() || "config.yaml";
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");

  return `${stamp}-${filename}`;
}

