"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Mail,
  MoreVertical,
  Trash2,
  RefreshCw,
  Search,
  Download,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import {
  getStatusPageSubscribers,
  deleteSubscriber,
  resendVerificationEmail,
} from "@/actions/get-status-page-subscribers";
import { toast } from "sonner";

type Subscriber = {
  id: string;
  email: string | null;
  mode: string;
  verifiedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type SubscribersTabProps = {
  statusPageId: string;
};

export function SubscribersTab({ statusPageId }: SubscribersTabProps) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [filteredSubscribers, setFilteredSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({ total: 0, verified: 0, pending: 0 });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subscriberToDelete, setSubscriberToDelete] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadSubscribers = useCallback(async () => {
    setLoading(true);
    const result = await getStatusPageSubscribers(statusPageId);
    if (result.success) {
      setSubscribers(result.subscribers);
      setFilteredSubscribers(result.subscribers);
      setStats(result.stats);
    }
    setLoading(false);
  }, [statusPageId]);

  useEffect(() => {
    loadSubscribers();
  }, [loadSubscribers]);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredSubscribers(subscribers);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredSubscribers(
        subscribers.filter((s) =>
          s.email?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, subscribers]);

  const handleDelete = async () => {
    if (!subscriberToDelete) return;

    setActionLoading(subscriberToDelete);
    const result = await deleteSubscriber(subscriberToDelete);

    if (result.success) {
      toast.success("Subscriber removed successfully");
      await loadSubscribers();
    } else {
      toast.error("Failed to remove subscriber", {
        description: result.message,
      });
    }

    setActionLoading(null);
    setDeleteDialogOpen(false);
    setSubscriberToDelete(null);
  };

  const handleResendVerification = async (subscriberId: string) => {
    setActionLoading(subscriberId);
    const result = await resendVerificationEmail(subscriberId);

    if (result.success) {
      toast.success("Verification email sent");
    } else {
      toast.error("Failed to send verification email", {
        description: result.message,
      });
    }

    setActionLoading(null);
  };

  const handleExportCSV = () => {
    const csvContent = [
      ["Email", "Mode", "Status", "Subscribed Date"],
      ...subscribers.map((s) => [
        s.email || "",
        s.mode,
        s.verifiedAt ? "Verified" : "Pending",
        s.createdAt ? format(new Date(s.createdAt), "yyyy-MM-dd HH:mm") : "",
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Subscribers exported to CSV");
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="p-4 border rounded-lg bg-card">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-blue-600" />
            <div>
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total Subscribers</div>
            </div>
          </div>
        </div>
        <div className="p-4 border rounded-lg bg-card">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <div className="text-2xl font-bold">{stats.verified}</div>
              <div className="text-sm text-muted-foreground">Verified</div>
            </div>
          </div>
        </div>
        <div className="p-4 border rounded-lg bg-card">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-600" />
            <div>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <div className="text-sm text-muted-foreground">Pending Verification</div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleExportCSV}
          disabled={subscribers.length === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Subscribers Table */}
      {filteredSubscribers.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h4 className="text-lg font-semibold mb-2">
            {searchQuery ? "No subscribers found" : "No subscribers yet"}
          </h4>
          <p className="text-sm text-muted-foreground">
            {searchQuery
              ? "Try a different search query"
              : "Subscribers will appear here once users sign up for notifications"}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subscribed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubscribers.map((subscriber) => (
                <TableRow key={subscriber.id}>
                  <TableCell className="font-medium">{subscriber.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {subscriber.mode}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {subscriber.verifiedAt ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {subscriber.createdAt
                      ? format(new Date(subscriber.createdAt), "MMM d, yyyy")
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!subscriber.verifiedAt && (
                          <DropdownMenuItem
                            onClick={() => handleResendVerification(subscriber.id)}
                            disabled={actionLoading === subscriber.id}
                          >
                            {actionLoading === subscriber.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Resend Verification
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            setSubscriberToDelete(subscriber.id);
                            setDeleteDialogOpen(true);
                          }}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Subscriber</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this subscriber? They will no longer
              receive notifications and their data will be permanently deleted in 30
              days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
