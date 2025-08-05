import { cn } from '../utils';

describe('utils', () => {
  describe('cn function', () => {
    it('should merge class names correctly', () => {
      const result = cn('px-4', 'py-2', 'bg-blue-500');
      expect(result).toBe('px-4 py-2 bg-blue-500');
    });

    it('should handle conditional classes', () => {
      const isActive = true;
      const isDisabled = false;
      
      const result = cn(
        'px-4 py-2',
        isActive && 'bg-blue-500',
        isDisabled && 'opacity-50'
      );
      
      expect(result).toBe('px-4 py-2 bg-blue-500');
    });

    it('should handle conflicting Tailwind classes', () => {
      const result = cn('px-4 px-6', 'py-2 py-4');
      // Tailwind merge should keep the last conflicting class
      expect(result).toBe('px-6 py-4');
    });

    it('should handle empty inputs', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('should handle null and undefined values', () => {
      const result = cn('px-4', null, undefined, 'py-2');
      expect(result).toBe('px-4 py-2');
    });

    it('should handle arrays of classes', () => {
      const result = cn(['px-4', 'py-2'], 'bg-blue-500');
      expect(result).toBe('px-4 py-2 bg-blue-500');
    });

    it('should handle objects with boolean values', () => {
      const result = cn({
        'px-4': true,
        'py-2': true,
        'bg-red-500': false,
        'bg-blue-500': true,
      });
      expect(result).toBe('px-4 py-2 bg-blue-500');
    });
  });
});