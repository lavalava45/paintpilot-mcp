/** Host Stop is owned by COS, not by the Photoshop document lifecycle. */
export type HostStopObservation = {
  source: 'cos-host-stop';
  state: 'stopped' | 'running';
  authoritative: true;
};

export type HostStopDecision = {
  state: 'stopped' | 'running' | 'unknown';
  may_mutate: boolean;
  reason: string;
};

/** An absent/untrusted observation must never imply that host Stop is cleared. */
export function assessHostStop(observation: unknown): HostStopDecision {
  if (!observation || typeof observation !== 'object') {
    return { state: 'unknown', may_mutate: false, reason: 'cos_host_stop_unverified' };
  }
  const value = observation as Partial<HostStopObservation>;
  if (value.source !== 'cos-host-stop' || value.authoritative !== true
    || (value.state !== 'running' && value.state !== 'stopped')) {
    return { state: 'unknown', may_mutate: false, reason: 'cos_host_stop_unverified' };
  }
  return value.state === 'stopped'
    ? { state: 'stopped', may_mutate: false, reason: 'cos_host_stop_active' }
    : { state: 'running', may_mutate: true, reason: 'cos_host_stop_cleared' };
}
