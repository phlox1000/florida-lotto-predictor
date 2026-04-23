import { useMemo, useState } from 'react';
import { Image, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from '@florida-lotto/shared';
import {
  Card,
  Chip,
  EmptyState,
  FeatureRow,
  InstrumentTab,
  NumberChip,
  PrimaryButton,
  Screen,
  SectionHeader,
  SkeletonCard,
  StateBlock,
  StatusPill,
  TerminalLabel,
  ui,
} from '../components/ui';
import { useSavedPicks, type SavedPick, type SavedPickSourceType, type SavedPickStatus } from '../lib/SavedPicksProvider';
import { buildManualTicketInput, type ManualTicketDraft } from '../lib/ticketImport';
import {
  createDraftFromUploadedTicket,
  hasTicketUploadAuth,
  selectTicketImage,
  uploadTicketImage,
  type SelectedTicketImage,
  type TicketImageSource,
} from '../lib/ticketUpload';
import { useAuthSession } from '../lib/authSession';
import {
  deriveLedgerStats,
  gradeSavedPick,
  normalizeDrawResults,
  sourceTypeLabel,
  type DrawResultLike,
} from '../lib/ticketGrading';
import { trpc } from '../lib/trpc';

type StatusFilter = 'all' | SavedPickStatus;
type GameFilter = 'all' | GameType;
type SourceFilter = 'all' | SavedPickSourceType;
type AuthMode = 'login' | 'register';

const ACTIVE_GAMES = GAME_TYPES.filter(gt => !FLORIDA_GAMES[gt].schedule.ended);

const STATUS_FILTERS: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Graded', value: 'graded' },
  { label: 'Reviewed', value: 'reviewed' },
  { label: 'Won', value: 'won' },
  { label: 'Lost', value: 'lost' },
];

const STATUS_ACTIONS: Array<{ label: string; value: SavedPickStatus }> = [
  { label: 'Pending', value: 'pending' },
  { label: 'Graded', value: 'graded' },
  { label: 'Reviewed', value: 'reviewed' },
  { label: 'Won', value: 'won' },
  { label: 'Lost', value: 'lost' },
];

const SOURCE_FILTERS: Array<{ label: string; value: SourceFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Generated', value: 'generated' },
  { label: 'Manual', value: 'manual' },
  { label: 'PDF', value: 'importedPdf' },
  { label: 'Image', value: 'uploadedImage' },
];

function createManualDraft(): ManualTicketDraft {
  return {
    gameType: ACTIVE_GAMES[0],
    mainNumbersText: '',
    specialNumbersText: '',
    drawDate: new Date().toISOString().slice(0, 10),
    drawTime: 'evening',
    notes: '',
    sourceType: 'manual',
    sourceLabel: 'Manual entry',
    originalFileName: null,
  };
}

function formatScore(score: number) {
  return score >= 10 ? score.toFixed(0) : score.toFixed(1);
}

