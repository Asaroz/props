import accountsData from '../mock/accounts.json';

export function getDemoAccounts() {
  return accountsData.accounts;
}

export function loginWithCredentials(identifier, password) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const account = accountsData.accounts.find((item) => {
    const usernameMatch = item.username.toLowerCase() === normalizedIdentifier;
    const emailMatch = item.email.toLowerCase() === normalizedIdentifier;
    return (usernameMatch || emailMatch) && item.password === password;
  });

  if (!account) {
    return null;
  }

  return account;
}
