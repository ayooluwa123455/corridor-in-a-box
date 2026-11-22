// Planner step 1: candidate corridors, and the protocol gates a candidate must
// pass before it can be offered (#645).
//
// A SEP-6 corridor can only pay a third party — a recipient account the sender
// does not own — when the receiving anchor has explicitly agreed to it. No
// stellar.toml or SEP-6 /info field says so, so the manifest records the
// confirmation in `dest.third_party_payout` (RFC 0004 §5). Without it, the
// corridor must not be offered for remittance at all: drop it here, with a
// reason the operator can read, rather than discovering the constraint after
// funds have moved.

import type { Corridor } from "@corridor/manifest";

export interface DroppedCandidate {
  readonly corridorId: string;
  readonly receivingDomain: string;
  readonly protocol: string;
  readonly dropped: true;
  readonly reason: string;
}

export interface CandidateSelection {
  /** Corridors eligible for pricing and ranking, in their original order. */
  readonly candidates: readonly Corridor[];
  /** Corridors excluded before any network call, with a plain-language reason. */
  readonly dropped: readonly DroppedCandidate[];
}

/**
 * Whether the corridor carries an explicit, manifest-recorded confirmation that
 * its receiving anchor accepts third-party payouts. Not a probe: the flag is a
 * claim a human checked with the anchor.
 */
export function hasConfirmedThirdPartyPayout(corridor: Corridor): boolean {
  return corridor.dest.protocol === "sep6" && corridor.dest.third_party_payout === true;
}

/**
 * Partition corridors into planner candidates and dropped ones. Only SEP-6 is
 * gated today: SEP-31 pays a recipient the receiving anchor has onboarded by
 * design, and a custom adapter owns its own rules.
 */
export function selectCandidates(corridors: readonly Corridor[]): CandidateSelection {
  const candidates: Corridor[] = [];
  const dropped: DroppedCandidate[] = [];

  for (const corridor of corridors) {
    if (corridor.dest.protocol === "sep6" && !hasConfirmedThirdPartyPayout(corridor)) {
      dropped.push({
        corridorId: corridor.id,
        receivingDomain: corridor.dest.endpoints.home_domain,
        protocol: corridor.dest.protocol,
        dropped: true,
        reason:
          "dropped: SEP-6 third-party payout not confirmed " +
          "(dest.third_party_payout is not true)",
      });
      continue;
    }
    candidates.push(corridor);
  }

  return { candidates, dropped };
}
