export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  code?: string;
  details?: unknown;
}

export function successResponse<T>(
  message: string,
  data?: T,
  code?: string
): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
    code,
  };
}

export function errorResponse(
  message: string,
  code: string,
  details?: unknown
): ApiResponse {
  return {
    success: false,
    message,
    code,
    details,
  };
}