import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AppShell } from './app/AppShell'

const TodayPage = lazy(() => import('./pages/TodayPage').then((module) => ({ default: module.TodayPage })))
const DirectionPage = lazy(() => import('./pages/DirectionPage').then((module) => ({ default: module.DirectionPage })))
const ReviewPage = lazy(() => import('./pages/ReviewPage').then((module) => ({ default: module.ReviewPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
const GrowthPage = lazy(() => import('./pages/GrowthPage').then((module) => ({ default: module.GrowthPage })))
const ConnectionsPage = lazy(() => import('./pages/ConnectionsPage').then((module) => ({ default: module.ConnectionsPage })))

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Suspense fallback={<div className="p-5 text-sm text-mute">加载中…</div>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<TodayPage />} />
            <Route path="direction" element={<DirectionPage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="analytics" element={<GrowthPage />} />
            <Route path="metrics" element={<AnalyticsPage />} />
            <Route path="connections" element={<ConnectionsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
