import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { configureMonacoYaml } from "monaco-yaml";
import "../../app/monacoWorkers";
import { clashSchema } from "../../app/clashSchema";

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
}

let yamlConfigured = false;

export function YamlEditor({ value, onChange }: YamlEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);

  onChangeRef.current = onChange;

  useEffect(() => {
    if (!yamlConfigured) {
      configureMonacoYaml(monaco, {
        enableSchemaRequest: false,
        validate: true,
        completion: true,
        hover: true,
        format: { enable: true },
        schemas: [
          {
            uri: "inmemory://schema/clash-mihomo.json",
            fileMatch: ["*.yaml", "*.yml", "*"],
            schema: clashSchema,
          },
        ],
      });
      yamlConfigured = true;
    }

    monaco.editor.defineTheme("yamlWorkbench", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "string.key.yaml", foreground: "9ad6ff" },
        { token: "number.yaml", foreground: "d7ba7d" },
      ],
      colors: {
        "editor.background": "#11151b",
        "editorLineNumber.foreground": "#51606f",
        "editorCursor.foreground": "#f5c542",
        "editor.selectionBackground": "#315168",
        "editorIndentGuide.background1": "#27303a",
      },
    });

    const editor = monaco.editor.create(hostRef.current!, {
      value,
      language: "yaml",
      theme: "yamlWorkbench",
      automaticLayout: true,
      minimap: { enabled: true, scale: 0.7 },
      tabSize: 2,
      insertSpaces: true,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      lineHeight: 21,
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      folding: true,
      glyphMargin: true,
      lineNumbers: "on",
      wordWrap: "off",
    });

    editorRef.current = editor;
    const disposable = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue());
    });

    return () => {
      disposable.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  return <div className="editor-host" ref={hostRef} />;
}
