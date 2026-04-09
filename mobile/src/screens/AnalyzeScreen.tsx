import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from '@florida-lotto/shared';
import { trpc } from '../lib/trpc';

const ACTIVE_GAMES = GAME_TYPES.filter(gt => !FLORIDA_GAMES[gt].schedule.ended);

export default function AnalyzeScreen() {
  const [selectedGame, setSelectedGame] = useState<GameType>(ACTIVE_GAMES[0]);
  const [showSlowWarning, setShowSlowWarning] = useState(false);

  // --- Next draw countdown ---
  const schedule = trpc.schedule.next.useQuery(
    { gameType: selectedGame },
    { refetchOnWindowFocus: false },
  );

  // Show "Connecting to server..." after 3 seconds of loading
  useEffect(() => {
    if (!schedule.isLoading) {
      setShowSlowWarning(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowWarning(true), 3000);
    return () => clearTimeout(timer);
  }, [schedule.isLoading]);

  // --- Predictions ---
  const generate = trpc.predictions.generate.useMutation();

  function handleGenerate() {
    generate.mutate({ gameType: selectedGame });
  }

  const top3 = generate.data?.predictions
    .slice()
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 3);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* ── Game Selector ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.selectorRow}
        contentContainerStyle={styles.selectorContent}
      >
        {ACTIVE_GAMES.map(gt => (
          <TouchableOpacity
            key={gt}
            style={[styles.gameBtn, selectedGame === gt && styles.gameBtnActive]}
            onPress={() => {
              setSelectedGame(gt);
              generate.reset();
            }}
          >
            <Text style={[styles.gameBtnText, selectedGame === gt && styles.gameBtnTextActive]}>
              {FLORIDA_GAMES[gt].name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Next Draw Countdown ── */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Next Draw</Text>
        {schedule.isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.loadingText}>
              {showSlowWarning ? 'Connecting to server...' : 'Loading...'}
            </Text>
          </View>
        ) : schedule.isError ? (
          <Text style={styles.errorText}>
            Could not load schedule. Check your connection.
          </Text>
        ) : (
          <>
            <Text style={styles.countdown}>{schedule.data?.countdown ?? '—'}</Text>
            <Text style={styles.subText}>{schedule.data?.gameName}</Text>
          </>
        )}
      </View>

      {/* ── Predictions ── */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Top Predictions</Text>

        <TouchableOpacity
          style={[styles.generateBtn, generate.isPending && styles.generateBtnDisabled]}
          onPress={handleGenerate}
          disabled={generate.isPending}
        >
          {generate.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.generateBtnText}>Generate</Text>
          )}
        </TouchableOpacity>

        {generate.isError && (
          <Text style={styles.errorText}>
            {generate.error?.message?.includes('Too many')
              ? 'Rate limited — wait a moment and try again.'
              : 'Failed to generate predictions. Try again.'}
          </Text>
        )}

        {top3 && top3.map((pred, i) => (
          <View key={i} style={styles.predRow}>
            <Text style={styles.predModel}>{pred.modelName}</Text>
            <Text style={styles.predNumbers}>
              {pred.mainNumbers.join(' - ')}
              {pred.specialNumbers.length > 0 && (
                '  |  ' + pred.specialNumbers.join(' - ')
              )}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 32 },

  // Game selector
  selectorRow: { marginBottom: 16 },
  selectorContent: { gap: 8 },
  gameBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
  },
  gameBtnActive: { backgroundColor: '#2563eb' },
  gameBtnText: { fontSize: 14, color: '#475569' },
  gameBtnTextActive: { color: '#fff', fontWeight: '600' },

  // Cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardLabel: { fontSize: 13, color: '#94a3b8', fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },

  // Countdown
  countdown: { fontSize: 28, fontWeight: '700', color: '#0f172a' },
  subText: { fontSize: 14, color: '#64748b', marginTop: 2 },

  // Loading / errors
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 14, color: '#64748b' },
  errorText: { fontSize: 14, color: '#dc2626', marginTop: 4 },

  // Generate button
  generateBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Prediction rows
  predRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  predModel: { fontSize: 13, color: '#64748b', marginBottom: 2 },
  predNumbers: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
});
