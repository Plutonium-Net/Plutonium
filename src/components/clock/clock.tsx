import { useEffect, useState } from 'react'
import './clock.css'

const CLOCK_MS = 10000

function clockParts(now: Date) {
  const hours = now.getHours()
  return {
    time: `${hours % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`,
    ampm: hours >= 12 ? 'PM' : 'AM',
  }
}

export default function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), CLOCK_MS)
    return () => window.clearInterval(id)
  }, [])

  const clock = clockParts(now)

  return (
    <div className="clock" id="clock">
      {clock.time}
      <span className="clock-ampm">{clock.ampm}</span>
    </div>
  )
}
