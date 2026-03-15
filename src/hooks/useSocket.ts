import { useEffect, useCallback, useState } from 'react';
import Cookies from 'js-cookie';
import { useAuth } from './useAuth';

// --- SINGLETON SOCKET STATE ---
// We keep these outside the hook so that multiple components calling useSocket()
// share the same connection and message bus, instead of opening many sockets.
let globalWs: WebSocket | null = null;
let globalHandlers: Set<(data: any) => void> = new Set();
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let reconnectAttemptsGlobal = 0;

export function useSocket() {
  const { isAuthenticated, token: authContextToken } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    // Only attempt connection if authenticated
    if (!isAuthenticated) return;

    // Use token from context or fallback to cookie
    const token = authContextToken || Cookies.get('auth_token');

    if (!token) return;

    if (globalWs?.readyState === WebSocket.OPEN || globalWs?.readyState === WebSocket.CONNECTING) {
      setIsConnected(true);
      return; 
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${token}`);

      // Expose globally for legacy components (CampaignLeadsModal, etc.)
      (window as any).socket = ws;

      ws.onopen = () => {
        console.log('WebSocket connected successfully');
        setIsConnected(true);
        reconnectAttemptsGlobal = 0;

        // Start heartbeat
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          globalHandlers.forEach(handler => handler(data));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected', event.code, event.reason);
        setIsConnected(false);
        globalWs = null;
        (window as any).socket = null;

        // Clear heartbeat
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }

        // Attempt to reconnect if not a normal closure and we have a token
        if (event.code !== 1000 && isAuthenticated) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsGlobal), 30000);
          console.log(`Attempting to reconnect in ${delay}ms (Attempt ${reconnectAttemptsGlobal + 1})`);
          reconnectAttemptsGlobal++;

          if (reconnectAttemptsGlobal < maxReconnectAttempts) {
            reconnectTimeout = setTimeout(() => {
              connect();
            }, delay);
          } else {
            console.error('Max reconnection attempts reached');
          }
        }
      };

      globalWs = ws;
    } catch (error) {
      console.error('Error creating WebSocket:', error);
    }
  }, [isAuthenticated, authContextToken]);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    }

    // Since this is a singleton, we only cleanup on REAL logout
    // Components unmounting shouldn't kill the global stream.
    return () => {
      if (!isAuthenticated && globalWs) {
         globalWs.close(1000, 'User logged out');
         globalWs = null;
         (window as any).socket = null;
      }
    };
  }, [connect, isAuthenticated]);

  const onMessage = useCallback((handler: (data: any) => void) => {
    globalHandlers.add(handler);
    return () => {
      globalHandlers.delete(handler);
    };
  }, []);

  const sendMessage = useCallback((data: any) => {
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
      globalWs.send(JSON.stringify(data));
    }
  }, []);

  return {
    ws: globalWs,
    onMessage,
    sendMessage,
    isConnected: isConnected || (globalWs?.readyState === WebSocket.OPEN),
    reconnect: connect,
  };
}