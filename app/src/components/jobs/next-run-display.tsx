'use client';

import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { getNextRunDate, formatNextRunDate } from '@/lib/cron-utils';

interface NextRunDisplayProps {
  cronExpression: string | null | undefined;
}

const NextRunDisplay: React.FC<NextRunDisplayProps> = ({ cronExpression }) => {
  const [nextRun, setNextRun] = useState<string>('N/A');

  useEffect(() => {
    if (cronExpression && cronExpression.trim() !== '') {
      try {
        const nextDate = getNextRunDate(cronExpression);
        setNextRun(formatNextRunDate(nextDate));
      } catch (error) {
        console.error('Error calculating next run date:', error);
        setNextRun('N/A');
      }
    } else {
      setNextRun('N/A');
    }
  }, [cronExpression]);

  if (!cronExpression || cronExpression.trim() === '') {
    return null;
  }

  return (
    <div className="flex items-center text-sm text-muted-foreground mt-2">
      <Clock className="h-4 w-4 mr-2" />
      <span>Next run: {nextRun}</span>
    </div>
  );
};

export default NextRunDisplay; 