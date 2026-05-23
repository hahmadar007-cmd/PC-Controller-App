/**
 * useConnection — No-Auth Build
 * ================================
 * WebSocket connects instantly on open.
 * No PIN, no token, no pairing flow.
 * HTTP helpers send requests with no auth headers.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
  IP:       "sysctrl_ip",
  HTTP_PORT:"sysctrl_http_port",
  WS_PORT:  "sysctrl_ws_port",
};

const DEFAULT_HTTP_PORT  = 9997;
const DEFAULT_WS_PORT    = 9996;
const MAX_RECONNECT_MS   = 8000;
const RECONNECT_BASE_MS  = 1000;

export function useConnection() {
  const [ip,        setIpState]      = useState("192.168.1.23");
  const [httpPort,  setHttpPortState] = useState(DEFAULT_HTTP_PORT);
  const [wsPort,    setWsPortState]   = useState(DEFAULT_WS_PORT);
  const [connected, setConnected]     = useState(false);
  const [wsReady,   setWsReady]       = useState(false);
  const [telemetry, setTelemetry]     = useState({
    cpu: 0, ram: 0, battery: 100, plugged: false,
    disk_percent: 0, gpu: [], active_window: "",
    net_sent_mb: 0, net_recv_mb: 0,
  });
  const [media,      setMedia]      = useState({ title:"", artist:"", album:"", status:"Stopped" });
  const [lastAction, setLastAction] = useState("—");

  const wsRef        = useRef(null);
  const reconnectRef = useRef(null);
  const reconnectMs  = useRef(RECONNECT_BASE_MS);
  const mountedRef   = useRef(true);

  // ── Persistence ────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const savedIp   = await AsyncStorage.getItem(STORAGE_KEYS.IP);
      const savedHttp = await AsyncStorage.getItem(STORAGE_KEYS.HTTP_PORT);
      const savedWs   = await AsyncStorage.getItem(STORAGE_KEYS.WS_PORT);
      if (savedIp)   setIpState(savedIp);
      if (savedHttp) setHttpPortState(parseInt(savedHttp));
      if (savedWs)   setWsPortState(parseInt(savedWs));
    })();
    return () => { mountedRef.current = false; };
  }, []);

  const saveIp = useCallback(async (v) => {
    setIpState(v);
    await AsyncStorage.setItem(STORAGE_KEYS.IP, v);
  }, []);

  const saveHttpPort = useCallback(async (v) => {
    setHttpPortState(v);
    await AsyncStorage.setItem(STORAGE_KEYS.HTTP_PORT, String(v));
  }, []);

  const saveWsPort = useCallback(async (v) => {
    setWsPortState(v);
    await AsyncStorage.setItem(STORAGE_KEYS.WS_PORT, String(v));
  }, []);

  // ── WebSocket lifecycle ────────────────────────────────────────────────────

  const connectWs = useCallback(() => {
    if (!ip) return;
    try { wsRef.current?.close(); } catch (_) {}

    let ws;
    try { ws = new WebSocket(`ws://${ip}:${wsPort}`); }
    catch (_) { scheduleReconnect(); return; }
    wsRef.current = ws;

    // ── NO-AUTH: mark connected the moment socket opens ───────────────────
    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);    // ← immediate, no handshake needed
      setWsReady(true);
      reconnectMs.current = RECONNECT_BASE_MS;
    };

    ws.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(e.data);

        // auth_ok is still sent by server for compatibility — treat it as a no-op
        if (msg.type === "auth_ok") return;

        // Accept telemetry immediately, no auth gate
        if (msg.type === "telemetry") {
          setTelemetry({
            cpu:           msg.cpu          ?? 0,
            ram:           msg.ram          ?? 0,
            battery:       msg.battery      ?? 100,
            plugged:       msg.plugged      ?? false,
            disk_percent:  msg.disk_percent ?? 0,
            gpu:           msg.gpu          ?? [],
            active_window: msg.active_window?? "",
            net_sent_mb:   msg.net_sent_mb  ?? 0,
            net_recv_mb:   msg.net_recv_mb  ?? 0,
          });
          if (msg.media) setMedia(msg.media);
        }
      } catch (_) {}
    };

    ws.onerror = () => {};

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      setWsReady(false);
      scheduleReconnect();
    };
  }, [ip, wsPort]);

  const scheduleReconnect = useCallback(() => {
    clearTimeout(reconnectRef.current);
    reconnectRef.current = setTimeout(() => {
      if (mountedRef.current) {
        reconnectMs.current = Math.min(reconnectMs.current * 1.5, MAX_RECONNECT_MS);
        connectWs();
      }
    }, reconnectMs.current);
  }, [connectWs]);

  // Reconnect whenever ip or wsPort changes
  useEffect(() => {
    if (ip) connectWs();
    return () => {
      clearTimeout(reconnectRef.current);
      try { wsRef.current?.close(); } catch (_) {}
    };
  }, [ip, wsPort]);

  // ── send — no auth header, WS first then HTTP fallback ────────────────────

  const send = useCallback(async (payload) => {
    setLastAction(payload.action + (payload.value ? `:${payload.value}` : ""));

    // Prefer WebSocket (zero latency)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return { ok: true };
    }

    // HTTP fallback — no token header
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`http://${ip}:${httpPort}/command`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  controller.signal,
      });
      clearTimeout(timer);
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }, [ip, httpPort, wsRef]);

  // ── httpGet — no token header ──────────────────────────────────────────────

  const httpGet = useCallback(async (path, timeoutMs = 6000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`http://${ip}:${httpPort}${path}`, {
        signal: controller.signal,
        // no X-Auth-Token header
      });
      clearTimeout(timer);
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }, [ip, httpPort]);

  // ── Network scanner ───────────────────────────────────────────────────────

  const scanNetwork = useCallback(async (subnet, port, onFound, onProgress) => {
    const probes = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
    const BATCH  = 30;
    let done = 0;

    for (let i = 0; i < probes.length; i += BATCH) {
      await Promise.all(probes.slice(i, i + BATCH).map(async (host) => {
        try {
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 1200);
          const res = await fetch(`http://${host}:${port}/ping`, { signal: ctrl.signal });
          if (res.ok) {
            const data = await res.json();
            onFound({ ip: host, hostname: data.hostname || host, data });
          }
        } catch (_) {}
        done++;
        onProgress(Math.round((done / probes.length) * 100));
      }));
    }
  }, []);

  return {
    // State
    ip, httpPort, wsPort, connected, wsReady,
    telemetry, media, lastAction,
    // Setters
    saveIp, saveHttpPort, saveWsPort,
    // Actions
    send, httpGet, scanNetwork,
    reconnect: connectWs,
  };
}