function formatSavedDate(savedAt: string) {
  const parsed = new Date(savedAt);

  if (Number.isNaN(parsed.getTime())) {
    return 'Saved locally';
  }

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCheckedDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusTone(status: SavedPickStatus) {
  switch (status) {
    case 'won':
      return 'success' as const;
    case 'lost':
      return 'danger' as const;
    case 'graded':
      return 'accent' as const;
    case 'reviewed':
      return 'warning' as const;
    default:
      return 'neutral' as const;
  }
}

function statusLabel(status: SavedPickStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function sourceTone(sourceType: SavedPickSourceType) {
  switch (sourceType) {
    case 'manual':
      return 'warning' as const;
    case 'importedPdf':
    case 'uploadedImage':
      return 'accent' as const;
    default:
      return 'neutral' as const;
  }
}

function formatPick(pick: SavedPick) {
  const main = pick.mainNumbers.join(' - ');
  return pick.specialNumbers.length > 0
    ? `${main} | Special ${pick.specialNumbers.join(' - ')}`
    : main;
}

function formatMatchedNumbers(pick: SavedPick) {
  if (!pick.gradedAt) {
    return null;
  }

  const main = pick.matchedMainNumbers.length > 0
    ? pick.matchedMainNumbers.join(', ')
    : 'none';
  const special = pick.specialNumbers.length > 0
    ? `; special ${pick.matchedSpecialNumbers.length > 0 ? pick.matchedSpecialNumbers.join(', ') : 'none'}`
    : '';

  return `Matched: ${main}${special}`;
}

type TrackScreenProps = {
  navigation?: {
    navigate: (screen: 'Analyze') => void;
  };
};

export default function TrackScreen({ navigation }: TrackScreenProps) {
  const {
    clearSavedPicks,
    deletePick,
    isLoaded,
    isSaved,
    savedPicks,
    savePick,
    storageError,
    updatePickGrades,
    updatePickNotes,
    updatePickStatus,
  } = useSavedPicks();
  const auth = useAuthSession();
  const trpcUtils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [gameFilter, setGameFilter] = useState<GameFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [isChecking, setIsChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<ManualTicketDraft>(() => createManualDraft());
  const [manualReview, setManualReview] = useState<ReturnType<typeof buildManualTicketInput>['input']>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedTicketImage | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFormMessage, setAuthFormMessage] = useState<string | null>(null);
  const [authFormError, setAuthFormError] = useState<string | null>(null);

  const stats = useMemo(() => deriveLedgerStats(savedPicks), [savedPicks]);
  const manualConfig = FLORIDA_GAMES[manualDraft.gameType];
  const uploadAuthReady = auth.isAuthenticated || hasTicketUploadAuth();
  const usingDevUploadToken = !auth.isAuthenticated && hasTicketUploadAuth();

  const gameOptions = useMemo(() => {
    const unique = new Map<GameType, string>();

    savedPicks.forEach(pick => {
      unique.set(pick.gameType, pick.gameName);
    });

    return Array.from(unique.entries())
      .map(([gameType, gameName]) => ({ gameType, gameName }))
      .sort((a, b) => a.gameName.localeCompare(b.gameName));
  }, [savedPicks]);

  const filteredPicks = savedPicks.filter(pick => {
    const statusMatches = statusFilter === 'all' || pick.status === statusFilter;
    const gameMatches = gameFilter === 'all' || pick.gameType === gameFilter;
    const sourceMatches = sourceFilter === 'all' || pick.sourceType === sourceFilter;
    return statusMatches && gameMatches && sourceMatches;
  });

  const checkablePicks = gameFilter === 'all'
    ? savedPicks
    : savedPicks.filter(pick => pick.gameType === gameFilter);

  function updateManualDraft(patch: Partial<ManualTicketDraft>) {
    setManualDraft(current => ({ ...current, ...patch }));
    setManualReview(null);
    setImportMessage(null);
    setImportError(null);
  }

  async function submitAuth() {
    setAuthFormError(null);
    setAuthFormMessage(null);
    auth.clearError();

    try {
      if (authMode === 'register') {
        await auth.register({
          name: authName,
          email: authEmail,
          password: authPassword,
        });
      } else {
        await auth.login(authEmail, authPassword);
      }

      setAuthPassword('');
      setAuthName('');
      setAuthFormMessage('Signed in. Ticket image upload will use this private beta session.');
    } catch (error) {
      setAuthFormError(error instanceof Error ? error.message : 'Unable to sign in.');
    }
  }

  async function logout() {
    setAuthFormError(null);
    setAuthFormMessage(null);
    await auth.logout();
    setImportMessage('Signed out. Local tickets remain on this device; image scanning requires sign-in.');
  }

  function reviewManualTicket() {
    const result = buildManualTicketInput(manualDraft);

    if (!result.input) {
      setManualReview(null);
      setImportError(result.errors.join(' '));
      setImportMessage(null);
      return;
    }

    setManualReview(result.input);
    setImportError(null);
    setImportMessage('Review the ticket details before saving to the local ledger.');
  }

  function saveManualTicket() {
    const result = manualReview ? { input: manualReview, errors: [] } : buildManualTicketInput(manualDraft);

    if (!result.input) {
      setImportError(result.errors.join(' '));
      setImportMessage(null);
      return;
    }

    const alreadySaved = isSaved(result.input);
    savePick(result.input);
    setImportError(null);
    setImportMessage(alreadySaved
      ? 'This ticket already exists in the local ledger.'
      : 'Manual ticket saved to the local ledger. You can check results when draw data is available.');
    setManualReview(null);

    if (!alreadySaved) {
      setManualDraft(createManualDraft());
    }
  }

  async function handleTicketImage(source: TicketImageSource) {
    setIsScanning(true);
    setImportError(null);
    setImportMessage(null);

    try {
      const image = await selectTicketImage(source);

      if (!image) {
        setImportMessage('Image selection was cancelled.');
        return;
      }

      setSelectedImage(image);
      updateManualDraft({
        sourceType: 'uploadedImage',
        sourceLabel: 'Ticket photo',
        originalFileName: image.fileName,
      });

      if (!uploadAuthReady) {
        setImportMessage('Ticket image selected. Sign in to scan it through the server, or review the ticket manually before saving.');
        return;
      }

      const upload = await uploadTicketImage(image);
      const draft = createDraftFromUploadedTicket(upload, image);
      const review = buildManualTicketInput(draft);

      setManualDraft(draft);

      if (review.input) {
        setManualReview(review.input);
        setImportMessage('Ticket photo scanned. Review the detected ticket details before saving.');
      } else {
        setManualReview(null);
        setImportError(review.errors.join(' ') || 'The scanned ticket needs manual correction before it can be saved.');
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to process the ticket image.');
    } finally {
      setIsScanning(false);
    }
  }

  async function checkResults() {
    if (checkablePicks.length === 0) {
      setCheckMessage('No local picks are available for the selected filter.');
      return;
    }

    setIsChecking(true);
    setCheckError(null);
    setCheckMessage(null);

    try {
      const checkedAt = new Date().toISOString();
      const gameTypes = Array.from(new Set(checkablePicks.map(pick => pick.gameType)));
      const resultEntries = await Promise.all(gameTypes.map(async gameType => {
        const draws = await trpcUtils.draws.byGame.fetch({ gameType, limit: 100 });
        return [gameType, normalizeDrawResults(draws as DrawResultLike[], gameType)] as const;
      }));
      const resultsByGame = new Map(resultEntries);
      const outcomes = checkablePicks.map(pick => gradeSavedPick(
        pick,
        resultsByGame.get(pick.gameType) ?? [],
        checkedAt,
      ));

      updatePickGrades(outcomes.map(outcome => ({
        id: outcome.id,
        grade: outcome.grade,
      })));

      const gradedCount = outcomes.filter(outcome => outcome.drawFound).length;
      const pendingCount = outcomes.length - gradedCount;

      setCheckMessage(
        gradedCount > 0
          ? `Checked ${outcomes.length} saved pick${outcomes.length === 1 ? '' : 's'}; ${gradedCount} matched official draw result${gradedCount === 1 ? '' : 's'}${pendingCount > 0 ? ` and ${pendingCount} remain pending` : ''}.`
          : 'Official results were queried, but no saved picks matched an available draw date yet.',
      );
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : 'Could not check draw results.');
    } finally {
      setIsChecking(false);
    }
  }

  async function sharePick(pick: SavedPick) {
    const message = [
      `Florida Lotto Predictor - ${pick.gameName}`,
      `Model: ${pick.modelName}`,
      `Source: ${sourceTypeLabel(pick.sourceType)}`,
      `Pick: ${formatPick(pick)}`,
      pick.sourceType === 'generated' ? `Score: ${formatScore(pick.confidenceScore)}` : null,
      pick.drawLabel ? `Draw context: ${pick.drawLabel}` : null,
      pick.gradeSummary ? `Result check: ${pick.gradeSummary}` : null,
      pick.prizeTierLabel ? `Tier: ${pick.prizeTierLabel}` : null,
      `Status: ${statusLabel(pick.status)}`,
      'Saved locally on this device.',
    ].filter(Boolean).join('\n');

    await Share.share({ message });
  }

  return (
    <Screen
      eyebrow="Results"
      title="Track"
      subtitle="A private local ledger for saved picks, official result checks, and honest outcome review."
    >
      {storageError ? (
        <StateBlock tone="warning" title="Local storage warning" body={storageError} />
      ) : null}

      <Card>
        <SectionHeader
          eyebrow="Local ledger"
          title={savedPicks.length > 0 ? `${savedPicks.length} saved pick${savedPicks.length === 1 ? '' : 's'}` : 'No saved picks yet'}
          caption="Stored privately on this device. Result checks use the existing draw-results API."
          right={<StatusPill label={isLoaded ? 'Local' : 'Loading'} tone={isLoaded ? 'accent' : 'neutral'} />}
        />

        {!isLoaded ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : savedPicks.length === 0 ? (
          <EmptyState
            icon="reader-outline"
            headline="No saved picks yet"
            description="Run Analyze, save a pick, and it will persist here between app launches."
            action="Open Analyze"
            onAction={() => navigation?.navigate('Analyze')}
          />
        ) : (
          <>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryValue}>{stats.pending}</Text>
                <Text style={styles.summaryLabel}>Pending</Text>
              </View>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryValue}>{stats.checked}</Text>
                <Text style={styles.summaryLabel}>Checked</Text>
              </View>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryValue}>{stats.imported}</Text>
                <Text style={styles.summaryLabel}>Imported</Text>
              </View>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryValue}>{stats.won}</Text>
                <Text style={styles.summaryLabel}>Won</Text>
              </View>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryValue}>{stats.lost}</Text>
                <Text style={styles.summaryLabel}>Lost</Text>
              </View>
            </View>

            <View style={styles.checkPanel}>
              <PrimaryButton
                label={isChecking ? 'Checking Results' : gameFilter === 'all' ? 'Check Results' : `Check ${FLORIDA_GAMES[gameFilter].name}`}
                onPress={checkResults}
                loading={isChecking}
                disabled={isChecking}
              />
              <Text style={styles.checkNote}>
                Checks only compare saved picks against available official draw records. Payouts and ROI are not estimated.
              </Text>
            </View>

            {checkMessage ? <StateBlock tone="success" title={checkMessage} /> : null}
            {checkError ? (
              <StateBlock
                tone="danger"
                title="Result check failed"
                body={checkError}
              />
            ) : null}

            <View style={styles.filterBlock}>
              <TerminalLabel>Status</TerminalLabel>
              <View style={styles.filterRow}>
                {STATUS_FILTERS.map(filter => (
                  <Chip
                    key={filter.value}
                    label={filter.label}
                    selected={statusFilter === filter.value}
                    onPress={() => setStatusFilter(filter.value)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.filterBlock}>
              <TerminalLabel>Game</TerminalLabel>
              <View style={styles.filterRow}>
                <Chip
                  label="All Games"
                  selected={gameFilter === 'all'}
                  onPress={() => setGameFilter('all')}
                />
                {gameOptions.map(option => (
                  <Chip
                    key={option.gameType}
                    label={option.gameName}
                    selected={gameFilter === option.gameType}
                    onPress={() => setGameFilter(option.gameType)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.filterBlock}>
              <TerminalLabel>Source</TerminalLabel>
              <View style={styles.filterRow}>
                {SOURCE_FILTERS.map(filter => (
                  <Chip
                    key={filter.value}
                    label={filter.label}
                    selected={sourceFilter === filter.value}
                    onPress={() => setSourceFilter(filter.value)}
                  />
                ))}
              </View>
            </View>
          </>
        )}
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Import"
          title="Add ticket to ledger"
          caption="Capture or choose a ticket image, then review the detected details before saving."
          right={<StatusPill label={uploadAuthReady ? 'Scan ready' : 'Sign in'} tone={uploadAuthReady ? 'success' : 'warning'} />}
        />

        <View style={styles.authPanel}>
          <View style={styles.authHeader}>
            <View style={styles.authHeaderText}>
              <Text style={styles.importTitle}>Private beta session</Text>
              <Text style={styles.importText}>
                {auth.isAuthenticated
                  ? 'Ticket image uploads use your stored mobile session.'
                  : usingDevUploadToken
                    ? 'A development upload token is present. Sign in for normal private beta use.'
                    : 'Sign in to scan ticket images through the authenticated upload route.'}
              </Text>
            </View>
            <StatusPill
              label={auth.isAuthenticated ? 'Signed in' : usingDevUploadToken ? 'Dev token' : 'Required'}
              tone={auth.isAuthenticated ? 'success' : usingDevUploadToken ? 'warning' : 'neutral'}
            />
          </View>

          {auth.isAuthenticated ? (
            <>
              <Text style={styles.authIdentity}>
                {auth.user?.email ?? auth.user?.name ?? 'Signed in account'}
              </Text>
              <PrimaryButton
                label="Log Out"
                onPress={logout}
                loading={auth.isBusy}
                size="compact"
                variant="secondary"
              />
            </>
          ) : (
            <>
              <View style={styles.authModeRow}>
                <Chip
                  label="Log In"
                  selected={authMode === 'login'}
                  onPress={() => {
                    setAuthMode('login');
                    setAuthFormError(null);
                    setAuthFormMessage(null);
                  }}
                />
                <Chip
                  label="Register"
                  selected={authMode === 'register'}
                  onPress={() => {
                    setAuthMode('register');
                    setAuthFormError(null);
                    setAuthFormMessage(null);
                  }}
                />
              </View>

              {authMode === 'register' ? (
                <>
                  <Text style={styles.inputLabel}>Name</Text>
                  <TextInput
                    value={authName}
                    onChangeText={setAuthName}
                    placeholder="Private beta name"
                    placeholderTextColor={ui.colors.textSubtle}
                    autoCapitalize="words"
                    style={styles.singleLineInput}
                  />
                </>
              ) : null}

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                value={authEmail}
                onChangeText={setAuthEmail}
                placeholder="email@example.com"
                placeholderTextColor={ui.colors.textSubtle}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={styles.singleLineInput}
              />

              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                value={authPassword}
                onChangeText={setAuthPassword}
                placeholder={authMode === 'register' ? 'At least 8 characters' : 'Password'}
                placeholderTextColor={ui.colors.textSubtle}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.singleLineInput}
              />

              <PrimaryButton
                label={authMode === 'register' ? 'Create Session' : 'Log In'}
                onPress={submitAuth}
                loading={auth.isBusy}
                disabled={!auth.isLoaded || auth.isBusy}
                size="compact"
                style={styles.authSubmit}
              />
            </>
          )}

          {authFormMessage ? <StateBlock tone="success" title={authFormMessage} /> : null}
          {authFormError || auth.error ? (
            <StateBlock
              tone="danger"
              title="Session action failed"
              body={authFormError ?? auth.error ?? undefined}
            />
          ) : null}
        </View>

        <View style={styles.importGrid}>
          <View style={styles.importOption}>
            <Text style={styles.importTitle}>Manual entry</Text>
            <Text style={styles.importText}>Enter a real ticket exactly as printed, then review before saving.</Text>
            <StatusPill label="Active" tone="success" />
          </View>
          <View style={styles.importOption}>
            <Text style={styles.importTitle}>Ticket image</Text>
            <Text style={styles.importText}>
              {uploadAuthReady
                ? 'Upload uses the active mobile session. Scanned results must still be reviewed before saving.'
                : 'Camera and image selection work. Sign in to scan through the server, or use manual review after selection.'}
            </Text>
            <View style={styles.importActions}>
              <PrimaryButton
                label="Take Photo"
                onPress={() => handleTicketImage('camera')}
                loading={isScanning}
                disabled={isScanning}
                size="compact"
                style={styles.cardAction}
              />
              <PrimaryButton
                label="Choose Image"
                onPress={() => handleTicketImage('library')}
                disabled={isScanning}
                size="compact"
                variant="secondary"
                style={styles.cardAction}
              />
            </View>
            <StatusPill label={uploadAuthReady ? 'Upload' : 'Auth needed'} tone={uploadAuthReady ? 'success' : 'warning'} />
          </View>
          <View style={styles.importOption}>
            <Text style={styles.importTitle}>PDF import</Text>
            <Text style={styles.importText}>Server PDF import is admin-only and imports draw history, not mobile ticket entries.</Text>
            <StatusPill label="Admin" tone="warning" />
          </View>
        </View>

        {selectedImage ? (
          <View style={styles.imageReview}>
            <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
            <View style={styles.imageMeta}>
              <Text style={styles.importTitle}>Selected ticket image</Text>
              <Text style={styles.importText}>{selectedImage.fileName}</Text>
              <Text style={styles.importText}>{selectedImage.width} x {selectedImage.height}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.formBlock}>
          <TerminalLabel>Game</TerminalLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.formTabRow}
          >
            {ACTIVE_GAMES.map((gameType, index) => (
              <InstrumentTab
                key={`manual-${gameType}`}
                label={FLORIDA_GAMES[gameType].name}
                selected={manualDraft.gameType === gameType}
                isLast={index === ACTIVE_GAMES.length - 1}
                onPress={() => updateManualDraft({
                  gameType,
                  mainNumbersText: '',
                  specialNumbersText: '',
                })}
              />
            ))}
          </ScrollView>

          <Text style={styles.inputLabel}>Main numbers</Text>
          <TextInput
            value={manualDraft.mainNumbersText}
            onChangeText={mainNumbersText => updateManualDraft({ mainNumbersText })}
            placeholder={manualConfig.isDigitGame
              ? `Example: ${Array.from({ length: manualConfig.mainCount }, (_, index) => index + 1).join('')}`
              : 'Example: 3 12 24 31 36'}
            placeholderTextColor={ui.colors.textSubtle}
            keyboardType="numbers-and-punctuation"
            style={styles.singleLineInput}
          />

          {manualConfig.specialCount > 0 ? (
            <>
              <Text style={styles.inputLabel}>{manualConfig.name === 'Powerball' ? 'Powerball' : manualConfig.name === 'Mega Millions' ? 'Mega Ball' : 'Special number'}</Text>
              <TextInput
                value={manualDraft.specialNumbersText}
                onChangeText={specialNumbersText => updateManualDraft({ specialNumbersText })}
                placeholder={`1-${manualConfig.specialMax}`}
                placeholderTextColor={ui.colors.textSubtle}
                keyboardType="number-pad"
                style={styles.singleLineInput}
              />
            </>
          ) : null}

          <View style={styles.formRow}>
            <View style={styles.formHalf}>
              <Text style={styles.inputLabel}>Draw date</Text>
              <TextInput
                value={manualDraft.drawDate}
                onChangeText={drawDate => updateManualDraft({ drawDate })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={ui.colors.textSubtle}
                keyboardType="numbers-and-punctuation"
                style={styles.singleLineInput}
              />
            </View>
            <View style={styles.formHalf}>
              <Text style={styles.inputLabel}>Draw period</Text>
              <View style={styles.periodRow}>
                <Chip
                  label="Midday"
                  selected={manualDraft.drawTime === 'midday'}
                  onPress={() => updateManualDraft({ drawTime: 'midday' })}
                />
                <Chip
                  label="Evening"
                  selected={manualDraft.drawTime === 'evening'}
                  onPress={() => updateManualDraft({ drawTime: 'evening' })}
                />
              </View>
            </View>
          </View>

          <Text style={styles.inputLabel}>Notes</Text>
          <TextInput
            multiline
            value={manualDraft.notes}
            onChangeText={notes => updateManualDraft({ notes })}
            placeholder="Optional private notes"
            placeholderTextColor={ui.colors.textSubtle}
            style={styles.notesInput}
          />

          <View style={styles.cardActions}>
            <PrimaryButton
              label="Review Ticket"
              onPress={reviewManualTicket}
              size="compact"
              style={styles.cardAction}
            />
            <PrimaryButton
              label="Save to Ledger"
              onPress={saveManualTicket}
              size="compact"
              variant="secondary"
              style={styles.cardAction}
            />
          </View>
        </View>

        {manualReview ? (
          <View style={styles.reviewBlock}>
            <Text style={styles.gradeTitle}>Review ticket details</Text>
            <Text style={styles.gradeText}>{manualReview.gameName}</Text>
            <Text style={styles.gradeText}>Main: {manualReview.mainNumbers.join(' - ')}</Text>
            {manualReview.specialNumbers.length > 0 ? (
              <Text style={styles.gradeText}>Special: {manualReview.specialNumbers.join(' - ')}</Text>
            ) : null}
            <Text style={styles.gradeText}>{manualReview.drawLabel}</Text>
          </View>
        ) : null}

        {importMessage ? <StateBlock tone="success" title={importMessage} /> : null}
        {importError ? <StateBlock tone="danger" title="Unable to confirm ticket structure" body={importError} /> : null}
      </Card>

      {isLoaded && savedPicks.length > 0 ? (
        <Card>
          <SectionHeader
            eyebrow="Tickets"
            title={filteredPicks.length > 0 ? 'Saved picks' : 'No matches'}
            caption="Newest records appear first. Result checks are local comparisons against fetched draw rows."
          />

          {filteredPicks.length === 0 ? (
            <StateBlock
              title="No saved picks match these filters"
              body="Adjust the status or game filters to review the local ledger."
            />
          ) : (
            <View style={styles.pickList}>
              {filteredPicks.map(pick => {
                const matchedText = formatMatchedNumbers(pick);
                const checkedLabel = formatCheckedDate(pick.lastCheckedAt);

                return (
                  <View key={pick.id} style={styles.pickCard}>
                    <View style={styles.pickHeader}>
                      <View style={styles.pickTitleGroup}>
                        <Text style={styles.pickGame}>{pick.gameName}</Text>
                        <Text style={styles.pickModel}>{pick.modelName}</Text>
                      </View>
                      <View style={styles.pickPills}>
                        <StatusPill label={statusLabel(pick.status)} tone={statusTone(pick.status)} />
                        <StatusPill label={sourceTypeLabel(pick.sourceType)} tone={sourceTone(pick.sourceType)} />
                      </View>
                    </View>

                    <View style={styles.numberRow}>
                      {pick.mainNumbers.map((number, index) => (
                        <NumberChip key={`${pick.id}-main-${index}`} value={number} />
                      ))}
                    </View>

                    {pick.specialNumbers.length > 0 ? (
                      <View style={styles.specialRow}>
                        <Text style={styles.specialLabel}>Special</Text>
                        <View style={styles.numberRowCompact}>
                          {pick.specialNumbers.map((number, index) => (
                            <NumberChip key={`${pick.id}-special-${index}`} value={number} muted />
                          ))}
                        </View>
                      </View>
                    ) : null}

                    <View style={styles.detailBlock}>
                      {pick.sourceType === 'generated' ? (
                        <Text style={styles.detailText}>Score {formatScore(pick.confidenceScore)}</Text>
                      ) : (
                        <Text style={styles.detailText}>Source {pick.sourceLabel ?? sourceTypeLabel(pick.sourceType)}</Text>
                      )}
                      <Text style={styles.detailText}>{formatSavedDate(pick.savedAt)}</Text>
                      {pick.drawLabel ? <Text style={styles.detailText}>{pick.drawLabel}</Text> : null}
                      {pick.drawResultLabel ? <Text style={styles.detailText}>Result draw: {pick.drawResultLabel}</Text> : null}
                      {checkedLabel ? <Text style={styles.detailText}>Last checked: {checkedLabel}</Text> : null}
                    </View>

                    {pick.gradeSummary ? (
                      <View style={styles.gradeBlock}>
                        <Text style={styles.gradeTitle}>Result check</Text>
                        <Text style={styles.gradeText}>{pick.gradeSummary}</Text>
                        {pick.prizeTierLabel ? <Text style={styles.gradeText}>Tier: {pick.prizeTierLabel}</Text> : null}
                        {matchedText ? <Text style={styles.gradeText}>{matchedText}</Text> : null}
                        {pick.resultSource ? <Text style={styles.gradeMeta}>Source: {pick.resultSource}</Text> : null}
                      </View>
                    ) : null}

                    <View style={styles.statusActions}>
                      {STATUS_ACTIONS.map(action => (
                        <Chip
                          key={`${pick.id}-${action.value}`}
                          label={action.label}
                          selected={pick.status === action.value}
                          onPress={() => updatePickStatus(pick.id, action.value)}
                        />
                      ))}
                    </View>

                    <TextInput
                      multiline
                      value={pick.notes}
                      onChangeText={notes => updatePickNotes(pick.id, notes)}
                      placeholder="Add private notes"
                      placeholderTextColor={ui.colors.textSubtle}
                      style={styles.notesInput}
                    />

                    <View style={styles.cardActions}>
                      <PrimaryButton
                        label="Share"
                        onPress={() => sharePick(pick)}
                        size="compact"
                        variant="secondary"
                        style={styles.cardAction}
                      />
                      <PrimaryButton
                        label="Delete"
                        onPress={() => deletePick(pick.id)}
                        size="compact"
                        variant="secondary"
                        style={styles.cardAction}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {filteredPicks.length > 0 ? (
            <View style={styles.clearArea}>
              <PrimaryButton
                label="Clear All Local Picks"
                onPress={clearSavedPicks}
                variant="secondary"
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <SectionHeader
          eyebrow="Workflow"
          title="Tracking path"
          caption="Structured for real outcomes without fake return estimates."
        />

        <FeatureRow
          title="1. Generate"
          detail="Create model output in Analyze using the live prediction endpoint."
          meta="Live"
        />
        <FeatureRow
          title="2. Save"
          detail="Persist generated or manually entered tickets locally on this device."
          meta="Local"
        />
        <FeatureRow
          title="3. Check results"
          detail="Fetch draw rows through the existing API and compare saved picks locally."
          meta="Active"
        />
        <FeatureRow
          title="4. Review"
          detail="Use manual status and notes for private follow-up until payout rules are connected."
          meta="Private"
        />
      </Card>

      <Text style={styles.note}>
        This ledger shows saved picks, fetched draw comparisons, and manual status only. It does not estimate payouts or ROI.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.md,
  },
  summaryTile: {
    backgroundColor: ui.colors.backgroundRaised,
    borderColor: ui.colors.border,
    borderRadius: ui.radii.md,
    borderWidth: 1,
    flexBasis: '46%',
    flexGrow: 1,
    padding: ui.spacing.lg,
  },
  summaryValue: {
    color: ui.colors.accent,
    fontFamily: 'monospace',
    fontSize: 24,
    fontWeight: '900',
  },
  summaryLabel: {
    color: ui.colors.textSubtle,
    fontSize: 12,
    fontWeight: '800',
    marginTop: ui.spacing.xs,
    textTransform: 'uppercase',
  },
  checkPanel: {
    borderTopColor: ui.colors.borderMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: ui.spacing.lg,
    paddingTop: ui.spacing.lg,
  },
  checkNote: {
    color: ui.colors.textSubtle,
    fontSize: 12,
    lineHeight: 17,
    marginTop: ui.spacing.sm,
  },
  filterBlock: {
    marginTop: ui.spacing.lg,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.sm,
  },
  importGrid: {
    gap: ui.spacing.md,
  },
  importOption: {
    backgroundColor: ui.colors.backgroundRaised,
    borderColor: ui.colors.borderMuted,
    borderRadius: ui.radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: ui.spacing.sm,
    padding: ui.spacing.md,
  },
  importTitle: {
    color: ui.colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  importText: {
    color: ui.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  authPanel: {
    backgroundColor: ui.colors.backgroundRaised,
    borderColor: ui.colors.borderMuted,
    borderRadius: ui.radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: ui.spacing.md,
    marginBottom: ui.spacing.lg,
    padding: ui.spacing.md,
  },
  authHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: ui.spacing.md,
    justifyContent: 'space-between',
  },
  authHeaderText: {
    flex: 1,
  },
  authModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.sm,
  },
  authIdentity: {
    color: ui.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  authSubmit: {
    alignSelf: 'stretch',
  },
  importActions: {
    flexDirection: 'row',
    gap: ui.spacing.sm,
  },
  imageReview: {
    alignItems: 'center',
    backgroundColor: ui.colors.backgroundRaised,
    borderColor: ui.colors.borderMuted,
    borderRadius: ui.radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: ui.spacing.md,
    marginTop: ui.spacing.lg,
    padding: ui.spacing.md,
  },
  imagePreview: {
    backgroundColor: ui.colors.surfaceMuted,
    borderRadius: ui.radii.sm,
    height: 74,
    width: 74,
  },
  imageMeta: {
    flex: 1,
  },
  formBlock: {
    borderTopColor: ui.colors.borderMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: ui.spacing.lg,
    paddingTop: ui.spacing.lg,
  },
  formTabRow: {
    borderBottomWidth: 1,
    borderBottomColor: ui.colors.border,
    marginHorizontal: -ui.spacing.md,
    marginBottom: ui.spacing.md,
  },
  inputLabel: {
    color: ui.colors.textSubtle,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: ui.spacing.sm,
    marginTop: ui.spacing.md,
    textTransform: 'uppercase',
  },
  singleLineInput: {
    backgroundColor: ui.colors.surfaceMuted,
    borderColor: ui.colors.borderMuted,
    borderRadius: ui.radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: ui.colors.text,
    fontSize: 14,
    fontWeight: '700',
    minHeight: 42,
    paddingHorizontal: ui.spacing.md,
  },
  formRow: {
    flexDirection: 'row',
    gap: ui.spacing.md,
  },
  formHalf: {
    flex: 1,
  },
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.sm,
  },
  reviewBlock: {
    backgroundColor: ui.colors.surfaceMuted,
    borderColor: ui.colors.borderMuted,
    borderRadius: ui.radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: ui.spacing.lg,
    padding: ui.spacing.md,
  },
  pickList: {
    gap: ui.spacing.md,
  },
  pickCard: {
    backgroundColor: ui.colors.backgroundRaised,
    borderColor: ui.colors.borderMuted,
    borderRadius: ui.radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: ui.spacing.lg,
  },
  pickHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: ui.spacing.md,
    justifyContent: 'space-between',
    marginBottom: ui.spacing.md,
  },
  pickTitleGroup: {
    flex: 1,
  },
  pickPills: {
    alignItems: 'flex-end',
    gap: ui.spacing.xs,
  },
  pickGame: {
    color: ui.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  pickModel: {
    color: ui.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: ui.spacing.xs,
  },
  numberRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.sm,
  },
  numberRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.sm,
  },
  specialRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: ui.spacing.md,
    marginTop: ui.spacing.md,
  },
  specialLabel: {
    color: ui.colors.textSubtle,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailBlock: {
    borderTopColor: ui.colors.borderMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: ui.spacing.xs,
    marginTop: ui.spacing.md,
    paddingTop: ui.spacing.md,
  },
  detailText: {
    color: ui.colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
  },
  gradeBlock: {
    backgroundColor: ui.colors.surfaceMuted,
    borderColor: ui.colors.borderMuted,
    borderRadius: ui.radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: ui.spacing.md,
    padding: ui.spacing.md,
  },
  gradeTitle: {
    color: ui.colors.text,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: ui.spacing.xs,
    textTransform: 'uppercase',
  },
  gradeText: {
    color: ui.colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  gradeMeta: {
    color: ui.colors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
    marginTop: ui.spacing.xs,
  },
  statusActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.sm,
    marginTop: ui.spacing.md,
  },
  notesInput: {
    backgroundColor: ui.colors.surfaceMuted,
    borderColor: ui.colors.borderMuted,
    borderRadius: ui.radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: ui.colors.text,
    fontSize: 13,
    marginTop: ui.spacing.md,
    minHeight: 62,
    padding: ui.spacing.md,
    textAlignVertical: 'top',
  },
  cardActions: {
    flexDirection: 'row',
    gap: ui.spacing.sm,
    marginTop: ui.spacing.md,
  },
  cardAction: {
    flex: 1,
  },
  clearArea: {
    marginTop: ui.spacing.lg,
  },
  note: {
    color: ui.colors.textSubtle,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: ui.spacing.xs,
  },
});
