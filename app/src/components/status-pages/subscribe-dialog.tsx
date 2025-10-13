"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Loader2, CheckCircle2, Slack, Webhook, Rss } from "lucide-react";
import { subscribeToStatusPage } from "@/actions/subscribe-to-status-page";
import { toast } from "sonner";

type SubscribeDialogProps = {
  statusPageId: string;
  statusPageName: string;
  trigger?: React.ReactNode;
};

export function SubscribeDialog({
  statusPageId,
  statusPageName,
  trigger,
}: SubscribeDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleEmailSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error("Please enter your email address");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await subscribeToStatusPage({
        statusPageId,
        email,
        subscribeToAllComponents: true,
      });

      if (result.success) {
        setIsSuccess(true);
        toast.success("Subscription successful!", {
          description: result.message,
        });
        setTimeout(() => {
          setOpen(false);
          setIsSuccess(false);
          setEmail("");
        }, 3000);
      } else {
        toast.error("Subscription failed", {
          description: result.message,
        });
      }
    } catch (error) {
      console.error("Error subscribing:", error);
      toast.error("Failed to subscribe", {
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
            SUBSCRIBE TO UPDATES
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
            Subscribe to Updates
          </DialogTitle>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Subscription Successful!</h3>
            <p className="text-muted-foreground">
              Please check your email to verify your subscription.
            </p>
          </div>
        ) : (
          <Tabs defaultValue="email" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <span className="hidden sm:inline">Email</span>
              </TabsTrigger>
              <TabsTrigger value="slack" className="flex items-center gap-2" disabled>
                <Slack className="h-4 w-4" />
                <span className="hidden sm:inline">Slack</span>
              </TabsTrigger>
              <TabsTrigger value="webhook" className="flex items-center gap-2" disabled>
                <Webhook className="h-4 w-4" />
                <span className="hidden sm:inline">Webhook</span>
              </TabsTrigger>
              <TabsTrigger value="rss" className="flex items-center gap-2" disabled>
                <Rss className="h-4 w-4" />
                <span className="hidden sm:inline">RSS</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  Get email notifications whenever <strong>{statusPageName}</strong>{" "}
                  creates, updates or resolves an incident.
                </p>
              </div>

              <form onSubmit={handleEmailSubscribe} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-base font-medium">
                    Email address:
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                    className="h-11"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Subscribing...
                    </>
                  ) : (
                    "SUBSCRIBE VIA EMAIL"
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  This site is protected by reCAPTCHA and the Google{" "}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Privacy Policy
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://policies.google.com/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Terms of Service
                  </a>{" "}
                  apply.
                </p>
              </form>
            </TabsContent>

            <TabsContent value="slack" className="py-8">
              <div className="text-center text-muted-foreground">
                <Slack className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Slack integration coming soon</p>
              </div>
            </TabsContent>

            <TabsContent value="webhook" className="py-8">
              <div className="text-center text-muted-foreground">
                <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Webhook subscriptions coming soon</p>
              </div>
            </TabsContent>

            <TabsContent value="rss" className="py-8">
              <div className="text-center text-muted-foreground">
                <Rss className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>RSS feed coming soon</p>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
