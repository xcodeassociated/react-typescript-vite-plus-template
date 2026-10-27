import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client'
import { setContext } from '@apollo/client/link/context'

import { keycloak } from '@/components/keycloak-provider'

const httpLink = new HttpLink({
  uri: `${import.meta.env.VITE_APP_BACKEND_URL}/graphql`,
})

const authLink = setContext((_operation, previousContext) => {
  const token = keycloak.token

  return {
    ...previousContext,
    headers: {
      ...previousContext.headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  }
})

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
})
