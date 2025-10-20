"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";
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
          description: result.message || "Unable to complete subscription. Please try again.",
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
          <div className="w-full space-y-4">
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
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
