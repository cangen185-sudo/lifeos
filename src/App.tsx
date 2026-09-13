import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { DirectionPage } from './pages/DirectionPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { TodayPage } from './pages/TodayPage'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<TodayPage />} />
          <Route path="direction" element={<DirectionPage />} />
          <Route
            path="review"
            element={
              <PlaceholderPage
                kicker="Review"
                title="复盘"
                lede="一天结束时，每一件没完成的 MUST 都要给出原因。失败是数据，不是罪名。"
                note="未完成的 MUST 会在这里关账并归因。现在先保证今日能记下来、能开始、能完成。"
              />
            }
          />
          <Route
            path="analytics"
            element={
              <PlaceholderPage
                kicker="Analytics"
                title="分析"
                lede="只看事实：MUST 完成率、估时偏差、未完成原因分布，以及时间是否流向了你说重要的方向。"
                note="需要几天真实记录才有意义。先用上几天，再回来看。"
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
