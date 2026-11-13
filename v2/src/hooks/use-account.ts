import { useEffect, useState } from 'react'
import { onAuthChange, signInWithEmail, signOut, signUp, type CloudUser } from '@/lib/cloud-store'

export function useAccount() {
  const [user, setUser] = useState<CloudUser | null>(null)

  useEffect(() => onAuthChange(setUser), [])

  return {
    user,
    signIn: signInWithEmail,
    signUp,
    signOut,
  }
}
