"use client";
import { forwardRef, useEffect, useState, useRef } from "react";
import { MonacoEditorClient } from "./monaco-editor";

interface CodeEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
}

type MonacoEditor = any;

// Make the component a client-side only component with dynamic loading
const CodeEditor = forwardRef<MonacoEditor, CodeEditorProps>(
  ({ value, onChange }, ref) => {
    const [ClientEditor, setClientEditor] = useState<any>(null);
    const isInitializedRef = useRef(false);
    const forceRenderKey = useRef(Date.now());
    
    // Force a client-side re-render to ensure Monaco loads immediately
    useEffect(() => {
      if (typeof window !== 'undefined') {
        // Dynamically import the editor component
        import("./monaco-editor").then((mod) => {
          setClientEditor(() => mod.MonacoEditorClient);
          // Force re-render after setting the client editor
          forceRenderKey.current = Date.now();
          isInitializedRef.current = true;
        });
      }
    }, []);
    
    // If no editor yet, show a simple loading placeholder
    if (!ClientEditor) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-black text-white p-4">
          Loading editor...
        </div>
      );
    }
    
    // Render with a key to force re-mount when needed
    return (
      <ClientEditor
        key={forceRenderKey.current}
        ref={ref}
        value={value}
        onChange={onChange}
      />
    );
  }
);

CodeEditor.displayName = "CodeEditor";

export { CodeEditor };
