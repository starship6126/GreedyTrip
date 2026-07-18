"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "paused" | "error";

export function useVoiceAgent(onFinalTranscript: (transcript: string) => void | Promise<void>) {
  const [status, setStatus] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  const permissionDeniedRef = useRef(false);
  const callbackRef = useRef(onFinalTranscript);

  useEffect(() => {
    callbackRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  const startRecognition = useCallback(() => {
    if (!activeRef.current || speakingRef.current || permissionDeniedRef.current) return;
    try {
      recognitionRef.current?.start();
    } catch {
      // The recognizer is already starting or active.
    }
  }, []);

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;
    queueMicrotask(() => setSupported(true));
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = process.env.NEXT_PUBLIC_AGENT_LANGUAGE ?? "en-US";
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setStatus("listening");
    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      setInterimTranscript(interim);
      if (final.trim()) {
        setInterimTranscript("");
        setStatus("thinking");
        void callbackRef.current(final.trim());
      }
    };
    recognition.onerror = (event) => {
      if (["not-allowed", "service-not-allowed"].includes(event.error)) {
        permissionDeniedRef.current = true;
        activeRef.current = false;
        setActive(false);
        setStatus("error");
        return;
      }
      if (!["no-speech", "aborted"].includes(event.error)) setStatus("error");
    };
    recognition.onend = () => {
      if (activeRef.current && !speakingRef.current && !permissionDeniedRef.current) {
        setStatus("idle");
        window.setTimeout(startRecognition, 350);
      } else if (!speakingRef.current && !permissionDeniedRef.current) {
        setStatus("paused");
      }
    };
    recognitionRef.current = recognition;
    return () => {
      activeRef.current = false;
      recognition.abort();
      window.speechSynthesis?.cancel();
      recognitionRef.current = null;
    };
  }, [startRecognition]);

  const activate = useCallback(() => {
    activeRef.current = true;
    setActive(true);
    setStatus("idle");
    if (supported) startRecognition();
  }, [startRecognition, supported]);

  const pause = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    permissionDeniedRef.current = false;
    activeRef.current = true;
    setActive(true);
    setStatus("idle");
    startRecognition();
  }, [startRecognition]);

  const speak = useCallback((text: string, urgent = false) => {
    if (!text || !("speechSynthesis" in window)) {
      if (activeRef.current) startRecognition();
      return;
    }
    speakingRef.current = true;
    recognitionRef.current?.stop();
    if (urgent) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = process.env.NEXT_PUBLIC_AGENT_LANGUAGE ?? "en-US";
    utterance.rate = 1.02;
    const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.lang.toLowerCase().startsWith("en"));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setStatus("speaking");
    utterance.onend = () => {
      speakingRef.current = false;
      setStatus(activeRef.current ? "idle" : "paused");
      if (activeRef.current) window.setTimeout(startRecognition, 250);
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      setStatus(activeRef.current ? "idle" : "error");
      if (activeRef.current) startRecognition();
    };
    window.speechSynthesis.speak(utterance);
  }, [startRecognition]);

  const setThinking = useCallback((thinking: boolean) => {
    // Finishing a silent recompute means the agent is ready, not user-paused.
    // The explicit pause() path still owns the paused state.
    setStatus(thinking ? "thinking" : "idle");
  }, []);

  return {
    status,
    interimTranscript,
    supported,
    active,
    activate,
    pause,
    resume,
    speak,
    setThinking,
    toggle: active ? pause : resume,
  };
}
