"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, RotateCcw, Info, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  updateStatusPageSettings,
  resetBrandingToDefaults,
} from "@/actions/update-status-page-settings";
import { useRouter } from "next/navigation";

type StatusPage = {
  id: string;
  name: string;
  headline: string | null;
  pageDescription: string | null;
  supportUrl: string | null;
  timezone: string | null;
  allowPageSubscribers: boolean | null;
  allowEmailSubscribers: boolean | null;
  allowWebhookSubscribers: boolean | null;
  allowIncidentSubscribers: boolean | null;
  notificationsFromEmail: string | null;
  notificationsEmailFooter: string | null;
  customDomain: string | null;
  customDomainVerified: boolean | null;
  cssBodyBackgroundColor: string | null;
  cssFontColor: string | null;
  cssGreens: string | null;
  cssYellows: string | null;
  cssOranges: string | null;
  cssBlues: string | null;
  cssReds: string | null;
  faviconLogo: string | null;
  transactionalLogo: string | null;
};

type SettingsTabProps = {
  statusPage: StatusPage;
  canUpdate: boolean;
};

export function SettingsTab({ statusPage, canUpdate }: SettingsTabProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Upload states
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const [logoUrl, setLogoUrl] = useState(statusPage.transactionalLogo || null);
  const [faviconUrl, setFaviconUrl] = useState(statusPage.faviconLogo || null);

  // General settings
  const [name, setName] = useState(statusPage.name);
  const [headline, setHeadline] = useState(statusPage.headline || "");
  const [description, setDescription] = useState(
    statusPage.pageDescription || ""
  );
  const [supportUrl, setSupportUrl] = useState(statusPage.supportUrl || "");

  // Custom domain
  const [customDomain, setCustomDomain] = useState(statusPage.customDomain || "");

  // Subscriber settings
  const [allowPageSubscribers, setAllowPageSubscribers] = useState(
    statusPage.allowPageSubscribers ?? true
  );
  const [allowEmailSubscribers, setAllowEmailSubscribers] = useState(
    statusPage.allowEmailSubscribers ?? true
  );

  // Notification settings
  const [notificationsFromEmail, setNotificationsFromEmail] = useState(
    statusPage.notificationsFromEmail || ""
  );

  // Branding colors
  const [cssGreens, setCssGreens] = useState(statusPage.cssGreens || "#2ecc71");
  const [cssYellows, setCssYellows] = useState(
    statusPage.cssYellows || "#f1c40f"
  );
  const [cssOranges, setCssOranges] = useState(
    statusPage.cssOranges || "#e67e22"
  );
  const [cssBlues, setCssBlues] = useState(statusPage.cssBlues || "#3498db");
  const [cssReds, setCssReds] = useState(statusPage.cssReds || "#e74c3c");

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const result = await updateStatusPageSettings({
        statusPageId: statusPage.id,
        name,
        headline: headline || undefined,
        pageDescription: description || undefined,
        supportUrl: supportUrl || undefined,
        customDomain: customDomain || undefined,
        allowPageSubscribers,
        allowEmailSubscribers,
        notificationsFromEmail: notificationsFromEmail || undefined,
        cssGreens,
        cssYellows,
        cssOranges,
        cssBlues,
        cssReds,
      });

      if (result.success) {
        toast.success("Settings saved successfully");
        router.refresh();
      } else {
        toast.error("Failed to save settings", {
          description: result.message,
        });
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetBranding = async () => {
    setIsResetting(true);

    try {
      const result = await resetBrandingToDefaults(statusPage.id);

      if (result.success) {
        toast.success("Branding reset to defaults");
        // Reset local state
        setCssGreens("#2ecc71");
        setCssYellows("#f1c40f");
        setCssOranges("#e67e22");
        setCssBlues("#3498db");
        setCssReds("#e74c3c");
        router.refresh();
      } else {
        toast.error("Failed to reset branding");
      }
    } catch (error) {
      console.error("Error resetting branding:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsResetting(false);
    }
  };

  const handleFileUpload = async (file: File, type: "logo" | "favicon") => {
    const setUploading =
      type === "logo" ? setIsUploadingLogo : setIsUploadingFavicon;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const response = await fetch(
        `/api/status-pages/${statusPage.id}/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const result = await response.json();

      if (result.success) {
        toast.success(
          `${type === "logo" ? "Logo" : "Favicon"} uploaded successfully`
        );

        if (type === "logo") {
          setLogoUrl(result.url);
        } else {
          setFaviconUrl(result.url);
        }

        router.refresh();
      } else {
        toast.error(result.message || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: "logo" | "favicon"
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }

      // Validate file type
      const allowedTypes = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/gif",
        "image/svg+xml",
        "image/webp",
      ];
      if (!allowedTypes.includes(file.type)) {
        toast.error(
          "Please upload a valid image file (PNG, JPG, GIF, SVG, or WebP)"
        );
        return;
      }

      handleFileUpload(file, type);
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Page Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your status page configuration, appearance, and notifications
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResetBranding}
          disabled={isResetting || !canUpdate}
          title={!canUpdate ? "You don't have permission to reset branding" : ""}
        >
          {isResetting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4 mr-2" />
          )}
          Reset to Defaults
        </Button>
      </div>

      {/* General Settings Card - Two Columns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">General Settings</CardTitle>
          <CardDescription>
            Configure basic information about your status page
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  Page Name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Status Page"
                  disabled={!canUpdate}
                />
                <p className="text-xs text-muted-foreground">
                  Internal name for your reference (not visible to public)
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your services and what this status page tracks..."
                  disabled={!canUpdate}
                  className="resize-none"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Shown to users visiting your status page
                </p>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Headline */}
              <div className="space-y-2">
                <Label htmlFor="headline" className="text-sm font-medium">
                  Headline
                </Label>
                <Input
                  id="headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="System Status"
                  maxLength={255}
                  disabled={!canUpdate}
                />
                <p className="text-xs text-muted-foreground">
                  Display heading on your public status page
                </p>
              </div>

              {/* Support URL */}
              <div className="space-y-2">
                <Label htmlFor="supportUrl" className="text-sm font-medium">
                  Support URL
                </Label>
                <Input
                  id="supportUrl"
                  type="url"
                  value={supportUrl}
                  onChange={(e) => setSupportUrl(e.target.value)}
                  placeholder="https://support.example.com"
                  disabled={!canUpdate}
                />
                <p className="text-xs text-muted-foreground">
                  Link to your support page or contact info
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Card - Two Column Layout */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuration</CardTitle>
          <CardDescription>
            Domain, subscriptions, and notification settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-8 md:grid-cols-2">
            {/* Left Column: Custom Domain & Subscriptions */}
            <div className="space-y-6">
              {/* Custom Domain */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Custom Domain</Label>
                    <p className="text-xs text-muted-foreground">
                      Use your own domain for the status page
                    </p>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                      >
                        <Info className="h-4 w-4 text-muted-foreground" />
                        <span className="sr-only">Custom domain setup instructions</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96" align="end">
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium mb-2">How to set up a custom domain</h4>
                          <p className="text-sm text-muted-foreground mb-4">
                            Follow these steps to use your own domain for your status page:
                          </p>
                        </div>

                        <div className="space-y-3">
                          <div className="flex gap-3">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-300">1</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Enter your domain</p>
                              <p className="text-xs text-muted-foreground">
                                e.g., <code className="bg-muted px-1 py-0.5 rounded">status.yourcompany.com</code>
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-300">2</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Add CNAME record</p>
                              <p className="text-xs text-muted-foreground">
                                Point to: <code className="bg-muted px-1 py-0.5 rounded">supercheck.io</code>
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-300">3</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium">Wait for DNS propagation</p>
                              <p className="text-xs text-muted-foreground">
                                Usually 15-30 minutes. We&apos;ll verify automatically.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground">
                            💡 Need help? Visit our DNS setup guide or contact support.
                          </p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <Input
                  placeholder="status.yourcompany.com"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  disabled={!canUpdate}
                  className="font-mono text-sm"
                />
                {statusPage.customDomainVerified && customDomain === statusPage.customDomain && (
                  <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950 p-2 rounded">
                    <CheckCircle2 className="h-4 w-4" />
                    Domain verified and active
                  </div>
                )}
                {!statusPage.customDomainVerified && customDomain && (
                  <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950 p-2 rounded">
                    ⏳ Waiting for DNS verification...
                  </div>
                )}
              </div>

              {/* Subscription Settings */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Subscriptions</Label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Allow Page Subscriptions</p>
                      <p className="text-xs text-muted-foreground">
                        Let users subscribe for updates
                      </p>
                    </div>
                    <Switch
                      checked={allowPageSubscribers}
                      onCheckedChange={setAllowPageSubscribers}
                      disabled={!canUpdate}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Email Subscriptions</p>
                      <p className="text-xs text-muted-foreground">
                        Send updates via email
                      </p>
                    </div>
                    <Switch
                      checked={allowEmailSubscribers}
                      onCheckedChange={setAllowEmailSubscribers}
                      disabled={!canUpdate}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Notification Settings */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Notifications</Label>
              <div className="space-y-2">
                <Label htmlFor="notifications-from" className="text-xs font-medium text-muted-foreground">
                  From Email Address
                </Label>
                <Input
                  id="notifications-from"
                  type="email"
                  value={notificationsFromEmail}
                  onChange={(e) => setNotificationsFromEmail(e.target.value)}
                  placeholder="notifications@example.com"
                  disabled={!canUpdate}
                />
                <p className="text-xs text-muted-foreground">
                  Email address shown as sender for incident notifications
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Page Branding */}
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Page Branding</h3>
          <p className="text-sm text-muted-foreground">
            Customize the look and feel of your status page
          </p>
        </div>
        <Separator />

        <div className="grid gap-4 md:grid-cols-2">
          {/* Page Logo */}
          <div className="space-y-2">
            <Label className="text-sm">Page logo</Label>
            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
              {logoUrl && (
                <div className="mb-3">
                  <Image
                    src={logoUrl}
                    alt="Page logo preview"
                    width={200}
                    height={96}
                    className="max-h-24 mx-auto object-contain"
                    unoptimized
                  />
                </div>
              )}
              <p className="text-sm text-blue-600 mb-1">
                {logoUrl ? "Change logo" : "Upload logo"}
              </p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp"
                onChange={(e) => handleFileChange(e, "logo")}
                className="hidden"
                id="logo-upload"
                disabled={isUploadingLogo}
              />
              <label htmlFor="logo-upload">
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  disabled={isUploadingLogo || !canUpdate}
                  asChild
                  title={!canUpdate ? "You don't have permission to upload" : ""}
                >
                  <span className="cursor-pointer">
                    {isUploadingLogo ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      "Upload image"
                    )}
                  </span>
                </Button>
              </label>
              <p className="text-xs text-muted-foreground mt-2">
                Recommended size: 630px x 420px (Max 5MB)
              </p>
            </div>
          </div>

          {/* Fav Icon */}
          <div className="space-y-2">
            <Label className="text-sm">Fav icon</Label>
            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
              {faviconUrl && (
                <div className="mb-3">
                  <Image
                    src={faviconUrl}
                    alt="Favicon preview"
                    width={96}
                    height={96}
                    className="max-h-24 mx-auto object-contain"
                    unoptimized
                  />
                </div>
              )}
              <p className="text-sm text-blue-600 mb-1">
                {faviconUrl ? "Change favicon" : "Upload favicon"}
              </p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp"
                onChange={(e) => handleFileChange(e, "favicon")}
                className="hidden"
                id="favicon-upload"
                disabled={isUploadingFavicon}
              />
              <label htmlFor="favicon-upload">
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  disabled={isUploadingFavicon || !canUpdate}
                  asChild
                  title={!canUpdate ? "You don't have permission to upload" : ""}
                >
                  <span className="cursor-pointer">
                    {isUploadingFavicon ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      "Upload image"
                    )}
                  </span>
                </Button>
              </label>
              <p className="text-xs text-muted-foreground mt-2">
                Recommended size: 96px x 96px (Max 5MB)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Branding Colors */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Branding Colors</h3>
          <p className="text-sm text-muted-foreground">
            Customize the colors used on your status page to match your brand
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="cssGreens" className="text-sm">
              Operational (Green)
            </Label>
            <div className="flex gap-2">
              <Input
                id="cssGreens"
                type="color"
                value={cssGreens}
                onChange={(e) => setCssGreens(e.target.value)}
                className="w-14 h-9 p-1"
              />
              <Input
                value={cssGreens}
                onChange={(e) => setCssGreens(e.target.value)}
                placeholder="#2ecc71"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cssYellows" className="text-sm">
              Degraded (Yellow)
            </Label>
            <div className="flex gap-2">
              <Input
                id="cssYellows"
                type="color"
                value={cssYellows}
                onChange={(e) => setCssYellows(e.target.value)}
                className="w-14 h-9 p-1"
              />
              <Input
                value={cssYellows}
                onChange={(e) => setCssYellows(e.target.value)}
                placeholder="#f1c40f"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cssOranges" className="text-sm">
              Partial Outage (Orange)
            </Label>
            <div className="flex gap-2">
              <Input
                id="cssOranges"
                type="color"
                value={cssOranges}
                onChange={(e) => setCssOranges(e.target.value)}
                className="w-14 h-9 p-1"
              />
              <Input
                value={cssOranges}
                onChange={(e) => setCssOranges(e.target.value)}
                placeholder="#e67e22"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cssBlues" className="text-sm">
              Maintenance (Blue)
            </Label>
            <div className="flex gap-2">
              <Input
                id="cssBlues"
                type="color"
                value={cssBlues}
                onChange={(e) => setCssBlues(e.target.value)}
                className="w-14 h-9 p-1"
              />
              <Input
                value={cssBlues}
                onChange={(e) => setCssBlues(e.target.value)}
                placeholder="#3498db"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cssReds" className="text-sm">
              Major Outage (Red)
            </Label>
            <div className="flex gap-2">
              <Input
                id="cssReds"
                type="color"
                value={cssReds}
                onChange={(e) => setCssReds(e.target.value)}
                className="w-14 h-9 p-1"
              />
              <Input
                value={cssReds}
                onChange={(e) => setCssReds(e.target.value)}
                placeholder="#e74c3c"
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={handleSave} disabled={isSaving || !canUpdate} title={!canUpdate ? "You don't have permission to save settings" : ""}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
