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
import { DiffView } from "@/components/diff/DiffView";

// Each route owns its own AppToolbar at the top and the route's content
// below. The whole shell is opaque (bg-background) so the BrowserWindow
// vibrancy material never shows through; the app reads as a standard
// solid-surface desktop window with traffic lights overlaying the
// toolbar.
function RootLayout() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <Outlet />
    </div>
  );
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

// Memory history (not browser history) because an Electron BrowserWindow
// has no URL bar to drive: routes are an internal navigation concept
// and shouldn't put a real URL in webContents nor survive a reload as
// anything other than the dashboard.
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
