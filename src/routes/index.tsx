import { lazy } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider } from '../lib/auth'
import ProtectedRoute from './ProtectedRoute'
import Layout from '../components/Layout'
import Login from '../pages/Login'
import ShowList from '../pages/ShowList'
import AddShow from '../pages/AddShow'
import Schedule from '../pages/Schedule'
import History from '../pages/History'
import Queue from '../pages/Queue'

const ShowDetail = lazy(() => import('../pages/ShowDetail'))
const Settings = lazy(() => import('../pages/Settings'))

function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/login', element: <Login /> },
      {
        path: '/',
        element: (
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <ShowList /> },
          { path: 'show/:slug', element: <ShowDetail /> },
          { path: 'add', element: <AddShow /> },
          { path: 'schedule', element: <Schedule /> },
          { path: 'history', element: <History /> },
          { path: 'queue', element: <Queue /> },
          { path: 'settings', element: <Settings /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])
