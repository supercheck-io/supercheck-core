"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, MessageSquare, Webhook, Plus, Bell } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NotificationProviderForm } from "@/components/alerts/notification-provider-form";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface AlertSettingsProps {
  value?: AlertConfiguration;
  onChange?: (config: AlertConfiguration) => void;
  title?: string;
  description?: string;
  hideTitle?: boolean;
  context?: 'monitor' | 'job';
  monitorType?: 'http_request' | 'website' | 'ping_host' | 'port_check' | 'heartbeat';
}

interface AlertConfiguration {
  enabled: boolean;
  notificationProviders: string[];
  alertOnFailure: boolean;
  alertOnRecovery?: boolean;
  alertOnSslExpiration?: boolean;
  alertOnSuccess?: boolean;
  alertOnTimeout?: boolean;
  failureThreshold: number;
  recoveryThreshold: number;
  customMessage?: string;
}

interface NotificationProvider {
  id: string;
  type: 'email' | 'slack' | 'webhook' | 'telegram' | 'discord';
  config: Record<string, unknown>;
}



const defaultConfig: AlertConfiguration = {
  enabled: false,
  notificationProviders: [],
  alertOnFailure: true,
  alertOnRecovery: true,
  alertOnSslExpiration: false,
  alertOnSuccess: false,
  alertOnTimeout: false,
  failureThreshold: 1,
  recoveryThreshold: 1,
  customMessage: "",
};

