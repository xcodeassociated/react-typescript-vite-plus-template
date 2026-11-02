import { combineReducers, configureStore } from "@reduxjs/toolkit"
import { setupListeners } from "@reduxjs/toolkit/query"
import {
  FLUSH,
  PAUSE,
  PERSIST,
  persistReducer,
  persistStore,
  PURGE,
  REGISTER,
  REHYDRATE,
} from "redux-persist"
import storageModule from "redux-persist/lib/storage"

// Rolldown's CJS interop can hand us the module namespace instead of the default export;
// unwrap so `storage` is always the storage engine in both Vite and Vite+ builds.
const storage =
  "getItem" in storageModule
    ? storageModule
    : (storageModule as unknown as { default: typeof storageModule }).default

import { usersApi } from "@/pages/users/api/usersApi"
import counterReducer from "@/pages/counter/counterSlice"

const persistConfig = {
  key: "counter",
  storage,
}

const persistedCounterReducer = persistReducer(persistConfig, counterReducer)

const rootReducer = combineReducers({
  counter: persistedCounterReducer,
  [usersApi.reducerPath]: usersApi.reducer,
})

export function setupStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        },
      }).concat(usersApi.middleware),
    preloadedState,
  })
}

export const store = setupStore()
export const persistor = persistStore(store)

export type AppStore = ReturnType<typeof setupStore>
export type RootState = ReturnType<typeof rootReducer>
export type AppDispatch = AppStore["dispatch"]

// wires window focus/online events -> actions; the actual refetching is
// opted into per-API (usersApi sets refetchOnFocus/refetchOnReconnect)
setupListeners(store.dispatch)
