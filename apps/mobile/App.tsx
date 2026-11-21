// Expo + React Native mobile shell that connects to the Go prototype API
// and renders the mobile-first employee intake & POS experience.
import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const DEMO_SERVER_URL = process.env.EXPO_PUBLIC_DEMO_URL || 'http://10.0.2.2:8080/m';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#182226" />
      <WebView
        source={{ uri: DEMO_SERVER_URL }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#182226' },
});
