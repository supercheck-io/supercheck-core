"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, RotateCcw } from "lucide-react";
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
  allowSmsSubscribers: boolean | null;
  allowWebhookSubscribers: boolean | null;
  allowIncidentSubscribers: boolean | null;
  notificationsFromEmail: string | null;
  notificationsEmailFooter: string | null;
  hiddenFromSearch: boolean | null;
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
};

export function SettingsTab({ statusPage }: SettingsTabProps) {
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

  // Subscriber settings
  const [allowPageSubscribers, setAllowPageSubscribers] = useState(
    statusPage.allowPageSubscribers ?? true
  );
  const [allowEmailSubscribers, setAllowEmailSubscribers] = useState(
    statusPage.allowEmailSubscribers ?? true
  );
  const [allowSmsSubscribers, setAllowSmsSubscribers] = useState(
    statusPage.allowSmsSubscribers ?? false
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
        allowPageSubscribers,
        allowEmailSubscribers,
        allowSmsSubscribers,
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
    <div className="p-6 space-y-6">
      {/* Page Branding */}
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Page Branding</h3>
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
                  disabled={isUploadingLogo}
                  asChild
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
                  disabled={isUploadingFavicon}
                  asChild
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

      {/* General Settings */}
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">General Settings</h3>
          <p className="text-sm text-muted-foreground">
            Basic information about your status page
          </p>
        </div>
        <Separator />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-sm">
              Name (Internal)
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Status Page"
            />
            <p className="text-xs text-muted-foreground">
              Internal name for your reference
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="headline" className="text-sm">
              Headline (Public)
            </Label>
            <Input
              id="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Service Status"
            />
            <p className="text-xs text-muted-foreground">
              This text will appear at the top of your page
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-sm">
            About the page
          </Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Welcome to our status page..."
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            A brief description of your service
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="supportUrl" className="text-sm">
            Support URL
          </Label>
          <Input
            id="supportUrl"
            type="url"
            value={supportUrl}
            onChange={(e) => setSupportUrl(e.target.value)}
            placeholder="https://support.example.com"
          />
          <p className="text-xs text-muted-foreground">
            Clicking on the header of your status page will forward here
          </p>
        </div>
      </div>

      {/* Subscriber Settings */}
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Subscriber Settings</h3>
          <p className="text-sm text-muted-foreground">
            Control who can subscribe to your status page
          </p>
        </div>
        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-sm">Allow Page Subscribers</Label>
              <p className="text-xs text-muted-foreground">
                Enable subscription to all page updates
              </p>
            </div>
            <Switch
              checked={allowPageSubscribers}
              onCheckedChange={setAllowPageSubscribers}
            />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-sm">Allow Email Subscribers</Label>
              <p className="text-xs text-muted-foreground">
                Enable email subscription notifications
              </p>
            </div>
            <Switch
              checked={allowEmailSubscribers}
              onCheckedChange={setAllowEmailSubscribers}
            />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-sm">Allow SMS Subscribers</Label>
              <p className="text-xs text-muted-foreground">
                Enable SMS subscription notifications (coming soon)
              </p>
            </div>
            <Switch
              checked={allowSmsSubscribers}
              onCheckedChange={setAllowSmsSubscribers}
              disabled
            />
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Notification Settings</h3>
          <p className="text-sm text-muted-foreground">
            Configure how notifications are sent
          </p>
        </div>
        <Separator />

        <div className="space-y-1.5">
          <Label htmlFor="notificationsEmail" className="text-sm">
            Notifications From Email
          </Label>
          <Input
            id="notificationsEmail"
            type="email"
            value={notificationsFromEmail}
            onChange={(e) => setNotificationsFromEmail(e.target.value)}
            placeholder="noreply@example.com"
          />
          <p className="text-xs text-muted-foreground">
            The email address that will appear in the &quot;From&quot; field
          </p>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Advanced Settings</h3>
          <p className="text-sm text-muted-foreground">
            Additional configuration options
          </p>
        </div>
        <Separator />

        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="space-y-0.5">
            <Label className="text-sm">
              Hide my status page from search engines
            </Label>
            <p className="text-xs text-muted-foreground">
              Prevent search engines from indexing your status page
            </p>
          </div>
          <Switch checked={statusPage.hiddenFromSearch ?? false} disabled />
        </div>
      </div>

      {/* Branding Colors */}
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Branding Colors</h3>
          <p className="text-sm text-muted-foreground">
            Customize the colors used on your status page
          </p>
        </div>
        <Separator />

        <div className="grid gap-3 md:grid-cols-2">
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

        <div className="flex justify-end pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetBranding}
            disabled={isResetting}
          >
            {isResetting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Reset to Defaults
          </Button>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={handleSave} disabled={isSaving}>
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
