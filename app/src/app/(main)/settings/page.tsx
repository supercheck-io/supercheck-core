
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Palette,
  Bell,
  Shield,
  Database,
  User,
  Key,
  Mail,
  Server,
  Monitor,
  Clock,
  Zap,
  Download,

} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";


export default function SettingsPage() {
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Settings", isCurrentPage: true },
  ];

  return (
    <div className="">
      <PageBreadcrumbs items={breadcrumbs} />
      <div className="mx-auto p-4 pt-0 -mt-2">
        <Card>
          <Tabs defaultValue="appearance" className="w-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <TabsList className="grid w-full max-w-[800px] grid-cols-5">
                  <TabsTrigger value="appearance" className="flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    <span className="hidden sm:inline">Appearance</span>
                  </TabsTrigger>
                  <TabsTrigger value="notifications" className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    <span className="hidden sm:inline">Notifications</span>
                  </TabsTrigger>
                  <TabsTrigger value="monitoring" className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    <span className="hidden sm:inline">Monitoring</span>
                  </TabsTrigger>
                  <TabsTrigger value="security" className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span className="hidden sm:inline">Security</span>
                  </TabsTrigger>
                  <TabsTrigger value="system" className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    <span className="hidden sm:inline">System</span>
                  </TabsTrigger>
                </TabsList>
              </div>
            </CardHeader>

            <CardContent className="pt-0 -mt-2">
              <TabsContent value="appearance" className="p-4">
                <div className="space-y-4">
                  {/* Theme settings removed and moved to user account dropdown */}
                  <Card className="bg-background">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center">
                        <User className="h-4 w-4 mr-2" />
                        Display Preferences
                      </CardTitle>
                      <CardDescription>
                        Configure how information is displayed
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Date Format</Label>
                        <Select defaultValue="relative">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="relative">Relative (2 hours ago)</SelectItem>
                            <SelectItem value="absolute">Absolute (Dec 25, 2024)</SelectItem>
                            <SelectItem value="iso">ISO Format</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Timezone</Label>
                        <Select defaultValue="auto">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto-detect</SelectItem>
                            <SelectItem value="utc">UTC</SelectItem>
                            <SelectItem value="est">EST</SelectItem>
                            <SelectItem value="pst">PST</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="notifications" className="p-4">
                <div>
                  <h3 className="text-2xl font-semibold mb-2 flex items-center">
                    <Bell className="h-6 w-6 mr-2" />
                    Notification Settings
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure when and how you receive alerts
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <Card className="bg-background">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center">
                        <Bell className="h-4 w-4 mr-2" />
                        Alert Settings 
                      </CardTitle>
                      <CardDescription>
                        Configure when and how you receive alerts
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Email Notifications</Label>
                          <p className="text-sm text-muted-foreground">
                            Receive email alerts for monitor failures
                          </p>
                        </div>
                        <Switch defaultChecked />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Desktop Notifications</Label>
                          <p className="text-sm text-muted-foreground">
                            Show browser notifications
                          </p>
                        </div>
                        <Switch />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Slack Integration</Label>
                          <p className="text-sm text-muted-foreground">
                            Send alerts to Slack channels
                          </p>
                        </div>
                        <Switch />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-background">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center">
                        <Mail className="h-4 w-4 mr-2" />
                        Email Settings
                      </CardTitle>
                      <CardDescription>
                        Configure email notification preferences
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Email Address</Label>
                        <Input type="email" placeholder="Enter your email" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Daily Digest</Label>
                          <p className="text-sm text-muted-foreground">
                            Receive a daily summary of alerts
                          </p>
                        </div>
                        <Switch />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="monitoring" className="p-4">
                <div>
                  <h3 className="text-2xl font-semibold mb-2 flex items-center">
                    <Monitor className="h-6 w-6 mr-2" />
                    Monitoring Settings
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure your monitoring preferences and thresholds
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <Card className="bg-background">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center">
                        <Clock className="h-4 w-4 mr-2" />
                        Check Frequency
                      </CardTitle>
                      <CardDescription>
                        Set how often monitors should check your endpoints
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Default Check Interval</Label>
                        <Select defaultValue="5">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Every minute</SelectItem>
                            <SelectItem value="5">Every 5 minutes</SelectItem>
                            <SelectItem value="15">Every 15 minutes</SelectItem>
                            <SelectItem value="30">Every 30 minutes</SelectItem>
                            <SelectItem value="60">Every hour</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Retry on Failure</Label>
                          <p className="text-sm text-muted-foreground">
                            Retry failed checks before alerting
                          </p>
                        </div>
                        <Switch defaultChecked />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-background">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center">
                        <Zap className="h-4 w-4 mr-2" />
                        Performance Thresholds
                      </CardTitle>
                      <CardDescription>
                        Set performance alert thresholds
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Response Time Threshold (ms)</Label>
                        <Input type="number" placeholder="2000" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Availability Target (%)</Label>
                        <Input type="number" placeholder="99.9" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="security" className="p-4">
                <div>
                  <h3 className="text-2xl font-semibold mb-2 flex items-center">
                    <Shield className="h-6 w-6 mr-2" />
                    Security Settings
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure security and access settings
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <Card className="bg-background">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center">
                        <Key className="h-4 w-4 mr-2" />
                        API Keys
                      </CardTitle>
                      <CardDescription>
                        Manage your API keys and access tokens
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Active API Keys</Label>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-2 border rounded-md">
                            <div>
                              <p className="text-sm font-medium">Production Key</p>
                              <p className="text-xs text-muted-foreground">Created: Jan 1, 2024</p>
                            </div>
                            <Button variant="destructive" size="sm">Revoke</Button>
                          </div>
                        </div>
                      </div>
                      <Button className="w-full">
                        <Key className="h-4 w-4 mr-2" />
                        Generate New API Key
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="bg-background">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center">
                        <Server className="h-4 w-4 mr-2" />
                        Access Control
                      </CardTitle>
                      <CardDescription>
                        Configure IP restrictions and access rules
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">IP Whitelist</Label>
                          <p className="text-sm text-muted-foreground">
                            Restrict access to specific IPs
                          </p>
                        </div>
                        <Switch />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Allowed IP Addresses</Label>
                        <Input placeholder="Enter IP address" disabled />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="system" className="p-4">
                <div>
                  <h3 className="text-2xl font-semibold mb-2 flex items-center">
                    <Server className="h-6 w-6 mr-2" />
                    System Settings
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    View system information and manage data
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <Card className="bg-background">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center">
                        <Database className="h-4 w-4 mr-2" />
                        Data Management
                      </CardTitle>
                      <CardDescription>
                        Manage your monitoring data
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Data Retention</Label>
                        <Select defaultValue="90">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30 days</SelectItem>
                            <SelectItem value="90">90 days</SelectItem>
                            <SelectItem value="180">180 days</SelectItem>
                            <SelectItem value="365">1 year</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Auto-cleanup</Label>
                          <p className="text-sm text-muted-foreground">
                            Automatically remove old data
                          </p>
                        </div>
                        <Switch defaultChecked />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-background">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center">
                        <Download className="h-4 w-4 mr-2" />
                        Export Data
                      </CardTitle>
                      <CardDescription>
                        Download your monitoring data
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Export Format</Label>
                        <Select defaultValue="json">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="json">JSON</SelectItem>
                            <SelectItem value="csv">CSV</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button className="w-full">
                        <Download className="h-4 w-4 mr-2" />
                        Export Data
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
} 