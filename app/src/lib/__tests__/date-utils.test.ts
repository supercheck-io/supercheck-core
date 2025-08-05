import { formatDistanceToNow, formatDurationMinutes } from '../date-utils';

describe('date-utils', () => {
  beforeEach(() => {
    // Mock the current date to a fixed time for consistent testing
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('formatDistanceToNow', () => {
    it('should return "just now" for very recent times', () => {
      const now = new Date('2024-01-01T12:00:00Z');
      const result = formatDistanceToNow(now);
      expect(result).toBe('just now');
    });

    it('should return "just now" for times within 30 seconds', () => {
      const recent = new Date('2024-01-01T11:59:40Z'); // 20 seconds ago
      const result = formatDistanceToNow(recent);
      expect(result).toBe('just now');
    });

    it('should return seconds for times between 30 seconds and 1 minute', () => {
      const thirtySecondsAgo = new Date('2024-01-01T11:59:30Z');
      const result = formatDistanceToNow(thirtySecondsAgo);
      expect(result).toBe('30 seconds ago');
    });

    it('should return minutes for times between 1 minute and 1 hour', () => {
      const fiveMinutesAgo = new Date('2024-01-01T11:55:00Z');
      const result = formatDistanceToNow(fiveMinutesAgo);
      expect(result).toBe('5 minutes ago');
    });

    it('should return singular minute for 1 minute ago', () => {
      const oneMinuteAgo = new Date('2024-01-01T11:59:00Z');
      const result = formatDistanceToNow(oneMinuteAgo);
      expect(result).toBe('1 minute ago');
    });

    it('should return hours for times between 1 hour and 1 day', () => {
      const twoHoursAgo = new Date('2024-01-01T10:00:00Z');
      const result = formatDistanceToNow(twoHoursAgo);
      expect(result).toBe('2 hours ago');
    });

    it('should return singular hour for 1 hour ago', () => {
      const oneHourAgo = new Date('2024-01-01T11:00:00Z');
      const result = formatDistanceToNow(oneHourAgo);
      expect(result).toBe('1 hour ago');
    });

    it('should return days for times between 1 day and 1 week', () => {
      const threeDaysAgo = new Date('2023-12-29T12:00:00Z');
      const result = formatDistanceToNow(threeDaysAgo);
      expect(result).toBe('3 days ago');
    });

    it('should return singular day for 1 day ago', () => {
      const oneDayAgo = new Date('2023-12-31T12:00:00Z');
      const result = formatDistanceToNow(oneDayAgo);
      expect(result).toBe('1 day ago');
    });

    it('should return weeks for times between 1 week and 1 month', () => {
      const twoWeeksAgo = new Date('2023-12-18T12:00:00Z');
      const result = formatDistanceToNow(twoWeeksAgo);
      expect(result).toBe('2 weeks ago');
    });

    it('should return singular week for 1 week ago', () => {
      const oneWeekAgo = new Date('2023-12-25T12:00:00Z');
      const result = formatDistanceToNow(oneWeekAgo);
      expect(result).toBe('1 week ago');
    });

    it('should return months for times between 1 month and 1 year', () => {
      const twoMonthsAgo = new Date('2023-11-01T12:00:00Z');
      const result = formatDistanceToNow(twoMonthsAgo);
      expect(result).toBe('2 months ago');
    });

    it('should return singular month for 1 month ago', () => {
      const oneMonthAgo = new Date('2023-12-01T12:00:00Z');
      const result = formatDistanceToNow(oneMonthAgo);
      expect(result).toBe('1 month ago');
    });

    it('should return years for times over 1 year', () => {
      const twoYearsAgo = new Date('2022-01-01T12:00:00Z');
      const result = formatDistanceToNow(twoYearsAgo);
      expect(result).toBe('2 years ago');
    });

    it('should return singular year for 1 year ago', () => {
      const oneYearAgo = new Date('2023-01-01T12:00:00Z');
      const result = formatDistanceToNow(oneYearAgo);
      expect(result).toBe('1 year ago');
    });

    it('should handle string inputs', () => {
      const result = formatDistanceToNow('2024-01-01T11:55:00Z');
      expect(result).toBe('5 minutes ago');
    });

    it('should handle invalid dates', () => {
      const result = formatDistanceToNow('invalid-date');
      expect(result).toBe('Invalid date');
    });

    it('should handle invalid Date objects', () => {
      const result = formatDistanceToNow(new Date('invalid'));
      expect(result).toBe('Invalid date');
    });
  });

  describe('formatDurationMinutes', () => {
    it('should format minutes less than 60', () => {
      expect(formatDurationMinutes(30)).toBe('30m');
      expect(formatDurationMinutes(1)).toBe('1m');
      expect(formatDurationMinutes(59)).toBe('59m');
    });

    it('should format exact hours', () => {
      expect(formatDurationMinutes(60)).toBe('1h');
      expect(formatDurationMinutes(120)).toBe('2h');
      expect(formatDurationMinutes(180)).toBe('3h');
    });

    it('should format hours with remaining minutes', () => {
      expect(formatDurationMinutes(90)).toBe('1h 30m');
      expect(formatDurationMinutes(125)).toBe('2h 5m');
      expect(formatDurationMinutes(61)).toBe('1h 1m');
    });

    it('should format days with no remaining time', () => {
      expect(formatDurationMinutes(1440)).toBe('1d'); // 24 hours = 1 day
      expect(formatDurationMinutes(2880)).toBe('2d'); // 48 hours = 2 days
    });

    it('should format days with remaining hours', () => {
      expect(formatDurationMinutes(1500)).toBe('1d 1h'); // 1 day + 1 hour
      expect(formatDurationMinutes(1620)).toBe('1d 3h'); // 1 day + 3 hours
    });

    it('should format days with remaining minutes', () => {
      expect(formatDurationMinutes(1470)).toBe('1d 30m'); // 1 day + 30 minutes
      expect(formatDurationMinutes(1441)).toBe('1d 1m'); // 1 day + 1 minute
    });

    it('should format days with hours and minutes', () => {
      expect(formatDurationMinutes(1530)).toBe('1d 1h 30m'); // 1 day + 1 hour + 30 minutes
      expect(formatDurationMinutes(2965)).toBe('2d 1h 25m'); // 2 days + 1 hour + 25 minutes (2965 - 2880 = 85, 85 - 60 = 25)
    });

    it('should handle zero minutes', () => {
      expect(formatDurationMinutes(0)).toBe('0m');
    });

    it('should handle large durations', () => {
      expect(formatDurationMinutes(10080)).toBe('7d'); // 1 week
      expect(formatDurationMinutes(10140)).toBe('7d 1h'); // 1 week + 1 hour
      expect(formatDurationMinutes(43200)).toBe('30d'); // 30 days
    });
  });
});