import { useState, useEffect, forwardRef } from "react";
import type { EditorProps } from "@monaco-editor/react";

// Define the editor type using the Monaco interface
type MonacoEditor = Parameters<NonNullable<EditorProps['onMount']>>[0];

interface CodeEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
}

const CodeEditor = forwardRef<MonacoEditor, CodeEditorProps>(
  (props, ref) => {
    const [ClientEditor, setClientEditor] = useState<
      typeof import("./monaco-editor").MonacoEditorClient | null
    >(null);

    useEffect(() => {
      import("./monaco-editor").then((module) => {
        setClientEditor(() => module.MonacoEditorClient);
      });
    }, []);

    return (
      <div className="flex flex-col flex-1 w-full overflow-hidden" style={{ border: 'none', outline: 'none' }}>
        {ClientEditor && (
          <div className="w-full h-full" style={{ border: 'none', borderBottom: 'none' }}>
            <ClientEditor
              ref={ref}
              value={props.value}
              onChange={props.onChange}
            />
          </div>
        )}
      </div>
    );
  }
);

CodeEditor.displayName = "CodeEditor";

export { CodeEditor };
