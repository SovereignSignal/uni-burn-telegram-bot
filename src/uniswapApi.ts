const UNI_ADDRESS = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const QUOTE_URL = "https://trade-api.gateway.uniswap.org/v1/quote";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const QUOTE_AMOUNT = "1000000000000000000000"; // 1000 UNI (18 decimals)

let apiKey = "";
let cachedPrice: number | null = null;
let cacheTimestamp = 0;

export function initUniswapApi(key: string): void {
  apiKey = key;
  if (key) {
    console.log("[UniswapAPI] Initialized with API key");
  } else {
    console.log("[UniswapAPI] No API key provided, USD prices disabled");
  }
}

export async function getUniPriceUsd(): Promise<number | null> {
  if (!apiKey) return null;

  // Return cached price if still valid
  if (cachedPrice !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedPrice;
  }

  try {
    const response = await fetch(QUOTE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        type: "EXACT_INPUT",
        tokenInChainId: 1,
        tokenOutChainId: 1,
        tokenIn: UNI_ADDRESS,
        tokenOut: USDC_ADDRESS,
        amount: QUOTE_AMOUNT,
        swapper: "0x0000000000000000000000000000000000000000",
        urgency: "low",
      }),
    });

    if (!response.ok) {
      console.error(`[UniswapAPI] Quote request failed: ${response.status} ${response.statusText}`);
      return cachedPrice; // Return stale cache on error
    }

    const data = await response.json();
    const usdcOutput = data?.quote?.output?.amount;

    if (!usdcOutput) {
      console.error("[UniswapAPI] Unexpected response structure:", JSON.stringify(data).slice(0, 200));
      return cachedPrice;
    }

    // USDC has 6 decimals, we quoted 1000 UNI
    const price = parseInt(usdcOutput, 10) / 1e6 / 1000;
    cachedPrice = price;
    cacheTimestamp = Date.now();

    console.log(`[UniswapAPI] UNI price: $${price.toFixed(4)}`);
    return price;
  } catch (error) {
    console.error("[UniswapAPI] Failed to fetch price:", error);
    return cachedPrice; // Return stale cache on error
  }
}
