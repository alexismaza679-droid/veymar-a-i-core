import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { VeymarLogo } from "@/components/veymar-logo";

export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

function AuthedLayout() {
  const { loading, user } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <VeymarLogo className="h-20 w-20 animate-veymar-pulse" />
      </div>
    );
  }
  if (!user) {
    throw redirect({ to: "/auth" });
  }
  return <Outlet />;
}
