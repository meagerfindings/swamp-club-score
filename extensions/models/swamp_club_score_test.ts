import { assert, assertEquals, assertRejects } from "@std/assert";
import { model } from "./swamp_club_score.ts";

const SAMPLE_HTML = `
<!doctype html>
<html>
  <head>
    <title>Swamp Club</title>
  </head>
  <body>
    <span class="font-mono text-hud-body text-white font-bold tabular-nums">1,964,794 PTS</span>
    <div class="text-2xl font-bold text-white">BLACK WATER WRAITH</div>
    <div class="font-mono text-hud-label text-white tabular-nums">1,964,794</div>
    <p class="text-hud-muted">The user bio goes here.</p>
    <div>41 active days in 2026</div>
    <div aria-label="1 day streak"></div>
    <span>joined May 2024</span>
    <details>
      <summary>Show full breakdown</summary>
      <div data-frsh-key="badges" class="bg-black/40 border border-white/[0.06] px-3 py-2">
        <div class="flex items-baseline gap-3">
          <span class="font-mono text-hud-code text-hud-label font-semibold truncate">badges</span>
          <span class="font-mono text-hud-code text-white tabular-nums" style="color:#39ff14;">1.05M</span>
        </div>
      </div>
      <div data-frsh-key="writings" class="bg-black/40 border border-white/[0.06] px-3 py-2">
        <div class="flex items-baseline gap-3">
          <span class="font-mono text-hud-code text-hud-label font-semibold truncate">writings</span>
          <span class="font-mono text-hud-code text-white tabular-nums" style="color:#39ff14;">700k</span>
        </div>
      </div>
      <div data-frsh-key="cli_invocation" class="bg-black/40 border border-white/[0.06] px-3 py-2">
        <div class="flex items-baseline gap-3">
          <span class="font-mono text-hud-code text-hud-label font-semibold truncate">cli invocation</span>
          <span class="font-mono text-hud-code text-white tabular-nums" style="color:#39ff14;">208k</span>
        </div>
      </div>
    </details>
  </body>
</html>`;

Deno.test("sync fetches and stores the current snapshot", async () => {
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0 }, (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname === "/u/mgreten") {
      return new Response(SAMPLE_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (url.pathname === "/api/v1/leaderboard/locate") {
      return Response.json({
        boards: {
          today: {
            rows: [
              {
                rank: 3,
                username: "mgreten",
                score: 8642,
                tierName: "GENESIS PASS",
                tierScore: 999999,
              },
            ],
          },
          alltime: {
            rows: [
              {
                rank: 1,
                username: "someone",
                score: 1234,
                tierName: "Ranger",
                tierScore: 1234,
              },
              {
                rank: 7,
                username: "mgreten",
                score: 1964794,
                tierName: "BLACK WATER WRAITH",
                tierScore: 1964794,
              },
            ],
          },
        },
      });
    }
    return new Response("not found", { status: 404 });
  });

  const port = (server.addr as Deno.NetAddr).port;
  const writes: Array<{ specName: string; instanceName: string; data: unknown }> = [];

  try {
    const result = await model.methods.sync.execute(
      {},
      {
        globalArgs: {
          username: "mgreten",
          swampClubUrl: `http://127.0.0.1:${port}`,
        },
        logger: {
          info: () => {},
          warning: () => {},
        },
        writeResource: async (specName, instanceName, data) => {
          writes.push({ specName, instanceName, data });
          return { name: `${specName}:${instanceName}` };
        },
      },
    );

    assertEquals(result.dataHandles.length, 3);
    assertEquals(writes.map((w) => w.specName), ["snapshot", "leaderboards", "topBuckets"]);

    const snapshot = writes[0].data as {
      username: string;
      score: number;
      rank: number | null;
      todayScore: number;
      todayScoreLabel: string;
      todayRank: number | null;
      tierName: string;
      topBuckets: Array<{ name: string; score: number }>;
      leaderboards: Record<string, unknown>;
    };

    assertEquals(snapshot.username, "mgreten");
    assertEquals(snapshot.score, 1964794);
    assertEquals(snapshot.rank, 7);
    assertEquals(snapshot.todayScore, 8642);
    assertEquals(snapshot.todayScoreLabel, "8642");
    assertEquals(snapshot.todayRank, 3);
    assertEquals(snapshot.tierName, "BLACK WATER WRAITH");
    assert(snapshot.topBuckets.length >= 2);
    assertEquals(snapshot.topBuckets[0].name, "badges");
    assertEquals(snapshot.topBuckets[0].score, 1050000);
    assertEquals(Object.keys(snapshot.leaderboards), ["today", "alltime"]);
  } finally {
    server.shutdown();
  }
});

