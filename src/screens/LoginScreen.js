import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  getAuthServiceMode,
  listDemoAccounts,
  loginWithPassword,
  signUpWithPassword,
} from '../backend/services';
import { palette } from '../theme/colors';

export default function LoginScreen({ onLogin }) {
  const authMode = getAuthServiceMode();
  const isSupabaseMode = authMode === 'supabase';

  const [formMode, setFormMode] = useState(isSupabaseMode ? 'signup' : 'login');
  const [identifier, setIdentifier] = useState(isSupabaseMode ? '' : 'lars');
  const [password, setPassword] = useState(isSupabaseMode ? '' : 'Props!2026');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const formAnimation = useRef(new Animated.Value(1)).current;

  const demoAccounts = useMemo(() => listDemoAccounts(3), []);

  function switchMode(nextMode) {
    if (nextMode === formMode || isSubmitting) {
      return;
    }

    Animated.timing(formAnimation, {
      toValue: 0,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setFormMode(nextMode);
      setError('');
      setNotice('');
      setIsPasswordVisible(false);
      if (nextMode === 'signup') {
        setIdentifier('');
        setPassword('');
        setConfirmPassword('');
      } else if (!isSupabaseMode) {
        setIdentifier('lars');
        setPassword('Props!2026');
        setConfirmPassword('');
      }

      Animated.timing(formAnimation, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  }

  function validateForm() {
    if (!identifier.trim()) {
      return formMode === 'signup'
        ? 'Please enter your email address.'
        : 'Please enter your email or username.';
    }

    if (!password) {
      return 'Please enter your password.';
    }

    if (formMode === 'signup') {
      if (!displayName.trim()) {
        return 'Please enter your display name.';
      }

      if (!username.trim()) {
        return 'Please choose a username.';
      }

      if (password.length < 8) {
        return 'Please use a password with at least 8 characters.';
      }

      if (password !== confirmPassword) {
        return 'Passwords do not match.';
      }
    }

    return '';
  }

  async function handleLogin() {
    setIsSubmitting(true);
    setError('');
    setNotice('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      setIsSubmitting(false);
      return;
    }

    let account = null;
    try {
      if (formMode === 'signup') {
        account = await signUpWithPassword({
          email: identifier,
          password,
          username,
          displayName,
          city,
        });

        if (account?.requiresEmailConfirmation) {
          setNotice('Account created. Please confirm your email before logging in.');
          setIsSubmitting(false);
          switchMode('login');
          return;
        }
      } else {
        account = await loginWithPassword(identifier, password);
      }
    } catch (serviceError) {
      setError(serviceError.message || 'Login failed. Please try again.');
      setIsSubmitting(false);
      return;
    }

    if (!account) {
      setError(
        formMode === 'signup'
          ? 'Account could not be created.'
          : 'Invalid username/email or password.'
      );
      setIsSubmitting(false);
      return;
    }

    onLogin(account);
    setIsSubmitting(false);
  }

  function renderPasswordField(label, value, onChangeText, placeholder) {
    return (
      <>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={palette.textSecondary}
            secureTextEntry={!isPasswordVisible}
          />
          <Pressable
            style={styles.passwordToggle}
            onPress={() => setIsPasswordVisible((currentValue) => !currentValue)}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={palette.textSecondary}
            />
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Props</Text>
      <Text style={styles.subtitle}>
        {formMode === 'signup' ? 'Create your first account' : 'Login to continue'}
      </Text>

      {isSupabaseMode ? (
        <View style={styles.modeSwitchRow}>
          <Pressable
            style={[styles.modeSwitchButton, formMode === 'signup' && styles.modeSwitchButtonActive]}
            onPress={() => switchMode('signup')}
          >
            <Text
              style={[styles.modeSwitchText, formMode === 'signup' && styles.modeSwitchTextActive]}
            >
              Sign up
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeSwitchButton, formMode === 'login' && styles.modeSwitchButtonActive]}
            onPress={() => switchMode('login')}
          >
            <Text
              style={[styles.modeSwitchText, formMode === 'login' && styles.modeSwitchTextActive]}
            >
              Login
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Animated.View
        style={[
          styles.formCard,
          {
            opacity: formAnimation,
            transform: [
              {
                translateY: formAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.label}>{formMode === 'signup' ? 'Email' : 'Username or email'}</Text>
        <TextInput
          style={styles.input}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          placeholder={formMode === 'signup' ? 'you@example.com' : 'lars or lars@example.com'}
          placeholderTextColor={palette.textSecondary}
          keyboardType={formMode === 'signup' ? 'email-address' : 'default'}
        />

        {formMode === 'signup' ? (
          <>
            <Text style={styles.label}>Display name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Lars Becker"
              placeholderTextColor={palette.textSecondary}
            />

            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholder="lars"
              placeholderTextColor={palette.textSecondary}
            />

            <Text style={styles.label}>City</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="Berlin"
              placeholderTextColor={palette.textSecondary}
            />
          </>
        ) : null}

        {renderPasswordField('Password', password, setPassword, 'Enter password')}

        {formMode === 'signup'
          ? renderPasswordField(
              'Confirm password',
              confirmPassword,
              setConfirmPassword,
              'Repeat password'
            )
          : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}

        <Pressable style={styles.loginButton} onPress={handleLogin} disabled={isSubmitting}>
          <Text style={styles.loginButtonText}>
            {isSubmitting
              ? formMode === 'signup'
                ? 'Creating account...'
                : 'Logging in...'
              : formMode === 'signup'
                ? 'Create account'
                : 'Login'}
          </Text>
        </Pressable>
      </Animated.View>

      {!isSupabaseMode ? (
        <View style={styles.demoCard}>
          <Text style={styles.demoTitle}>Demo users</Text>
          {demoAccounts.map((item) => (
            <Text key={item.id} style={styles.demoLine}>
              {item.username} / {item.password}
            </Text>
          ))}
        </View>
      ) : (
        <View style={styles.demoCard}>
          <Text style={styles.demoTitle}>Supabase mode</Text>
          <Text style={styles.demoLine}>
            Create your first real account here, then log in with the same email and password.
          </Text>
        </View>
      )}
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
    marginBottom: 12,
    textAlign: 'center',
    color: palette.textSecondary,
    fontSize: 14,
  },
  modeSwitchRow: {
    flexDirection: 'row',
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
  },
  modeSwitchButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeSwitchButtonActive: {
    backgroundColor: palette.accentSoft,
  },
  modeSwitchText: {
    color: palette.textSecondary,
    fontWeight: '600',
  },
  modeSwitchTextActive: {
    color: palette.accent,
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.textPrimary,
  },
  passwordToggle: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    marginTop: 8,
    color: '#B00020',
    fontSize: 12,
  },
  noticeText: {
    marginTop: 8,
    color: '#1E5E2E',
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
