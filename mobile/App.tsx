import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';

// Workspace import: @florida-lotto/shared is linked via pnpm workspaces.
// Use this pattern for all shared type/config imports in the mobile app.
import type { GameType } from '@florida-lotto/shared';

import AnalyzeScreen from './src/screens/AnalyzeScreen';
import GenerateScreen from './src/screens/GenerateScreen';
import TrackScreen from './src/screens/TrackScreen';
import ModelsScreen from './src/screens/ModelsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap;
            switch (route.name) {
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
          tabBarActiveTintColor: '#2563eb',
          tabBarInactiveTintColor: '#9ca3af',
        })}
      >
        <Tab.Screen name="Analyze" component={AnalyzeScreen} />
        <Tab.Screen name="Generate" component={GenerateScreen} />
        <Tab.Screen name="Track" component={TrackScreen} />
        <Tab.Screen name="Models" component={ModelsScreen} />
      </Tab.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
