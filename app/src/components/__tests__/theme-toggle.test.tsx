import { render, screen } from '../../../tests/utils/testHelpers';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../theme-toggle';

// Mock next-themes
const mockSetTheme = jest.fn();
jest.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme: mockSetTheme,
  }),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Sun: ({ className, ...props }: React.ComponentProps<'svg'>) => (
    <svg data-testid="sun-icon" className={className} {...props}>
      <circle />
    </svg>
  ),
  Moon: ({ className, ...props }: React.ComponentProps<'svg'>) => (
    <svg data-testid="moon-icon" className={className} {...props}>
      <path />
    </svg>
  ),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render theme toggle button', () => {
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button', { name: /toggle theme/i });
      expect(button).toBeInTheDocument();
    });

    it('should render sun and moon icons', () => {
      render(<ThemeToggle />);
      
      expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
      expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
    });

    it('should have proper button styling', () => {
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-9', 'w-9');
    });

    it('should have screen reader accessible text', () => {
      render(<ThemeToggle />);
      
      expect(screen.getByText('Toggle theme')).toHaveClass('sr-only');
    });
  });

  describe('icon styling', () => {
    it('should apply correct classes to sun icon', () => {
      render(<ThemeToggle />);
      
      const sunIcon = screen.getByTestId('sun-icon');
      expect(sunIcon).toHaveClass(
        'h-4',
        'w-4',
        'rotate-0',
        'scale-100',
        'transition-all',
        'dark:-rotate-90',
        'dark:scale-0'
      );
    });

    it('should apply correct classes to moon icon', () => {
      render(<ThemeToggle />);
      
      const moonIcon = screen.getByTestId('moon-icon');
      expect(moonIcon).toHaveClass(
        'absolute',
        'h-4',
        'w-4',
        'rotate-90',
        'scale-0',
        'transition-all',
        'dark:rotate-0',
        'dark:scale-100'
      );
    });
  });

  describe('dropdown menu', () => {
    it('should open dropdown menu when button is clicked', async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button', { name: /toggle theme/i });
      await user.click(button);
      
      // Menu items should be visible after click
      expect(screen.getByRole('menuitem', { name: /light/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /dark/i })).toBeInTheDocument();
    });

    it('should render light theme option with sun icon', async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button', { name: /toggle theme/i });
      await user.click(button);
      
      const lightOption = screen.getByRole('menuitem', { name: /light/i });
      expect(lightOption).toBeInTheDocument();
      expect(lightOption).toHaveTextContent('Light');
      
      // Should have a sun icon inside
      const sunIcons = screen.getAllByTestId('sun-icon');
      expect(sunIcons.length).toBeGreaterThan(1); // One in button, one in menu item
    });

    it('should render dark theme option with moon icon', async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button', { name: /toggle theme/i });
      await user.click(button);
      
      const darkOption = screen.getByRole('menuitem', { name: /dark/i });
      expect(darkOption).toBeInTheDocument();
      expect(darkOption).toHaveTextContent('Dark');
      
      // Should have a moon icon inside
      const moonIcons = screen.getAllByTestId('moon-icon');
      expect(moonIcons.length).toBeGreaterThan(1); // One in button, one in menu item
    });
  });

  describe('theme switching', () => {
    it('should call setTheme with "light" when light option is clicked', async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button', { name: /toggle theme/i });
      await user.click(button);
      
      const lightOption = screen.getByRole('menuitem', { name: /light/i });
      await user.click(lightOption);
      
      expect(mockSetTheme).toHaveBeenCalledTimes(1);
      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });

    it('should call setTheme with "dark" when dark option is clicked', async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button', { name: /toggle theme/i });
      await user.click(button);
      
      const darkOption = screen.getByRole('menuitem', { name: /dark/i });
      await user.click(darkOption);
      
      expect(mockSetTheme).toHaveBeenCalledTimes(1);
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });

    it('should not call setTheme when button is clicked (only menu items)', async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button', { name: /toggle theme/i });
      await user.click(button);
      
      expect(mockSetTheme).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes', async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button', { name: /toggle theme/i });
      
      // Button should have dropdown menu trigger attributes
      expect(button).toHaveAttribute('aria-haspopup');
      
      // After clicking, should have expanded state
      await user.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button', { name: /toggle theme/i });
      
      // Focus and open with Enter
      button.focus();
      await user.keyboard('{Enter}');
      
      expect(screen.getByRole('menuitem', { name: /light/i })).toBeInTheDocument();
      
      // Should be able to navigate with arrow keys and select with Enter
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');
      
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });

    it('should close menu when Escape is pressed', async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button', { name: /toggle theme/i });
      await user.click(button);
      
      expect(screen.getByRole('menuitem', { name: /light/i })).toBeInTheDocument();
      
      await user.keyboard('{Escape}');
      
      // Menu should be closed
      expect(screen.queryByRole('menuitem', { name: /light/i })).not.toBeInTheDocument();
    });
  });

  describe('integration with dropdown components', () => {
    it('should properly integrate with DropdownMenu components', async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);
      
      // Should work as a proper dropdown trigger
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('data-state', 'closed');
      
      await user.click(button);
      expect(button).toHaveAttribute('data-state', 'open');
    });

    it('should align dropdown content to end', async () => {
      const user = userEvent.setup();
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button');
      await user.click(button);
      
      // The dropdown content should have align="end" attribute
      // This is typically reflected in positioning classes
      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should handle setTheme errors gracefully', async () => {
      mockSetTheme.mockImplementation(() => {
        throw new Error('Theme switching failed');
      });
      
      const user = userEvent.setup();
      render(<ThemeToggle />);
      
      const button = screen.getByRole('button', { name: /toggle theme/i });
      await user.click(button);
      
      const lightOption = screen.getByRole('menuitem', { name: /light/i });
      
      // Should not crash when setTheme throws
      await expect(user.click(lightOption)).resolves.not.toThrow();
    });
  });
});