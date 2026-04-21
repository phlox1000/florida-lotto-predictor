import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import QueryProvider from './src/lib/QueryProvider';
import { AuthSessionProvider } from './src/lib/authSession';
import { SavedPicksProvider } from './src/lib/SavedPicksProvider';

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
                    borderTopColor: colors.borderMuted,
                    minHeight: 72,
                    paddingTop: 8,
                    paddingBottom: 12,
                  },
                  tabBarItemStyle: {
                    paddingVertical: 2,
                  },
                  tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '700',
                    marginTop: 1,
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
          </SafeAreaProvider>
        </SavedPicksProvider>
      </AuthSessionProvider>
    </QueryProvider>
  );
}
