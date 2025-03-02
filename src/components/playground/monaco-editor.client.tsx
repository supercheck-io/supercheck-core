import { forwardRef, useEffect } from "react";
import { Editor, useMonaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

interface MonacoEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
}

export const MonacoEditorClient = forwardRef<
  editor.IStandaloneCodeEditor,
  MonacoEditorProps
>(({ value, onChange }, ref) => {
  const monaco = useMonaco();

  useEffect(() => {
    if (monaco) {
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
        checkJs: false,
        strict: false,
        noImplicitAny: false,
        strictNullChecks: false,
        strictFunctionTypes: false,
        strictBindCallApply: false,
        strictPropertyInitialization: false,
        noImplicitThis: false,
        alwaysStrict: false,
      });

      // Disable diagnostics but keep suggestions
      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
        noSuggestionDiagnostics: false,
        diagnosticCodesToIgnore: [1],
      });

      // Add Playwright types from your d.ts file
      monaco.languages.typescript.javascriptDefaults.addExtraLib(
        `
declare module "@playwright/test" {
  export interface Page {
    goto(
      url: string,
      options?: {
        timeout?: number;
        waitUntil?: "load" | "domcontentloaded" | "networkidle";
      }
    ): Promise<Response | null>;
    getByRole(
      role: string,
      options?: { name?: string; exact?: boolean }
    ): Locator;
    getByText(text: string | RegExp, options?: { exact?: boolean }): Locator;
    getByTestId(testId: string): Locator;
    getByPlaceholder(
      placeholder: string,
      options?: { exact?: boolean }
    ): Locator;
    getByLabel(label: string, options?: { exact?: boolean }): Locator;
    locator(selector: string): Locator;
    frameLocator(selector: string): FrameLocator;
    screenshot(options?: {
      path?: string;
      fullPage?: boolean;
      type?: "jpeg" | "png";
      quality?: number;
    }): Promise<Buffer>;
    evaluate<R, Arg>(
      pageFunction: (arg: Arg) => R | Promise<R>,
      arg: Arg
    ): Promise<R>;
    evaluateHandle<R, Arg>(
      pageFunction: (arg: Arg) => R | Promise<R>,
      arg: Arg
    ): Promise<JSHandle>;
    on(
      event: "request" | "response" | "console",
      listener: (event: any) => void
    ): void;
    setViewportSize(viewportSize: {
      width: number;
      height: number;
    }): Promise<void>;
    close(): Promise<void>;
  }

  export interface Locator {
    click(options?: {
      force?: boolean;
      modifiers?: ("Alt" | "Control" | "Meta" | "Shift")[];
    }): Promise<void>;
    dblclick(options?: { force?: boolean }): Promise<void>;
    hover(options?: { force?: boolean }): Promise<void>;
    check(options?: { force?: boolean }): Promise<void>;
    uncheck(options?: { force?: boolean }): Promise<void>;
    dragTo(target: Locator, options?: { force?: boolean }): Promise<void>;
    nth(index: number): Locator;
    allTextContents(): Promise<string[]>;
    first(): Locator;
    last(): Locator;
  }

  export interface FrameLocator {
    locator(selector: string): Locator;
    nth(index: number): FrameLocator;
  }

  export interface Response {
    status(): number;
    ok(): boolean;
    url(): string;
    headers(): { [key: string]: string };
    text(): Promise<string>;
    json(): Promise<any>;
    body(): Promise<Buffer>;
  }

  export interface Route {
    abort(errorCode?: string): Promise<void>;
    fulfill(response: {
      status: number;
      body: string;
      headers?: { [key: string]: string };
    }): Promise<void>;
    continue(overrides?: {
      url?: string;
      method?: string;
      headers?: { [key: string]: string };
    }): Promise<void>;
  }

  export interface Browser {
    newContext(options?: BrowserContextOptions): Promise<BrowserContext>;
    close(): Promise<void>;
  }

  export interface BrowserContext {
    newPage(): Promise<Page>;
    close(): Promise<void>;
    addInitScript(script: string | Function, arg?: any): Promise<void>;
    exposeFunction(name: string, callback: Function): Promise<void>;
    cookies(urls?: string | string[]): Promise<Cookie[]>;
    setCookies(cookies: Cookie[]): Promise<void>;
  }

  export interface Cookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }

  export interface TestFixtures {
    page: Page;
    context: BrowserContext;
    browser: Browser;
  }

  export interface PlaywrightTestArgs extends TestFixtures {}

  export interface TestType {
    (
      name: string,
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void>
    ): void;
    only: (
      name: string,
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void>
    ) => void;
    skip: (
      name: string,
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void>
    ) => void;
    describe: (name: string, testFn: () => void) => void;
    beforeEach: (fn: (fixtures: PlaywrightTestArgs) => Promise<void>) => void;
    afterEach: (fn: (fixtures: PlaywrightTestArgs) => Promise<void>) => void;
    beforeAll: (fn: (fixtures: PlaywrightTestArgs) => Promise<void>) => void;
    afterAll: (fn: (fixtures: PlaywrightTestArgs) => Promise<void>) => void;
  }

  export const test: TestType;

  export interface ExpectMatchers<R = void> {
    toBeVisible(): R;
    toBeHidden(): R;
    toBeEnabled(): R;
    toBeDisabled(): R;
    toHaveText(expected: string | RegExp): R;
    toHaveValue(expected: string): R;
    toHaveAttribute(name: string, value: string): R;
    toHaveCSS(name: string, value: string): R;
    toHaveClass(expected: string | RegExp): R;
    toHaveTitle(title: string | RegExp): R;
    toHaveURL(url: string | RegExp): R;
    toHaveCount(count: number): R;
    toContainText(expected: string | RegExp): R;
  }

  export interface Expect {
    <T = unknown>(actual: T): ExpectMatchers<Promise<void>>;
    soft<T = unknown>(actual: T): ExpectMatchers<Promise<void>>;
  }

  export const expect: Expect;
}`,
        "playwright.d.ts"
      );

      // Add default imports
      monaco.languages.typescript.javascriptDefaults.addExtraLib(
        'import { test, expect } from "@playwright/test";',
        "imports.d.ts"
      );

      // Add basic types for immediate completion
      monaco.languages.typescript.javascriptDefaults.addExtraLib(
        'declare const page: import("@playwright/test").Page;',
        "globals.d.ts"
      );
    }
  }, [monaco]);

  return (
    <div className="flex flex-1 h-screen w-full relative">
      <Editor
        height="calc(100vh - 10rem)"
        defaultLanguage="javascript"
        value={value}
        onChange={onChange}
        theme="vs-dark"
        className="w-full absolute inset-0"
        onMount={(editor) => {
          if (ref && typeof ref === "object") {
            ref.current = editor;
          }
          // Enable quick suggestions immediately
          editor.updateOptions({
            quickSuggestions: { other: true, comments: true, strings: true },
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: "on",
            tabCompletion: "on",
            wordBasedSuggestions: "currentDocument",
            parameterHints: { enabled: true, cycle: true },
          });
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 13.5,
          wordWrap: "on",
          padding: { top: 16 },
          automaticLayout: true,
          roundedSelection: true,
          scrollBeyondLastLine: false,
          folding: true,
          renderValidationDecorations: "off",
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
});

// Add displayName for better debugging and to fix the ESLint warning
MonacoEditorClient.displayName = "MonacoEditorClient";
