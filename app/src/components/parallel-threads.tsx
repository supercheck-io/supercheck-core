"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "./ui/skeleton";

// Define our queue stats interface here for reference
interface QueueStats {
  running: number;
  runningCapacity: number;
  queued: number;
  queuedCapacity: number;
}

export function ParallelThreads() {
  const [stats, setStats] = useState<QueueStats>({
    running: 0,
    runningCapacity: parseInt(process.env.MAX_CONCURRENT_TESTS || '5'),
    queued: 0,
    queuedCapacity: parseInt(process.env.QUEUED_CAPACITY || '50'),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;

    // Use SSE for real-time updates
    try {
      source = new EventSource('/api/queue-stats/sse');
      
      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setStats(data);
          setLoading(false);
        } catch (err) {
          console.error('Error parsing SSE data:', err);
        }
      };
      
      source.onerror = (e) => {
        console.error('SSE connection error:', e);
        setError('Connection to queue stats lost');
      };
    } catch (err) {
      console.error('Failed to initialize SSE:', err);
      setError('Could not connect to queue stats');
    }

    // Cleanup function
    return () => {
      if (source) {
        source.close();
      }
    };
  }, []);

  // Calculate progress percentages
  const runningProgress = Math.min(100, (stats.running / stats.runningCapacity) * 100);
  const queuedProgress = Math.min(100, (stats.queued / stats.queuedCapacity) * 100);

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="flex items-center mr-4">
      {error ? (
        <div className="flex items-center text-xs">
          <span className="font-medium text-gray-500 mr-3">STATUS:</span>
          <span className="text-red-500 font-medium">{error}</span>
        </div>
      ) : (
        <div className="flex items-center text-xs">
          <span className="font-medium text-gray-500 mr-3">PARALLEL EXECUTIONS:</span>
          
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
              <span className={`font-medium ${stats.queued > 0 ? 'text-amber-600 dark:text-amber-500' : 'text-gray-500'}`}>Queued</span>
              <span className="text-gray-700 dark:text-gray-300">{stats.queued}/{stats.queuedCapacity}</span>
            </div>
            <div className="w-32 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-600 rounded-full" 
                style={{ width: `${queuedProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Loading skeleton for parallel executions component
function LoadingSkeleton() {
  return (
    <div className="flex items-center mr-4">
      <div className="flex items-center text-xs">
        <Skeleton className="h-4 w-36 mr-3" />
        
        <div className="flex flex-col mr-6">
          <div className="flex items-center justify-between mb-0.5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="w-32 h-1.5 rounded-full" />
        </div>
        
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-0.5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="w-32 h-1.5 rounded-full" />
        </div>
      </div>
    </div>
  );
} 