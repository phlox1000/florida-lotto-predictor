import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Dices } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Enter email and password.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!res.ok) {
        toast.error(data.error || data.message || `Request failed (${res.status})`);
        return;
      }

      await utils.auth.me.invalidate();
      toast.success(mode === "login" ? "Signed in." : "Account created. You're signed in.");
      navigate("/");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Link href="/" className="flex items-center gap-2 no-underline mb-8">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Dices className="w-5 h-5 text-primary" />
        </div>
        <span className="text-lg font-bold text-foreground">
          FL Lotto <span className="text-primary">Oracle</span>
        </span>
      </Link>

      <Card className="w-full max-w-md border-border/50 bg-card">
        <CardHeader>
          <CardTitle>{mode === "login" ? "Sign in" : "Create account"}</CardTitle>
          <CardDescription>
            {mode === "login"
              ? "Use the email and password for your account."
              : "Register with your email and a strong password (min. 8 characters)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                disabled={submitting}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                disabled={submitting}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground mt-4">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium bg-transparent border-0 p-0 cursor-pointer"
                  onClick={() => setMode("register")}
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium bg-transparent border-0 p-0 cursor-pointer"
                  onClick={() => setMode("login")}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