Deno.test("sync defaults today values when the target is absent", async () => {
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0 }, (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname === "/u/mgreten") return new Response(SAMPLE_HTML);
    if (url.pathname === "/api/v1/leaderboard/locate") {
      return Response.json({
        boards: {
          alltime: {
            rows: [{ rank: 7, username: "mgreten", score: 1964794 }],
          },
          today: {
            rows: [{ rank: 1, username: "someone", score: 5000 }],
          },
        },
      });
    }
    return new Response("not found", { status: 404 });
  });
  const port = (server.addr as Deno.NetAddr).port;
  const writes: Array<{ specName: string; data: unknown }> = [];

  try {
    await model.methods.sync.execute({}, {
      globalArgs: {
        username: "mgreten",
        swampClubUrl: `http://127.0.0.1:${port}`,
      },
      logger: { info: () => {}, warning: () => {} },
      writeResource: async (specName, _instanceName, data) => {
        writes.push({ specName, data });
        return { name: specName };
      },
    });

    const snapshot = writes[0].data as {
      score: number;
      rank: number | null;
      todayScore: number;
      todayScoreLabel: string;
      todayRank: number | null;
    };
    assertEquals(snapshot.score, 1964794);
    assertEquals(snapshot.rank, 7);
    assertEquals(snapshot.todayScore, 0);
    assertEquals(snapshot.todayScoreLabel, "0");
    assertEquals(snapshot.todayRank, null);
  } finally {
    server.shutdown();
  }
});

Deno.test("sync rejects a leaderboard HTTP failure without writes", async () => {
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0 }, (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname === "/u/mgreten") return new Response(SAMPLE_HTML);
    if (url.pathname === "/api/v1/leaderboard/locate") {
      return new Response("unavailable", { status: 500 });
    }
    return new Response("not found", { status: 404 });
  });
  const port = (server.addr as Deno.NetAddr).port;
  const writes: unknown[] = [];

  try {
    await assertRejects(
      () => model.methods.sync.execute({}, {
        globalArgs: {
          username: "mgreten",
          swampClubUrl: `http://127.0.0.1:${port}`,
        },
        logger: { info: () => {}, warning: () => {} },
        writeResource: async (_specName, _instanceName, data) => {
          writes.push(data);
          return { name: "unexpected" };
        },
      }),
      Error,
      "500",
    );
    assertEquals(writes, []);
  } finally {
    server.shutdown();
  }
});

Deno.test("sync rejects a missing today board without writes", async () => {
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0 }, (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname === "/u/mgreten") return new Response(SAMPLE_HTML);
    if (url.pathname === "/api/v1/leaderboard/locate") {
      return Response.json({
        boards: {
          alltime: {
            rows: [{ rank: 7, username: "mgreten", score: 1964794 }],
          },
        },
      });
    }
    return new Response("not found", { status: 404 });
  });
  const port = (server.addr as Deno.NetAddr).port;
  const writes: unknown[] = [];

  try {
    await assertRejects(
      () => model.methods.sync.execute({}, {
        globalArgs: {
          username: "mgreten",
          swampClubUrl: `http://127.0.0.1:${port}`,
        },
        logger: { info: () => {}, warning: () => {} },
        writeResource: async (_specName, _instanceName, data) => {
          writes.push(data);
          return { name: "unexpected" };
        },
      }),
      Error,
      "must contain a today board",
    );
    assertEquals(writes, []);
  } finally {
    server.shutdown();
  }
});

