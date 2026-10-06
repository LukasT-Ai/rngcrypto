// Trimmed fixtures captured from the live Kalshi API on 2026-10-06 (api.elections.kalshi.com/trade-api/v2).
// Do not hand-edit values; regenerate from live responses if the API shape changes.
import type { KalshiRawEvent, KalshiRawMarket } from "../kalshi";

export const FED_DECISION_EVENTS: KalshiRawEvent[] = [
  {
    "event_ticker": "KXFEDDECISION-26OCT",
    "series_ticker": "KXFEDDECISION",
    "title": "Fed decision in Oct 2026?",
    "strike_date": "2026-10-28T18:00:00Z",
    "mutually_exclusive": true,
    "markets": [
      {
        "ticker": "KXFEDDECISION-26OCT-C26",
        "event_ticker": "KXFEDDECISION-26OCT",
        "title": "Will the Federal Reserve Cut rates by >25bps at their October 2026 meeting?",
        "yes_sub_title": "Cut >25bps",
        "status": "active",
        "close_time": "2026-10-28T17:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Cut": ">25"
        },
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0100",
        "last_price_dollars": "0.0100",
        "volume_fp": "226596.51",
        "open_interest_fp": "213143.06"
      },
      {
        "ticker": "KXFEDDECISION-26OCT-C25",
        "event_ticker": "KXFEDDECISION-26OCT",
        "title": "Will the Federal Reserve Cut rates by 25bps at their October 2026 meeting?",
        "yes_sub_title": "Cut 25bps",
        "status": "active",
        "close_time": "2026-10-28T17:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Cut": "25"
        },
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0100",
        "last_price_dollars": "0.0100",
        "volume_fp": "915171.50",
        "open_interest_fp": "796331.24"
      },
      {
        "ticker": "KXFEDDECISION-26OCT-H0",
        "event_ticker": "KXFEDDECISION-26OCT",
        "title": "Will the Federal Reserve Hike rates by 0bps at their October 2026 meeting?",
        "yes_sub_title": "Fed maintains rate",
        "status": "active",
        "close_time": "2026-10-28T17:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Hike": "0"
        },
        "yes_bid_dollars": "0.8200",
        "yes_ask_dollars": "0.8300",
        "last_price_dollars": "0.8300",
        "volume_fp": "3500043.08",
        "open_interest_fp": "1356272.39"
      },
      {
        "ticker": "KXFEDDECISION-26OCT-H25",
        "event_ticker": "KXFEDDECISION-26OCT",
        "title": "Will the Federal Reserve Hike rates by 25bps at their October 2026 meeting?",
        "yes_sub_title": "Hike 25bps",
        "status": "active",
        "close_time": "2026-10-28T17:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Hike": "25"
        },
        "yes_bid_dollars": "0.1700",
        "yes_ask_dollars": "0.1800",
        "last_price_dollars": "0.1800",
        "volume_fp": "2539910.53",
        "open_interest_fp": "1057091.81"
      },
      {
        "ticker": "KXFEDDECISION-26OCT-H26",
        "event_ticker": "KXFEDDECISION-26OCT",
        "title": "Will the Federal Reserve Hike rates by >25bps at their October 2026 meeting?",
        "yes_sub_title": "Hike >25bps",
        "status": "active",
        "close_time": "2026-10-28T17:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Hike": ">25"
        },
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0100",
        "last_price_dollars": "0.0100",
        "volume_fp": "897204.21",
        "open_interest_fp": "840559.72"
      }
    ]
  },
  {
    "event_ticker": "KXFEDDECISION-26DEC",
    "series_ticker": "KXFEDDECISION",
    "title": "Fed decision in Dec 2026?",
    "strike_date": "2026-12-09T19:00:00Z",
    "mutually_exclusive": true,
    "markets": [
      {
        "ticker": "KXFEDDECISION-26DEC-C26",
        "event_ticker": "KXFEDDECISION-26DEC",
        "title": "Will the Federal Reserve Cut rates by >25bps at their December 2026 meeting?",
        "yes_sub_title": "Cut >25bps",
        "status": "active",
        "close_time": "2026-12-09T18:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Cut": ">25"
        },
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0100",
        "last_price_dollars": "0.0100",
        "volume_fp": "80559.20",
        "open_interest_fp": "72220.90"
      },
      {
        "ticker": "KXFEDDECISION-26DEC-C25",
        "event_ticker": "KXFEDDECISION-26DEC",
        "title": "Will the Federal Reserve Cut rates by 25bps at their December 2026 meeting?",
        "yes_sub_title": "Cut 25bps",
        "status": "active",
        "close_time": "2026-12-09T18:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Cut": "25"
        },
        "yes_bid_dollars": "0.0100",
        "yes_ask_dollars": "0.0200",
        "last_price_dollars": "0.0200",
        "volume_fp": "158527.66",
        "open_interest_fp": "133798.95"
      },
      {
        "ticker": "KXFEDDECISION-26DEC-H0",
        "event_ticker": "KXFEDDECISION-26DEC",
        "title": "Will the Federal Reserve Hike rates by 0bps at their December 2026 meeting?",
        "yes_sub_title": "Fed maintains rate",
        "status": "active",
        "close_time": "2026-12-09T18:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Hike": "0"
        },
        "yes_bid_dollars": "0.2600",
        "yes_ask_dollars": "0.2700",
        "last_price_dollars": "0.2700",
        "volume_fp": "219503.08",
        "open_interest_fp": "158832.61"
      },
      {
        "ticker": "KXFEDDECISION-26DEC-H25",
        "event_ticker": "KXFEDDECISION-26DEC",
        "title": "Will the Federal Reserve Hike rates by 25bps at their December 2026 meeting?",
        "yes_sub_title": "Hike 25bps",
        "status": "active",
        "close_time": "2026-12-09T18:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Hike": "25"
        },
        "yes_bid_dollars": "0.7000",
        "yes_ask_dollars": "0.7200",
        "last_price_dollars": "0.7300",
        "volume_fp": "196922.83",
        "open_interest_fp": "116932.89"
      },
      {
        "ticker": "KXFEDDECISION-26DEC-H26",
        "event_ticker": "KXFEDDECISION-26DEC",
        "title": "Will the Federal Reserve Hike rates by >25bps at their December 2026 meeting?",
        "yes_sub_title": "Hike >25bps",
        "status": "active",
        "close_time": "2026-12-09T18:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Hike": ">25"
        },
        "yes_bid_dollars": "0.0200",
        "yes_ask_dollars": "0.0300",
        "last_price_dollars": "0.0200",
        "volume_fp": "187879.07",
        "open_interest_fp": "131714.15"
      }
    ]
  },
  {
    "event_ticker": "KXFEDDECISION-27JAN",
    "series_ticker": "KXFEDDECISION",
    "title": "Fed decision in Jan 2027?",
    "strike_date": "2027-01-27T19:00:00Z",
    "mutually_exclusive": true,
    "markets": [
      {
        "ticker": "KXFEDDECISION-27JAN-C26",
        "event_ticker": "KXFEDDECISION-27JAN",
        "title": "Will the Federal Reserve Cut rates by >25bps at their January 2027 meeting?",
        "yes_sub_title": "Cut >25bps",
        "status": "active",
        "close_time": "2027-01-27T18:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Cut": ">25"
        },
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0100",
        "last_price_dollars": "0.0100",
        "volume_fp": "16095.81",
        "open_interest_fp": "13567.28"
      },
      {
        "ticker": "KXFEDDECISION-27JAN-C25",
        "event_ticker": "KXFEDDECISION-27JAN",
        "title": "Will the Federal Reserve Cut rates by 25bps at their January 2027 meeting?",
        "yes_sub_title": "Cut 25bps",
        "status": "active",
        "close_time": "2027-01-27T18:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Cut": "25"
        },
        "yes_bid_dollars": "0.0200",
        "yes_ask_dollars": "0.0600",
        "last_price_dollars": "0.0300",
        "volume_fp": "27974.91",
        "open_interest_fp": "23017.52"
      },
      {
        "ticker": "KXFEDDECISION-27JAN-H0",
        "event_ticker": "KXFEDDECISION-27JAN",
        "title": "Will the Federal Reserve Hike rates by 0bps at their January 2027 meeting?",
        "yes_sub_title": "Fed maintains rate",
        "status": "active",
        "close_time": "2027-01-27T18:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Hike": "0"
        },
        "yes_bid_dollars": "0.6000",
        "yes_ask_dollars": "0.6400",
        "last_price_dollars": "0.6000",
        "volume_fp": "46044.81",
        "open_interest_fp": "25340.70"
      },
      {
        "ticker": "KXFEDDECISION-27JAN-H25",
        "event_ticker": "KXFEDDECISION-27JAN",
        "title": "Will the Federal Reserve Hike rates by 25bps at their January 2027 meeting?",
        "yes_sub_title": "Hike 25bps",
        "status": "active",
        "close_time": "2027-01-27T18:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Hike": "25"
        },
        "yes_bid_dollars": "0.2700",
        "yes_ask_dollars": "0.3700",
        "last_price_dollars": "0.3700",
        "volume_fp": "55726.23",
        "open_interest_fp": "43791.10"
      },
      {
        "ticker": "KXFEDDECISION-27JAN-H26",
        "event_ticker": "KXFEDDECISION-27JAN",
        "title": "Will the Federal Reserve Hike rates by >25bps at their January 2027 meeting?",
        "yes_sub_title": "Hike >25bps",
        "status": "active",
        "close_time": "2027-01-27T18:59:00Z",
        "strike_type": "custom",
        "custom_strike": {
          "Hike": ">25"
        },
        "yes_bid_dollars": "0.0100",
        "yes_ask_dollars": "0.0200",
        "last_price_dollars": "0.0100",
        "volume_fp": "7017.22",
        "open_interest_fp": "6166.03"
      }
    ]
  }
];

