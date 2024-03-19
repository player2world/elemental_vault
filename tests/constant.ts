const daysInMs = 60 * 60 * 24 * 1000;

export const DECIMAL_PLACE = 6;
// export const START_DATE = Date.now() + 120_000; // 300sec == 5min
// export const END_DATE = START_DATE + 120_000; // 300 Seconds duration
export const MIN_AMOUNT = 1_000 * 10 ** DECIMAL_PLACE;
export const VAULT_CAPACITY = 50_000 * 10 ** DECIMAL_PLACE;
// export const WITHDRAW_TIMEFRAME = 120_000;
export const YIELD_BPS = 80 * 100; //80%
export const USER_DEPOSIT_AMOUNT = 1000 * 10 ** DECIMAL_PLACE;

// FOR TESTING
export const START_DATE = Date.now() + 5000;
export const END_DATE = START_DATE + 3000; // 3 Seconds duration
export const WITHDRAW_TIMEFRAME = 0;
export const INITIAL_MINT_AMOUNT = 10_000_000_000;
