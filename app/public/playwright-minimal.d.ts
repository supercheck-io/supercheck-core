declare module "@playwright/test" {
  // --- Basic Interfaces ---

  export interface Response {
    /** Gets the response status code. */
    status(): number;
    /** Checks if the response was successful (status in the 200-299 range). */
    ok(): boolean;
    /** Gets the response URL. */
    url(): string;
    /** Gets the response headers. */
    headers(): { [key: string]: string };
    /** Gets the response body as text. */
    text(): Promise<string>;
    /** Gets the response body as JSON. */
    json(): Promise<any>;
  }

  export interface Locator {
    /** Clicks the element. */
    click(options?: { force?: boolean; timeout?: number }): Promise<void>;
    /** Double-clicks the element. */
    dblclick(options?: { force?: boolean; timeout?: number }): Promise<void>;
    /** Fills the input element with text. */
    fill(
      value: string,
      options?: { force?: boolean; timeout?: number }
    ): Promise<void>;
    /** Types text into the element. */
    type(
      text: string,
      options?: { delay?: number; timeout?: number }
    ): Promise<void>;
    /** Hovers over the element. */
    hover(options?: { force?: boolean; timeout?: number }): Promise<void>;
    /** Focuses the element. */
    focus(options?: { timeout?: number }): Promise<void>;
    /** Checks the checkbox or radio button. */
    check(options?: { force?: boolean; timeout?: number }): Promise<void>;
    /** Unchecks the checkbox. */
    uncheck(options?: { force?: boolean; timeout?: number }): Promise<void>;
    /** Selects options in a <select> element. */
    selectOption(
      values:
        | string
        | string[]
        | { label?: string; value?: string; index?: number },
      options?: { force?: boolean; timeout?: number }
    ): Promise<string[]>;
    /** Gets the text content of the element. */
    textContent(options?: { timeout?: number }): Promise<string | null>;
    /** Gets the inner text of the element. */
    innerText(options?: { timeout?: number }): Promise<string>;
    /** Gets the value of an attribute. */
    getAttribute(
      name: string,
      options?: { timeout?: number }
    ): Promise<string | null>;
    /** Checks if the element is visible. */
    isVisible(options?: { timeout?: number }): Promise<boolean>;
    /** Checks if the element is hidden. */
    isHidden(options?: { timeout?: number }): Promise<boolean>;
    /** Checks if the element is enabled. */
    isEnabled(options?: { timeout?: number }): Promise<boolean>;
    /** Checks if the element is disabled. */
    isDisabled(options?: { timeout?: number }): Promise<boolean>;
    /** Checks if the element is editable. */
    isEditable(options?: { timeout?: number }): Promise<boolean>;
    /** Checks if the element is checked. */
    isChecked(options?: { timeout?: number }): Promise<boolean>;
    /** Returns the first matching element. */
    first(): Locator;
    /** Returns the last matching element. */
    last(): Locator;
    /** Returns the nth matching element (0-based). */
    nth(index: number): Locator;
    /** Returns the number of elements matching the locator. */
    count(): Promise<number>;
    /** Returns a locator that matches the element's text content. */
    filter(options?: { hasText?: string | RegExp }): Locator;
    /** Returns a locator that matches the element's role. */
    filter(options?: { has?: Locator }): Locator;
    /** Returns a locator that matches the element's role. */
    getByRole(
      role: string,
      options?: { name?: string | RegExp; exact?: boolean }
    ): Locator;
    /** Returns a locator that matches the element's text content. */
    getByText(text: string | RegExp, options?: { exact?: boolean }): Locator;
    /** Returns a locator that matches the element's label text. */
    getByLabel(text: string | RegExp, options?: { exact?: boolean }): Locator;
    /** Returns a locator that matches the element's placeholder text. */
    getByPlaceholder(
      text: string | RegExp,
      options?: { exact?: boolean }
    ): Locator;
    /** Returns a locator that matches the element's data-testid attribute. */
    getByTestId(testId: string | RegExp): Locator;
  }

  export interface Page {
    /** Navigates to a URL. */
    goto(
      url: string,
      options?: {
        timeout?: number;
        waitUntil?: "load" | "domcontentloaded" | "networkidle";
      }
    ): Promise<Response | null>;
    /** Clicks an element matching the selector. */
    click(
      selector: string,
      options?: { force?: boolean; timeout?: number }
    ): Promise<void>;
    /** Fills an input element matching the selector. */
    fill(
      selector: string,
      value: string,
      options?: { force?: boolean; timeout?: number }
    ): Promise<void>;
    /** Types text into an element matching the selector. */
    type(
      selector: string,
      text: string,
      options?: { delay?: number; timeout?: number }
    ): Promise<void>;
    /** Waits for a selector to appear in the DOM. */
    waitForSelector(
      selector: string,
      options?: {
        state?: "attached" | "detached" | "visible" | "hidden";
        timeout?: number;
      }
    ): Promise<Locator>;
    /** Waits for navigation to complete. */
    waitForNavigation(options?: {
      url?: string | RegExp;
      waitUntil?: "load" | "domcontentloaded" | "networkidle";
      timeout?: number;
    }): Promise<Response | null>;
    /** Takes a screenshot of the page. */
    screenshot(options?: {
      path?: string;
      fullPage?: boolean;
      type?: "png" | "jpeg";
      timeout?: number;
    }): Promise<Buffer>;
    /** Evaluates a function in the page context. */
    evaluate<R, Arg>(
      pageFunction: (arg: Arg) => R | Promise<R>,
      arg?: Arg
    ): Promise<R>;
    /** Returns a locator for the given selector. */
    locator(selector: string): Locator;
    /** Gets a locator by ARIA role. */
    getByRole(
      role: string,
      options?: { name?: string | RegExp; exact?: boolean }
    ): Locator;
    /** Gets a locator by its text content. */
    getByText(text: string | RegExp, options?: { exact?: boolean }): Locator;
    /** Gets a locator by its label text. */
    getByLabel(text: string | RegExp, options?: { exact?: boolean }): Locator;
    /** Gets a locator by its placeholder text. */
    getByPlaceholder(
      text: string | RegExp,
      options?: { exact?: boolean }
    ): Locator;
    /** Gets a locator by its data-testid attribute. */
    getByTestId(testId: string | RegExp): Locator;
    /** Sets the viewport size. */
    setViewportSize(viewportSize: {
      width: number;
      height: number;
    }): Promise<void>;
    /** Closes the page. */
    close(): Promise<void>;
    /** Reloads the current page. */
    reload(options?: {
      timeout?: number;
      waitUntil?: "load" | "domcontentloaded" | "networkidle";
    }): Promise<Response | null>;
    /** Returns the page's title. */
    title(): Promise<string>;
    /** Returns the page's URL. */
    url(): string;
    /** Returns the page's content. */
    content(): Promise<string>;
    /** Sets the page's content. */
    setContent(
      html: string,
      options?: {
        timeout?: number;
        waitUntil?: "load" | "domcontentloaded" | "networkidle";
      }
    ): Promise<void>;
    /** Adds a script tag into the page. */
    addScriptTag(options?: {
      url?: string;
      path?: string;
      content?: string;
      type?: string;
    }): Promise<void>;
    /** Adds a style tag into the page. */
    addStyleTag(options?: {
      url?: string;
      path?: string;
      content?: string;
    }): Promise<void>;
    /** Returns the page's main frame. */
    mainFrame(): Frame;
    /** Returns an array of all frames attached to the page. */
    frames(): Frame[];
    /** Returns the keyboard object for the page. */
    keyboard: Keyboard;
    /** Returns the mouse object for the page. */
    mouse: Mouse;
    /** Returns the touchscreen object for the page. */
    touchscreen: Touchscreen;
  }

  export interface Frame {
    /** Returns the frame's name. */
    name(): string;
    /** Returns the frame's URL. */
    url(): string;
    /** Returns the frame's parent frame, if any. */
    parentFrame(): Frame | null;
    /** Returns an array of child frames. */
    childFrames(): Frame[];
    /** Returns a locator for the given selector. */
    locator(selector: string): Locator;
    /** Gets a locator by ARIA role. */
    getByRole(
      role: string,
      options?: { name?: string | RegExp; exact?: boolean }
    ): Locator;
    /** Gets a locator by its text content. */
    getByText(text: string | RegExp, options?: { exact?: boolean }): Locator;
    /** Gets a locator by its label text. */
    getByLabel(text: string | RegExp, options?: { exact?: boolean }): Locator;
    /** Gets a locator by its placeholder text. */
    getByPlaceholder(
      text: string | RegExp,
      options?: { exact?: boolean }
    ): Locator;
    /** Gets a locator by its data-testid attribute. */
    getByTestId(testId: string | RegExp): Locator;
  }

  export interface Keyboard {
    /** Presses a key. */
    press(key: string, options?: { delay?: number }): Promise<void>;
    /** Types text. */
    type(text: string, options?: { delay?: number }): Promise<void>;
    /** Inserts a single character. */
    insertText(text: string): Promise<void>;
    /** Presses down a key. */
    down(key: string): Promise<void>;
    /** Releases a key. */
    up(key: string): Promise<void>;
  }

  export interface Mouse {
    /** Moves the mouse to a position. */
    move(x: number, y: number, options?: { steps?: number }): Promise<void>;
    /** Clicks at the current mouse position. */
    click(
      x: number,
      y: number,
      options?: {
        delay?: number;
        button?: "left" | "right" | "middle";
        clickCount?: number;
      }
    ): Promise<void>;
    /** Double-clicks at the current mouse position. */
    dblclick(
      x: number,
      y: number,
      options?: { delay?: number; button?: "left" | "right" | "middle" }
    ): Promise<void>;
    /** Presses down a mouse button. */
    down(options?: {
      button?: "left" | "right" | "middle";
      clickCount?: number;
    }): Promise<void>;
    /** Releases a mouse button. */
    up(options?: {
      button?: "left" | "right" | "middle";
      clickCount?: number;
    }): Promise<void>;
  }

  export interface Touchscreen {
    /** Taps at a position. */
    tap(x: number, y: number): Promise<void>;
  }

  export interface BrowserContext {
    /** Returns a new page in the context. */
    newPage(): Promise<Page>;
    /** Returns all pages in the context. */
    pages(): Page[];
    /** Closes the context and all pages in it. */
    close(): Promise<void>;
    /** Adds cookies to the context. */
    addCookies(
      cookies: Array<{
        name: string;
        value: string;
        url?: string;
        domain?: string;
        path?: string;
        expires?: number;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: "Strict" | "Lax" | "None";
      }>
    ): Promise<void>;
    /** Clears all cookies in the context. */
    clearCookies(): Promise<void>;
    /** Grants permissions to the context. */
    grantPermissions(
      permissions: string[],
      options?: { origin?: string }
    ): Promise<void>;
    /** Clears all permissions in the context. */
    clearPermissions(): Promise<void>;
    /** Sets the context's geolocation. */
    setGeolocation(geolocation: {
      latitude: number;
      longitude: number;
      accuracy?: number;
    }): Promise<void>;
    /** Sets the context's HTTP credentials. */
    setHTTPCredentials(
      credentials: { username: string; password: string } | null
    ): Promise<void>;
    /** Sets the context's offline mode. */
    setOffline(offline: boolean): Promise<void>;
    /** Sets the context's extra HTTP headers. */
    setExtraHTTPHeaders(headers: { [key: string]: string }): Promise<void>;
  }

  export interface Browser {
    /** Returns a new browser context. */
    newContext(options?: {
      viewport?: { width: number; height: number };
      userAgent?: string;
      deviceScaleFactor?: number;
      isMobile?: boolean;
      hasTouch?: boolean;
      javaScriptEnabled?: boolean;
      timezoneId?: string;
      geolocation?: { latitude: number; longitude: number; accuracy?: number };
      locale?: string;
      permissions?: string[];
      extraHTTPHeaders?: { [key: string]: string };
      offline?: boolean;
      httpCredentials?: { username: string; password: string };
      ignoreHTTPSErrors?: boolean;
      bypassCSP?: boolean;
      userDataDir?: string;
      colorScheme?: "light" | "dark" | "no-preference";
      reducedMotion?: "reduce" | "no-preference";
      forcedColors?: "active" | "none";
      acceptDownloads?: boolean;
      baseURL?: string;
      recordVideo?: { dir: string; size?: { width: number; height: number } };
      recordHar?: {
        path: string;
        content?: "embed" | "attach" | "omit";
        mode?: "full" | "minimal";
        urlFilter?: string | RegExp;
      };
    }): Promise<BrowserContext>;
    /** Returns all browser contexts. */
    contexts(): BrowserContext[];
    /** Closes the browser and all its contexts. */
    close(): Promise<void>;
  }

  // --- Test Fixtures ---
  export interface PlaywrightTestArgs {
    page: Page;
    context: BrowserContext;
    browser: Browser;
  }

  // --- Test Runner ---

  interface TestType {
    /** Declares a test. */
    (
      name: string,
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Declares a test with additional details. */
    (
      name: string,
      details: {
        tag?: string | string[];
        annotation?: {
          type: string;
          description?: string;
        };
      },
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Declares a focused test. */
    only(
      name: string,
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Declares a focused test with additional details. */
    only(
      name: string,
      details: {
        tag?: string | string[];
        annotation?: {
          type: string;
          description?: string;
        };
      },
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Declares a skipped test. */
    skip(
      name: string,
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Declares a skipped test with additional details. */
    skip(
      name: string,
      details: {
        tag?: string | string[];
        annotation?: {
          type: string;
          description?: string;
        };
      },
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Declares a test that should be fixed. */
    fixme(
      name: string,
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Declares a test that should be fixed with additional details. */
    fixme(
      name: string,
      details: {
        tag?: string | string[];
        annotation?: {
          type: string;
          description?: string;
        };
      },
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Declares a test that is expected to fail. */
    fail(
      name: string,
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Declares a test that is expected to fail with additional details. */
    fail(
      name: string,
      details: {
        tag?: string | string[];
        annotation?: {
          type: string;
          description?: string;
        };
      },
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Groups tests together. */
    describe(name: string, testFn: () => void): void;
    /** Groups tests together with additional details. */
    describe(
      name: string,
      details: {
        tag?: string | string[];
        annotation?: {
          type: string;
          description?: string;
        };
      },
      testFn: () => void
    ): void;
    /** Groups tests together without a name. */
    describe(testFn: () => void): void;
    /** Runs before each test in a describe block. */
    beforeEach(
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Runs after each test in a describe block. */
    afterEach(
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Runs once before all tests in a describe block. */
    beforeAll(
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Runs once after all tests in a describe block. */
    afterAll(
      testFn: (fixtures: PlaywrightTestArgs) => Promise<void> | void
    ): void;
    /** Configures the test. */
    configure(options: {
      mode?: "default" | "parallel" | "serial";
      retries?: number;
      timeout?: number;
      tag?: string | string[];
      annotation?: {
        type: string;
        description?: string;
      };
    }): void;
    /** Sets up fixtures for tests. */
    use(options: Partial<PlaywrightTestArgs>): void;
    /** Sets up fixtures for tests with a function. */
    use(
      setup: (
        fixtures: PlaywrightTestArgs
      ) => Promise<Partial<PlaywrightTestArgs>>
    ): void;
    /** Sets up fixtures for tests with a function and options. */
    use(
      setup: (
        fixtures: PlaywrightTestArgs
      ) => Promise<Partial<PlaywrightTestArgs>>,
      options: { auto?: boolean }
    ): void;
    /** Sets up fixtures for tests with a function and options. */
    use(
      setup: (fixtures: PlaywrightTestArgs) => Partial<PlaywrightTestArgs>,
      options: { auto?: boolean }
    ): void;
    /** Sets up fixtures for tests with a function and options. */
    use(
      setup: (fixtures: PlaywrightTestArgs) => Partial<PlaywrightTestArgs>
    ): void;
  }

  export const test: TestType;

  // --- Expect Matchers ---

  interface ExpectMatchers<R = Promise<void>> {
    /** Asserts the element is visible. */
    toBeVisible(options?: { timeout?: number }): R;
    /** Asserts the element is hidden. */
    toBeHidden(options?: { timeout?: number }): R;
    /** Asserts the element is enabled. */
    toBeEnabled(options?: { timeout?: number }): R;
    /** Asserts the element is disabled. */
    toBeDisabled(options?: { timeout?: number }): R;
    /** Asserts the element is editable. */
    toBeEditable(options?: { timeout?: number }): R;
    /** Asserts the element is checked. */
    toBeChecked(options?: { timeout?: number }): R;
    /** Asserts the element has the expected text content. */
    toHaveText(
      expected: string | RegExp | (string | RegExp)[],
      options?: { timeout?: number; useInnerText?: boolean }
    ): R;
    /** Asserts the input element has the expected value. */
    toHaveValue(expected: string | RegExp, options?: { timeout?: number }): R;
    /** Asserts the element has the expected attribute value. */
    toHaveAttribute(
      name: string,
      expected: string | RegExp,
      options?: { timeout?: number }
    ): R;
    /** Asserts the element has the expected CSS class. */
    toHaveClass(
      expected: string | RegExp | (string | RegExp)[],
      options?: { timeout?: number }
    ): R;
    /** Asserts the locator resolves to the expected number of elements. */
    toHaveCount(expected: number, options?: { timeout?: number }): R;
    /** Asserts the page has the expected title. */
    toHaveTitle(expected: string | RegExp, options?: { timeout?: number }): R;
    /** Asserts the page has the expected URL. */
    toHaveURL(expected: string | RegExp, options?: { timeout?: number }): R;
    /** Asserts the value is equal to the expected value (deep equality). */
    toEqual(expected: any): R;
    /** Asserts the value is truthy. */
    toBeTruthy(): R;
    /** Asserts the value is falsy. */
    toBeFalsy(): R;
    /** Asserts the value is null. */
    toBeNull(): R;
    /** Asserts the value is defined. */
    toBeDefined(): R;
    /** Asserts the value is undefined. */
    toBeUndefined(): R;
    /** Asserts the value is NaN. */
    toBeNaN(): R;
    /** Asserts the value is greater than the expected value. */
    toBeGreaterThan(expected: number): R;
    /** Asserts the value is greater than or equal to the expected value. */
    toBeGreaterThanOrEqual(expected: number): R;
    /** Asserts the value is less than the expected value. */
    toBeLessThan(expected: number): R;
    /** Asserts the value is less than or equal to the expected value. */
    toBeLessThanOrEqual(expected: number): R;
    /** Asserts the value matches the expected regular expression. */
    toMatch(expected: string | RegExp): R;
    /** Asserts the value contains the expected substring. */
    toContain(expected: string): R;
    /** Asserts the value has the expected length. */
    toHaveLength(expected: number): R;
    /** Asserts the value is an instance of the expected class. */
    toBeInstanceOf(expected: Function): R;
    /** Asserts the value has the expected property. */
    toHaveProperty(keyPath: string | string[], value?: any): R;
    /** Asserts the value is close to the expected value. */
    toBeCloseTo(expected: number, numDigits?: number): R;
    /** Asserts the page matches the expected screenshot. */
    toHaveScreenshot(
      name?: string | string[],
      options?: {
        timeout?: number;
        maxDiffPixels?: number;
        maxDiffPixelRatio?: number;
        threshold?: number;
        animations?: "allow" | "disabled";
        caret?: "hide" | "initial";
        scale?: "css" | "device";
        stylePath?: string | string[];
      }
    ): R;
    /** Asserts the locator matches the expected ARIA snapshot. */
    toMatchAriaSnapshot(name?: string, options?: { timeout?: number }): R;
    /** Asserts the value matches the expected snapshot. */
    toMatchSnapshot(
      name?: string,
      options?: {
        timeout?: number;
        maxDiffPixels?: number;
        maxDiffPixelRatio?: number;
        threshold?: number;
      }
    ): R;
    /** Asserts the value passes the given function within the timeout. */
    toPass(options?: { timeout?: number; intervals?: number[] }): R;
  }

  interface Expect {
    /** Creates an expectation for a locator or value. */
    <T = unknown>(actual: T): ExpectMatchers<Promise<void>>;
    /** Creates a soft expectation. */
    soft<T = unknown>(actual: T): ExpectMatchers<Promise<void>>;
    /** Polls the function until it returns a truthy value or times out. */
    poll<T>(
      fn: () => T | Promise<T>,
      options?: { timeout?: number }
    ): ExpectMatchers<Promise<void>>;
  }

  export const expect: Expect;
}

// Buffer type might be needed for screenshot
declare type Buffer = any;