// Profile layout and leaderboard row shape served by swamp-club.com since
// September 2026: a "Tier" section with Rank / Score / Next, and a nested
// `tier` object on each leaderboard row instead of flat tierName/tierScore.
const CURRENT_TIER_HTML = `
<section aria-label="Tier"><div class="flex items-stretch gap-4"><div class="flex flex-col items-center"><div class="font-orbitron font-black text-5xl leading-none text-orange-400" aria-label="Tier 12 of 20">12</div><div class="font-mono text-hud-micro text-hud-muted mt-1.5 uppercase tracking-[0.18em]">of 20</div></div><div class="grid grid-cols-2 gap-x-4 gap-y-3 flex-1 min-w-0 self-center"><div class="col-span-2"><div class="font-mono text-hud-micro text-hud-muted uppercase tracking-[0.22em] mb-1">Rank</div><div class="font-mono text-base font-semibold uppercase tracking-[0.08em] text-orange-400">Bog Keeper</div></div><div><div class="font-mono text-hud-micro text-hud-muted uppercase tracking-[0.22em] mb-1">Score</div><div class="font-mono text-base text-white font-semibold tabular-nums">12,053,268</div></div><div><div class="font-mono text-hud-micro text-hud-muted uppercase tracking-[0.22em] mb-1">Next</div><div class="font-mono text-base text-[color:var(--profile-accent)] tabular-nums">25,000,000</div></div></div></div></section>
<section aria-label="Extensions"></section>`;

Deno.test("sync parses the current tier section and nested leaderboard tier", async () => {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0 },
    (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === "/u/sntxrr") return new Response(CURRENT_TIER_HTML);
      if (url.pathname === "/api/v1/leaderboard/locate") {
        return Response.json({
          boards: {
            alltime: {
              rows: [{
                rank: 7,
                username: "sntxrr",
                score: 12053268,
                tier: { tierName: "Bog Keeper", tier: 4, ordinal: 12 },
                isMatch: true,
              }],
            },
            today: {
              rows: [{
                rank: 4,
                username: "sntxrr",
                score: 213953,
                tier: { tierName: "Bog Keeper", tier: 4, ordinal: 12 },
                isMatch: true,
              }],
            },
          },
        });
      }
      return new Response("not found", { status: 404 });
    },
  );
  const port = (server.addr as Deno.NetAddr).port;
  const writes: Array<{ specName: string; data: unknown }> = [];

  try {
    await model.methods.sync.execute({}, {
      globalArgs: {
        username: "sntxrr",
        swampClubUrl: `http://127.0.0.1:${port}`,
      },
      logger: { info: () => {}, warning: () => {} },
      writeResource: (specName, _instanceName, data) => {
        writes.push({ specName, data });
        return Promise.resolve({ name: specName });
      },
    });

    const snapshot = writes[0].data as {
      tierName: string;
      tierScore: number;
      tierOrdinal: number | null;
      tierCount: number | null;
      nextTierScore: number | null;
      leaderboards: Record<
        string,
        { rows: Array<{ tierName: string; tierOrdinal: number | null }> }
      >;
    };
    assertEquals(snapshot.tierName, "Bog Keeper");
    assertEquals(snapshot.tierScore, 12053268);
    assertEquals(snapshot.tierOrdinal, 12);
    assertEquals(snapshot.tierCount, 20);
    assertEquals(snapshot.nextTierScore, 25000000);
    assertEquals(snapshot.leaderboards.alltime.rows[0].tierName, "Bog Keeper");
    assertEquals(snapshot.leaderboards.alltime.rows[0].tierOrdinal, 12);
  } finally {
    server.shutdown();
  }
});

Deno.test("sync takes the tier from the leaderboard when the page has none", async () => {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0 },
    (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === "/u/sntxrr") return new Response("<html></html>");
      if (url.pathname === "/api/v1/leaderboard/locate") {
        return Response.json({
          boards: {
            alltime: {
              rows: [{
                rank: 7,
                username: "sntxrr",
                score: 12053268,
                tier: { tierName: "Bog Keeper", ordinal: 12 },
              }],
            },
            today: { rows: [] },
          },
        });
      }
      return new Response("not found", { status: 404 });
    },
  );
  const port = (server.addr as Deno.NetAddr).port;
  const writes: Array<{ specName: string; data: unknown }> = [];

  try {
    await model.methods.sync.execute({}, {
      globalArgs: {
        username: "sntxrr",
        swampClubUrl: `http://127.0.0.1:${port}`,
      },
      logger: { info: () => {}, warning: () => {} },
      writeResource: (specName, _instanceName, data) => {
        writes.push({ specName, data });
        return Promise.resolve({ name: specName });
      },
    });

    const snapshot = writes[0].data as {
      tierName: string;
      tierOrdinal: number | null;
      nextTierScore: number | null;
    };
    assertEquals(snapshot.tierName, "Bog Keeper");
    assertEquals(snapshot.tierOrdinal, 12);
    assertEquals(snapshot.nextTierScore, null);
  } finally {
    server.shutdown();
  }
});
