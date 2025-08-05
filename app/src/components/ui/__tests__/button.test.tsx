import { render, screen, fireEvent } from '../../../../tests/utils/testHelpers';
import userEvent from '@testing-library/user-event';
import { Button } from '../button';

describe('Button', () => {
  describe('rendering', () => {
    it('should render button with default props', () => {
      render(<Button>Click me</Button>);
      
      const button = screen.getByRole('button', { name: /click me/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('data-slot', 'button');
    });

    it('should render button with custom text', () => {
      render(<Button>Custom Text</Button>);
      
      expect(screen.getByRole('button', { name: /custom text/i })).toBeInTheDocument();
    });

    it('should render as child component when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      );
      
      const link = screen.getByRole('link', { name: /link button/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/test');
      expect(link).toHaveAttribute('data-slot', 'button');
    });
  });

  describe('variants', () => {
    it('should apply default variant classes', () => {
      render(<Button>Default</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-primary', 'text-primary-foreground');
    });

    it('should apply destructive variant classes', () => {
      render(<Button variant="destructive">Delete</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-destructive', 'text-white');
    });

    it('should apply outline variant classes', () => {
      render(<Button variant="outline">Outline</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('border', 'bg-background');
    });

    it('should apply secondary variant classes', () => {
      render(<Button variant="secondary">Secondary</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-secondary', 'text-secondary-foreground');
    });

    it('should apply ghost variant classes', () => {
      render(<Button variant="ghost">Ghost</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('hover:bg-accent');
    });

    it('should apply link variant classes', () => {
      render(<Button variant="link">Link</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('text-primary', 'underline-offset-4');
    });
  });

  describe('sizes', () => {
    it('should apply default size classes', () => {
      render(<Button>Default Size</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-9', 'px-4', 'py-2');
    });

    it('should apply small size classes', () => {
      render(<Button size="sm">Small</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-8', 'px-3');
    });

    it('should apply large size classes', () => {
      render(<Button size="lg">Large</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-10', 'px-6');
    });

    it('should apply icon size classes', () => {
      render(<Button size="icon">🚀</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('size-9');
    });
  });

  describe('custom classes', () => {
    it('should merge custom className with variant classes', () => {
      render(<Button className="custom-class">Custom</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
      expect(button).toHaveClass('bg-primary'); // Still has variant classes
    });

    it('should handle conflicting classes correctly with cn utility', () => {
      render(<Button className="bg-red-500" variant="secondary">Conflicting</Button>);
      
      const button = screen.getByRole('button');
      // The cn utility should resolve class conflicts
      expect(button).toHaveClass('bg-red-500');
    });
  });

  describe('interactions', () => {
    it('should handle click events', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      
      render(<Button onClick={handleClick}>Click me</Button>);
      
      const button = screen.getByRole('button');
      await user.click(button);
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not trigger click when disabled', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      
      render(<Button onClick={handleClick} disabled>Disabled</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      
      await user.click(button);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should have proper disabled styling', () => {
      render(<Button disabled>Disabled</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('disabled:pointer-events-none', 'disabled:opacity-50');
    });
  });

  describe('accessibility', () => {
    it('should have proper focus styles', () => {
      render(<Button>Focus me</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('focus-visible:ring-ring/50', 'focus-visible:ring-[3px]');
    });

    it('should handle aria-invalid styling', () => {
      render(<Button aria-invalid="true">Invalid</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('aria-invalid:ring-destructive/20');
    });

    it('should support all standard button attributes', () => {
      render(
        <Button
          type="submit"
          form="test-form"
          aria-label="Submit form"
          title="Submit the form"
        >
          Submit
        </Button>
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('form', 'test-form');
      expect(button).toHaveAttribute('aria-label', 'Submit form');
      expect(button).toHaveAttribute('title', 'Submit the form');
    });
  });

  describe('with icons', () => {
    it('should apply icon-specific classes when icon is present', () => {
      render(
        <Button>
          <svg data-testid="icon">
            <path />
          </svg>
          Button with icon
        </Button>
      );
      
      const button = screen.getByRole('button');
      const icon = screen.getByTestId('icon');
      
      expect(button).toBeInTheDocument();
      expect(icon).toBeInTheDocument();
      // Icon-specific classes are applied via CSS selectors
      expect(button).toHaveClass('has-[>svg]:px-3');
    });

    it('should handle icon-only buttons', () => {
      render(
        <Button size="icon" aria-label="Close">
          <svg data-testid="close-icon">
            <path />
          </svg>
        </Button>
      );
      
      const button = screen.getByRole('button', { name: /close/i });
      const icon = screen.getByTestId('close-icon');
      
      expect(button).toBeInTheDocument();
      expect(icon).toBeInTheDocument();
      expect(button).toHaveClass('size-9');
    });
  });

  describe('variant and size combinations', () => {
    it('should handle destructive + small combination', () => {
      render(<Button variant="destructive" size="sm">Delete</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-destructive', 'h-8', 'px-3');
    });

    it('should handle outline + large combination', () => {
      render(<Button variant="outline" size="lg">Large Outline</Button>);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('border', 'h-10', 'px-6');
    });

    it('should handle ghost + icon combination', () => {
      render(
        <Button variant="ghost" size="icon" aria-label="Menu">
          ☰
        </Button>
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('hover:bg-accent', 'size-9');
    });
  });

  describe('forwarded props', () => {
    it('should forward all standard button props', () => {
      const handleMouseEnter = jest.fn();
      const handleMouseLeave = jest.fn();
      
      render(
        <Button
          id="test-button"
          data-testid="custom-button"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          tabIndex={0}
        >
          Test Button
        </Button>
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('id', 'test-button');
      expect(button).toHaveAttribute('data-testid', 'custom-button');
      expect(button).toHaveAttribute('tabindex', '0');
      
      // Test event forwarding
      fireEvent.mouseEnter(button);
      expect(handleMouseEnter).toHaveBeenCalledTimes(1);
      
      fireEvent.mouseLeave(button);
      expect(handleMouseLeave).toHaveBeenCalledTimes(1);
    });
  });
});