"use client";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { signUp } from "@/utils/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

interface InviteData {
  organizationName: string;
  role: string;
  email?: string;
}

export default function SignUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);

  useEffect(() => {
    const invite = searchParams.get('invite');
    if (invite) {
      setInviteToken(invite);
      fetchInviteData(invite);
    }
  }, [searchParams]);

  const fetchInviteData = async (token: string) => {
    try {
      const response = await fetch(`/api/invite/${token}`);
      const data = await response.json();
      if (data.success) {
        setInviteData(data.data);
      }
    } catch (error) {
      console.error('Error fetching invite data:', error);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    // Validate email matches invitation if present
    if (inviteData && email !== inviteData.email) {
      setError("Email must match the invitation email address");
      setIsLoading(false);
      return;
    }

    const { error } = await signUp.email({ name, email, password });

    if (error) {
      setError(error.message || "An error occurred");
      setIsLoading(false);
      return;
    }

    // Wait a moment for the session to be established
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Call setup-defaults endpoint to create default org/project
    try {
      const response = await fetch('/api/auth/setup-defaults', {
        method: 'POST',
      });
      
      if (response.ok) {
        await response.json();
        console.log('✅ Default organization and project created');
        
        // If user signed up with an invite token, redirect to accept invitation
        if (inviteToken) {
          router.push(`/invite/${inviteToken}`);
        } else {
          router.push("/");
        }
      } else {
        console.warn('⚠️ Could not create defaults, but signup successful');
        
        // If user signed up with an invite token, redirect to accept invitation
        if (inviteToken) {
          router.push(`/invite/${inviteToken}`);
        } else {
          router.push("/");
        }
      }
    } catch (setupError) {
      console.warn('⚠️ Setup defaults failed, but signup successful:', setupError);
      
      // If user signed up with an invite token, redirect to accept invitation
      if (inviteToken) {
        router.push(`/invite/${inviteToken}`);
      } else {
        router.push("/");
      }
    }
    
    setIsLoading(false);
  };

  return (
    <Card className="w-full max-w-sm">
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle className="text-2xl">
            {inviteData ? `Join ${inviteData.organizationName}` : 'Sign Up'}
          </CardTitle>
          <CardDescription>
            {inviteData 
              ? `Create an account to join ${inviteData.organizationName} as ${inviteData.role}.`
              : 'Enter your information to create an account'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="Max Robinson" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              name="email"
              placeholder="m@example.com"
              defaultValue={inviteData?.email || ''}
              readOnly={!!inviteData}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" name="password" required />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
        </CardContent>
        <CardFooter className="flex flex-col">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create account
          </Button>
          <div className="mt-4 text-center text-sm">
            Already have an account?{" "}
            <Link 
              href={inviteToken ? `/sign-in?invite=${inviteToken}` : "/sign-in"} 
              className="underline"
            >
              Sign in
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
} 