import {
  checkAdminSession,
  clearAuthToken,
  loginAdmin,
} from './ordersApi'

export async function isAdminLoggedIn() {
  return checkAdminSession()
}

export async function adminLogin(username: string, password: string) {
  try {
    await loginAdmin(username, password)
    return true
  } catch {
    return false
  }
}

export function adminLogout() {
  clearAuthToken()
}
