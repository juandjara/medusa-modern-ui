import { lazy } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import ProtectedRoute from "./ProtectedRoute";
import Layout from "../components/Layout";
import Login from "../pages/Login";
import ShowList from "../pages/ShowList";
import AddShow from "../pages/AddShow";
import Schedule from "../pages/Schedule";
import History from "../pages/History";
import Queue from "../pages/Queue";

const ShowDetail = lazy(() => import("../pages/ShowDetail"));
const ShowSettings = lazy(() => import("../pages/ShowSettings"));
const Settings = lazy(() => import("../pages/settings/Settings"));
const System = lazy(() => import("../pages/System"));
const Logs = lazy(() => import("../pages/Logs"));
const ProwlarrSettings = lazy(
  () => import("../pages/settings/ProwlarrSettings"),
);
const DownloadClients = lazy(
  () => import("../pages/settings/DownloadClients"),
);
const SearchProviders = lazy(() => import("../pages/settings/SearchProviders"));
const CustomProviders = lazy(() => import("../pages/settings/CustomProviders"));
const PostProcessing = lazy(() => import("../pages/settings/PostProcessing"));
const PostProcess = lazy(() => import("../pages/PostProcess"));
const SearchSettings = lazy(() => import("../pages/settings/SearchSettings"));

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
    children: [
      { path: "/login", element: <Login /> },
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
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
