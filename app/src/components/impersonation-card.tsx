"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { UserX, User } from 'lucide-react';
import { toast } from 'sonner';

interface ImpersonationInfo {
  isImpersonating: boolean;
  impersonatedUser?: {
    id: string;
    name: string;
    email: string;
  };
}

export function ImpersonationCard() {
  const [impersonationInfo, setImpersonationInfo] = useState<ImpersonationInfo>({ isImpersonating: false });
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    checkImpersonationStatus();
  }, []);

  const checkImpersonationStatus = async () => {
    try {
      const response = await fetch('/api/auth/impersonation-status');
      if (response.ok) {
        const data = await response.json();
        setImpersonationInfo(data);
      }
    } catch (error) {
      console.error('Error checking impersonation status:', error);
    }
  };

  const stopImpersonation = async () => {
    setStopping(true);
    try {
      const response = await fetch('/api/admin/stop-impersonation', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Returned to admin account');
        window.location.reload();
      } else {
        toast.error(data.error || 'Failed to stop impersonation');
      }
    } catch (error) {
      console.error('Error stopping impersonation:', error);
      toast.error('Failed to stop impersonation');
    } finally {
      setStopping(false);
    }
  };

  if (!impersonationInfo.isImpersonating) {
    return null;
  }

  return (
    <Card className="mx-2 mb-2  bg-card">
      <CardContent className="p-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <User className="h-4 w-4 text-orange-600" />
            <span className="text-xs font-medium">Impersonating</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={stopImpersonation}
            disabled={stopping}
            className="h-6 px-2 text-xs text-orange-600"
          >
            <UserX className="h-4 w-4" /> Stop
          </Button>
        </div>
        <div className="text-xs font-medium truncate">
          {impersonationInfo.impersonatedUser?.name}
        </div>
        <div className="text-xs truncate">
          {impersonationInfo.impersonatedUser?.email}
        </div>
      </CardContent>
    </Card>
  );
}