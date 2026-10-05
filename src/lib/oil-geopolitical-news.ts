// Compatibility alias: the OIL engine now lives in the config-driven multi-asset catalyst module.
export {
  getCatalystNews,
  isCatalystAsset,
  CATALYST_ASSETS,
  type CatalystAsset,
  type CatalystEvent as OilGeoEvent,
  type CatalystForce,
  type CatalystVerdict as OilGeoVerdict,
  type CatalystResult as OilGeoResult,
  type Sentiment,
  type Impact,
} from "./catalyst-news";

import { getCatalystNews as _get, type CatalystResult } from "./catalyst-news";

export type OilCatalystCategory = string;

export function getOilGeopoliticalNews(): Promise<CatalystResult> {
  return _get("OIL");
}
