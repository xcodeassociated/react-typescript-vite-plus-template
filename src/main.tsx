import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Provider } from "react-redux"
import { PersistGate } from "redux-persist/integration/react"
import { ApolloProvider } from "@apollo/client/react"
import { BrowserRouter } from "react-router-dom"

import { apolloClient } from "@/lib/apollo"
import { KeycloakProvider } from "@/components/keycloak-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { persistor, store } from "@/store/store"
import "@/locales/i18n"
import "./index.css"
import App from "./App.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <KeycloakProvider>
      <ThemeProvider>
        <Provider store={store}>
          <PersistGate loading={null} persistor={persistor}>
            <BrowserRouter>
              <ApolloProvider client={apolloClient}>
                <App />
              </ApolloProvider>
            </BrowserRouter>
          </PersistGate>
        </Provider>
      </ThemeProvider>
    </KeycloakProvider>
  </StrictMode>
)
