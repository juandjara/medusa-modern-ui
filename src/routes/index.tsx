// Route config — the only export is `router`. The `const X = lazy(...)`
// declarations look like component declarations to react-refresh, but
// editing this file always triggers a full reload anyway (the router config
// itself doesn't hot-swap), so the rule's heuristic is wrong here.
/* eslint-disable react-refresh/only-export-components */
import { lazy } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import ProtectedRoute from "./ProtectedRoute";
import Layout from "../components/Layout";
import RouteErrorBoundary from "../components/RouteErrorBoundary";
import Login from "../pages/Login";
import ShowList from "../pages/show/ShowList";
import AddShow from "../pages/show/AddShow";
import Schedule from "../pages/Schedule";
import History from "../pages/History";
import Queue from "../pages/Queue";

const ShowDetail = lazy(() => import("../pages/show/ShowDetail"));
const ShowSettings = lazy(() => import("../pages/show/ShowSettings"));
const Settings = lazy(() => import("../pages/settings/Settings"));
const System = lazy(() => import("../pages/System"));
const Logs = lazy(() => import("../pages/Logs"));
const ProwlarrSettings = lazy(
  () => import("../pages/settings/ProwlarrSettings"),
);
const DownloadClients = lazy(() => import("../pages/settings/DownloadClients"));
const SearchProviders = lazy(() => import("../pages/settings/SearchProviders"));
const CustomProviders = lazy(() => import("../pages/settings/CustomProviders"));
const PostProcessing = lazy(() => import("../pages/settings/PostProcessing"));
const PostProcess = lazy(() => import("../pages/PostProcess"));
const SearchSettings = lazy(() => import("../pages/settings/SearchSettings"));
const GeneralSettings = lazy(() => import("../pages/settings/GeneralSettings"));
const NotificationsSettings = lazy(
  () => import("../pages/settings/NotificationsSettings"),
);
const SubtitlesSettings = lazy(
  () => import("../pages/settings/SubtitlesSettings"),
);
const ImportShows = lazy(() => import("../pages/show/ImportShows"));
const Recommended = lazy(() => import("../pages/show/Recommended"));
const Manage = lazy(() => import("../pages/manage/Manage"));
const FailedReleases = lazy(() => import("../pages/manage/FailedReleases"));
const BacklogOverview = lazy(() => import("../pages/manage/BacklogOverview"));
const EpisodeStatuses = lazy(() => import("../pages/manage/EpisodeStatuses"));
const BulkShows = lazy(() => import("../pages/manage/BulkShows"));

function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/signin", element: <Login /> },
      {
        path: "/",
        element: (
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <ShowList /> },
          { path: "show/:slug", element: <ShowDetail /> },
          { path: "show/:slug/settings", element: <ShowSettings /> },
          { path: "add", element: <AddShow /> },
          { path: "import", element: <ImportShows /> },
          { path: "recommended", element: <Recommended /> },
          { path: "manage", element: <Manage /> },
          { path: "manage/failed", element: <FailedReleases /> },
          { path: "manage/backlog", element: <BacklogOverview /> },
          { path: "manage/episode-statuses", element: <EpisodeStatuses /> },
          { path: "manage/bulk-shows", element: <BulkShows /> },
          { path: "schedule", element: <Schedule /> },
          { path: "history", element: <History /> },
          { path: "queue", element: <Queue /> },
          { path: "logs", element: <Logs /> },
          { path: "system", element: <System /> },
          { path: "settings", element: <Settings /> },
          {
            path: "settings/providers/prowlarr",
            element: <ProwlarrSettings />,
          },
          {
            path: "settings/download-clients",
            element: <DownloadClients />,
          },
          {
            path: "settings/providers",
            element: <SearchProviders />,
          },
          {
            path: "settings/providers/custom",
            element: <CustomProviders />,
          },
          {
            path: "settings/postprocessing",
            element: <PostProcessing />,
          },
          {
            path: "postprocess",
            element: <PostProcess />,
          },
          {
            path: "settings/search",
            element: <SearchSettings />,
          },
          {
            path: "settings/general",
            element: <GeneralSettings />,
          },
          {
            path: "settings/notifications",
            element: <NotificationsSettings />,
          },
          {
            path: "settings/subtitles",
            element: <SubtitlesSettings />,
          },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