export const BTCD_EVENTS: KalshiRawEvent[] = [
  {
    "event_ticker": "KXBTCD-26OCT0616",
    "series_ticker": "KXBTCD",
    "title": "BTC price on Oct 6, 2026 at 4pm EDT?",
    "strike_date": "2026-10-06T20:00:00Z",
    "markets": [
      {
        "ticker": "KXBTCD-26OCT0616-T84899.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$84,900 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 84899.99,
        "yes_bid_dollars": "0.9900",
        "yes_ask_dollars": "1.0000",
        "last_price_dollars": "0.9900",
        "volume_fp": "2123.24",
        "open_interest_fp": "1931.24"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T84999.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$85,000 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 84999.99,
        "yes_bid_dollars": "0.9900",
        "yes_ask_dollars": "1.0000",
        "last_price_dollars": "0.9900",
        "volume_fp": "10677.68",
        "open_interest_fp": "9002.11"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T85099.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$85,100 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 85099.99,
        "yes_bid_dollars": "0.9800",
        "yes_ask_dollars": "0.9900",
        "last_price_dollars": "0.9900",
        "volume_fp": "23434.90",
        "open_interest_fp": "16204.31"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T85199.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$85,200 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 85199.99,
        "yes_bid_dollars": "0.9800",
        "yes_ask_dollars": "0.9900",
        "last_price_dollars": "0.9800",
        "volume_fp": "32878.64",
        "open_interest_fp": "21337.41"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T85299.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$85,300 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 85299.99,
        "yes_bid_dollars": "0.9600",
        "yes_ask_dollars": "0.9700",
        "last_price_dollars": "0.9600",
        "volume_fp": "92581.53",
        "open_interest_fp": "35347.71"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T85399.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$85,400 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 85399.99,
        "yes_bid_dollars": "0.9100",
        "yes_ask_dollars": "0.9200",
        "last_price_dollars": "0.9100",
        "volume_fp": "92669.80",
        "open_interest_fp": "44145.83"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T85499.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$85,500 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 85499.99,
        "yes_bid_dollars": "0.7000",
        "yes_ask_dollars": "0.7100",
        "last_price_dollars": "0.7500",
        "volume_fp": "116727.89",
        "open_interest_fp": "39535.04"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T85599.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$85,600 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 85599.99,
        "yes_bid_dollars": "0.3900",
        "yes_ask_dollars": "0.4000",
        "last_price_dollars": "0.4000",
        "volume_fp": "86121.84",
        "open_interest_fp": "36035.64"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T85699.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$85,700 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 85699.99,
        "yes_bid_dollars": "0.1500",
        "yes_ask_dollars": "0.1600",
        "last_price_dollars": "0.1500",
        "volume_fp": "49055.13",
        "open_interest_fp": "28323.65"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T85799.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$85,800 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 85799.99,
        "yes_bid_dollars": "0.0500",
        "yes_ask_dollars": "0.0600",
        "last_price_dollars": "0.0600",
        "volume_fp": "32788.35",
        "open_interest_fp": "17235.92"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T85899.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$85,900 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 85899.99,
        "yes_bid_dollars": "0.0200",
        "yes_ask_dollars": "0.0300",
        "last_price_dollars": "0.0200",
        "volume_fp": "13776.22",
        "open_interest_fp": "11800.90"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T85999.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$86,000 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 85999.99,
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0200",
        "last_price_dollars": "0.0200",
        "volume_fp": "6483.27",
        "open_interest_fp": "4936.23"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T86099.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$86,100 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 86099.99,
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0100",
        "last_price_dollars": "0.0100",
        "volume_fp": "2178.62",
        "open_interest_fp": "1882.62"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T86199.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$86,200 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 86199.99,
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0100",
        "last_price_dollars": "0.0100",
        "volume_fp": "1665.55",
        "open_interest_fp": "1648.60"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T86299.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$86,300 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 86299.99,
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0100",
        "last_price_dollars": "0.0100",
        "volume_fp": "1.00",
        "open_interest_fp": "1.00"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T86399.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$86,400 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 86399.99,
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0100",
        "last_price_dollars": "0.0100",
        "volume_fp": "1.00",
        "open_interest_fp": "1.00"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T86499.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$86,500 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 86499.99,
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0100",
        "last_price_dollars": "0.0100",
        "volume_fp": "1.00",
        "open_interest_fp": "1.00"
      },
      {
        "ticker": "KXBTCD-26OCT0616-T86599.99",
        "event_ticker": "KXBTCD-26OCT0616",
        "title": "Bitcoin price on Oct 6, 2026?",
        "yes_sub_title": "$86,600 or above",
        "status": "active",
        "close_time": "2026-10-06T20:00:00Z",
        "strike_type": "greater",
        "floor_strike": 86599.99,
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0100",
        "last_price_dollars": "0.0100",
        "volume_fp": "93.51",
        "open_interest_fp": "93.51"
      }
    ]
  }
];

