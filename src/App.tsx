import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { TodayPage } from './pages/TodayPage'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<TodayPage />} />
          <Route
            path="direction"
            element={
              <PlaceholderPage
                title="Direction"
                note="Desire / Goal / Commitment 还没做。今天可以先把 MUST 写下来，方向后补。"
              />
            }
          />
          <Route
            path="review"
            element={
              <PlaceholderPage
                title="Review"
                note="日终复盘会在你需要关账的时候再做。现在先保证 Today 能记下来。"
              />
            }
          />
          <Route
            path="analytics"
            element={
              <PlaceholderPage
                title="Analytics"
                note="完成率、估时偏差和原因分布会等有几天数据再加。"
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
