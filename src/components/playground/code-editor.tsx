import { useState, useEffect, forwardRef } from "react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
}

const CodeEditor = forwardRef((props: CodeEditorProps, ref) => {
  const [ClientEditor, setClientEditor] =
    useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    import("./monaco-editor").then((module) => {
      setClientEditor(() => module.MonacoEditorClient);
    });
  }, []);

  return (
    <div className="flex flex-col flex-1 w-full overflow-hidden">
      {ClientEditor && (
        <ClientEditor ref={ref} value={props.value} onChange={props.onChange} />
      )}
    </div>
  );
});

CodeEditor.displayName = "CodeEditor";

export { CodeEditor };
