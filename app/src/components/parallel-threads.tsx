"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface QueueStats {
  running: number;
  runningCapacity: number;
  queued: number;
  queuedCapacity: number;
}

export function ParallelThreads() {
  const [stats, setStats] = useState<QueueStats>({
    running: 0,
    runningCapacity: 100, // Updated to match new capacity
    queued: 0,
    queuedCapacity: 100, // Updated to match new capacity
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isSubscribed = true;
    const fetchQueueStats = async () => {
      try {
        // Fetch queue stats from API
        const response = await fetch('/api/queue-stats');
        if (!response.ok) {
          throw new Error('Failed to fetch queue statistics');
        }
        const data = await response.json();
        
        if (isSubscribed) {
          setStats(data);
          setLoading(false);
        }
      } catch (err) {
        if (isSubscribed) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setLoading(false);
        }
      }
    };

    // Initial fetch
    fetchQueueStats();

    // Set up interval for updates
    const intervalId = setInterval(fetchQueueStats, 3000); // Update more frequently (3s)

    // Cleanup
    return () => {
      isSubscribed = false;
      clearInterval(intervalId);
    };
  }, []);

  // Calculate progress percentages
  const runningProgress = Math.min(100, (stats.running / stats.runningCapacity) * 100);
  const queuedProgress = Math.min(100, (stats.queued / stats.queuedCapacity) * 100);

  return (
    <div className="flex items-center mr-4">
      {loading ? (
        <div className="flex items-center">
          <Loader2 className="animate-spin h-4 w-4 mr-2" />
          <span className="text-gray-400 text-xs">Loading...</span>
        </div>
      ) : (
        <div className="flex items-center text-xs">
          <span className="font-medium text-gray-500 mr-3">PARALLEL THREADS:</span>
          
          <div className="flex flex-col mr-6">
            <div className="flex items-center justify-between mb-0.5">
              <span className={`font-medium ${stats.running > 0 ? 'text-blue-600 dark:text-blue-500' : 'text-gray-500'}`}>Running</span>
              <span className="text-gray-700 dark:text-gray-300">{stats.running}/{stats.runningCapacity}</span>
            </div>
            <div className="w-32 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full" 
                style={{ width: `${runningProgress}%` }}
              />
            </div>
          </div>
          
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-0.5">
              <span className={`font-medium ${stats.queued > 0 ? 'text-blue-600 dark:text-blue-500' : 'text-gray-500'}`}>Queued</span>
              <span className="text-gray-700 dark:text-gray-300">{stats.queued}/{stats.queuedCapacity}</span>
            </div>
            <div className="w-32 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gray-400 dark:bg-gray-500 rounded-full" 
                style={{ width: `${queuedProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 