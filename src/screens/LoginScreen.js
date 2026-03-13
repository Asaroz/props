import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  getAuthServiceMode,
  listDemoAccounts,
  loginWithPassword,
  signUpWithPassword,
} from '../backend/services';
import { palette } from '../theme/colors';

// ── Dev-only quick-login shortcuts (only visible when __DEV__ === true) ──────
const DEV_TEST_USERS = [
  { label: 'tuser1 · Nova',   email: 'tuser1@props.test',  password: '123456' },
  { label: 'tuser2 · Eli',    email: 'tuser2@props.test',  password: '123456' },
  { label: 'tuser3 · Rhea',   email: 'tuser3@props.test',  password: '123456' },
  { label: 'tuser4 · Kian',   email: 'tuser4@props.test',  password: '123456' },
  { label: 'tuser5 · Ivy',    email: 'tuser5@props.test',  password: '123456' },
  { label: 'tuser6 · Otto',   email: 'tuser6@props.test',  password: '123456' },
  { label: 'tuser7 · Zuri',   email: 'tuser7@props.test',  password: '123456' },
  { label: 'tuser8 · Ryan',   email: 'tuser8@props.test',  password: '123456' },
  { label: 'tuser9 · Mina',   email: 'tuser9@props.test',  password: '123456' },
  { label: 'tuser10 · Noah',  email: 'tuser10@props.test', password: '123456' },
];

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
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [devPickerOpen, setDevPickerOpen] = useState(false);
  const [devPickerLabel, setDevPickerLabel] = useState(null);
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
      setFieldErrors({});
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
    const nextFieldErrors = {};

    if (!identifier.trim()) {
      nextFieldErrors.identifier =
        formMode === 'signup'
          ? 'Please enter your email address.'
          : 'Please enter your email or username.';
    }

    if (isSupabaseMode && identifier.trim() && !identifier.trim().includes('@')) {
      nextFieldErrors.identifier = 'Please use your email address for Supabase login.';
    }

    if (!password) {
      nextFieldErrors.password = 'Please enter your password.';
    }

    if (formMode === 'signup') {
      if (!displayName.trim()) {
        nextFieldErrors.displayName = 'Please enter your display name.';
      }

      if (!username.trim()) {
        nextFieldErrors.username = 'Please choose a username.';
      }

      if (password.length < 8) {
        nextFieldErrors.password = 'Please use a password with at least 8 characters.';
      }

      if (password !== confirmPassword) {
        nextFieldErrors.confirmPassword = 'Passwords do not match.';
      }
    }

    return nextFieldErrors;
  }

  function applyServiceError(message) {
    const lower = String(message || '').toLowerCase();

    if (lower.includes('email')) {
      setFieldErrors((prev) => ({ ...prev, identifier: message }));
      return;
    }

    if (lower.includes('password') || lower.includes('credentials')) {
      setFieldErrors((prev) => ({ ...prev, password: message }));
      return;
    }

    setError(message || 'Login failed. Please try again.');
  }

  async function handleLogin() {
    setIsSubmitting(true);
    setError('');
    setFieldErrors({});
    setNotice('');

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
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
      applyServiceError(serviceError.message || 'Login failed. Please try again.');
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
        <Text style={styles.label}>{isSupabaseMode || formMode === 'signup' ? 'Email' : 'Username or email'}</Text>
        <TextInput
          style={[styles.input, fieldErrors.identifier && styles.inputError]}
          value={identifier}
          onChangeText={(value) => {
            setIdentifier(value);
            if (fieldErrors.identifier) {
              setFieldErrors((prev) => ({ ...prev, identifier: undefined }));
            }
          }}
          autoCapitalize="none"
          placeholder={isSupabaseMode || formMode === 'signup' ? 'you@example.com' : 'lars or lars@example.com'}
          placeholderTextColor={palette.textSecondary}
          keyboardType={isSupabaseMode || formMode === 'signup' ? 'email-address' : 'default'}
        />
        {fieldErrors.identifier ? <Text style={styles.fieldErrorText}>{fieldErrors.identifier}</Text> : null}

        {formMode === 'signup' ? (
          <>
            <Text style={styles.label}>Display name</Text>
            <TextInput
              style={[styles.input, fieldErrors.displayName && styles.inputError]}
              value={displayName}
              onChangeText={(value) => {
                setDisplayName(value);
                if (fieldErrors.displayName) {
                  setFieldErrors((prev) => ({ ...prev, displayName: undefined }));
                }
              }}
              placeholder="Lars Becker"
              placeholderTextColor={palette.textSecondary}
            />
            {fieldErrors.displayName ? <Text style={styles.fieldErrorText}>{fieldErrors.displayName}</Text> : null}

            <Text style={styles.label}>Username</Text>
            <TextInput
              style={[styles.input, fieldErrors.username && styles.inputError]}
              value={username}
              onChangeText={(value) => {
                setUsername(value);
                if (fieldErrors.username) {
                  setFieldErrors((prev) => ({ ...prev, username: undefined }));
                }
              }}
              autoCapitalize="none"
              placeholder="lars"
              placeholderTextColor={palette.textSecondary}
            />
            {fieldErrors.username ? <Text style={styles.fieldErrorText}>{fieldErrors.username}</Text> : null}

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

        {renderPasswordField(
          'Password',
          password,
          (value) => {
            setPassword(value);
            if (fieldErrors.password) {
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }
          },
          'Enter password'
        )}
        {fieldErrors.password ? <Text style={styles.fieldErrorText}>{fieldErrors.password}</Text> : null}

        {formMode === 'signup'
          ? renderPasswordField(
              'Confirm password',
              confirmPassword,
              (value) => {
                setConfirmPassword(value);
                if (fieldErrors.confirmPassword) {
                  setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                }
              },
              'Repeat password'
            )
          : null}
        {fieldErrors.confirmPassword ? <Text style={styles.fieldErrorText}>{fieldErrors.confirmPassword}</Text> : null}

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
      ) : null}

      {/* ── Dev quick-login: only shown in development builds ── */}
      {__DEV__ && isSupabaseMode ? (
        <View style={styles.devCard}>
          <Pressable
            style={styles.devPickerToggle}
            onPress={() => setDevPickerOpen((o) => !o)}
          >
            <Text style={styles.devPickerToggleText}>
              {devPickerLabel ?? '⚡ Schnelllogin (Dev)'}
            </Text>
            <Ionicons
              name={devPickerOpen ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={palette.textSecondary}
            />
          </Pressable>

          {devPickerOpen ? (
            <ScrollView
              style={styles.devPickerList}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {DEV_TEST_USERS.map((u) => (
                <Pressable
                  key={u.email}
                  style={({ pressed }) => [
                    styles.devPickerItem,
                    pressed && styles.devPickerItemPressed,
                  ]}
                  onPress={() => {
                    setIdentifier(u.email);
                    setPassword(u.password);
                    setDevPickerLabel(u.label);
                    setDevPickerOpen(false);
                    setError('');
                    setFieldErrors({});
                    if (formMode !== 'login') switchMode('login');
                  }}
                >
                  <Text style={styles.devPickerItemText}>{u.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
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
  inputError: {
    borderColor: '#B00020',
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
  fieldErrorText: {
    marginTop: 4,
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
  devCard: {
    marginTop: 10,
    backgroundColor: '#FFFBEA',
    borderWidth: 1,
    borderColor: '#F0D060',
    borderRadius: 14,
    overflow: 'hidden',
  },
  devPickerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  devPickerToggleText: {
    color: '#7A6400',
    fontWeight: '600',
    fontSize: 13,
  },
  devPickerList: {
    maxHeight: 220,
    borderTopWidth: 1,
    borderTopColor: '#F0D060',
  },
  devPickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5E899',
  },
  devPickerItemPressed: {
    backgroundColor: '#FFF3B0',
  },
  devPickerItemText: {
    color: '#5A4800',
    fontSize: 13,
  },
});
