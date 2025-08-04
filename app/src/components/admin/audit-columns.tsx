"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Copy, Check, Activity, User, Calendar, Clock } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { DataTableColumnHeader } from "@/components/tests/data-table-column-header";

export interface AuditUser {
  id: string | null;
  name: string | null;
  email: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  details: Record<string, any> | null;
  createdAt: string;
  user: AuditUser;
}

// JSON viewer component
function JsonViewer({ data, title }: { data: any; title: string }) {
  const [copied, setCopied] = useState(false);
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("JSON copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy JSON");
    }
  };

  const formatJsonWithSyntaxHighlight = (obj: any): JSX.Element => {
    if (obj === null) return <span className="text-gray-500">null</span>;
    if (obj === undefined) return <span className="text-gray-500">undefined</span>;
    if (typeof obj === 'string') return <span className="text-green-600">"{obj}"</span>;
    if (typeof obj === 'number') return <span className="text-blue-600">{obj}</span>;
    if (typeof obj === 'boolean') return <span className="text-purple-600">{obj.toString()}</span>;
    
    if (Array.isArray(obj)) {
      return (
        <div>
          <span className="text-gray-600">[</span>
          {obj.map((item, index) => (
            <div key={index} className="ml-4">
              {formatJsonWithSyntaxHighlight(item)}
              {index < obj.length - 1 && <span className="text-gray-600">,</span>}
            </div>
          ))}
          <span className="text-gray-600">]</span>
        </div>
      );
    }
    
    if (typeof obj === 'object') {
      return (
        <div>
          <span className="text-gray-600">{'{'}</span>
          {Object.entries(obj).map(([key, value], index, array) => (
            <div key={key} className="ml-4">
              <span className="text-red-600">"{key}"</span>
              <span className="text-gray-600">: </span>
              {formatJsonWithSyntaxHighlight(value)}
              {index < array.length - 1 && <span className="text-gray-600">,</span>}
            </div>
          ))}
          <span className="text-gray-600">{'}'}</span>
        </div>
      );
    }
    
    return <span>{String(obj)}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{title}</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={copyToClipboard}
          className="h-8"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy JSON"}
        </Button>
      </div>
      
      <Tabs defaultValue="formatted" className="w-full">
        <TabsList>
          <TabsTrigger value="formatted">Formatted</TabsTrigger>
          <TabsTrigger value="raw">Raw JSON</TabsTrigger>
        </TabsList>
        
        <TabsContent value="formatted" className="mt-4">
          <div className="p-4 bg-gray-50 rounded-lg border font-mono text-sm overflow-auto max-h-96">
            {formatJsonWithSyntaxHighlight(data)}
          </div>
        </TabsContent>
        
        <TabsContent value="raw" className="mt-4">
          <pre className="p-4 bg-gray-50 rounded-lg border text-sm overflow-auto max-h-96 whitespace-pre-wrap">
            {JSON.stringify(data, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const getActionBadgeColor = (action: string) => {
  if (action.includes('delete') || action.includes('remove')) return 'bg-red-100 text-red-700';
  if (action.includes('create') || action.includes('add')) return 'bg-green-100 text-green-700';
  if (action.includes('update') || action.includes('edit')) return 'bg-blue-100 text-blue-700';
  if (action.includes('login') || action.includes('auth')) return 'bg-purple-100 text-purple-700';
  return 'bg-gray-100 text-gray-700';
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const renderDetailsPreview = (details: Record<string, any> | null) => {
  if (!details) return <span className="text-muted-foreground text-xs">No details</span>;
  
  const keys = Object.keys(details);
  if (keys.length === 0) return <span className="text-muted-foreground text-xs">No details</span>;
  
  const previewText = keys.slice(0, 2).map(key => `${key}: ${JSON.stringify(details[key])}`).join(', ');
  const truncated = previewText.length > 40 ? previewText.substring(0, 40) + '...' : previewText;
  
  return <span className="text-xs font-mono text-muted-foreground">{truncated}</span>;
};

export const auditLogColumns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Timestamp" />
    ),
    cell: ({ row }) => {
      const dateTime = formatDate(row.getValue("createdAt"));
      const date = new Date(row.getValue("createdAt"));
      const timeAgo = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
        Math.ceil((date.getTime() - Date.now()) / (1000 * 60)),
        'minute'
      );
      
      return (
        <div className="py-2">
          <div className="text-xs font-mono">
            {dateTime}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {timeAgo}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "action",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Action" />
    ),
    cell: ({ row }) => {
      const action = row.getValue("action") as string;
      
      return (
        <div className="py-2">
          <Badge 
            variant="outline" 
            className={`${getActionBadgeColor(action)} text-xs px-2 py-1`}
          >
            <Activity className="mr-1 h-3 w-3" />
            {action}
          </Badge>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "user",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="User" />
    ),
    cell: ({ row }) => {
      const user = row.getValue("user") as AuditUser;
      
      return (
        <div className="py-2">
          <div className="flex items-center gap-2">
            <User className="h-3 w-3 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">
                {user.name || 'System'}
              </div>
              {user.email && (
                <div className="text-xs text-muted-foreground">
                  {user.email}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      const user = row.getValue(id) as AuditUser;
      const searchText = `${user.name || ''} ${user.email || ''}`;
      return searchText.toLowerCase().includes(value.toLowerCase());
    },
  },
  {
    accessorKey: "details",
    header: "Details",
    cell: ({ row }) => {
      const details = row.getValue("details") as Record<string, any> | null;
      
      return (
        <div className="py-2 max-w-[200px]">
          {renderDetailsPreview(details)}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const log = row.original;
      
      return (
        <div className="py-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Eye className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Audit Log Details
                </DialogTitle>
                <DialogDescription>
                  Detailed information about this audit log entry
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[70vh]">
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
                      <div className="mt-1 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-mono">{formatDate(log.createdAt)}</p>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Action</label>
                      <div className="mt-1">
                        <Badge 
                          variant="outline" 
                          className={`${getActionBadgeColor(log.action)} text-xs px-2 py-1`}
                        >
                          <Activity className="mr-1 h-3 w-3" />
                          {log.action}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">User</label>
                      <div className="mt-1 flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{log.user.name || 'System'}</p>
                          {log.user.email && (
                            <p className="text-xs text-muted-foreground">{log.user.email}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Log ID</label>
                      <p className="text-xs font-mono mt-1 text-muted-foreground">{log.id}</p>
                    </div>
                  </div>
                  
                  {log.details && (
                    <div>
                      <JsonViewer data={log.details} title="Audit Details" />
                    </div>
                  )}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>
      );
    },
  },
];