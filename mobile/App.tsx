import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import QueryProvider from './src/lib/QueryProvider';
import { DashboardStateProvider } from './src/lib/DashboardStateProvider';
import { colors } from './src/theme';

import AnalyzeScreen from './src/screens/AnalyzeScreen';
import GenerateScreen from './src/screens/GenerateScreen';
import TrackScreen from './src/screens/TrackScreen';
import ModelsScreen from './src/screens/ModelsScreen';
import HomeScreen from './src/screens/HomeScreen';
import type { MainTabParamList } from './src/navigation/types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

export default function App() {
  return (
    <QueryProvider>
      <DashboardStateProvider>
        <SafeAreaProvider>
          <NavigationContainer theme={navTheme}>
            <Tab.Navigator
              screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: {
                  backgroundColor: colors.bgElevated,
                  borderTopColor: colors.border,
                },
                tabBarIcon: ({ color, size }) => {
                  let iconName: keyof typeof Ionicons.glyphMap;
                  switch (route.name) {
                    case 'Home':
                      iconName = 'grid';
                      break;
                    case 'Analyze':
                      iconName = 'bar-chart';
                      break;
                    case 'Generate':
                      iconName = 'flash';
                      break;
                    case 'Track':
                      iconName = 'list';
                      break;
                    case 'Models':
                      iconName = 'trophy';
                      break;
                    default:
                      iconName = 'ellipse';
                  }
                  return <Ionicons name={iconName} size={size} color={color} />;
                },
                tabBarActiveTintColor: colors.accent,
                tabBarInactiveTintColor: colors.textSubtle,
              })}
            >
              <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
              <Tab.Screen name="Analyze" component={AnalyzeScreen} options={{ title: 'Analyze' }} />
              <Tab.Screen name="Generate" component={GenerateScreen} options={{ title: 'Generate' }} />
              <Tab.Screen name="Track" component={TrackScreen} options={{ title: 'Track' }} />
              <Tab.Screen name="Models" component={ModelsScreen} options={{ title: 'Models' }} />
            </Tab.Navigator>
            <StatusBar style="light" />
          </NavigationContainer>
        </SafeAreaProvider>
      </DashboardStateProvider>
    </QueryProvider>
  );
}
