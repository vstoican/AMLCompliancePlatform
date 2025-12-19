export interface User {
  id: string
  email: string
  full_name: string
  role: 'analyst' | 'senior_analyst' | 'manager' | 'admin'
  is_active: boolean
  created_at?: string
  updated_at?: string
  last_login?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface ProfileUpdateRequest {
  full_name?: string
  email?: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}
