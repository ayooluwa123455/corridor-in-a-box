import { describe, expect, it } from "vitest";
import { parseCorridor, type Corridor } from "@corridor/manifest";
import { hasConfirmedThirdPartyPayout, selectCandidates } from "@corridor/router";

const base = {
  id: "t",
  source: { name: "S", asset: "USDC", endpoints: { home_domain: "s.example" } },
  dest: {
    protocol: "sep31",
    name: "D",
    asset: "iso4217:ARS",
    endpoints: {
      home_domain: "d.example",
      transfer_server_sep31: "https://d.example/sep31",
      quote_server: "https://d.example/sep38",
    },
  },
  fx: { path: ["ARS", "USDC", "ARS"], who_holds_risk: "receiving_anchor" },
  compliance: { source_jurisdiction: "AR", dest_jurisdiction: "AR" },
  settlement: { network: "testnet", asset_issuer: "GISSUER" },
  recovery: {},
};

function corridor(raw: Record<string, unknown>): Corridor {
  const r = parseCorridor(raw);
  if (!r.ok) throw new Error(`fixture did not parse: ${r.error.message}`);
  return r.value;
}

function sep6(id: string, thirdPartyPayout?: boolean): Corridor {
  return corridor({
    ...base,
    id,
    dest: {
      protocol: "sep6",
      name: "SEP-6 anchor",
      asset: "iso4217:ARS",
      endpoints: { home_domain: "sep6.example", transfer_server: "https://sep6.example/sep6" },
      ...(thirdPartyPayout === undefined ? {} : { third_party_payout: thirdPartyPayout }),
    },
  });
}

function sep31(id: string): Corridor {
  return corridor({ ...base, id });
}

describe("selectCandidates (#645)", () => {
  it("keeps a SEP-6 corridor only when third_party_payout is true", () => {
    const confirmed = sep6("confirmed", true);
    const { candidates, dropped } = selectCandidates([confirmed]);

    expect(candidates.map((c) => c.id)).toEqual(["confirmed"]);
    expect(dropped).toEqual([]);
    expect(hasConfirmedThirdPartyPayout(confirmed)).toBe(true);
  });

  it("drops a SEP-6 corridor whose flag is absent, with a reason", () => {
    const { candidates, dropped } = selectCandidates([sep6("unconfirmed")]);

    expect(candidates).toEqual([]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({
      corridorId: "unconfirmed",
      receivingDomain: "sep6.example",
      protocol: "sep6",
      dropped: true,
    });
    expect(dropped[0]!.reason).toContain("third_party_payout");
    expect(dropped[0]!.reason).toContain("SEP-6");
  });

  it("drops an explicit third_party_payout: false too", () => {
    const { candidates, dropped } = selectCandidates([sep6("refused", false)]);

    expect(candidates).toEqual([]);
    expect(dropped.map((d) => d.corridorId)).toEqual(["refused"]);
  });

  it("keeps SEP-31 corridors without the flag", () => {
    const { candidates, dropped } = selectCandidates([sep31("sep31-lane")]);

    expect(candidates.map((c) => c.id)).toEqual(["sep31-lane"]);
    expect(dropped).toEqual([]);
  });

  it("preserves order and reports every dropped SEP-6 corridor", () => {
    const { candidates, dropped } = selectCandidates([
      sep6("a"),
      sep31("b"),
      sep6("c", true),
      sep6("d", false),
    ]);

    expect(candidates.map((c) => c.id)).toEqual(["b", "c"]);
    expect(dropped.map((d) => d.corridorId)).toEqual(["a", "d"]);
  });
});
