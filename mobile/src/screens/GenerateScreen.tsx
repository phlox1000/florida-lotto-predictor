import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useDashboardState } from '../lib/DashboardStateProvider';
import { colors } from '../theme';

export default function GenerateScreen() {
  const { recordTabOpen } = useDashboardState();
  useFocusEffect(
    useCallback(() => {
      recordTabOpen('generate', null);
    }, [recordTabOpen]),
  );
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Generate</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '600', color: colors.text },
});
