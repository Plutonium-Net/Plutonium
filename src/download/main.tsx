import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import DownloadPage from './download-page'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DownloadPage />
  </StrictMode>,
)
