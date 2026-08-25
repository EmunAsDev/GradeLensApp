import * as SecureStore from "expo-secure-store";

export type Employee = {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  email: string | null;
};

const TOKEN_KEY = "gradelens_auth_token";

const EMPLOYEE_KEY = "gradelens_employee";

export async function saveAuthSession(
  token: string,
  employee: Employee,
): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token),

    SecureStore.setItemAsync(EMPLOYEE_KEY, JSON.stringify(employee)),
  ]);
}

export async function getStoredToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getStoredEmployee(): Promise<Employee | null> {
  const employeeJson = await SecureStore.getItemAsync(EMPLOYEE_KEY);

  if (!employeeJson) {
    return null;
  }

  try {
    return JSON.parse(employeeJson) as Employee;
  } catch {
    return null;
  }
}

export async function clearAuthSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),

    SecureStore.deleteItemAsync(EMPLOYEE_KEY),
  ]);
}