export function AlertSettings({ 
  value = defaultConfig, 
  onChange, 
  title = "Alert Settings",
  description = "Configure how you want to be notified when this check fails or recovers",
  hideTitle = true,
  context = 'monitor',
  monitorType
}: AlertSettingsProps) {
  const [providers, setProviders] = useState<NotificationProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);
  const [config, setConfig] = useState<AlertConfiguration>({
    ...defaultConfig,
    ...value,
    notificationProviders: value?.notificationProviders || [],
  });

  useEffect(() => {
    // Load providers from API
    const loadProviders = async () => {
      try {
        const response = await fetch('/api/notification-providers');
        if (response.ok) {
          const data = await response.json();
          setProviders(data);
        } else {
          console.error('Failed to fetch notification providers');
          setProviders([]);
        }
      } catch (error) {
        console.error('Error loading notification providers:', error);
        setProviders([]);
      } finally {
        setLoading(false);
      }
    };

    loadProviders();
  }, []);

  useEffect(() => {
    // Ensure the config always has required properties with defaults
    const safeConfig = {
      ...defaultConfig,
      ...value,
      notificationProviders: value?.notificationProviders || [],
    };
    setConfig(safeConfig);
  }, [value]);

  const updateConfig = (updates: Partial<AlertConfiguration>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onChange?.(newConfig);
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

  const toggleProvider = (providerId: string) => {
    const currentProviders = config.notificationProviders || [];
    const newProviders = currentProviders.includes(providerId)
      ? currentProviders.filter(id => id !== providerId)
      : [...currentProviders, providerId];
    
    updateConfig({ notificationProviders: newProviders });
  };

  return (
    <Card>
      {!hideTitle && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-6">
        {/* Enable/Disable Alerts */}
        <div className="flex items-center justify-between mt-6">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <Label htmlFor="alerts-enabled"> Enable Alerts</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Turn on notifications for this check
            </p>
          </div>
          <Switch
            id="alerts-enabled"
            checked={config.enabled}
            onCheckedChange={(enabled) => updateConfig({ enabled })}
          />
        </div>

        {config.enabled && (
          <>
            {/* Alert Types */}
            <div className="space-y-4">
              <Label className="text-sm font-medium">Alert Types</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="alert-failure"
                    checked={config.alertOnFailure}
                    onCheckedChange={(checked) => updateConfig({ alertOnFailure: checked as boolean })}
                  />
                  <Label htmlFor="alert-failure" className="text-sm">
                    {context === 'job' ? 'Job failures' : 'Alert on failure'}
                  </Label>
                </div>
                
                {context === 'monitor' && (
                  <>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="alert-recovery"
                        checked={config.alertOnRecovery || false}
                        onCheckedChange={(checked) => updateConfig({ alertOnRecovery: checked as boolean })}
                      />
                      <Label htmlFor="alert-recovery" className="text-sm">
                        Alert on recovery
                      </Label>
                    </div>
                    {/* Only show SSL alerts for website monitors */}
                    {monitorType === 'website' && (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="alert-ssl"
                          checked={config.alertOnSslExpiration || false}
                          onCheckedChange={(checked) => updateConfig({ alertOnSslExpiration: checked as boolean })}
                        />
                        <Label htmlFor="alert-ssl" className="text-sm">
                          Alert on SSL certificate expiration
                        </Label>
                      </div>
                    )}
                  </>
                )}

                {context === 'job' && (
                  <>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="alert-success"
                        checked={config.alertOnSuccess || false}
                        onCheckedChange={(checked) => updateConfig({ alertOnSuccess: checked as boolean })}
                      />
                      <Label htmlFor="alert-success" className="text-sm">
                        Job success (completion notifications)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="alert-timeout"
                        checked={config.alertOnTimeout || false}
                        onCheckedChange={(checked) => updateConfig({ alertOnTimeout: checked as boolean })}
                      />
                      <Label htmlFor="alert-timeout" className="text-sm">
                        Job timeouts
                      </Label>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Thresholds */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="failure-threshold" className="text-sm font-medium">
                  Failure Threshold
                </Label>
                <p className="text-sm text-muted-foreground">
                  Alert after this many consecutive failures
                </p>
                <Select
                  value={(config.failureThreshold || 1).toString()}
                  onValueChange={(value) => updateConfig({ failureThreshold: parseInt(value) })}
                >
                  <SelectTrigger id="failure-threshold">
                    <SelectValue placeholder="Select threshold" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 failure</SelectItem>
                    <SelectItem value="2">2 failures</SelectItem>
                    <SelectItem value="3">3 failures</SelectItem>
                    <SelectItem value="4">4 failures</SelectItem>
                    <SelectItem value="5">5 failures</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-threshold" className="text-sm font-medium">
                  Recovery Threshold
                </Label>
                <p className="text-sm text-muted-foreground">
                  Alert after this many consecutive successes
                </p>
                <Select
                  value={(config.recoveryThreshold || 1).toString()}
                  onValueChange={(value) => updateConfig({ recoveryThreshold: parseInt(value) })}
                >
                  <SelectTrigger id="recovery-threshold">
                    <SelectValue placeholder="Select threshold" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 success</SelectItem>
                    <SelectItem value="2">2 successes</SelectItem>
                    <SelectItem value="3">3 successes</SelectItem>
                    <SelectItem value="4">4 successes</SelectItem>
                    <SelectItem value="5">5 successes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notification Providers */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Notification Channels</Label>
                <Dialog open={isProviderDialogOpen} onOpenChange={setIsProviderDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Channel
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
                      onSuccess={async (newProvider) => {
                        try {
                          const response = await fetch('/api/notification-providers', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              type: newProvider.type,
                              config: newProvider.config,
                            }),
                          });

                          if (response.ok) {
                            const createdProvider = await response.json();
                            setProviders(prev => [...prev, createdProvider]);
                            setIsProviderDialogOpen(false);
                          } else {
                            console.error('Failed to create notification provider');
                          }
                        } catch (error) {
                          console.error('Error creating notification provider:', error);
                        }
                      }}
                      onCancel={() => setIsProviderDialogOpen(false)}
                    />
                  </DialogContent>
                </Dialog>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="h-16 bg-muted rounded-lg animate-pulse" />
                  <div className="h-16 bg-muted rounded-lg animate-pulse" />
                </div>
              ) : (
                <div>
                  {providers.length === 0 ? (
                    <div className="text-center py-6 border-2 border-dashed border-muted-foreground/25 rounded-lg">
                      <div className="flex flex-col items-center space-y-3">
                        <Bell className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">No notification providers configured</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Create a notification provider first to receive alerts
                          </p>
                        </div>
                        <Dialog open={isProviderDialogOpen} onOpenChange={setIsProviderDialogOpen}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Plus className="h-4 w-4 mr-2" />
                              Create Provider
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
                              onSuccess={async (newProvider) => {
                                try {
                                  const response = await fetch('/api/notification-providers', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                      type: newProvider.type,
                                      config: newProvider.config,
                                    }),
                                  });

                                  if (response.ok) {
                                    const createdProvider = await response.json();
                                    setProviders(prev => [...prev, createdProvider]);
                                    setIsProviderDialogOpen(false);
                                  } else {
                                    console.error('Failed to create notification provider');
                                  }
                                } catch (error) {
                                  console.error('Error creating notification provider:', error);
                                }
                              }}
                              onCancel={() => setIsProviderDialogOpen(false)}
                            />
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {providers.map((provider) => (
                        <div 
                          key={provider.id}
                          onClick={() => toggleProvider(provider.id)}
                          className={`flex items-center p-3 rounded-lg border transition-all duration-200 cursor-pointer hover:shadow-sm ${
                            (config.notificationProviders || []).includes(provider.id) 
                              ? 'border-primary bg-primary/5 shadow-sm' 
                              : 'border-border hover:bg-muted/50 hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted mr-3 shrink-0">
                            {getProviderIcon(provider.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{provider.config.name as string}</p>
                            <p className="text-xs text-muted-foreground capitalize truncate">
                              {provider.type}
                            </p>
                          </div>
                          <Checkbox
                            checked={(config.notificationProviders || []).includes(provider.id)}
                            onChange={() => {}} // Handled by parent onClick
                            className="ml-2 shrink-0"
                            onClick={(e) => e.stopPropagation()} // Prevent double toggle
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
} 