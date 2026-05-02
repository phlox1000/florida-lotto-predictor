import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useDashboardState } from '../lib/DashboardStateProvider';
import { colors } from '../theme';

export default function TrackScreen() {
  const { recordTabOpen } = useDashboardState();
  useFocusEffect(
    useCallback(() => {
      recordTabOpen('track', null);
    }, [recordTabOpen]),
  );
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
              <View style={styles.roleRow}>
                <Text style={styles.roleLabel}>Role</Text>
                <Text style={[
                  styles.roleValue,
                  auth.user?.role === 'admin' ? styles.roleAdmin : styles.roleUser,
                ]}>
                  {auth.user?.role ?? 'user'}
                </Text>
              </View>
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
            <Text style={styles.importText}>
              PDF imports are handled via the web admin panel. Visit{'\n'}
              <Text style={styles.importLink}>florida-lotto-predictor.onrender.com</Text>
              {'\n'}to import draw history PDFs.
            </Text>
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
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '600', color: colors.text },
});
