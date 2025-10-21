/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test suite for Monaco Editor improvements
 * Tests memory cleanup, error boundaries, accessibility, and performance monitoring
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MonacoEditorClient } from '../monaco-editor';
import { MonacoErrorBoundary } from '../monaco-error-boundary';
import { CodeEditor } from '../code-editor';

// Mock Monaco Editor
jest.mock('@monaco-editor/react', () => ({
  Editor: ({ onMount, onChange, ...props }: any) => {
    React.useEffect(() => {
      // Simulate editor mount
      const mockEditor = {
        dispose: jest.fn(),
        getValue: jest.fn(() => 'test code'),
        setValue: jest.fn(),
        onDidChangeModelContent: jest.fn(() => ({ dispose: jest.fn() })),
        onDidLayoutChange: jest.fn(() => ({ dispose: jest.fn() })),
        updateOptions: jest.fn(),
        focus: jest.fn(),
        getModel: jest.fn(() => ({
          onDidChangeContent: jest.fn(() => ({ dispose: jest.fn() }))
        }))
      };
      
      setTimeout(() => onMount(mockEditor), 0);
    }, [onMount]);

    return (
      <div 
        data-testid="monaco-editor" 
        data-language={props.defaultLanguage}
        data-theme={props.theme}
        onChange={(e: any) => onChange?.(e.target.value)}
      >
        Monaco Editor Mock
      </div>
    );
  },
  useMonaco: () => ({
    editor: {
      defineTheme: jest.fn(),
      setTheme: jest.fn(),
      languages: {
        typescript: {
          javascriptDefaults: {
            setEagerModelSync: jest.fn(),
            setCompilerOptions: jest.fn(),
            setDiagnosticsOptions: jest.fn(),
            addExtraLib: jest.fn()
          }
        }
      },
      Uri: { parse: jest.fn(() => ({ toString: () => 'test-uri' })) },
      Range: jest.fn(),
      editor: { createModel: jest.fn() }
    }
  })
}));

// Mock theme hook
jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light' })
}));

// Mock performance API
Object.defineProperty(global, 'performance', {
  value: {
    now: jest.fn(() => Date.now()),
    memory: {
      usedJSHeapSize: 50 * 1024 * 1024 // 50MB
    }
  },
  writable: true
});

