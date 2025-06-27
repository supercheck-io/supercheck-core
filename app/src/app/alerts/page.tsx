"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NotificationProviderForm } from "@/components/alerts/notification-provider-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Mail, MessageSquare, Webhook, Plus, Edit, Trash2, SearchIcon, AlertTriangle, Bell, Loader2 } from "lucide-react";
import { formatDistance } from "date-fns";
import { DataTable } from "@/components/alerts/data-table";
import { columns, type AlertHistory } from "@/components/alerts/columns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { alertStatuses } from "@/components/alerts/data";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

interface NotificationProvider {
  id: string;
  type: 'email' | 'slack' | 'webhook' | 'telegram' | 'discord';
  config: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

export default function AlertsPage() {
  const [providers, setProviders] = useState<NotificationProvider[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertHistory[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<NotificationProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Alerts", isCurrentPage: true },
  ];

  useEffect(() => {
    // Load providers from API and alert history
    const loadData = async () => {
      try {
        const [providersResponse, historyResponse] = await Promise.all([
          fetch('/api/notification-providers'),
          fetch('/api/alerts/history')
        ]);
        
        if (providersResponse.ok) {
          const data = await providersResponse.json();
          setProviders(data);
        } else {
          console.error('Failed to fetch notification providers');
          setProviders([]);
        }

        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          setAlertHistory(historyData);
        } else {
          console.error('Failed to fetch alert history');
          setAlertHistory([]);
        }
      } catch (error) {
        console.error('Error loading data:', error);
        setProviders([]);
        setAlertHistory([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

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

  const handleCreateProvider = async (newProvider: {
    type: string;
    config: Record<string, unknown>;
  }) => {
    try {
      const response = await fetch('/api/notification-providers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: newProvider.type,
          config: newProvider.config,
          isEnabled: true,
        }),
      });

      if (response.ok) {
        const createdProvider = await response.json();
        setProviders(prev => [...prev, createdProvider]);
        setIsCreateDialogOpen(false);
      } else {
        console.error('Failed to create notification provider');
      }
    } catch (error) {
      console.error('Error creating notification provider:', error);
    }
  };

  const handleEditProvider = (provider: NotificationProvider) => {
    setEditingProvider(provider);
    setIsEditDialogOpen(true);
  };

  const handleUpdateProvider = async (updatedProvider: {
    type: string;
    config: Record<string, unknown>;
  }) => {
    if (editingProvider) {
      try {
        const response = await fetch(`/api/notification-providers/${editingProvider.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: updatedProvider.type,
            config: updatedProvider.config,
            isEnabled: true,
          }),
        });

        if (response.ok) {
          const updated = await response.json();
          setProviders(prev => prev.map(p => p.id === editingProvider.id ? updated : p));
          setIsEditDialogOpen(false);
          setEditingProvider(null);
        } else {
          console.error('Failed to update notification provider');
        }
      } catch (error) {
        console.error('Error updating notification provider:', error);
      }
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    try {
      const response = await fetch(`/api/notification-providers/${providerId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setProviders(prev => prev.filter(p => p.id !== providerId));
      } else {
        console.error('Failed to delete notification provider');
      }
    } catch (error) {
      console.error('Error deleting notification provider:', error);
    }
  };

  // Get unique alert types for filter
  const alertTypes = [...new Set(alertHistory.map(alert => alert.type))].map(type => ({
    value: type,
    label: type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
    icon: AlertTriangle,
  }));

  const filteredAlertHistory = alertHistory.filter(alert => {
    const matchesSearch = (alert.title?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
                         (alert.message?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
                         (alert.targetName?.toLowerCase() || "").includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || alert.status === statusFilter;
    const matchesType = typeFilter === "all" || alert.type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  if (loading) {
    return (
      <div>
        <PageBreadcrumbs items={breadcrumbs} />
        <div className="container mx-auto py-6">
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-muted-foreground">Loading alerts...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <div className="container mx-auto p-4">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Alerts</h1>
            <p className="text-muted-foreground">
              Manage notification providers and view alert history
            </p>
          </div>

          <Card>
            <Tabs defaultValue="providers" className="w-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="providers">Notification Providers</TabsTrigger>
                    <TabsTrigger value="history">Alert History</TabsTrigger>
                  </TabsList>
                  <div className="flex items-center space-x-2">
                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Provider
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Create Notification Provider</DialogTitle>
                          <DialogDescription>
                            Add a new way to receive alert notifications
                          </DialogDescription>
                        </DialogHeader>
                        <NotificationProviderForm
                          onSuccess={handleCreateProvider}
                          onCancel={() => setIsCreateDialogOpen(false)}
                        />
                      </DialogContent>
                    </Dialog>

                    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Edit Notification Provider</DialogTitle>
                          <DialogDescription>
                            Update your notification provider settings
                          </DialogDescription>
                        </DialogHeader>
                        {editingProvider && (
                          <NotificationProviderForm
                            initialData={editingProvider}
                            onSuccess={handleUpdateProvider}
                            onCancel={() => {
                              setIsEditDialogOpen(false);
                              setEditingProvider(null);
                            }}
                          />
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <TabsContent value="providers" className="mt-0">
                  <div className="space-y-4">
                    <div>
                      <CardTitle className="text-lg">Notification Providers</CardTitle>
                      <CardDescription>
                        Configure how you want to receive alerts
                      </CardDescription>
                    </div>
                    
                    {providers.length === 0 ? (
                      <div className="text-center py-8">
                        <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">No notification providers</h3>
                        <p className="text-muted-foreground mb-4">
                          Add your first notification provider to start receiving alerts
                        </p>
                        <Button onClick={() => setIsCreateDialogOpen(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Provider
                        </Button>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Provider</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {providers.map((provider) => (
                            <TableRow key={provider.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center space-x-3">
                                  {getProviderIcon(provider.type)}
                                  <span>{(provider.config as Record<string, unknown>).name as string || `${provider.type} Provider`}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">
                                  {provider.type}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={provider.isEnabled ? "default" : "secondary"}>
                                  {provider.isEnabled ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {formatDistance(new Date(provider.createdAt), new Date(), { addSuffix: true })}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditProvider(provider)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteProvider(provider.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Alert History</CardTitle>
                        <CardDescription>
                          View all alert notifications that have been sent
                        </CardDescription>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="relative">
                          <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Filter by Alert ID, Target, or Message..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 h-8 w-[200px] lg:w-[350px]"
                          />
                        </div>
                        {alertTypes.length > 0 && (
                          <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-[120px] h-8">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Types</SelectItem>
                              {alertTypes.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="w-[120px] h-8">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            {alertStatuses.map((status) => (
                              <SelectItem key={status.value} value={status.value}>
                                {status.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="h-full flex-1 flex-col space-y-4 md:flex">
                      {filteredAlertHistory.length === 0 ? (
                        <div className="text-center py-8">
                          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <h3 className="text-lg font-medium mb-2">No alerts found</h3>
                          <p className="text-muted-foreground">
                            {searchTerm || statusFilter !== "all" || typeFilter !== "all"
                              ? "Try adjusting your filters" 
                              : "Alerts will appear here when your monitors or jobs trigger notifications"
                            }
                          </p>
                        </div>
                      ) : (
                        <DataTable columns={columns} data={filteredAlertHistory} />
                      )}
                    </div>
                  </div>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}