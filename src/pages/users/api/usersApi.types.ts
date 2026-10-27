export interface Role {
  readonly _id: string | undefined
  name: string
  description?: string | undefined

  version?: number | undefined
  createdBy?: string | undefined
  createdDate?: string | undefined
  modifiedBy?: string | undefined
  modifiedDate?: string | undefined
}

export interface User {
  readonly _id: string | undefined
  name: string
  email: string
  role: Role[]

  version?: number | undefined
  createdBy?: string | undefined
  createdDate?: string | undefined
  modifiedBy?: string | undefined
  modifiedDate?: string | undefined
}

export interface UserInput<T = Role[]> {
  _id: string | undefined
  name: string
  email: string
  role: T
  version: number | undefined
}

export type UserInputDto = UserInput<string[]>

export interface Page {
  page: number
  pageSize: number
  sort: string
  direction: string
}

export function buildPage(page = 0, pageSize = 10, sort = 'id', direction = 'ASC'): Page {
  return { page, pageSize, sort, direction }
}
