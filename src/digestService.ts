import type { Config } from "./types";
import { getBurnStatsForPeriod, getTopInitiatorsForPeriod, getDigestTimestamp, setDigestTimestamp } from "./database";
import { formatDigestMessage } from "./formatter";
import { sendBurnAlert } from "./telegramService";

let digestInterval: NodeJS.Timeout | null = null;

const SECONDS_IN_DAY = 86400;
const SECONDS_IN_WEEK = 604800;
const CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds

export function startDigestScheduler(
  config: Config,
  getPrice: () => Promise<number | null>
): void {
  if (!config.digestEnabled) {
    console.log("[Digest] Digest disabled (set DIGEST_ENABLED=true to enable)");
    return;
  }

  console.log(`[Digest] Scheduler started (daily at ${config.digestDailyHour}:00 UTC, weekly on day ${config.digestWeeklyDay})`);

  digestInterval = setInterval(async () => {
    try {
      await checkAndSendDigests(config, getPrice);
    } catch (error) {
      console.error("[Digest] Error checking digests:", error);
    }
  }, CHECK_INTERVAL_MS);
}

export function stopDigestScheduler(): void {
  if (digestInterval) {
    clearInterval(digestInterval);
    digestInterval = null;
    console.log("[Digest] Scheduler stopped");
  }
}

async function checkAndSendDigests(
  config: Config,
  getPrice: () => Promise<number | null>
): Promise<void> {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const utcDay = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ...

  // Only check during the target hour's first minute window
  // (the 60s interval ensures we hit this once per hour)
  if (utcMinute > 1) return;

  // Daily digest
  if (utcHour === config.digestDailyHour) {
    await maybeSendDigest("daily", SECONDS_IN_DAY, config, getPrice);
  }

  // Weekly digest (same hour, specific day)
  if (utcHour === config.digestDailyHour && utcDay === config.digestWeeklyDay) {
    await maybeSendDigest("weekly", SECONDS_IN_WEEK, config, getPrice);
  }
}

async function maybeSendDigest(
  period: "daily" | "weekly",
  lookbackSeconds: number,
  config: Config,
  getPrice: () => Promise<number | null>
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Check if we already sent this digest recently
  const lastSent = await getDigestTimestamp(period);
  const minGap = period === "daily" ? SECONDS_IN_DAY - 3600 : SECONDS_IN_WEEK - 3600; // Allow 1h tolerance
  if (lastSent && (nowSeconds - lastSent) < minGap) {
    return; // Already sent recently
  }

  console.log(`[Digest] Sending ${period} digest...`);

  const sinceTimestamp = nowSeconds - lookbackSeconds;
  const [stats, topSearchers, price] = await Promise.all([
    getBurnStatsForPeriod(sinceTimestamp),
    getTopInitiatorsForPeriod(sinceTimestamp, 1),
    getPrice(),
  ]);

  const topSearcher = topSearchers[0] || null;
  const message = formatDigestMessage(period, stats, topSearcher, price, config);

  await sendBurnAlert(config.telegramChannelId, message);
  await setDigestTimestamp(period, nowSeconds);

  console.log(`[Digest] ${period} digest sent (${stats.burnCount} burns, ${stats.totalBurned} UNI)`);
}