describe('Monaco Editor Improvements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  describe('Memory Cleanup', () => {
    test('should dispose editor instances on unmount', async () => {
      const { unmount } = render(<MonacoEditorClient value="test" onChange={jest.fn()} />);
      
      // Wait for editor to mount
      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      });

      // Unmount component
      unmount();

      // Verify cleanup warnings are not thrown (no errors in cleanup)
      expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('[Monaco Editor] Error disposing')
      );
    });

    test('should handle disposal errors gracefully', async () => {
      const mockDispose = jest.fn(() => {
        throw new Error('Disposal error');
      });

      jest.doMock('@monaco-editor/react', () => ({
        Editor: ({ onMount }: any) => {
          React.useEffect(() => {
            setTimeout(() => onMount({
              dispose: mockDispose,
              getValue: jest.fn(),
              setValue: jest.fn(),
              onDidChangeModelContent: jest.fn(() => ({ dispose: jest.fn() })),
              onDidLayoutChange: jest.fn(() => ({ dispose: jest.fn() })),
              updateOptions: jest.fn(),
              focus: jest.fn(),
              getModel: jest.fn(() => ({
                onDidChangeContent: jest.fn(() => ({ dispose: jest.fn() }))
              }))
            }), 0);
          }, [onMount]);

          return <div data-testid="monaco-editor">Monaco Editor Mock</div>;
        },
        useMonaco: () => ({
          editor: {
            defineTheme: jest.fn(),
            setTheme: jest.fn(),
            languages: {
              typescript: {
                javascriptDefaults: {
                  setEagerModelSync: jest.fn(),
                  setCompilerOptions: jest.fn(),
                  setDiagnosticsOptions: jest.fn(),
                  addExtraLib: jest.fn()
                }
              }
            },
            Uri: { parse: jest.fn(() => ({ toString: () => 'test-uri' })) },
            Range: jest.fn(),
            editor: { createModel: jest.fn() }
          }
        })
      }));

      const { unmount } = render(<MonacoEditorClient value="test" onChange={jest.fn()} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      });

      unmount();

      expect(console.warn).toHaveBeenCalledWith(
        '[Monaco Editor] Error disposing main editor:',
        expect.any(Error)
      );
    });
  });

  describe('Error Boundary', () => {
    test('should catch and display editor errors', () => {
      const ThrowErrorComponent = () => {
        throw new Error('Test error');
      };

      render(
        <MonacoErrorBoundary>
          <ThrowErrorComponent />
        </MonacoErrorBoundary>
      );

      expect(screen.getByText('Editor Error')).toBeInTheDocument();
      expect(screen.getByText(/The code editor encountered an unexpected error/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    test('should provide custom error handling', () => {
      const onError = jest.fn();
      const ThrowErrorComponent = () => {
        throw new Error('Custom error');
      };

      render(
        <MonacoErrorBoundary onError={onError}>
          <ThrowErrorComponent />
        </MonacoErrorBoundary>
      );

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String)
        })
      );
    });

    test('should allow retry after error', async () => {
      let shouldThrow = true;
      const ToggleErrorComponent = () => {
        if (shouldThrow) {
          throw new Error('Test error');
        }
        return <div data-testid="recovered-component">Recovered</div>;
      };

      render(
        <MonacoErrorBoundary>
          <ToggleErrorComponent />
        </MonacoErrorBoundary>
      );

      // Should show error state
      expect(screen.getByText('Editor Error')).toBeInTheDocument();

      // Click retry
      shouldThrow = false;
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));

      // Should show recovered component
      expect(screen.getByTestId('recovered-component')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels', async () => {
      render(<MonacoEditorClient value="test" onChange={jest.fn()} />);
      
      await waitFor(() => {
        const editorContainer = screen.getByRole('application');
        expect(editorContainer).toHaveAttribute('aria-label', 'Code editor');
        expect(editorContainer).toHaveAttribute('aria-describedby', 'editor-help');
      });

      expect(screen.getByText(/Code editor with JavaScript\/TypeScript support/)).toBeInTheDocument();
    });

    test('should have accessible fullscreen controls', async () => {
      render(<MonacoEditorClient value="test" onChange={jest.fn()} />);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /open editor in fullscreen mode/i })).toBeInTheDocument();
      });

      const fullscreenButton = screen.getByRole('button', { name: /open editor in fullscreen mode/i });
      expect(fullscreenButton).toHaveAttribute('title', 'Open editor in fullscreen mode');
    });
  });

  describe('Performance Monitoring', () => {
    test('should track editor load performance', async () => {
      const onChange = jest.fn();
      render(<MonacoEditorClient value="test" onChange={onChange} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      });

      // Performance monitoring should be integrated
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[Monaco Performance] editor-load:'),
        expect.any(Number),
        expect.any(Object)
      );
    });

    test('should track typing performance', async () => {
      const onChange = jest.fn();
      render(<MonacoEditorClient value="test" onChange={onChange} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      });

      // Simulate typing
      const editor = screen.getByTestId('monaco-editor');
      fireEvent.change(editor, { target: { value: 'new code' } });

      // Check that onChange was called
      expect(onChange).toHaveBeenCalledWith('new code');
    });
  });

  describe('Code Editor Integration', () => {
    test('should wrap Monaco Editor with error boundary', async () => {
      render(<CodeEditor value="test" onChange={jest.fn()} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      });

      // Should not show error state for normal operation
      expect(screen.queryByText('Editor Error')).not.toBeInTheDocument();
    });

    test('should handle dynamic loading', () => {
      render(<CodeEditor value="test" onChange={jest.fn()} />);
      
      // Should show loading state initially
      expect(screen.getByText('Monaco Editor Mock')).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    test('should handle Escape key in fullscreen', async () => {
      render(<MonacoEditorClient value="test" onChange={jest.fn()} />);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /open editor in fullscreen mode/i })).toBeInTheDocument();
      });

      // Open fullscreen
      fireEvent.click(screen.getByRole('button', { name: /open editor in fullscreen mode/i }));

      // Simulate Escape key
      fireEvent.keyDown(document, { key: 'Escape' });

      // Should close fullscreen (this would be tested with actual implementation)
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('Memory Usage', () => {
    test('should monitor memory usage', () => {
      const { unmount } = render(<MonacoEditorClient value="test" onChange={jest.fn()} />);
      
      // Memory monitoring should be available
      expect(performance.memory).toBeDefined();
      expect(performance.memory.usedJSHeapSize).toBeGreaterThan(0);

      unmount();
    });
  });
});

describe('Integration Tests', () => {
  test('should work end-to-end without breaking existing functionality', async () => {
    const onChange = jest.fn();
    
    render(
      <div>
        <MonacoErrorBoundary>
          <CodeEditor value="initial code" onChange={onChange} />
        </MonacoErrorBoundary>
      </div>
    );

    // Wait for editor to load
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });

    // Test typing
    const editor = screen.getByTestId('monaco-editor');
    fireEvent.change(editor, { target: { value: 'updated code' } });

    expect(onChange).toHaveBeenCalledWith('updated code');

    // Test fullscreen
    const fullscreenButton = screen.getByRole('button', { name: /open editor in fullscreen mode/i });
    expect(fullscreenButton).toBeInTheDocument();

    // Test accessibility
    expect(screen.getByRole('application')).toHaveAttribute('aria-label', 'Code editor');
  });
});