import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getDemoAccounts, loginWithCredentials } from '../backend/auth/mockAuth';
import { palette } from '../theme/colors';

export default function LoginScreen({ onLogin }) {
  const [identifier, setIdentifier] = useState('lars');
  const [password, setPassword] = useState('Props!2026');
  const [error, setError] = useState('');

  const demoAccounts = useMemo(() => getDemoAccounts().slice(0, 3), []);

  function handleLogin() {
    const account = loginWithCredentials(identifier, password);

    if (!account) {
      setError('Invalid username/email or password.');
      return;
    }

    setError('');
    onLogin(account);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Props</Text>
      <Text style={styles.subtitle}>Login to continue</Text>

      <View style={styles.formCard}>
        <Text style={styles.label}>Username or email</Text>
        <TextInput
          style={styles.input}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          placeholder="lars or lars@example.com"
          placeholderTextColor={palette.textSecondary}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Enter password"
          placeholderTextColor={palette.textSecondary}
          secureTextEntry
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginButtonText}>Login</Text>
        </Pressable>
      </View>

      <View style={styles.demoCard}>
        <Text style={styles.demoTitle}>Demo users</Text>
        {demoAccounts.map((item) => (
          <Text key={item.id} style={styles.demoLine}>
            {item.username} / {item.password}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: palette.background,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: palette.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 18,
    textAlign: 'center',
    color: palette.textSecondary,
    fontSize: 14,
  },
  formCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 14,
  },
  label: {
    fontSize: 13,
    color: palette.textSecondary,
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.textPrimary,
    backgroundColor: '#FFFFFF',
  },
  errorText: {
    marginTop: 8,
    color: '#B00020',
    fontSize: 12,
  },
  loginButton: {
    marginTop: 14,
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  demoCard: {
    marginTop: 14,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 16,
    padding: 12,
  },
  demoTitle: {
    color: palette.textPrimary,
    fontWeight: '700',
    marginBottom: 6,
  },
  demoLine: {
    color: palette.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
});
