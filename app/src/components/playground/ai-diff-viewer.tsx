"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

// Import Monaco Editor properly
import { DiffEditor, useMonaco } from "@monaco-editor/react";

interface AIDiffViewerProps {
  originalScript: string;
  fixedScript: string;
  explanation: string;
  confidence: number;
  isVisible: boolean;
  onAccept: (acceptedScript: string) => void;
  onReject: () => void;
  onClose: () => void;
}

export function AIDiffViewer({
  originalScript,
  fixedScript,
  explanation,
  confidence,
  isVisible,
  onAccept,
  onReject,
  onClose,
}: AIDiffViewerProps) {
  const [currentFixedScript, setCurrentFixedScript] = useState(fixedScript);
  const editorRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const monaco = useMonaco();
  const isMountedRef = useRef(true);

  useEffect(() => {
    setCurrentFixedScript(fixedScript);
  }, [fixedScript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      // Clean up editor models if they exist
      if (editorRef.current) {
        try {
          const modifiedEditor = editorRef.current.getModifiedEditor?.();
          const originalEditor = editorRef.current.getOriginalEditor?.();

          if (modifiedEditor?.getModel) {
            const model = modifiedEditor.getModel();
            if (model) {
              model.dispose();
            }
          }

          if (originalEditor?.getModel) {
            const model = originalEditor.getModel();
            if (model) {
              model.dispose();
            }
          }

          // Dispose the editor itself
          if (typeof editorRef.current.dispose === "function") {
            editorRef.current.dispose();
          }
        } catch (error) {
          console.warn("[AI Diff] Error during editor cleanup:", error);
        }
      }
    };
  }, []);

  // Configure Monaco when available
  useEffect(() => {
    if (monaco) {
      console.log("[AI Diff] Monaco is available, configuring...");

      // Set JavaScript defaults similar to main editor
      monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ESNext,
        allowNonTsExtensions: true,
        moduleResolution:
          monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.languages.typescript.ModuleKind.CommonJS,
        lib: ["es2020", "dom"],
      });
    }
  }, [monaco]);

  const handleEditorDidMount = (editor: any) => {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    // Check if component is still mounted before proceeding
    if (!isMountedRef.current) {
      console.warn(
        "[AI Diff] Component unmounted before editor could be mounted"
      );
      return;
    }

    editorRef.current = editor;
    console.log("[AI Diff] Monaco diff editor mounted successfully");

    try {
      // Configure diff editor options properly
      editor.updateOptions({
        renderSideBySide: true,
        enableSplitViewResizing: false,
        renderOverviewRuler: false,
        diffCodeLens: false,
        originalEditable: false,
        ignoreTrimWhitespace: false,
        renderIndicators: true,
        maxComputationTime: 5000,
        maxFileSize: 20,
        computeStats: false,
      });

      // Get both editors and configure them properly
      const modifiedEditor = editor.getModifiedEditor();
      const originalEditor = editor.getOriginalEditor();

      // Configure scrollbar options for both editors
      const scrollbarConfig = {
        vertical: "hidden" as const,
        horizontal: "hidden" as const,
        verticalScrollbarSize: 0,
        horizontalScrollbarSize: 0,
        useShadows: false,
        verticalHasArrows: false,
        horizontalHasArrows: false,
        alwaysConsumeMouseWheel: false,
      };

      if (modifiedEditor) {
        modifiedEditor.updateOptions({
          scrollbar: scrollbarConfig,
          readOnly: false,
          wordWrap: "off",
          lineNumbers: "on",
          glyphMargin: false,
        });
        // Set focus to modified editor after a short delay, only if still mounted
        setTimeout(() => {
          if (isMountedRef.current && modifiedEditor) {
            modifiedEditor.focus();
          }
        }, 100);
        console.log("[AI Diff] Configured modified editor");
      }

      if (originalEditor) {
        originalEditor.updateOptions({
          scrollbar: scrollbarConfig,
          readOnly: true,
          wordWrap: "off",
          lineNumbers: "on",
          glyphMargin: false,
        });
        console.log("[AI Diff] Configured original editor");
      }

      // Force layout update, only if still mounted
      setTimeout(() => {
        if (isMountedRef.current && editor) {
          editor.layout();
        }
      }, 200);
    } catch (error) {
      console.error("[AI Diff] Error configuring editor:", error);
    }
  };

  const handleAccept = () => {
    // Check if component is still mounted
    if (!isMountedRef.current) {
      console.warn("[AI Diff] Component unmounted, cannot accept fix");
      return;
    }

    try {
      let acceptedScript = currentFixedScript; // Default to the fixed script

      // Try to get content from the modified editor if available
      if (editorRef.current) {
        const modifiedEditor = editorRef.current.getModifiedEditor?.();
        if (modifiedEditor && typeof modifiedEditor.getValue === "function") {
          const editorContent = modifiedEditor.getValue();
          if (editorContent && editorContent.trim()) {
            acceptedScript = editorContent;
          }
        }
      }

      console.log("[AI Diff] Accepting script:", {
        originalLength: originalScript.length,
        fixedScriptLength: fixedScript.length,
        currentFixedScriptLength: currentFixedScript.length,
        acceptedScriptLength: acceptedScript.length,
        acceptedScriptPreview: acceptedScript.substring(0, 200) + "...",
        hasEditorRef: !!editorRef.current,
      });

      if (!acceptedScript || !acceptedScript.trim()) {
        toast.error("Cannot accept empty script");
        return;
      }

      // Let parent component handle success toast to avoid duplicates
      onAccept(acceptedScript);
    } catch (error) {
      console.error("Error accepting AI fix:", error);
      // Let parent handle error toast, just fallback to the fixed script
      onAccept(currentFixedScript);
    }
  };

  const handleReject = () => {
    toast.info("AI fix rejected", {
      description: "Original script remains unchanged.",
    });
    onReject();
  };

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.8) return "bg-green-100 text-green-800 border-green-200";
    if (conf >= 0.6) return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-orange-100 text-orange-800 border-orange-200";
  };

  if (!isVisible) {
    return null;
  }

  console.log("[AI Diff] Rendering diff viewer with:", {
    originalLength: originalScript.length,
    fixedLength: fixedScript.length,
    confidence,
    hasExplanation: explanation.length > 0,
    monacoAvailable: !!monaco,
  });

  // Convert explanation to clean, professional bullet points
  const getBulletPoints = (text: string): string[] => {
    const fixes: string[] = [];

    // Try to split by natural sentence boundaries or line breaks first
    let points: string[] = [];

    // Check if the text has numbered lists (1. 2. 3.)
    if (text.match(/^\d+\./m)) {
      points = text.split(/(?=\d+\.)/g).filter((p) => p.trim().length > 10);
    }
    // Check if the text has bullet points (- or •)
    else if (text.match(/^[-•]/m)) {
      points = text.split(/(?=[-•])/g).filter((p) => p.trim().length > 10);
    }
    // Otherwise split by sentences but be more conservative
    else {
      points = text.split(/[.\n]/).filter((p) => p.trim().length > 20);
    }

    // Clean up each point minimally
    points.slice(0, 3).forEach((point) => {
      let cleanPoint = point
        .replace(/\*\*/g, "") // Remove markdown bold
        .replace(/^\d+\.\s*/, "") // Remove numbering
        .replace(/^[-•]\s*/, "") // Remove bullets
        .trim();

      // Only remove obvious action prefixes, keep the rest intact
      cleanPoint = cleanPoint.replace(
        /^(Fixed|Added|Updated|Changed):\s*/i,
        ""
      );

      // Ensure it starts with capital and ends properly
      if (cleanPoint && cleanPoint.length > 8) {
        cleanPoint = cleanPoint.charAt(0).toUpperCase() + cleanPoint.slice(1);

        // Only add period if it doesn't already end with punctuation
        if (!cleanPoint.match(/[.!?:]$/)) {
          cleanPoint += ".";
        }

        fixes.push(cleanPoint);
      }
    });

    return fixes.length > 0 ? fixes : ["Test script has been improved."];
  };

  const bulletPoints = getBulletPoints(explanation);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
        {/* Compact Header */}
        <div className="flex-shrink-0 bg-gray-900 border-b border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-white">
                AI Fix Review
              </h2>
              <Badge
                className={`text-xs px-2 py-1 ${getConfidenceColor(
                  confidence
                )}`}
              >
                {Math.round(confidence * 100)}% Confident
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-gray-400 hover:text-white hover:bg-gray-800 h-7 w-7 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          {/* Brief bullet points */}
          <div className="bg-gray-800 rounded px-3 py-3">
            <div className="text-sm text-gray-300 space-y-2">
              {bulletPoints.map((point, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                  <span className="leading-relaxed">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Monaco Editor with fixed height */}
        <div
          className="bg-gray-900 relative overflow-hidden"
          style={{ height: "500px" }}
        >
          <style jsx>{`
            .monaco-scrollable-element > .scrollbar,
            .monaco-scrollable-element .scrollbar,
            .editor-scrollable .scrollbar,
            .decorationsOverviewRuler,
            .monaco-editor .overflow-guard > .scrollbar {
              display: none !important;
              width: 0 !important;
              height: 0 !important;
              opacity: 0 !important;
            }
            .monaco-diff-editor .editor.modified {
              border-left: 1px solid #404040;
            }
          `}</style>
          <DiffEditor
            height="500px"
            language="javascript"
            original={originalScript}
            modified={currentFixedScript}
            onMount={handleEditorDidMount}
            key={`${originalScript.length}-${currentFixedScript.length}`}
            options={{
              fontSize: 12,
              fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
              lineNumbers: "on",
              renderSideBySide: true,
              enableSplitViewResizing: false,
              readOnly: false,
              minimap: { enabled: false },
              wordWrap: "off",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              renderOverviewRuler: false,
              diffCodeLens: false,
              renderIndicators: true,
              originalEditable: false,
              ignoreTrimWhitespace: false,
              folding: false,
              glyphMargin: false,
              contextmenu: false,
              scrollbar: {
                vertical: "hidden",
                horizontal: "hidden",
                verticalScrollbarSize: 0,
                horizontalScrollbarSize: 0,
                useShadows: false,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                alwaysConsumeMouseWheel: false,
              },
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
            }}
            theme="vs-dark"
          />
        </div>

        {/* Compact Action Bar */}
        <div className="flex-shrink-0 bg-gray-800 border-t border-gray-700 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500/60 rounded-full"></div>
                <span>Original</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500/60 rounded-full"></div>
                <span>AI Fixed</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleReject}
                className="h-9 px-4 text-sm bg-transparent border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
              >
                <X className="h-4 w-4 mr-1" />
                Reject
              </Button>
              <Button
                onClick={handleAccept}
                className="h-9 px-4 text-sm bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="h-4 w-4 mr-1" />
                Accept & Apply
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
