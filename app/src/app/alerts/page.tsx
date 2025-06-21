"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Bell, BellRing, CheckCircle, Clock, Mail, MessageSquare, Webhook, Plus, Settings, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NotificationProviderForm } from "@/components/alerts/notification-provider-form";
import { formatDistance } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface AlertRecord {
  id: string;
  monitorId: string;
  monitorName: string;
  status: 'down' | 'up' | 'error' | 'timeout';
  message: string;
  createdAt: string;
  sentTo: string[];
  acknowledged: boolean;
}

interface NotificationProvider {
  id: string;
  name: string;
  type: 'email' | 'slack' | 'webhook' | 'telegram' | 'discord';
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

const mockAlerts: AlertRecord[] = [
  {
    id: "1",
    monitorId: "mon_1",
    monitorName: "API Health Check",
    status: "down",
    message: "HTTP request failed with status 500",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
    sentTo: ["email", "slack"],
    acknowledged: false,
  },
  {
    id: "2",
    monitorId: "mon_2", 
    monitorName: "Website Ping",
    status: "up",
    message: "Service recovered - response time 245ms",
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 minutes ago
    sentTo: ["email"],
    acknowledged: true,
  },
  {
    id: "3",
    monitorId: "mon_3",
    monitorName: "Database Connection",
    status: "timeout",
    message: "Connection timeout after 30 seconds",
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
    sentTo: ["slack", "webhook"],
    acknowledged: false,
  },
];

const mockProviders: NotificationProvider[] = [
  {
    id: "1",
    name: "Primary Email",
    type: "email",
    config: { smtp_host: "smtp.gmail.com", to_email: "admin@company.com" },
    isActive: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "2", 
    name: "Dev Team Slack",
    type: "slack",
    config: { webhook_url: "https://hooks.slack.com/..." },
    isActive: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [providers, setProviders] = useState<NotificationProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);

  useEffect(() => {
    // Simulate loading data
    setTimeout(() => {
      setAlerts(mockAlerts);
      setProviders(mockProviders);
      setLoading(false);
    }, 1000);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'down':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'up':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'timeout':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      down: "destructive",
      up: "success", 
      error: "secondary",
      timeout: "outline"
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || "secondary"}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'slack':
        return <MessageSquare className="h-4 w-4" />;
      case 'webhook':
        return <Webhook className="h-4 w-4" />;
      case 'telegram':
        return <MessageSquare className="h-4 w-4" />;
      case 'discord':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    const matchesSearch = alert.monitorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         alert.message.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || alert.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const alertStats = {
    total: alerts.length,
    active: alerts.filter(a => !a.acknowledged).length,
    down: alerts.filter(a => a.status === 'down').length,
    up: alerts.filter(a => a.status === 'up').length,
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
          <p className="text-muted-foreground">
            Monitor alert history and manage notification providers
          </p>
        </div>
      </div>

      {/* Alert Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Alerts</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alertStats.total}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <BellRing className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{alertStats.active}</div>
            <p className="text-xs text-muted-foreground">Unacknowledged</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Down Events</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alertStats.down}</div>
            <p className="text-xs text-muted-foreground">Service failures</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recovery Events</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{alertStats.up}</div>
            <p className="text-xs text-muted-foreground">Service recoveries</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="history" className="space-y-4">
        <TabsList>
          <TabsTrigger value="history">Alert History</TabsTrigger>
          <TabsTrigger value="providers">Notification Providers</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search alerts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="down">Down</SelectItem>
                <SelectItem value="up">Up</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="timeout">Timeout</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Alert History Table */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Alerts</CardTitle>
              <CardDescription>
                All alert notifications sent to your configured providers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-4 w-[200px]" />
                      <Skeleton className="h-4 w-[100px]" />
                      <Skeleton className="h-4 w-[150px]" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Monitor</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Sent To</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAlerts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No alerts found matching your criteria
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredAlerts.map((alert) => (
                          <TableRow key={alert.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(alert.status)}
                                {getStatusBadge(alert.status)}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              {alert.monitorName}
                            </TableCell>
                            <TableCell className="max-w-[300px] truncate">
                              {alert.message}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {alert.sentTo.map((provider) => (
                                  <Badge key={provider} variant="outline" className="text-xs">
                                    {provider}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDistance(new Date(alert.createdAt), new Date(), { addSuffix: true })}
                            </TableCell>
                            <TableCell>
                              {!alert.acknowledged && (
                                <Button variant="outline" size="sm">
                                  Acknowledge
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium">Notification Providers</h3>
              <p className="text-sm text-muted-foreground">
                Configure where alerts are sent when monitors fail
              </p>
            </div>
            <Dialog open={isProviderDialogOpen} onOpenChange={setIsProviderDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Provider
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add Notification Provider</DialogTitle>
                  <DialogDescription>
                    Configure a new notification channel for alerts
                  </DialogDescription>
                </DialogHeader>
                <NotificationProviderForm 
                  onSuccess={() => {
                    setIsProviderDialogOpen(false);
                    // Refresh providers list
                  }}
                  onCancel={() => setIsProviderDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-4 w-[100px]" />
                    <Skeleton className="h-3 w-[80px]" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : (
              providers.map((provider) => (
                <Card key={provider.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getProviderIcon(provider.type)}
                        <CardTitle className="text-base">{provider.name}</CardTitle>
                      </div>
                      <Badge variant={provider.isActive ? "success" : "secondary"}>
                        {provider.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <CardDescription className="capitalize">
                      {provider.type} notifications
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Created {formatDistance(new Date(provider.createdAt), new Date(), { addSuffix: true })}
                      </p>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
} 