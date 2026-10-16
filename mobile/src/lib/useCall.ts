import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { canFlipCamera, flipCamera, getMedia, rtc } from "@/lib/webrtc";

// One call, start to finish. The server rings the other person and passes the connection setup
// messages between the two apps; audio and video go directly between the phones (or through the TURN
// relay the server names, which keeps both people's IP addresses private).

export type CallView = {
  id: string; matchId: string; kind: "AUDIO" | "VIDEO"; state: "RINGING" | "ACTIVE" | "ENDED"; endReason: string | null;
  incoming: boolean; answeredAt: string | null; ringsUntil: string;
};
type Ice = { iceServers: unknown[]; iceTransportPolicy: "all" | "relay"; relay: boolean } | null;
type Signal = { seq: number; type: "offer" | "answer" | "ice"; data: any };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useCall(id: string, accept: boolean) {
  const [call, setCall] = useState<CallView | null>(null);
  const [local, setLocal] = useState<any>(null);
  const [remote, setRemote] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [problem, setProblem] = useState("");
  const [relay, setRelay] = useState(false);
  const ended = useRef(false);
  const localRef = useRef<any>(null);

  useEffect(() => {
    let stop = false;
    let pc: any = null;
    const ctl = new AbortController();
    const queued: any[] = [];
    let after = 0;
    const send = (type: Signal["type"], data: unknown) =>
      api(`/api/calls/${id}/signal`, { body: { type, data } }).catch(() => {});
    const finish = (c: CallView) => { ended.current = true; setCall(c); };

    async function handle(s: Signal) {
      if (!pc) return;
      if (s.type === "offer") {
        await pc.setRemoteDescription(new rtc.RTCSessionDescription(s.data));
        while (queued.length) await pc.addIceCandidate(new rtc.RTCIceCandidate(queued.shift())).catch(() => {});
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        void send("answer", { type: answer.type, sdp: answer.sdp });
      } else if (s.type === "answer") {
        await pc.setRemoteDescription(new rtc.RTCSessionDescription(s.data));
        while (queued.length) await pc.addIceCandidate(new rtc.RTCIceCandidate(queued.shift())).catch(() => {});
      } else if (s.type === "ice") {
        if (pc.remoteDescription) await pc.addIceCandidate(new rtc.RTCIceCandidate(s.data)).catch(() => {});
        else queued.push(s.data);
      }
    }

    (async () => {
      let c: CallView, ice: Ice;
      try {
        const r = accept
          ? await api<{ call: CallView; ice: Ice }>(`/api/calls/${id}`, { body: { action: "accept" } })
          : await api<{ call: CallView; ice: Ice }>(`/api/calls/${id}?ice=1&wait=0`);
        c = r.call; ice = r.ice;
      } catch (e: any) { setProblem(e.message); ended.current = true; return; }
      setCall(c);
      if (c.state === "ENDED") return finish(c);
      if (!ice) { setProblem("Calls aren't available yet."); void api(`/api/calls/${id}`, { body: { action: "end" } }).catch(() => {}); return; }
      setRelay(ice.relay);

      try {
        const stream = await getMedia({ audio: true, video: c.kind === "VIDEO" ? { facingMode: "user", width: 640, height: 480 } : false });
        if (stop) { stream.getTracks().forEach((t: any) => t.stop()); return; }
        localRef.current = stream; setLocal(stream);
        pc = new rtc.RTCPeerConnection({ iceServers: ice.iceServers, iceTransportPolicy: ice.iceTransportPolicy });
        stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
        pc.addEventListener("icecandidate", (e: any) => { if (e.candidate) void send("ice", e.candidate.toJSON ? e.candidate.toJSON() : e.candidate); });
        pc.addEventListener("track", (e: any) => { if (e.streams?.[0]) setRemote(e.streams[0]); });
        pc.addEventListener("connectionstatechange", () => {
          if (pc.connectionState === "connected") { setConnected(true); setProblem(""); }
          if (pc.connectionState === "disconnected") setProblem("Reconnecting…");
          if (pc.connectionState === "failed") setProblem("The connection dropped. Hang up and try again.");
        });
        if (!c.incoming) {
          const offer = await pc.createOffer({});
          await pc.setLocalDescription(offer);
          void send("offer", { type: offer.type, sdp: offer.sdp });
        }
      } catch {
        setProblem(c.kind === "VIDEO" ? "Allow camera and microphone access to make video calls." : "Allow microphone access to make calls.");
        void api(`/api/calls/${id}`, { body: { action: "end" } }).catch(() => {});
        ended.current = true;
        return;
      }

      while (!stop) {
        try {
          const r = await api<{ call: CallView; signals: Signal[] }>(`/api/calls/${id}?after=${after}&wait=20000`, { signal: ctl.signal });
          setCall(r.call);
          for (const s of r.signals) { after = Math.max(after, s.seq); await handle(s).catch(() => {}); }
          if (r.call.state === "ENDED") { finish(r.call); break; }
        } catch {
          if (stop) break;
          await sleep(1500);
        }
      }
    })();

    return () => {
      stop = true;
      ctl.abort();
      localRef.current?.getTracks().forEach((t: any) => t.stop());
      try { pc?.close(); } catch { /* already closed */ }
      if (!ended.current) void api(`/api/calls/${id}`, { body: { action: "end" } }).catch(() => {});
    };
  }, [id, accept]);

  return {
    call, local, remote, connected, muted, cameraOff, problem, relay, canFlip: canFlipCamera,
    hangUp: () => api<{ call: CallView }>(`/api/calls/${id}`, { body: { action: "end" } }).then((r) => { ended.current = true; setCall(r.call); }).catch(() => {}),
    toggleMute: () => { const on = !muted; localRef.current?.getAudioTracks().forEach((t: any) => { t.enabled = !on; }); setMuted(on); },
    toggleCamera: () => { const off = !cameraOff; localRef.current?.getVideoTracks().forEach((t: any) => { t.enabled = !off; }); setCameraOff(off); },
    flip: () => { const t = localRef.current?.getVideoTracks()[0]; if (t) void flipCamera(t); },
  };
}
