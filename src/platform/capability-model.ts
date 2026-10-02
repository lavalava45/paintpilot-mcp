import { isUxpBridgeReachable } from './uxp-bridge-client.js';

export type ParsedPhotoshopVersion = Readonly<{
  raw: string;
  major: number;
  minor: number;
  year?: number;
}>;

type PhotoshopFeatureFlags = Readonly<{
  select_subject_v2: boolean;
  sky_replacement_native: boolean;
  neural_filters: boolean;
  uxp_bridge_reachable: boolean;
  execute_as_modal_timeout: boolean;
  uxp_plugin_api: boolean;
}>;

export type PhotoshopCapabilities = Readonly<{
  version: string;
  features: PhotoshopFeatureFlags;
}>;

type VersionFloor = Readonly<{ major: number; year: number }>;

const FLOOR = {
  selectSubject: { major: 23, year: 2020 },
  skyReplacement: { major: 22, year: 2021 },
  modalTimeout: { major: 23, year: 2022 },
} satisfies Record<string, VersionFloor>;

function firstNumericPair(raw: string): [number, number] | undefined {
  const match = /(\d+)(?:\.(\d*))?/.exec(raw);
  if (match === null) return undefined;
  return [
    Number.parseInt(match[1]!, 10),
    match[2] ? Number.parseInt(match[2], 10) : 0,
  ];
}

export function parsePhotoshopVersion(raw: string): ParsedPhotoshopVersion {
  const pair = firstNumericPair(raw);
  if (pair !== undefined) {
    return { major: pair[0], minor: pair[1], raw };
  }

  const yearDigits = /20(\d{2})/.exec(raw)?.[1];
  if (yearDigits === undefined) return { major: 0, minor: 0, raw };
  const year = Number.parseInt(`20${yearDigits}`, 10);
  return { major: year - 1990, minor: 0, year, raw };
}

function calendarYear(version: ParsedPhotoshopVersion): number | undefined {
  return version.year ?? (version.major >= 13 ? version.major + 1990 : undefined);
}

function supports(version: ParsedPhotoshopVersion, floor: VersionFloor): boolean {
  const year = calendarYear(version);
  return version.major >= floor.major || (year !== undefined && year >= floor.year);
}

function offlineFeatures(version: ParsedPhotoshopVersion): PhotoshopCapabilities['features'] {
  return {
    select_subject_v2: supports(version, FLOOR.selectSubject),
    sky_replacement_native: supports(version, FLOOR.skyReplacement),
    neural_filters: false,
    uxp_bridge_reachable: false,
    execute_as_modal_timeout: supports(version, FLOOR.modalTimeout),
    uxp_plugin_api: version.major > 23 || (version.major === 23 && version.minor >= 5),
  };
}

export function getPhotoshopCapabilities(version: string): PhotoshopCapabilities {
  const parsed = parsePhotoshopVersion(version);
  return { version, features: offlineFeatures(parsed) };
}

export async function resolvePhotoshopCapabilities(version: string): Promise<PhotoshopCapabilities> {
  const snapshot = getPhotoshopCapabilities(version);
  const reachable = await isUxpBridgeReachable();
  return {
    version: snapshot.version,
    features: {
      ...snapshot.features,
      uxp_bridge_reachable: reachable,
      neural_filters: reachable && snapshot.features.uxp_plugin_api,
    },
  };
}
