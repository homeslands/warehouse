import { Providers } from '@/bootstrap/providers'
import { SessionGate } from '@/bootstrap/SessionGate'

export default function RootLayout() {
  return (
    <Providers>
      <SessionGate />
    </Providers>
  )
}