export const BTCMAXMON_EVENTS: KalshiRawEvent[] = [
  {
    "event_ticker": "KXBTCMAXMON-BTC-26OCT31",
    "series_ticker": "KXBTCMAXMON",
    "title": "How high will BTC get in October?",
    "markets": [
      {
        "ticker": "KXBTCMAXMON-BTC-26OCT31-8500000",
        "event_ticker": "KXBTCMAXMON-BTC-26OCT31",
        "title": "Will BTC trimmed mean be above $85000.00 by 11:59 PM ET on Oct 31, 2026?",
        "yes_sub_title": "Above $85,000.00",
        "status": "finalized",
        "close_time": "2026-10-01T18:51:08Z",
        "strike_type": "greater",
        "floor_strike": 85000,
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "1.0000",
        "last_price_dollars": "0.9900",
        "volume_fp": "6984.60",
        "open_interest_fp": "5262.60"
      },
      {
        "ticker": "KXBTCMAXMON-BTC-26OCT31-8750000",
        "event_ticker": "KXBTCMAXMON-BTC-26OCT31",
        "title": "Will BTC trimmed mean be above $87500.00 by 11:59 PM ET on Oct 31, 2026?",
        "yes_sub_title": "Above $87,500.00",
        "status": "active",
        "close_time": "2026-11-01T03:59:59Z",
        "strike_type": "greater",
        "floor_strike": 87500,
        "yes_bid_dollars": "0.7900",
        "yes_ask_dollars": "0.8000",
        "last_price_dollars": "0.7800",
        "volume_fp": "56950.64",
        "open_interest_fp": "32315.32"
      },
      {
        "ticker": "KXBTCMAXMON-BTC-26OCT31-9000000",
        "event_ticker": "KXBTCMAXMON-BTC-26OCT31",
        "title": "Will BTC trimmed mean be above $90000.00 by 11:59 PM ET on Oct 31, 2026?",
        "yes_sub_title": "Above $90,000.00",
        "status": "active",
        "close_time": "2026-11-01T03:59:59Z",
        "strike_type": "greater",
        "floor_strike": 90000,
        "yes_bid_dollars": "0.5600",
        "yes_ask_dollars": "0.5900",
        "last_price_dollars": "0.5900",
        "volume_fp": "39735.97",
        "open_interest_fp": "22764.98"
      },
      {
        "ticker": "KXBTCMAXMON-BTC-26OCT31-9250000",
        "event_ticker": "KXBTCMAXMON-BTC-26OCT31",
        "title": "Will BTC trimmed mean be above $92500.00 by 11:59 PM ET on Oct 31, 2026?",
        "yes_sub_title": "Above $92,500.00",
        "status": "active",
        "close_time": "2026-11-01T03:59:59Z",
        "strike_type": "greater",
        "floor_strike": 92500,
        "yes_bid_dollars": "0.3700",
        "yes_ask_dollars": "0.3800",
        "last_price_dollars": "0.3800",
        "volume_fp": "25206.34",
        "open_interest_fp": "15279.87"
      },
      {
        "ticker": "KXBTCMAXMON-BTC-26OCT31-9500000",
        "event_ticker": "KXBTCMAXMON-BTC-26OCT31",
        "title": "Will BTC trimmed mean be above $95000.00 by 11:59 PM ET on Oct 31, 2026?",
        "yes_sub_title": "Above $95,000.00",
        "status": "active",
        "close_time": "2026-11-01T03:59:59Z",
        "strike_type": "greater",
        "floor_strike": 95000,
        "yes_bid_dollars": "0.2200",
        "yes_ask_dollars": "0.2600",
        "last_price_dollars": "0.2400",
        "volume_fp": "40481.84",
        "open_interest_fp": "26938.51"
      },
      {
        "ticker": "KXBTCMAXMON-BTC-26OCT31-9750000",
        "event_ticker": "KXBTCMAXMON-BTC-26OCT31",
        "title": "Will BTC trimmed mean be above $97500.00 by 11:59 PM ET on Oct 31, 2026?",
        "yes_sub_title": "Above $97,500.00",
        "status": "active",
        "close_time": "2026-11-01T03:59:59Z",
        "strike_type": "greater",
        "floor_strike": 97500,
        "yes_bid_dollars": "0.1300",
        "yes_ask_dollars": "0.1700",
        "last_price_dollars": "0.1300",
        "volume_fp": "25963.93",
        "open_interest_fp": "17275.54"
      },
      {
        "ticker": "KXBTCMAXMON-BTC-26OCT31-10000000",
        "event_ticker": "KXBTCMAXMON-BTC-26OCT31",
        "title": "Will BTC trimmed mean be above $100000.00 by 11:59 PM ET on Oct 31, 2026?",
        "yes_sub_title": "Above $100,000.00",
        "status": "active",
        "close_time": "2026-11-01T03:59:59Z",
        "strike_type": "greater",
        "floor_strike": 100000,
        "yes_bid_dollars": "0.0900",
        "yes_ask_dollars": "0.1100",
        "last_price_dollars": "0.1100",
        "volume_fp": "40154.49",
        "open_interest_fp": "19386.80"
      },
      {
        "ticker": "KXBTCMAXMON-BTC-26OCT31-10250000",
        "event_ticker": "KXBTCMAXMON-BTC-26OCT31",
        "title": "Will BTC trimmed mean be above $102500.00 by 11:59 PM ET on Oct 31, 2026?",
        "yes_sub_title": "Above $102,500.00",
        "status": "active",
        "close_time": "2026-11-01T03:59:59Z",
        "strike_type": "greater",
        "floor_strike": 102500,
        "yes_bid_dollars": "0.0700",
        "yes_ask_dollars": "0.0800",
        "last_price_dollars": "0.0700",
        "volume_fp": "20721.19",
        "open_interest_fp": "17486.02"
      }
    ]
  }
];

