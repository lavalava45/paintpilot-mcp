import { isUxpBridgeReachable } from './uxp-bridge-client.js';

export type ParsedPhotoshopVersion = {
  major: number;
  minor: number;
  year?: number;
  raw: string;
};

export type PhotoshopCapabilities = {
  version: string;
  features: {
    select_subject_v2: boolean;
    sky_replacement_native: boolean;
    neural_filters: boolean;
    uxp_bridge_reachable: boolean;
    execute_as_modal_timeout: boolean;
    uxp_plugin_api: boolean;
  };
};

function parsedPair(raw: string): Pick<ParsedPhotoshopVersion, 'major' | 'minor'> | null {
  const match = /(\d+)(?:\.(\d*))?/.exec(raw);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1]!, 10),
    minor: match[2] ? Number.parseInt(match[2], 10) : 0,
  };
}

export function parsePhotoshopVersion(raw: string): ParsedPhotoshopVersion {
  const pair = parsedPair(raw);
  if (pair) return { ...pair, raw };
  const yearMatch = /20(\d{2})/.exec(raw);
  if (!yearMatch) return { major: 0, minor: 0, raw };
  const year = Number.parseInt(`20${yearMatch[1]}`, 10);
  return { major: year - 1990, minor: 0, year, raw };
}

function calendarYear(version: ParsedPhotoshopVersion): number | undefined {
  if (version.year !== undefined) return version.year;
  return version.major >= 13 ? version.major + 1990 : undefined;
}

function meets(version: ParsedPhotoshopVersion, major: number, year: number): boolean {
  const inferred = calendarYear(version);
  return version.major >= major || (inferred !== undefined && inferred >= year);
}

export function getPhotoshopCapabilities(version: string): PhotoshopCapabilities {
  const parsed = parsePhotoshopVersion(version);
  const features: PhotoshopCapabilities['features'] = {
    select_subject_v2: meets(parsed, 23, 2020),
    sky_replacement_native: meets(parsed, 22, 2021),
    neural_filters: false,
    uxp_bridge_reachable: false,
    execute_as_modal_timeout: meets(parsed, 23, 2022),
    uxp_plugin_api: parsed.major > 23 || (parsed.major === 23 && parsed.minor >= 5),
  };
  return { version, features };
}

export async function resolvePhotoshopCapabilities(version: string): Promise<PhotoshopCapabilities> {
  const base = getPhotoshopCapabilities(version);
  const bridgeReady = await isUxpBridgeReachable();
  return {
    version: base.version,
    features: {
      ...base.features,
      uxp_bridge_reachable: bridgeReady,
      neural_filters: bridgeReady && base.features.uxp_plugin_api,
    },
  };
}
