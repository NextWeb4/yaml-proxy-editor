import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import YamlWorker from "./yaml.worker?worker";

const monacoWorkerScope = self as unknown as {
  MonacoEnvironment: {
    getWorker(workerId: string, label: string): Worker;
  };
};

monacoWorkerScope.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "yaml") {
      return new YamlWorker();
    }

    return new EditorWorker();
  },
};
