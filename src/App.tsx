import { useKeycloak } from '@/components/keycloak-provider'
import { LoadingScreenMemo } from '@/components/app/loading-screen'
import { Home } from '@/pages/home/home'

function App() {
  const { initialized } = useKeycloak()

  if (!initialized) {
    return <LoadingScreenMemo />
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <Home />
    </div>
  )
}

export default App
