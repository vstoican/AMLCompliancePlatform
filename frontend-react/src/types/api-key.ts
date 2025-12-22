export interface ApiKey {
  id: number
  user_id: string
  name: string
  key_prefix: string
  scopes: string[]
  last_used_at: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ApiKeyCreateRequest {
  name: string
  scopes: string[]
  expires_at?: string | null
}

export interface ApiKeyCreateResponse {
  id: number
  name: string
  key: string  // Full key - only shown once!
  key_prefix: string
  scopes: string[]
  expires_at: string | null
  created_at: string
}

export interface ApiKeyUpdateRequest {
  name?: string
  is_active?: boolean
  scopes?: string[]
}
