import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './fonts.css'
import App from './App.tsx'
import { startLocalFileSync } from './db/localFileSync'
import './index.css'
import './growth.css'

async function start() {
  await startLocalFileSync()
  registerSW({ immediate: true })
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
