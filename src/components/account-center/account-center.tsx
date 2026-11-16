import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/modal/modal'
import PillGlass from '@/components/glass-pill/pill-glass'
import SignInView from '@/components/account-center/sign-in-view'
import AccountView from '@/components/account-center/account-view'
import { useAccount } from '@/hooks/use-account'
import { loadProfilePhoto, saveProfilePhoto } from '@/lib/cloud-store'
import './account-center.css'

const AVATAR_KEY = 'plu_avatar_'

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0] ?? '')
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U'
  )
}

export default function AccountCenter({ showTrigger = true }: { showTrigger?: boolean }) {
  const { user } = useAccount()
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const openDialog = () => setOpen(true)
    window.addEventListener('plu:open-account', openDialog)
    return () => window.removeEventListener('plu:open-account', openDialog)
  }, [])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open])

  useEffect(() => {
    if (!user) {
      setPhoto('')
      return
    }
    let alive = true
    let cached = ''
    try {
      cached = localStorage.getItem(`${AVATAR_KEY}${user.uid}`) ?? ''
    } catch {
      cached = ''
    }
    setPhoto(cached || user.photoUrl || '')
    void loadProfilePhoto().then((remote) => {
      if (!alive || !remote) return
      setPhoto(remote)
      try {
        localStorage.setItem(`${AVATAR_KEY}${user.uid}`, remote)
      } catch {
      }
    })
    return () => {
      alive = false
    }
  }, [user])

  function pickPhoto(file: File | undefined) {
    if (!file || !file.type.startsWith('image/') || !user) return
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      const size = 256
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) return
      const edge = Math.min(image.width, image.height)
      context.drawImage(image, (image.width - edge) / 2, (image.height - edge) / 2, edge, edge, 0, 0, size, size)
      let dataUrl = ''
      try {
        dataUrl = canvas.toDataURL('image/webp', 0.82)
      } catch {
        dataUrl = ''
      }
      if (!dataUrl || dataUrl.length > 90_000) dataUrl = canvas.toDataURL('image/jpeg', 0.8)
      setPhoto(dataUrl)
      try {
        localStorage.setItem(`${AVATAR_KEY}${user.uid}`, dataUrl)
      } catch {
      }
      void saveProfilePhoto(dataUrl).catch(() => {
      })
    }
    image.onerror = () => URL.revokeObjectURL(url)
    image.src = url
  }

  const name = user?.displayName || user?.email?.split('@')[0] || 'Account'

  return (
    <>
      {showTrigger && (
        <div className="account-corner">
          {user ? (
            <>
              <button
                type="button"
                className="account-trigger"
                onClick={() => setOpen(true)}
                aria-label={`Account: ${name}`}
                title={name}
              >
                <PillGlass />
                {photo ? (
                  <img className="account-trigger__photo" src={photo} alt="" draggable={false} />
                ) : (
                  <span className="account-trigger__initials">{initials(name)}</span>
                )}
              </button>
              <span className="account-corner__greeting">
                <span className="account-corner__hello">Welcome back</span>
                <span className="account-corner__name">{name.split(/\s+/)[0]}</span>
              </span>
            </>
          ) : (
            <button type="button" className="account-trigger account-trigger--signin" onClick={() => setOpen(true)}>
              <PillGlass />
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8.5" r="3.5" />
                <path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
              Sign in
            </button>
          )}
        </div>
      )}

      {open && (
        <Modal className="account-center" label={user ? 'Account' : 'Sign in'} onClose={() => setOpen(false)}>
          <div className="account-center__head">
            <span className="account-center__title">{user ? 'Account' : 'Welcome to Plutonium'}</span>
            <button className="account-center__close" type="button" aria-label="Close" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <div className="account-center__body">
            {user ? (
              <AccountView user={user} photo={photo} onPickPhoto={() => fileRef.current?.click()} onClose={() => setOpen(false)} />
            ) : (
              <SignInView />
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              pickPhoto(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </Modal>
      )}
    </>
  )
}
