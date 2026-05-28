import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import { ErrorFallback } from "@/components/ErrorFallback";
import { Dashboard } from "@/components/Dashboard";
import { DiffView } from "@/components/DiffView";

function RootLayout() {
  return <Outlet />;
}

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Dashboard,
});

// Force remount on params change so the resolve query refetches fresh
// (TanStack Router keeps the same instance and just re-renders otherwise).
function KeyedDiffView() {
  const { repoId, diffId } = diffRoute.useParams();
  return <DiffView key={`${repoId}:${diffId}`} />;
}

const diffRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/repos/$repoId/diffs/$diffId",
  component: KeyedDiffView,
});

const routeTree = rootRoute.addChildren([indexRoute, diffRoute]);

function RouteErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const retry = () => {
    reset();
    void router.invalidate();
  };
  return (
    <ErrorFallback error={error} scope="view" action={{ label: "Try again", onClick: retry }} />
  );
}

export const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ["/"] }),
  defaultPreload: false,
  defaultErrorComponent: RouteErrorFallback,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