export const WTIW_MARKETS: KalshiRawMarket[] = [
  {
    "ticker": "KXWTIW-26OCT0914-T79.00",
    "event_ticker": "KXWTIW-26OCT0914",
    "title": "Will the WTI crude oil settlement price be below 79.00 USD/Bbl on Oct 9, 2026?",
    "yes_sub_title": "Below $79.00",
    "status": "active",
    "close_time": "2026-10-09T18:30:00Z",
    "strike_type": "less",
    "cap_strike": 79,
    "custom_strike": {
      "front_month_contract": "WBS 26X-ICE",
      "strike_date": "2026-10-09T14:30:00-04:00"
    },
    "yes_bid_dollars": "0.0000",
    "yes_ask_dollars": "0.0300",
    "last_price_dollars": "0.0400",
    "volume_fp": "1480.90",
    "open_interest_fp": "1480.90"
  },
  {
    "ticker": "KXWTIW-26OCT0914-T103.99",
    "event_ticker": "KXWTIW-26OCT0914",
    "title": "Will the WTI crude oil settlement price be above 103.99 USD/Bbl on Oct 9, 2026?",
    "yes_sub_title": "Above $103.99",
    "status": "active",
    "close_time": "2026-10-09T18:30:00Z",
    "strike_type": "greater",
    "floor_strike": 103.99,
    "custom_strike": {
      "front_month_contract": "WBS 26X-ICE",
      "strike_date": "2026-10-09T14:30:00-04:00"
    },
    "yes_bid_dollars": "0.0000",
    "yes_ask_dollars": "0.0400",
    "last_price_dollars": "0.0200",
    "volume_fp": "7735.11",
    "open_interest_fp": "7295.11"
  },
  {
    "ticker": "KXWTIW-26OCT0914-B99.50",
    "event_ticker": "KXWTIW-26OCT0914",
    "title": "Will the WTI crude oil settlement price be between 99.00 and 99.99 USD/Bbl on Oct 9, 2026?",
    "yes_sub_title": "$99.00 to $99.99",
    "status": "active",
    "close_time": "2026-10-09T18:30:00Z",
    "strike_type": "between",
    "floor_strike": 99,
    "cap_strike": 99.99,
    "custom_strike": {
      "front_month_contract": "WBS 26X-ICE",
      "strike_date": "2026-10-09T14:30:00-04:00"
    },
    "yes_bid_dollars": "0.0000",
    "yes_ask_dollars": "0.0300",
    "last_price_dollars": "0.0000",
    "volume_fp": "0.00",
    "open_interest_fp": "0.00"
  },
  {
    "ticker": "KXWTIW-26OCT0914-B98.50",
    "event_ticker": "KXWTIW-26OCT0914",
    "title": "Will the WTI crude oil settlement price be between 98.00 and 98.99 USD/Bbl on Oct 9, 2026?",
    "yes_sub_title": "$98.00 to $98.99",
    "status": "active",
    "close_time": "2026-10-09T18:30:00Z",
    "strike_type": "between",
    "floor_strike": 98,
    "cap_strike": 98.99,
    "custom_strike": {
      "front_month_contract": "WBS 26X-ICE",
      "strike_date": "2026-10-09T14:30:00-04:00"
    },
    "yes_bid_dollars": "0.0100",
    "yes_ask_dollars": "0.0400",
    "last_price_dollars": "0.0200",
    "volume_fp": "161.93",
    "open_interest_fp": "161.93"
  },
  {
    "ticker": "KXWTIW-26OCT0914-B97.50",
    "event_ticker": "KXWTIW-26OCT0914",
    "title": "Will the WTI crude oil settlement price be between 97.00 and 97.99 USD/Bbl on Oct 9, 2026?",
    "yes_sub_title": "$97.00 to $97.99",
    "status": "active",
    "close_time": "2026-10-09T18:30:00Z",
    "strike_type": "between",
    "floor_strike": 97,
    "cap_strike": 97.99,
    "custom_strike": {
      "front_month_contract": "WBS 26X-ICE",
      "strike_date": "2026-10-09T14:30:00-04:00"
    },
    "yes_bid_dollars": "0.0100",
    "yes_ask_dollars": "0.0500",
    "last_price_dollars": "0.0300",
    "volume_fp": "252.12",
    "open_interest_fp": "242.56"
  },
  {
    "ticker": "KXWTIW-26OCT0914-B96.50",
    "event_ticker": "KXWTIW-26OCT0914",
    "title": "Will the WTI crude oil settlement price be between 96.00 and 96.99 USD/Bbl on Oct 9, 2026?",
    "yes_sub_title": "$96.00 to $96.99",
    "status": "active",
    "close_time": "2026-10-09T18:30:00Z",
    "strike_type": "between",
    "floor_strike": 96,
    "cap_strike": 96.99,
    "custom_strike": {
      "front_month_contract": "WBS 26X-ICE",
      "strike_date": "2026-10-09T14:30:00-04:00"
    },
    "yes_bid_dollars": "0.0200",
    "yes_ask_dollars": "0.0500",
    "last_price_dollars": "0.0400",
    "volume_fp": "915.64",
    "open_interest_fp": "846.02"
  }
];
