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

// Transaction validation
const validTransactionTypes = ['INCOME', 'EXPENSE', 'TRANSFER'];
const validTransactionCategories = [
  'FOOD_DINING',
  'TRANSPORTATION',
  'SHOPPING',
  'ENTERTAINMENT',
  'BILLS_UTILITIES',
  'HEALTHCARE',
  'EDUCATION',
  'TRAVEL',
  'INCOME_SALARY',
  'INCOME_BUSINESS',
  'TRANSFER',
  'OTHER',
];

export const validateTransactionInput = (
  accountId: string,
  amount: number,
  description: string,
  category: string,
  type: string,
  date: string
): { valid: boolean; error?: string } => {
  if (!accountId || !description || !category || !type || !date) {
    return { valid: false, error: 'Account ID, amount, description, category, type, and date are required' };
  }

  if (description.trim().length < 2) {
    return { valid: false, error: 'Description must be at least 2 characters' };
  }

  if (isNaN(amount) || amount <= 0) {
    return { valid: false, error: 'Amount must be a positive number' };
  }

  if (!validTransactionTypes.includes(type)) {
    return { valid: false, error: `Transaction type must be one of: ${validTransactionTypes.join(', ')}` };
  }

  if (!validTransactionCategories.includes(category)) {
    return { valid: false, error: `Category must be one of: ${validTransactionCategories.join(', ')}` };
  }

  // Validate date format
  const transactionDate = new Date(date);
  if (isNaN(transactionDate.getTime())) {
    return { valid: false, error: 'Invalid date format' };
  }

  return { valid: true };
};

export const validateTransactionUpdate = (
  amount?: number,
  description?: string,
  category?: string,
  date?: string
): { valid: boolean; error?: string } => {
  if (description !== undefined && description.trim().length < 2) {
    return { valid: false, error: 'Description must be at least 2 characters' };
  }

  if (amount !== undefined && (isNaN(amount) || amount <= 0)) {
    return { valid: false, error: 'Amount must be a positive number' };
  }

  if (category !== undefined && !validTransactionCategories.includes(category)) {
    return { valid: false, error: `Category must be one of: ${validTransactionCategories.join(', ')}` };
  }

  if (date !== undefined) {
    const transactionDate = new Date(date);
    if (isNaN(transactionDate.getTime())) {
      return { valid: false, error: 'Invalid date format' };
    }
  }

  return { valid: true };
};

// Goal validation
const validGoalCategories = [
  'EMERGENCY_FUND',
  'HOUSE_DOWN_PAYMENT',
  'VACATION',
  'CAR',
  'DEBT_PAYOFF',
  'RETIREMENT',
  'OTHER',
];

export const validateGoalInput = (
  title: string,
  targetAmount: number,
  targetDate: string,
  category: string
): { valid: boolean; error?: string } => {
  if (!title || !targetDate || !category) {
    return { valid: false, error: 'Title, target amount, target date, and category are required' };
  }

  if (title.trim().length < 2) {
    return { valid: false, error: 'Title must be at least 2 characters' };
  }

  if (isNaN(targetAmount) || targetAmount <= 0) {
    return { valid: false, error: 'Target amount must be a positive number' };
  }

  if (!validGoalCategories.includes(category)) {
    return { valid: false, error: `Category must be one of: ${validGoalCategories.join(', ')}` };
  }

  // Validate target date
  const goalDate = new Date(targetDate);
  if (isNaN(goalDate.getTime())) {
    return { valid: false, error: 'Invalid target date format' };
  }

  // Target date should be in the future
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (goalDate < today) {
    return { valid: false, error: 'Target date must be in the future' };
  }

  return { valid: true };
};

export const validateGoalUpdate = (
  title?: string,
  targetAmount?: number,
  currentAmount?: number,
  targetDate?: string,
  isActive?: boolean
): { valid: boolean; error?: string } => {
  if (title !== undefined && title.trim().length < 2) {
    return { valid: false, error: 'Title must be at least 2 characters' };
  }

  if (targetAmount !== undefined && (isNaN(targetAmount) || targetAmount <= 0)) {
    return { valid: false, error: 'Target amount must be a positive number' };
  }

  if (currentAmount !== undefined && (isNaN(currentAmount) || currentAmount < 0)) {
    return { valid: false, error: 'Current amount must be a non-negative number' };
  }

  if (targetDate !== undefined) {
    const goalDate = new Date(targetDate);
    if (isNaN(goalDate.getTime())) {
      return { valid: false, error: 'Invalid target date format' };
    }
  }

  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return { valid: false, error: 'isActive must be a boolean value' };
  }

  return { valid: true };
};
