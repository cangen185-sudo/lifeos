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
                title="方向"
                note="Desire、Goal、Commitment 会在这里。今天可以先把 MUST 写下来，方向后补。"
              />
            }
          />
          <Route
            path="review"
            element={
              <PlaceholderPage
                title="复盘"
                note="未完成的 MUST 会在这里关账。现在先保证今日能记下来。"
              />
            }
          />
          <Route
            path="analytics"
            element={
              <PlaceholderPage
                title="分析"
                note="MUST 完成率、估时偏差和原因分布，等有几天真实数据再加。"
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
