export interface PublicUser {
  id: number;
  name: string;
  email: string;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
}
