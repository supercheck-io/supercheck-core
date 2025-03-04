import { useState, useEffect, forwardRef } from "react";
import type { editor } from "monaco-editor";

interface CodeEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
}

const CodeEditor = forwardRef<editor.IStandaloneCodeEditor, CodeEditorProps>(
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
      <div className="flex flex-col flex-1 w-full overflow-hidden">
        {ClientEditor && (
          <ClientEditor
            ref={ref}
            value={props.value}
            onChange={props.onChange}
          />
        )}
      </div>
    );
  }
);

CodeEditor.displayName = "CodeEditor";

export { CodeEditor };
