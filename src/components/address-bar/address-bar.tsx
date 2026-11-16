import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './address-bar.css'

type AddressBarProps = {
  url: string
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onNavigate: (value: string) => void
}

export default function AddressBar({ url, canBack, canForward, onBack, onForward, onReload, onNavigate }: AddressBarProps) {
  const [value, setValue] = useState(url)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setValue(url)
  }, [url, focused])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = value.trim()
    if (!target) return
    onNavigate(target)
    event.currentTarget.blur()
  }

  return (
    <div className="address-bar">
      <button
        className="address-bar__btn"
        type="button"
        aria-label="Back"
        onClick={onBack}
        disabled={!canBack}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 19 8 12l7-7" />
        </svg>
      </button>
      <button
        className="address-bar__btn"
        type="button"
        aria-label="Forward"
        onClick={onForward}
        disabled={!canForward}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>
      <button className="address-bar__btn" type="button" aria-label="Reload" onClick={onReload}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 3v6h-6" />
        </svg>
      </button>
      <form className="address-bar__form" onSubmit={submit}>
        <input
          className="address-bar__input"
          type="text"
          value={value}
          aria-label="Address"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
          onFocus={(event) => {
            setFocused(true)
            event.currentTarget.select()
          }}
          onBlur={() => setFocused(false)}
        />
      </form>
    </div>
  )
}
