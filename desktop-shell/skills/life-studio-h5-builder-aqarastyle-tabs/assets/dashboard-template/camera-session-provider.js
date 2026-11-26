(function installCameraSessionProvider(global) {
  'use strict';

  const EVENT = 'onCameraWebRTCSignal';
  function payload(value) {
    if (value && value.data !== null && value.data !== undefined) return value.data;
    return value === null || value === undefined ? {} : value;
  }
  function validSessionId(value) { if (value == null || String(value).trim() === '') return false; const number = Number(value); return Number.isInteger(number) && number >= 0 && number <= 0xffff; }
  function normalizedLocalCandidate(value) {
    const item = value && value.toJSON ? value.toJSON() : value || {};
    const candidate = String(item.candidate || ''); const sdpMid = item.sdpMid == null ? '' : String(item.sdpMid); const sdpMLineIndex = Number(item.sdpMLineIndex);
    if (!candidate || candidate.length > 8192 || sdpMid.length > 128 || !Number.isInteger(sdpMLineIndex) || sdpMLineIndex < 0 || sdpMLineIndex > 0xffff) throw new Error('Invalid local ICE candidate');
    return { candidate, sdpMid, sdpMLineIndex };
  }

  function create(deviceId) {
    const iceWatchers = new Map(); const endWatchers = new Map(); const iceBuffer = new Map(); const endBuffer = new Map();
    const disposeEvent = global.LifeBridge.onNativeEvent(EVENT, (raw) => {
      const event = payload(raw); if (String(event.deviceId || '') !== String(deviceId)) return;
      const sessionId = String(event.sessionId === null || event.sessionId === undefined ? '' : event.sessionId); if (!validSessionId(sessionId)) return;
      if (event.type === 'ice' && event.candidate) {
        const candidate = { candidate: String(event.candidate), sdpMid: event.sdpMid == null ? undefined : String(event.sdpMid), sdpMLineIndex: event.sdpMLineIndex == null ? undefined : Number(event.sdpMLineIndex) };
        const watchers = iceWatchers.get(sessionId); if (watchers && watchers.size) watchers.forEach((watcher) => watcher(candidate)); else iceBuffer.set(sessionId, [...(iceBuffer.get(sessionId) || []), candidate]);
      }
      if (event.type === 'end') { const reason = event.reason == null ? undefined : String(event.reason); const watchers = endWatchers.get(sessionId); if (watchers && watchers.size) watchers.forEach((watcher) => watcher(reason)); else endBuffer.set(sessionId, reason); }
    });

    return {
      capabilities: Object.freeze({ playback: false, resolutionSelection: false, playbackMetadata: false }),
      async prepare() { const response = await global.LifeBridge.invoke('cameraWebRTCPrepareLive', { deviceId }, { timeoutMs: 65000 }); return payload(response); },
      async createSession(request, ticket) {
        const response = await global.LifeBridge.invoke('cameraWebRTCCreateSession', {
          deviceId, ticket, requestId: request.requestId, offerSdp: request.offerSdp,
          iceServers: request.iceServers || [], iceTransportPolicy: request.iceTransportPolicy || 'all', mode: 'live',
        }, { timeoutMs: 35000 });
        const result = payload(response); if (!result.answerSdp || !validSessionId(result.sessionId)) throw new Error('Camera Answer is missing a valid SDP or sessionId');
        return { answerSdp: String(result.answerSdp), sessionId: String(result.sessionId) };
      },
      supportsLocalIce() { const bridge = global.LifeBridge; return Boolean(bridge && bridge.supports('cameraWebRTCAddIceCandidate') === true); },
      async addLocalIceCandidate(sessionId, candidate) {
        if (!validSessionId(sessionId) || !this.supportsLocalIce()) throw new Error('Native local ICE transport is unavailable');
        const response = await global.LifeBridge.invoke('cameraWebRTCAddIceCandidate', { deviceId, sessionId: Number(sessionId), candidate: normalizedLocalCandidate(candidate) }, { timeoutMs: 10000 });
        return payload(response);
      },
      async closeSession(sessionId) { await global.LifeBridge.invoke('cameraWebRTCCloseSession', { deviceId, ...(validSessionId(sessionId) ? { sessionId: Number(sessionId) } : {}) }, { timeoutMs: 10000 }); },
      watchRemoteIceCandidates(sessionId, watcher) { const key = String(sessionId); const set = iceWatchers.get(key) || new Set(); set.add(watcher); iceWatchers.set(key, set); (iceBuffer.get(key) || []).forEach(watcher); iceBuffer.delete(key); return () => { set.delete(watcher); if (!set.size) iceWatchers.delete(key); }; },
      watchSessionEnd(sessionId, watcher) { const key = String(sessionId); const set = endWatchers.get(key) || new Set(); set.add(watcher); endWatchers.set(key, set); if (endBuffer.has(key)) { const reason = endBuffer.get(key); endBuffer.delete(key); queueMicrotask(() => watcher(reason)); } return () => { set.delete(watcher); if (!set.size) endWatchers.delete(key); }; },
      dispose() { disposeEvent(); iceWatchers.clear(); endWatchers.clear(); iceBuffer.clear(); endBuffer.clear(); },
    };
  }

  global.CameraSessionProvider = Object.freeze({ create, isAvailable: () => { const bridge = global.LifeBridge; return Boolean(bridge && ['cameraWebRTCPrepareLive', 'cameraWebRTCCreateSession', 'cameraWebRTCCloseSession'].every((name) => bridge.supports(name))); } });
})(window);
