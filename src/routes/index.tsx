import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { VeymarLogo } from "@/components/veymar-logo";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    navigate({ to: user ? "/chat" : "/auth", replace: true });
  }, [user, loading, navigate]);
  return (
    <div className="flex h-screen items-center justify-center">
      <VeymarLogo className="h-20 w-20 animate-veymar-pulse" />
    </div>
  );
}
