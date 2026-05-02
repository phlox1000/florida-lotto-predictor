import { useEffect, useRef, useState } from 'react';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import QueryProvider from './src/lib/QueryProvider';
import { AuthSessionProvider } from './src/lib/authSession';
import { SavedPicksProvider } from './src/lib/SavedPicksProvider';
import { applyPendingUpdate, fetchPendingUpdate } from './src/lib/updates';
import UpdatePrompt from './src/components/UpdatePrompt';

import AnalyzeScreen from './src/screens/AnalyzeScreen';
import GenerateScreen from './src/screens/GenerateScreen';
import TrackScreen from './src/screens/TrackScreen';
import ModelsScreen from './src/screens/ModelsScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.borderMuted,
    primary: colors.accent,
    text: colors.text,
  },
};

export default function App() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  // Per-process flag: dismissals should not persist across app cold launches.
  // If the user taps "Later", a kill+reopen surfaces the same prompt again
  // because the staged bundle is still pending.
  const sessionDismissedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const isReady = await fetchPendingUpdate();
      if (cancelled || !isReady) return;
      if (sessionDismissedRef.current) return;
      setShowUpdatePrompt(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <QueryProvider>
      <AuthSessionProvider>
        <SavedPicksProvider>
          <SafeAreaProvider>
            <NavigationContainer theme={navigationTheme}>
              <Tab.Navigator
                screenOptions={({ route }) => ({
                  headerShown: false,
                  tabBarHideOnKeyboard: true,
                  tabBarIcon: ({ color, size }) => {
                    let iconName: keyof typeof Ionicons.glyphMap;

                    switch (route.name) {
                      case 'Analyze':
                        iconName = 'bar-chart';
                        break;
                      case 'Generate':
                        iconName = 'options';
                        break;
                      case 'Track':
                        iconName = 'reader';
                        break;
                      case 'Models':
                        iconName = 'analytics';
                        break;
                      default:
                        iconName = 'ellipse';
                    }

                    return <Ionicons name={iconName} size={size} color={color} />;
                  },
                  tabBarActiveTintColor: colors.accentStrong,
                  tabBarInactiveTintColor: colors.textSubtle,
                  tabBarStyle: {
                    backgroundColor: colors.backgroundRaised,
                    borderTopColor: colors.border,
                    borderTopWidth: 1,
                    minHeight: 72,
                    paddingTop: 8,
                    paddingBottom: 12,
                  },
                  tabBarItemStyle: {
                    paddingVertical: 2,
                  },
                  tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    marginTop: 2,
                  },
                })}
              >
                <Tab.Screen name="Analyze" component={AnalyzeScreen} />
                <Tab.Screen name="Generate" component={GenerateScreen} />
                <Tab.Screen name="Track" component={TrackScreen} />
                <Tab.Screen name="Models" component={ModelsScreen} />
              </Tab.Navigator>
              <StatusBar style="light" backgroundColor={colors.background} />
            </NavigationContainer>
            <UpdatePrompt
              visible={showUpdatePrompt}
              onUpdateNow={() => {
                setShowUpdatePrompt(false);
                applyPendingUpdate();
              }}
              onLater={() => {
                setShowUpdatePrompt(false);
                sessionDismissedRef.current = true;
              }}
            />
          </SafeAreaProvider>
        </SavedPicksProvider>
      </AuthSessionProvider>
    </QueryProvider>
  );
}
