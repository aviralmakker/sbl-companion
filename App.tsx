import { useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import { DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import { useStore } from './store';
import { Colors } from './constants/colors';

import HomeScreen from './screens/Home';
import WorkoutScreen from './screens/Workout';
import FoodScreen from './screens/Food';
import ProgressScreen from './screens/Progress';
import OnboardingScreen from './screens/Onboarding';

SplashScreen.preventAutoHideAsync();

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const NAV_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.bg,
    card: Colors.bg2,
    text: Colors.text,
    border: Colors.border,
    primary: Colors.accent,
    notification: Colors.accent,
  },
};

type TabIconProps = { focused: boolean; color: string };

function HomeIcon({ focused, color }: TabIconProps) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55, color }}>⌂</Text>
  );
}
function WorkoutIcon({ focused, color }: TabIconProps) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55, color }}>◎</Text>
  );
}
function FoodIcon({ focused, color }: TabIconProps) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55, color }}>⊞</Text>
  );
}
function ProgressIcon({ focused, color }: TabIconProps) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55, color }}>▲</Text>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.text3,
        tabBarLabelStyle: styles.tabLabel,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: HomeIcon, tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Workout"
        component={WorkoutScreen}
        options={{ tabBarIcon: WorkoutIcon, tabBarLabel: 'Workout' }}
      />
      <Tab.Screen
        name="Food"
        component={FoodScreen}
        options={{ tabBarIcon: FoodIcon, tabBarLabel: 'Food' }}
      />
      <Tab.Screen
        name="Progress"
        component={ProgressScreen}
        options={{ tabBarIcon: ProgressIcon, tabBarLabel: 'Progress' }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const userProfile = useStore((s) => s.userProfile);
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      {userProfile ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    BebasNeue: BebasNeue_400Regular,
    DMMono: DMMono_400Regular,
    'DMMono-Medium': DMMono_500Medium,
    DMSans: DMSans_400Regular,
    'DMSans-Medium': DMSans_500Medium,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={styles.root} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <NavigationContainer theme={NAV_THEME}>
          <StatusBar style="light" backgroundColor={Colors.bg} />
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  tabBar: {
    backgroundColor: Colors.bg2,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 84 : 60,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontFamily: 'DMSans',
    fontSize: 10,
    letterSpacing: 0.3,
  },
});
