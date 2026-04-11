import { useState, useEffect, type FormEvent } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dices } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (meQuery.data) navigate("/");
  }, [meQuery.data, navigate]);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        window.location.href = "/";
      } else {
        setErrorMsg(result.message ?? "Login failed");
      }
    },
    onError: (err) => setErrorMsg(err.message),
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => { window.location.href = "/"; },
    onError: (err) => setErrorMsg(err.message),
  });

  const isPending = loginMutation.isPending || registerMutation.isPending;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (isRegister) {
      registerMutation.mutate({ name, email, password });
    } else {
      loginMutation.mutate({ email, password });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Dices className="w-7 h-7 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">
            {isRegister ? "Create Account" : "Sign In"}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {isRegister
              ? "Create your FL Lotto Oracle account"
              : "Sign in to FL Lotto Oracle"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder={isRegister ? "Min 8 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isRegister ? 8 : undefined}
              />
            </div>
            {errorMsg && (
              <p className="text-sm text-destructive">{errorMsg}</p>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending
                ? "Please wait..."
                : isRegister
                  ? "Create Account"
                  : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isRegister ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => { setIsRegister(false); setErrorMsg(""); }}
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => { setIsRegister(true); setErrorMsg(""); }}
                >
                  Create one
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
