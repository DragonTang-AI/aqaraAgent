(function installCameraWebRTCReadiness(global) {
  'use strict';

  const DEFAULT_MEDIA_TIMEOUT_MS = 30000;

  function abortError() { return new DOMException('WebRTC connection aborted', 'AbortError'); }

  function waitForIceGathering(peer, signal, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(abortError()); return; }
      if (peer.iceGatheringState === 'complete') { resolve(); return; }
      let timer;
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); peer.removeEventListener('icegatheringstatechange', onChange); };
      const onAbort = () => { cleanup(); reject(abortError()); };
      const onChange = () => { if (peer.iceGatheringState === 'complete') { cleanup(); resolve(); } };
      timer = setTimeout(() => { cleanup(); reject(new Error('WebRTC ICE gathering timeout')); }, timeoutMs);
      signal.addEventListener('abort', onAbort, { once: true });
      peer.addEventListener('icegatheringstatechange', onChange);
      if (signal.aborted) onAbort(); else onChange();
    });
  }

  function waitForMediaReady({ peer, video, stream, signal, timeoutMs = DEFAULT_MEDIA_TIMEOUT_MS }) {
    return new Promise((resolve, reject) => {
      let settled = false; let timeout; let poll;
      const events = ['loadeddata', 'canplay', 'playing'];
      const current = () => video.srcObject === stream;
      const cleanup = () => { clearTimeout(timeout); clearTimeout(poll); signal.removeEventListener('abort', onAbort); peer.removeEventListener('connectionstatechange', onState); peer.removeEventListener('iceconnectionstatechange', onState); events.forEach((name) => video.removeEventListener(name, onMedia)); };
      const success = (source) => { if (settled || !current()) return; settled = true; cleanup(); resolve(source); };
      const fail = (error) => { if (settled) return; settled = true; cleanup(); reject(error); };
      const onAbort = () => fail(abortError());
      const onState = () => {
        if (!current()) return;
        if (['failed', 'closed'].includes(peer.connectionState)) { fail(new Error(`WebRTC Peer ${peer.connectionState}`)); return; }
        if (['failed', 'closed'].includes(peer.iceConnectionState)) fail(new Error(`WebRTC ICE ${peer.iceConnectionState}`));
      };
      const onMedia = () => { if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) success('media-element'); };
      const pollStats = async () => {
        if (settled || !current()) return;
        try {
          const stats = await peer.getStats(); let ready = false;
          stats.forEach((report) => { const kind = report.kind || report.mediaType; if (report.type === 'inbound-rtp' && kind === 'video' && Number(report.bytesReceived) > 0) ready = true; });
          if (ready) { success('inbound-stats'); return; }
        } catch { /* stats are a readiness fallback, not the media path */ }
        if (!settled) poll = setTimeout(pollStats, 250);
      };
      const timeoutError = () => {
        const ice = peer.iceConnectionState;
        const connection = peer.connectionState;
        if (['new', 'checking'].includes(ice) || ['new', 'connecting'].includes(connection)) return new Error('WebRTC ICE connection timeout');
        if (ice === 'connected' || ice === 'completed' || connection === 'connected') return new Error('WebRTC media readiness timeout');
        return new Error('WebRTC media connection timeout');
      };
      signal.addEventListener('abort', onAbort, { once: true }); peer.addEventListener('connectionstatechange', onState); peer.addEventListener('iceconnectionstatechange', onState); events.forEach((name) => video.addEventListener(name, onMedia));
      if (signal.aborted) { onAbort(); return; } onState(); onMedia();
      if (settled) return;
      timeout = setTimeout(() => fail(timeoutError()), timeoutMs); void pollStats();
    });
  }

  global.CameraWebRTCReadiness = Object.freeze({ waitForIceGathering, waitForMediaReady, mediaConnectionTimeoutMs: DEFAULT_MEDIA_TIMEOUT_MS });
})(window);
