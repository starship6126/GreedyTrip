"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useWakeLock() {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    queueMicrotask(() => setSupported("wakeLock" in navigator));
  }, []);

  const request = useCallback(async () => {
    if (!("wakeLock" in navigator)) return false;
    try {
      sentinelRef.current = await navigator.wakeLock.request("screen");
      setActive(true);
      sentinelRef.current.addEventListener("release", () => setActive(false), { once: true });
      return true;
    } catch {
      setActive(false);
      return false;
    }
  }, []);

  const release = useCallback(async () => {
    await sentinelRef.current?.release();
    sentinelRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && sentinelRef.current === null && active) void request();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [active, request]);

  return { supported, active, request, release };
}
