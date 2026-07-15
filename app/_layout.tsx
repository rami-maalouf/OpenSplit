import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { usePalette } from '@/lib/theme';

export default function RootLayout() {
  const palette = usePalette();

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: palette.background },
        }}>
        <Stack.Screen name="index" options={{ title: 'OpenSplit' }} />
      </Stack>
    </>
  );
}
