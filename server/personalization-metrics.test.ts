import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignPersonalizationAbGroup,
  deterministicAbBucket,
  resolveSelectedCandidateSource,
  snapshotTopCandidates,
} from "./personalization-metrics";

describe("personalization metrics helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses deterministic bucketing per user and game", () => {
    vi.stubEnv("PERSONALIZATION_METRICS_HASH_SALT", "salt-a");
    const first = deterministicAbBucket(42, "fantasy_5");
    const second = deterministicAbBucket(42, "fantasy_5");
    const differentGame = deterministicAbBucket(42, "powerball");

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(100);
    expect(differentGame).toBeGreaterThanOrEqual(0);
    expect(differentGame).toBeLessThan(100);
  });

  it("assigns ineligible when user or eligibility missing", () => {
    const noUser = assignPersonalizationAbGroup({
      userId: null,
      gameType: "fantasy_5",
      personalizationEligible: true,
    });
    expect(noUser).toEqual({
      group: "ineligible",
      bucket: null,
      personalizationAllowed: false,
    });

    const notEligible = assignPersonalizationAbGroup({
      userId: 7,
      gameType: "fantasy_5",
      personalizationEligible: false,
    });
    expect(notEligible).toEqual({
      group: "ineligible",
      bucket: null,
      personalizationAllowed: false,
    });
  });

  it("sends eligible users to control when control split is 100%", () => {
    vi.stubEnv("PERSONALIZATION_METRICS_HASH_SALT", "salt-b");
    vi.stubEnv("PERSONALIZATION_AB_CONTROL_PERCENT", "100");

    const assignment = assignPersonalizationAbGroup({
      userId: 11,
      gameType: "fantasy_5",
      personalizationEligible: true,
    });
    expect(assignment.group).toBe("control");
    expect(assignment.personalizationAllowed).toBe(false);
    expect(assignment.bucket).not.toBeNull();
  });

  it("detects selected source as personal adjustment when rank lifts", () => {
    const source = resolveSelectedCandidateSource({
      selectedCandidateKey: "1,2,3,4,5|",
      personalizationApplied: true,
      baselineRankByKey: new Map([["1,2,3,4,5|", 5]]),
      servedRankByKey: new Map([["1,2,3,4,5|", 2]]),
    });
    expect(source).toBe("personal_reranker_adjustment");
  });

  it("captures top-N snapshots from ranked candidates", () => {
    const snapshots = snapshotTopCandidates([
      { candidateKey: "a|", rankPosition: 1, rankerProbability: 0.8 },
      { candidateKey: "b|", rankPosition: 2, rankerProbability: 0.7 },
      { candidateKey: "c|", rankPosition: 3, rankerProbability: 0.6 },
    ], 2);
    expect(snapshots).toEqual([
      { candidateKey: "a|", rankPosition: 1, probability: 0.8 },
      { candidateKey: "b|", rankPosition: 2, probability: 0.7 },
    ]);
  });
});
