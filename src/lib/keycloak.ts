import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  url: import.meta.env.VITE_APP_KEYCLOAK_URL,
  realm: 'app',
  clientId: 'frontend',
})

export default keycloak
