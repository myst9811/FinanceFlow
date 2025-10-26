export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): { valid: boolean; error?: string } => {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  return { valid: true };
};

export const validateRegisterInput = (
  email: string,
  password: string,
  firstName: string,
  lastName: string
): { valid: boolean; error?: string } => {
  if (!email || !password || !firstName || !lastName) {
    return { valid: false, error: 'All fields are required' };
  }

  if (!validateEmail(email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return passwordValidation;
  }

  if (firstName.trim().length < 2) {
    return { valid: false, error: 'First name must be at least 2 characters' };
  }

  if (lastName.trim().length < 2) {
    return { valid: false, error: 'Last name must be at least 2 characters' };
  }

  return { valid: true };
};

export const validateLoginInput = (
  email: string,
  password: string
): { valid: boolean; error?: string } => {
  if (!email || !password) {
    return { valid: false, error: 'Email and password are required' };
  }

  if (!validateEmail(email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true };
};

// Account validation
const validAccountTypes = ['CHECKING', 'SAVINGS', 'CREDIT', 'INVESTMENT'];
const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

export const validateAccountInput = (
  name: string,
  type: string,
  balance?: number,
  currency?: string
): { valid: boolean; error?: string } => {
  if (!name || !type) {
    return { valid: false, error: 'Account name and type are required' };
  }

  if (name.trim().length < 2) {
    return { valid: false, error: 'Account name must be at least 2 characters' };
  }

  if (!validAccountTypes.includes(type)) {
    return { valid: false, error: `Account type must be one of: ${validAccountTypes.join(', ')}` };
  }

  if (balance !== undefined && (isNaN(balance) || balance < 0)) {
    return { valid: false, error: 'Balance must be a non-negative number' };
  }

  if (currency && !validCurrencies.includes(currency)) {
    return { valid: false, error: `Currency must be one of: ${validCurrencies.join(', ')}` };
  }

  return { valid: true };
};

export const validateAccountUpdate = (
  name?: string,
  balance?: number,
  isActive?: boolean
): { valid: boolean; error?: string } => {
  if (name !== undefined && name.trim().length < 2) {
    return { valid: false, error: 'Account name must be at least 2 characters' };
  }

  if (balance !== undefined && (isNaN(balance) || balance < 0)) {
    return { valid: false, error: 'Balance must be a non-negative number' };
  }

  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return { valid: false, error: 'isActive must be a boolean value' };
  }

  return { valid: true };
};
