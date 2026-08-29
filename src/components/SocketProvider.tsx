"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";

/**
 * One socket per browser tab, shared by every screen.
 *
 * The server places this connection in rooms derived from the session cookie,
 * so there is nothing to subscribe to and no room id to leak — a screen just
 * listens for the events it cares about.
 */

type Handler = (payload: never) => void;

interface SocketContextValue {
  connected: boolean;
  on: (event: string, handler: Handler) => () => void;
  emit: (event: string, payload: unknown) => void;
}

const SocketContext = createContext<SocketContextValue>({
  connected: false,
  on: () => () => {},
  emit: () => {},
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io({ path: "/api/socket", transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const value = useMemo<SocketContextValue>(
    () => ({
      connected,
      on: (event, handler) => {
        const socket = socketRef.current;
        if (!socket) return () => {};
        socket.on(event, handler as (...args: unknown[]) => void);
        return () => {
          socket.off(event, handler as (...args: unknown[]) => void);
        };
      },
      emit: (event, payload) => socketRef.current?.emit(event, payload),
    }),
    [connected],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

/** Subscribe to one event for the lifetime of a component. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const { on } = useSocket();
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    return on(event, ((payload: T) => saved.current(payload)) as Handler);
  }, [event, on]);
}
