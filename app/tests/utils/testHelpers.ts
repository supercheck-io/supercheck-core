import { render, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';

// Custom render function with providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  // Add any providers here (e.g., theme, auth, etc.)
}

export function customRender(
  ui: ReactElement,
  options?: CustomRenderOptions
) {
  return render(ui, {
    // Add wrapper with providers if needed
    // wrapper: ({ children }) => <Providers>{children}</Providers>,
    ...options,
  });
}

// Re-export everything from testing library
export * from '@testing-library/react';
export { userEvent };

// Override render method
export { customRender as render };

// Test data factories
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  organizationId: 'test-org-id',
  role: 'project_viewer',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockOrganization = (overrides = {}) => ({
  id: 'test-org-id',
  name: 'Test Organization',
  slug: 'test-org',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockTest = (overrides = {}) => ({
  id: 'test-id',
  name: 'Test E2E Flow',
  description: 'Test description',
  playwrightCode: 'test("example", async ({ page }) => { /* test code */ });',
  organizationId: 'test-org-id',
  projectId: 'test-project-id',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockJob = (overrides = {}) => ({
  id: 'job-id',
  name: 'Test Job',
  cron: '0 9 * * *',
  testId: 'test-id',
  enabled: true,
  organizationId: 'test-org-id',
  projectId: 'test-project-id',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockRun = (overrides = {}) => ({
  id: 'run-id',
  testId: 'test-id',
  jobId: 'job-id',
  status: 'completed' as const,
  result: 'passed' as const,
  duration: 5000,
  organizationId: 'test-org-id',
  projectId: 'test-project-id',
  startedAt: new Date('2024-01-01T09:00:00Z'),
  completedAt: new Date('2024-01-01T09:00:05Z'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockMonitor = (overrides = {}) => ({
  id: 'monitor-id',
  name: 'API Health Check',
  url: 'https://api.example.com/health',
  method: 'GET' as const,
  interval: 300, // 5 minutes
  timeout: 30000, // 30 seconds
  enabled: true,
  organizationId: 'test-org-id',
  projectId: 'test-project-id',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

// Mock server action responses
export const createMockServerActionResult = <T>(data: T, success = true) => ({
  success,
  data: success ? data : undefined,
  error: success ? undefined : 'Mock error message',
});

// Async testing utilities
export const waitForAsyncUpdates = () => 
  new Promise(resolve => setTimeout(resolve, 0));

export const waitForLoadingToFinish = async () => {
  await waitForAsyncUpdates();
};

// Form testing utilities
export const fillForm = async (form: HTMLFormElement, data: Record<string, string>) => {
  const user = userEvent.setup();
  
  for (const [name, value] of Object.entries(data)) {
    const field = form.querySelector(`[name="${name}"]`) as HTMLInputElement;
    if (field) {
      await user.clear(field);
      await user.type(field, value);
    }
  }
};

export const submitForm = async (form: HTMLFormElement) => {
  const user = userEvent.setup();
  const submitButton = form.querySelector('[type="submit"]') as HTMLButtonElement;
  if (submitButton) {
    await user.click(submitButton);
  }
};

// API mocking utilities
export const createMockFetch = (responses: Record<string, any>) => {
  return jest.fn().mockImplementation((url: string) => {
    const response = responses[url] || responses.default;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response)),
    });
  });
};

// Date and time utilities
export const createMockDate = (dateString: string) => {
  const mockDate = new Date(dateString);
  jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
  return mockDate;
};

export const restoreDate = () => {
  (global.Date as any).mockRestore?.();
};

// Local storage utilities
export const mockLocalStorage = () => {
  const store: Record<string, string> = {};
  
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: jest.fn((key: string) => store[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        Object.keys(store).forEach(key => delete store[key]);
      }),
    },
    writable: true,
  });
  
  return window.localStorage;
};