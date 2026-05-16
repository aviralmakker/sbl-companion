import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setSuccessMsg(null);
    if (!email.trim() || !password) { setError('Email and password are required.'); return; }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: e } = await supabase.auth.signUp({ email: email.trim(), password });
        if (e) throw e;
        setSuccessMsg('Check your email to confirm your account, then sign in.');
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (e) throw e;
        // onAuthStateChange in App.tsx handles navigation
      }
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand */}
        <View style={styles.brand}>
          <Text style={styles.logo}>SBL</Text>
          <Text style={styles.logoSub}>COMPANION</Text>
          <Text style={styles.tagline}>Science-based lifting, personalised.</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </Text>

          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={Colors.text3}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
            placeholderTextColor={Colors.text3}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error && <Text style={styles.errorText}>{error}</Text>}
          {successMsg && <Text style={styles.successText}>{successMsg}</Text>}

          <TouchableOpacity
            style={[styles.btn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={Colors.bg} />
              : <Text style={styles.btnText}>{mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setSuccessMsg(null); }}
          >
            <Text style={styles.toggleText}>
              {mode === 'signin'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { alignItems: 'center', marginBottom: 48 },
  logo: { fontFamily: Fonts.display, fontSize: 64, color: Colors.accent, lineHeight: 68 },
  logoSub: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text2, letterSpacing: 6, marginTop: -4 },
  tagline: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3, marginTop: 10, letterSpacing: 0.5 },
  card: {
    width: '100%',
    backgroundColor: Colors.bg2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
  },
  cardTitle: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, letterSpacing: 2, marginBottom: 24 },
  label: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 1.5, marginBottom: 6 },
  input: {
    backgroundColor: Colors.bg3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 16,
  },
  errorText: { fontFamily: Fonts.sans, fontSize: 13, color: '#ff6b6b', marginBottom: 12 },
  successText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.accent, marginBottom: 12 },
  btn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnText: { fontFamily: Fonts.display, fontSize: 16, color: Colors.bg, letterSpacing: 1.5 },
  toggleBtn: { alignItems: 'center', paddingTop: 20 },
  toggleText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3 },
});
