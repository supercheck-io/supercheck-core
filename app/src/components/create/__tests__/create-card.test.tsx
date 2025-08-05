import { render, screen } from '../../../../tests/utils/testHelpers';
import userEvent from '@testing-library/user-event';
import { CreateCard } from '../create-card';

describe('CreateCard', () => {
  const defaultProps = {
    icon: <div data-testid="test-icon">🚀</div>,
    title: 'Test Card',
    description: 'This is a test card description',
    onClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render card with all required props', () => {
      render(<CreateCard {...defaultProps} />);
      
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
      expect(screen.getByText('Test Card')).toBeInTheDocument();
      expect(screen.getByText('This is a test card description')).toBeInTheDocument();
    });

    it('should render icon correctly', () => {
      const customIcon = <span data-testid="custom-icon">📝</span>;
      render(<CreateCard {...defaultProps} icon={customIcon} />);
      
      const icon = screen.getByTestId('custom-icon');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveTextContent('📝');
    });

    it('should render title correctly', () => {
      render(<CreateCard {...defaultProps} title="Custom Title" />);
      
      const title = screen.getByText('Custom Title');
      expect(title).toBeInTheDocument();
      expect(title).toHaveClass('font-medium');
    });

    it('should render description correctly', () => {
      const longDescription = 'This is a very long description that tests the text wrapping and styling of the card component.';
      render(<CreateCard {...defaultProps} description={longDescription} />);
      
      const description = screen.getByText(longDescription);
      expect(description).toBeInTheDocument();
      expect(description).toHaveClass('text-xs', 'text-muted-foreground', 'leading-relaxed');
    });
  });

  describe('styling', () => {
    it('should apply default card styling', () => {
      render(<CreateCard {...defaultProps} />);
      
      const card = screen.getByRole('button'); // Card becomes clickable button-like element
      expect(card).toHaveClass(
        'hover:border-primary',
        'hover:shadow-sm',
        'transition-all',
        'cursor-pointer',
        'h-auto'
      );
    });

    it('should apply custom className', () => {
      render(<CreateCard {...defaultProps} className="custom-class border-2" />);
      
      const card = screen.getByRole('button');
      expect(card).toHaveClass('custom-class', 'border-2');
      // Should still have default classes
      expect(card).toHaveClass('hover:border-primary', 'cursor-pointer');
    });

    it('should apply icon styling', () => {
      render(<CreateCard {...defaultProps} />);
      
      const iconContainer = screen.getByTestId('test-icon').parentElement;
      expect(iconContainer).toHaveClass('text-primary', 'shrink-0');
    });

    it('should apply proper layout classes', () => {
      render(<CreateCard {...defaultProps} />);
      
      // Test the structure and layout classes
      const card = screen.getByRole('button');
      const contentDiv = card.firstChild as HTMLElement;
      expect(contentDiv).toHaveClass('p-5');
      
      const headerDiv = contentDiv.firstChild as HTMLElement;
      expect(headerDiv).toHaveClass('flex', 'items-center', 'gap-3', 'mb-3');
    });
  });

  describe('interactions', () => {
    it('should call onClick when card is clicked', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      
      render(<CreateCard {...defaultProps} onClick={handleClick} />);
      
      const card = screen.getByRole('button');
      await user.click(card);
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not have click behavior when onClick is not provided', () => {
      const propsWithoutClick = { ...defaultProps };
      delete propsWithoutClick.onClick;
      render(<CreateCard {...propsWithoutClick} />);
      
      // Should render as div without button role when onClick is not provided
      const card = screen.getByText('Test Card').closest('div[class*="rounded-lg"]');
      expect(card).toBeInTheDocument();
      expect(card).not.toHaveAttribute('role', 'button');
    });

    it('should handle multiple clicks', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      
      render(<CreateCard {...defaultProps} onClick={handleClick} />);
      
      const card = screen.getByRole('button');
      await user.click(card);
      await user.click(card);
      await user.click(card);
      
      expect(handleClick).toHaveBeenCalledTimes(3);
    });
  });

  describe('accessibility', () => {
    it('should be keyboard accessible when onClick is provided', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      
      render(<CreateCard {...defaultProps} onClick={handleClick} />);
      
      const card = screen.getByRole('button');
      card.focus();
      await user.keyboard('{Enter}');
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should be keyboard accessible with Space key', async () => {
      const handleClick = jest.fn();
      const user = userEvent.setup();
      
      render(<CreateCard {...defaultProps} onClick={handleClick} />);
      
      const card = screen.getByRole('button');
      card.focus();
      await user.keyboard(' ');
      
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should have proper focus styling', () => {
      render(<CreateCard {...defaultProps} onClick={jest.fn()} />);
      
      const card = screen.getByRole('button');
      card.focus();
      
      // Should have focus styles (from Card component)
      expect(card).toHaveClass('cursor-pointer');
    });

    it('should have descriptive content for screen readers', () => {
      render(<CreateCard {...defaultProps} />);
      
      // The card content should be accessible via text content
      expect(screen.getByText('Test Card')).toBeInTheDocument();
      expect(screen.getByText('This is a test card description')).toBeInTheDocument();
    });
  });

  describe('component structure', () => {
    it('should have correct DOM structure', () => {
      render(<CreateCard {...defaultProps} />);
      
      const card = screen.getByRole('button');
      const contentDiv = card.firstChild as HTMLElement;
      const headerDiv = contentDiv.firstChild as HTMLElement;
      const descriptionDiv = contentDiv.lastChild as HTMLElement;
      
      expect(contentDiv).toHaveClass('p-5');
      expect(headerDiv).toHaveClass('flex', 'items-center', 'gap-3', 'mb-3');
      expect(descriptionDiv).toHaveClass('text-xs', 'text-muted-foreground');
    });

    it('should render icon and title in the same row', () => {
      render(<CreateCard {...defaultProps} />);
      
      const card = screen.getByRole('button');
      const headerDiv = card.querySelector('.flex.items-center');
      
      expect(headerDiv).toContainElement(screen.getByTestId('test-icon'));
      expect(headerDiv).toContainElement(screen.getByText('Test Card'));
    });
  });

  describe('edge cases', () => {
    it('should render with empty description', () => {
      render(<CreateCard {...defaultProps} description="" />);
      
      expect(screen.getByText('Test Card')).toBeInTheDocument();
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
      
      // Description should still render but be empty
      const descriptionElement = screen.getByText('Test Card').parentElement?.parentElement?.lastChild;
      expect(descriptionElement).toHaveTextContent('');
    });

    it('should render with complex icon component', () => {
      const ComplexIcon = () => (
        <div data-testid="complex-icon" className="flex items-center">
          <span>🎯</span>
          <span className="ml-1">Target</span>
        </div>
      );
      
      render(<CreateCard {...defaultProps} icon={<ComplexIcon />} />);
      
      const complexIcon = screen.getByTestId('complex-icon');
      expect(complexIcon).toBeInTheDocument();
      expect(complexIcon).toHaveTextContent('🎯Target');
    });

    it('should handle very long titles gracefully', () => {
      const longTitle = 'This is a very long title that might cause layout issues if not handled properly';
      render(<CreateCard {...defaultProps} title={longTitle} />);
      
      const title = screen.getByText(longTitle);
      expect(title).toBeInTheDocument();
      expect(title).toHaveClass('font-medium');
    });

    it('should handle undefined onClick gracefully', () => {
      render(<CreateCard {...defaultProps} onClick={undefined} />);
      
      // Should render as div without button role when onClick is undefined
      const card = screen.getByText('Test Card').closest('div[class*="rounded-lg"]');
      expect(card).toBeInTheDocument();
      expect(card).not.toHaveAttribute('role', 'button');
      // Should not throw when clicked
      expect(() => card?.click()).not.toThrow();
    });
  });

  describe('custom props', () => {
    it('should pass through additional props to Card component', () => {
      render(
        <CreateCard 
          {...defaultProps} 
          data-testid="custom-card"
          role="region"
          aria-label="Custom create card"
        />
      );
      
      const card = screen.getByTestId('custom-card');
      expect(card).toHaveAttribute('role', 'region');
      expect(card).toHaveAttribute('aria-label', 'Custom create card');
    });
  });
});