import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Activity, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Monitor } from "./schema";
import { MonitorConfig } from "@/db/schema/schema";
import { formatDistanceToNow, parseISO } from "date-fns";

interface HeartbeatDisplayProps {
  monitor: Monitor & { config?: MonitorConfig };
}

export function HeartbeatDisplay({ monitor }: HeartbeatDisplayProps) {
  if (monitor.type !== "heartbeat") {
    return null;
  }

  const config = monitor.config as MonitorConfig | undefined;
  const expectedInterval = config?.expectedIntervalMinutes || 60;
  const gracePeriod = config?.gracePeriodMinutes || 10;
  const lastPingAt = config?.lastPingAt;
  const heartbeatUrl = config?.heartbeatUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/heartbeat/${monitor.id}`;
  const failureUrl = `${heartbeatUrl}/fail`;

  // Calculate time since last ping
  let timeSinceLastPing = "";
  let isOverdue = false;
  
  if (lastPingAt) {
    const lastPing = new Date(lastPingAt);
    const now = new Date();
    const minutesSince = Math.floor((now.getTime() - lastPing.getTime()) / (1000 * 60));
    
    if (minutesSince < 60) {
      timeSinceLastPing = `${minutesSince} minute${minutesSince !== 1 ? 's' : ''} ago`;
    } else if (minutesSince < 1440) {
      const hours = Math.floor(minutesSince / 60);
      timeSinceLastPing = `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(minutesSince / 1440);
      timeSinceLastPing = `${days} day${days !== 1 ? 's' : ''} ago`;
    }
    
    isOverdue = minutesSince > (expectedInterval + gracePeriod);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-pink-600" />
            Heartbeat Configuration
          </CardTitle>
          <CardDescription>
            Passive monitoring expecting regular pings from your services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Expected Interval</label>
              <p className="text-sm">{expectedInterval} minutes</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Grace Period</label>
              <p className="text-sm">{gracePeriod} minutes</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Last Ping</label>
              <div className="flex items-center gap-2 mt-1">
                {lastPingAt ? (
                  <>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{timeSinceLastPing}</span>
                    {isOverdue && (
                      <Badge variant="destructive" className="ml-2">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Overdue
                      </Badge>
                    )}
                    {!isOverdue && (
                      <Badge variant="secondary" className="ml-2">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        On Time
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">No pings received yet</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Heartbeat URLs</CardTitle>
          <CardDescription>
            Use these URLs to send pings from your services, scripts, or cron jobs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Success URL</label>
            <div className="flex items-center gap-2 mt-1 group">
              <code className="flex-1 text-sm bg-muted px-3 py-2 rounded font-mono break-all">
                {heartbeatUrl}
              </code>
              <CopyButton value={heartbeatUrl} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Send GET or POST requests to this URL when your service is running successfully
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Failure URL</label>
            <div className="flex items-center gap-2 mt-1 group">
              <code className="flex-1 text-sm bg-muted px-3 py-2 rounded font-mono break-all">
                {failureUrl}
              </code>
              <CopyButton value={failureUrl} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Send requests to this URL to explicitly report failures
            </p>
          </div>

          <div className="bg-muted/30 p-4 rounded-lg">
            <h4 className="font-medium text-sm mb-2">Usage Examples:</h4>
            <div className="space-y-2 text-sm font-mono">
              <div>
                <span className="text-muted-foreground"># Success ping:</span>
                <br />
                <code>curl &quot;{heartbeatUrl}&quot;</code>
              </div>
              <div>
                <span className="text-muted-foreground"># Failure ping:</span>
                <br />
                <code>curl &quot;{failureUrl}&quot;</code>
              </div>
              <div>
                <span className="text-muted-foreground"># With error message:</span>
                <br />
                <code>curl -d &quot;Backup failed&quot; &quot;{failureUrl}&quot;</code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 