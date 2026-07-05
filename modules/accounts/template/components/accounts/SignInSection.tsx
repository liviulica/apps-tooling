/**
 * Example sign-in UI (APP-OWNED FILE — NOT overwritten on blueprint re-sync).
 *
 * A deliberately unstyled starting point: restyle it with your app's design
 * system, or discard it and build your own on top of useAccounts(). Hide the
 * Apple button on Android (expo-apple-authentication is iOS-only).
 */
import React, {useState} from 'react';
import {Button, Platform, Text, TextInput, View} from 'react-native';
import {useAccounts} from '../../lib/accounts';

export function SignInSection() {
  const accounts = useAccounts();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (accounts.status === 'signedIn' && accounts.user) {
    return (
      <View>
        <Text>Signed in as {accounts.user.email ?? accounts.user.id}</Text>
        <Button title="Sign out" onPress={() => void accounts.signOut()} />
      </View>
    );
  }

  const report = (result: {status: string; message?: string}) => {
    setError(result.status === 'error' ? result.message ?? 'Failed' : null);
  };

  return (
    <View>
      {Platform.OS === 'ios' && (
        <Button
          title="Continue with Apple"
          onPress={async () => report(await accounts.signInWithApple())}
        />
      )}
      <Button
        title="Continue with Google"
        onPress={async () => report(await accounts.signInWithGoogle())}
      />
      {!otpSent ? (
        <>
          <TextInput
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Button
            title="Send code"
            onPress={async () => {
              const r = await accounts.requestEmailOtp(email.trim());
              setOtpSent(r.sent);
              setError(r.sent ? null : r.message ?? 'Failed');
            }}
          />
        </>
      ) : (
        <>
          <TextInput
            placeholder="6-digit code"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
          />
          <Button
            title="Verify"
            onPress={async () =>
              report(await accounts.verifyEmailOtp(email.trim(), code.trim()))
            }
          />
        </>
      )}
      {error != null && <Text>{error}</Text>}
    </View>
  );
}
