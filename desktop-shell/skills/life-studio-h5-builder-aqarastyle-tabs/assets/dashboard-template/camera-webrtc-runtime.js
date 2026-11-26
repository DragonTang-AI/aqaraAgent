(function installCameraWebRTCRuntime(global) {
  'use strict';

  const states = new Map();
  const starts = new Map();
  function requestId() { const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join(''); }
  function emit(state, status, error) { state.status = status; if (typeof state.onStatus === 'function') state.onStatus(status, error); }
  function phase(state, value) { state.phase = value; if (typeof state.onStatus === 'function') state.onStatus('connecting', { phase: value }); }
  function abortable(promise, signal) {
    if (signal.aborted) return Promise.reject(new DOMException('WebRTC connection aborted', 'AbortError'));
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(new DOMException('WebRTC connection aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
      Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
  }
  function isIpCandidate(value) {
    const address = String(value || '').trim().replace(/^a=/, '').split(/\s+/)[4];
    if (!address) return false;
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)) return address !== '0.0.0.0' && address.split('.').every((part) => Number(part) <= 255);
    if (!address.includes(':') || !/^[\da-f:.]+$/i.test(address)) return false;
    try { return new URL(`http://[${address}]/`).hostname !== '[::]'; } catch { return false; }
  }
  function signalingOffer(sdp, completeOffer) {
    const ipOnly = String(sdp || '').replace(/^a=candidate:[^\r\n]*(?:\r?\n|$)/gm, (line) => isIpCandidate(line) ? line : '');
    if (!completeOffer) return ipOnly;
    return ipOnly.replace(/^a=ice-options:([^\r\n]*)(\r?\n|$)/gm, (line, value, ending) => {
      const options = value.trim().split(/[ \t]+/).filter((option) => option !== 'trickle');
      return options.length ? `a=ice-options:${options.join(' ')}${ending}` : '';
    });
  }
  function localCandidate(candidate) {
    if (!candidate) return null;
    const item = candidate.toJSON ? candidate.toJSON() : candidate;
    return { candidate: String(item.candidate || ''), sdpMid: item.sdpMid == null ? '' : String(item.sdpMid), sdpMLineIndex: Number(item.sdpMLineIndex) };
  }
  function normalizeAnswerSDP(answerSdp) {
    const lines = String(answerSdp || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    const sessionLines = []; const mediaSections = []; let section = sessionLines;
    lines.forEach((line) => { if (line.startsWith('m=')) { section = []; mediaSections.push(section); } section.push(line); });
    const candidates = []; const sanitized = [...sessionLines];
    mediaSections.forEach((mediaLines, sdpMLineIndex) => {
      const midLine = mediaLines.find((line) => line.startsWith('a=mid:'));
      const sdpMid = midLine ? midLine.slice('a=mid:'.length) : undefined;
      mediaLines.forEach((line) => {
        if (line.startsWith('a=candidate:')) { candidates.push({ candidate: line.slice(2), sdpMid, sdpMLineIndex }); return; }
        sanitized.push(line);
      });
    });
    return { sdp: `${sanitized.join('\r\n')}\r\n`, candidates };
  }
  async function release(state, notifyNative = true) {
    if (state.releasePromise) return state.releasePromise;
    state.releasePromise = (async () => {
      if (state.abort) state.abort.abort(); state.abort = null; state.cleanups.splice(0).forEach((cleanup) => cleanup());
      const sessionId = state.sessionId; state.sessionId = null;
      if (state.peer) { state.peer.getSenders().forEach((sender) => { if (sender.track) sender.track.stop(); }); state.peer.getReceivers().forEach((receiver) => { if (receiver.track) receiver.track.stop(); }); state.peer.close(); state.peer = null; }
      if (state.stream) { state.stream.getTracks().forEach((track) => track.stop()); state.stream = null; }
      state.video.pause(); state.video.srcObject = null;
      if (notifyNative) { try { await state.provider.closeSession(sessionId); } catch { /* local media cleanup has already finished */ } }
    })();
    return state.releasePromise;
  }
  function disposeProvider(state) { if (!state.providerDisposed) { state.providerDisposed = true; state.provider.dispose(); } }

  async function startAttempt(deviceId, video, onStatus) {
    await stopAll(); const provider = global.CameraSessionProvider.create(deviceId);
    const state = { deviceId, video, onStatus, provider, peer: null, stream: null, sessionId: null, abort: new AbortController(), cleanups: [], status: 'idle', phase: 'prepare', iceServerStatus: 'unknown' }; states.set(deviceId, state); phase(state, 'prepare');
    try {
      const prepared = await abortable(provider.prepare(), state.abort.signal);
      if (states.get(deviceId) !== state || !state.abort || state.abort.signal.aborted) throw new DOMException('WebRTC connection aborted', 'AbortError');
      state.iceServerStatus = prepared.iceServerStatus || 'unknown';
      const configuration = {
        iceServers: Array.isArray(prepared.iceServers) ? prepared.iceServers : [],
        iceTransportPolicy: prepared.iceTransportPolicy === 'relay' ? 'relay' : 'all',
      };
      const requestedMode = prepared.localIceMode === 'trickle' ? 'trickle' : 'complete-offer';
      const localIceMode = requestedMode === 'trickle' && provider.supportsLocalIce() ? 'trickle' : 'complete-offer';
      await connectProfile(state, prepared.ticket, configuration, localIceMode); emit(state, 'connected');
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      failure.phase = state.phase; failure.iceServerStatus = state.iceServerStatus;
      await release(state, true); disposeProvider(state);
      if (states.get(deviceId) === state) { states.delete(deviceId); emit(state, 'failed', failure); }
      throw failure;
    }
  }

  function start(deviceId, video, onStatus) {
    const current = starts.get(deviceId);
    if (current) return current;
    const attempt = startAttempt(deviceId, video, onStatus);
    starts.set(deviceId, attempt);
    void attempt.finally(() => { if (starts.get(deviceId) === attempt) starts.delete(deviceId); }).catch(() => {});
    return attempt;
  }

  async function connectProfile(state, ticket, configuration, localIceMode) {
    const signal = state.abort.signal;
    const peer = new RTCPeerConnection(configuration); const stream = new MediaStream(); state.peer = peer; state.stream = stream; state.video.srcObject = stream;
    peer.addTransceiver('video', { direction: 'recvonly' }); peer.addTransceiver('audio', { direction: 'recvonly' });
    peer.addEventListener('track', (event) => { if (state.peer === peer && !stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track); });
    const pendingLocalCandidates = []; let localIceReady = false; let localIceChain = Promise.resolve();
    const sendLocalCandidate = (candidate) => {
      localIceChain = localIceChain.then(() => state.peer === peer && state.sessionId != null ? state.provider.addLocalIceCandidate(state.sessionId, candidate) : undefined).catch(() => undefined);
      return localIceChain;
    };
    const onLocalIceCandidate = (event) => {
      if (localIceMode !== 'trickle') return;
      const candidate = localCandidate(event.candidate); if (!candidate || !candidate.candidate || !isIpCandidate(candidate.candidate)) return;
      if (localIceReady) void sendLocalCandidate(candidate); else pendingLocalCandidates.push(candidate);
    };
    peer.addEventListener('icecandidate', onLocalIceCandidate); state.cleanups.push(() => peer.removeEventListener('icecandidate', onLocalIceCandidate));
    const offer = await abortable(peer.createOffer(), signal); await abortable(peer.setLocalDescription(offer), signal);
    if (localIceMode !== 'trickle') await global.CameraWebRTCReadiness.waitForIceGathering(peer, signal);
    phase(state, 'signaling');
    const localDescription = peer.localDescription;
    const answer = await abortable(state.provider.createSession({ offerSdp: signalingOffer(localDescription && localDescription.sdp || '', localIceMode !== 'trickle'), requestId: requestId(), iceServers: configuration.iceServers, iceTransportPolicy: configuration.iceTransportPolicy }, ticket), signal);
    const normalizedAnswer = normalizeAnswerSDP(answer.answerSdp);
    phase(state, 'answer');
    state.sessionId = answer.sessionId; await peer.setRemoteDescription({ type: 'answer', sdp: normalizedAnswer.sdp });
    for (const candidate of normalizedAnswer.candidates) { try { await peer.addIceCandidate(candidate); } catch { /* one incompatible path must not discard the remaining remote candidates */ } }
    state.cleanups.push(state.provider.watchRemoteIceCandidates(answer.sessionId, (candidate) => { if (state.peer === peer) void peer.addIceCandidate(candidate).catch(() => {}); }));
    if (localIceMode === 'trickle') { localIceReady = true; pendingLocalCandidates.splice(0).forEach(sendLocalCandidate); }
    let remoteEndReject; const remoteEnd = new Promise((_, reject) => { remoteEndReject = reject; });
    state.cleanups.push(state.provider.watchSessionEnd(answer.sessionId, (reason) => remoteEndReject(new Error(reason ? `Camera ended the session: ${reason}` : 'Camera ended the session'))));
    void state.video.play().catch(() => {});
    phase(state, 'media');
    await Promise.race([global.CameraWebRTCReadiness.waitForMediaReady({ peer, video: state.video, stream, signal }), remoteEnd]);
  }

  async function stop(deviceId) { const state = states.get(deviceId); if (!state) return; states.delete(deviceId); await release(state, true); disposeProvider(state); emit(state, 'idle'); }
  function pause(deviceId) { const state = states.get(deviceId); if (!state || state.status !== 'connected') return false; state.video.pause(); emit(state, 'paused'); return true; }
  async function resume(deviceId) { const state = states.get(deviceId); if (!state || !['paused', 'connected'].includes(state.status)) return false; await state.video.play(); emit(state, 'connected'); return true; }
  function stopAll() { return Promise.all([...states.keys()].map(stop)); }
  global.addEventListener('pagehide', () => { void stopAll(); }); document.addEventListener('visibilitychange', () => { if (document.hidden) void stopAll(); });

  global.CameraWebRTCRuntime = Object.freeze({ start, stop, pause, resume, stopAll, normalizeAnswerSDP, status: (deviceId) => { const state = states.get(deviceId); return state && state.status || 'idle'; }, isAvailable: () => Boolean(global.RTCPeerConnection && global.CameraSessionProvider && global.CameraSessionProvider.isAvailable()) });
})(window);
