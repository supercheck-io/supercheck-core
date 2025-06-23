import { Metadata } from "next";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Palette, 
  Bell, 
  Shield, 
  Database, 
  Globe, 
  User,
  Key,
  Mail,
  Server,
  Settings as SettingsIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Settings | Supercheck",
  description: "Configure your monitoring settings and preferences",
};

export default function SettingsPage() {
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Settings", isCurrentPage: true },
  ];

  return (
    <div className=" flex flex-col">
      <PageBreadcrumbs items={breadcrumbs} />
      
      <div className="flex-1 p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage your account and monitoring preferences
            </p>
          </div>
        </div>

        <Tabs defaultValue="appearance" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="appearance" className="flex-1 mt-4">
            <div className="grid gap-4 md:grid-cols-2 h-full">
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Palette className="h-5 w-5" />
                    <CardTitle>Theme Settings</CardTitle>
                  </div>
                  <CardDescription>
                    Customize the appearance of your dashboard
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Theme</Label>
                      <p className="text-sm text-muted-foreground">
                        Choose your preferred theme
                      </p>
                    </div>
                    <ThemeToggle />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Compact View</Label>
                      <p className="text-sm text-muted-foreground">
                        Use a more compact layout
                      </p>
                    </div>
                    <Switch />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">High Contrast</Label>
                      <p className="text-sm text-muted-foreground">
                        Increase contrast for better visibility
                      </p>
                    </div>
                    <Switch />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <User className="h-5 w-5" />
                    <CardTitle>Display Preferences</CardTitle>
                  </div>
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

          <TabsContent value="notifications" className="flex-1 mt-4">
            <div className="grid gap-4 md:grid-cols-2 h-full">
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Bell className="h-5 w-5" />
                    <CardTitle>Alert Settings</CardTitle>
                  </div>
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

              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Mail className="h-5 w-5" />
                    <CardTitle>Email Configuration</CardTitle>
                  </div>
                  <CardDescription>
                    Setup email addresses and preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Primary Alert Email</Label>
                    <div className="flex space-x-2">
                      <Input placeholder="alerts@yourcompany.com" className="flex-1" />
                      <Button variant="outline" size="sm">Verify</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Alert Frequency</Label>
                    <Select defaultValue="immediate">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="immediate">Immediate</SelectItem>
                        <SelectItem value="digest">Daily Digest</SelectItem>
                        <SelectItem value="weekly">Weekly Summary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="monitoring" className="flex-1 mt-4">
            <div className="grid gap-4 md:grid-cols-2 h-full">
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Globe className="h-5 w-5" />
                    <CardTitle>Default Monitor Settings</CardTitle>
                  </div>
                  <CardDescription>
                    Configure default settings for new monitors
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Check Interval</Label>
                      <Select defaultValue="300">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="60">1 minute</SelectItem>
                          <SelectItem value="300">5 minutes</SelectItem>
                          <SelectItem value="600">10 minutes</SelectItem>
                          <SelectItem value="1800">30 minutes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Timeout</Label>
                      <Select defaultValue="30">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10 seconds</SelectItem>
                          <SelectItem value="30">30 seconds</SelectItem>
                          <SelectItem value="60">1 minute</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Auto-pause Failed Monitors</Label>
                      <p className="text-sm text-muted-foreground">
                        Pause after consecutive failures
                      </p>
                    </div>
                    <Switch />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Database className="h-5 w-5" />
                    <CardTitle>Data Retention</CardTitle>
                  </div>
                  <CardDescription>
                    Manage how long monitoring data is kept
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Retention Period</Label>
                    <Select defaultValue="90">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="180">6 months</SelectItem>
                        <SelectItem value="365">1 year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator />
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
            </div>
          </TabsContent>

          <TabsContent value="security" className="flex-1 mt-4">
            <div className="grid gap-4 md:grid-cols-2 h-full">
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Shield className="h-5 w-5" />
                    <CardTitle>Authentication</CardTitle>
                  </div>
                  <CardDescription>
                    Secure your account with additional authentication
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Two-Factor Authentication</Label>
                      <p className="text-sm text-muted-foreground">
                        Add extra security to your account
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      <Key className="h-4 w-4 mr-1" />
                      Setup 2FA
                    </Button>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Session Timeout</Label>
                    <Select defaultValue="24">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 hour</SelectItem>
                        <SelectItem value="8">8 hours</SelectItem>
                        <SelectItem value="24">24 hours</SelectItem>
                        <SelectItem value="168">7 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Key className="h-5 w-5" />
                    <CardTitle>API Access</CardTitle>
                  </div>
                  <CardDescription>
                    Manage API keys and integrations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">API Key</Label>
                    <div className="flex space-x-2">
                      <Input value="sk-..." readOnly className="flex-1" />
                      <Button variant="outline" size="sm">Regenerate</Button>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Rate Limiting</Label>
                      <p className="text-sm text-muted-foreground">
                        Limit API requests per hour
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="system" className="flex-1 mt-4">
            <div className="grid gap-4 md:grid-cols-2 h-full">
              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <Server className="h-5 w-5" />
                    <CardTitle>System Information</CardTitle>
                  </div>
                  <CardDescription>
                    View system status and configuration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Version</Label>
                      <p className="font-medium">1.0.0</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Environment</Label>
                      <p className="font-medium">Production</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Uptime</Label>
                      <p className="font-medium">24 days</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Database</Label>
                      <p className="font-medium">PostgreSQL</p>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Export Data</Label>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        Export Monitors
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1">
                        Export Reports
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <SettingsIcon className="h-5 w-5" />
                    <CardTitle>Advanced Settings</CardTitle>
                  </div>
                  <CardDescription>
                    Advanced configuration options
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Debug Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable detailed logging
                      </p>
                    </div>
                    <Switch />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Maintenance Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Temporarily disable monitoring
                      </p>
                    </div>
                    <Switch />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Button variant="destructive" size="sm" className="w-full">
                      Reset All Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
} 