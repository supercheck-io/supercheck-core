import { forwardRef, useEffect, useCallback, useRef, memo } from "react";
import { Editor, useMonaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useTheme } from "next-themes";

interface MonacoEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
}

// Use the memo HOC to prevent unnecessary re-renders
export const MonacoEditorClient = memo(
  forwardRef<editor.IStandaloneCodeEditor, MonacoEditorProps>(
    ({ value, onChange }, ref) => {
      const monaco = useMonaco();
      const { theme } = useTheme();
      const editorInstanceRef = useRef<editor.IStandaloneCodeEditor | null>(
        null
      );
      const styleSheetRef = useRef<HTMLStyleElement | null>(null);
      const isInitialized = useRef(false);

      // Update editor theme when app theme changes
      useEffect(() => {
        if (editorInstanceRef.current && monaco) {
          const editorTheme = theme === 'dark' ? 'vs-dark' : 'warm-light';
          monaco.editor.setTheme(editorTheme);
        }
      }, [theme, monaco]);

      // Configure Monaco once when it's available
      useEffect(() => {
        if (!monaco || isInitialized.current) return;

        // Mark as initialized to prevent configuration on re-renders
        isInitialized.current = true;

        // Set eager model sync for immediate type loading
        monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);

        // Configure JavaScript defaults
        monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
          target: monaco.languages.typescript.ScriptTarget.ESNext,
          allowNonTsExtensions: true,
          moduleResolution:
            monaco.languages.typescript.ModuleResolutionKind.NodeJs,
          module: monaco.languages.typescript.ModuleKind.ESNext,
          noEmit: true,
          esModuleInterop: true,
          allowJs: true,
          checkJs: true,
          strict: true,
          noImplicitAny: false,
          strictNullChecks: true,
          strictFunctionTypes: true,
          strictBindCallApply: true,
          strictPropertyInitialization: true,
          noImplicitThis: true,
          alwaysStrict: true,
        });

        // Enable diagnostics and suggestions
        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: false,
          noSyntaxValidation: false,
          noSuggestionDiagnostics: false,
          diagnosticCodesToIgnore: [],
        });

        // Fetch and add Playwright types
        fetch("/playwright-minimal.d.ts")
          .then((response) => {
            if (!response.ok) {
              console.error(
                `Failed to fetch Playwright types: ${response.status}`
              );
              return null;
            }
            return response.text();
          })
          .then((playwrightTypes) => {
            if (playwrightTypes) {
              // Check if model already exists to prevent the "model already exists" error
              const uri = monaco.Uri.parse("file:///types/playwright.d.ts");
              const existingModel = monaco.editor.getModel(uri);
              
              // Only create a new model if one doesn't already exist
              if (!existingModel) {
                // Create a model for the type definitions
                const model = monaco.editor.createModel(
                  playwrightTypes,
                  "typescript",
                  uri
                );

                // Add the model to the JavaScript defaults
                monaco.languages.typescript.javascriptDefaults.addExtraLib(
                  model.getValue(),
                  model.uri.toString()
                );

                console.log("Playwright types loaded successfully into Monaco.");
              } else {
                // If model already exists, just update the extra lib
                monaco.languages.typescript.javascriptDefaults.addExtraLib(
                  playwrightTypes,
                  uri.toString()
                );
                console.log("Updated existing Playwright types in Monaco.");
              }
            }
          })
          .catch((error) => {
            console.error("Error fetching or loading Playwright types:", error);
          });
      }, [monaco]);

      // Add custom styles to remove all borders, but only once
      const beforeMount = useCallback((monaco: typeof import('monaco-editor')) => {
        // Define custom warm light theme before editor mounts
        monaco.editor.defineTheme('warm-light', {
          base: 'vs',
          inherit: true,
          rules: [],
          colors: {
            'editor.background': '#FAF7F3'
          }
        });

        // Check if the style already exists by ID
        if (!document.getElementById("monaco-editor-styles")) {
          const styleSheet = document.createElement("style");
          styleSheet.id = "monaco-editor-styles";
          styleSheet.textContent = `
        .monaco-editor, .monaco-editor-background, .monaco-editor .margin,
        .monaco-workbench .part.editor>.content .editor-group-container>.title,
        .monaco-workbench .part.editor>.content .editor-group-container,
        .monaco-editor .overflow-guard {
          border: none !important;
          outline: none !important;
        }
        .overflow-guard {
          border-bottom: none !important;
        }
      `;
          document.head.appendChild(styleSheet);
          styleSheetRef.current = styleSheet;
        }
      }, []);

      // Handle editor mount - this should only happen once
      const handleEditorMount = useCallback(
        (editor: editor.IStandaloneCodeEditor) => {
          // Store the editor instance in our ref
          editorInstanceRef.current = editor;

          // Set the ref passed from the parent
          if (ref && typeof ref === "object") {
            ref.current = editor;
          }

          // Configuration will be handled by the main options prop
        },
        [ref]
      );

      // Create a memoized callback for onChange to prevent unnecessary re-renders
      const handleEditorChange = useCallback(
        (value: string | undefined) => {
          onChange(value);
        },
        [onChange]
      );

      return (
        <div
          className="flex flex-1 w-full relative overflow-hidden border border-border rounded-bl-lg monaco-wrapper"
        >
          <Editor
            height="calc(100vh - 10rem)"
            defaultLanguage="typescript"
            value={value}
            onChange={handleEditorChange}
            theme={theme === 'dark' ? 'vs-dark' : 'warm-light'}
            className="w-full overflow-hidden"
            beforeMount={beforeMount}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13.5,
              wordWrap: "on",
              padding: { top: 16, bottom: 16 },
              automaticLayout: true,
              roundedSelection: true,
              scrollBeyondLastLine: false,
              folding: true,
              renderValidationDecorations: "off",
              hover: { enabled: true },
              suggest: {
                snippetsPreventQuickSuggestions: false,
                showIcons: true,
                showStatusBar: true,
                preview: true,
                filterGraceful: true,
                selectionMode: "always",
                showMethods: true,
                showFunctions: true,
                showConstructors: true,
                showDeprecated: false,
                matchOnWordStartOnly: false,
                localityBonus: true,
              },
              parameterHints: {
                enabled: true,
                cycle: true,
              },
              inlineSuggest: {
                enabled: true,
              },
              quickSuggestions: {
                other: true,
                comments: true,
                strings: true,
              },
              acceptSuggestionOnCommitCharacter: true,
              acceptSuggestionOnEnter: "on",
              tabCompletion: "on",
              wordBasedSuggestions: "currentDocument",
            }}
          />
        </div>
      );
    }
  )
);

// Add displayName for better debugging and to fix the ESLint warning
MonacoEditorClient.displayName = "MonacoEditorClient";
