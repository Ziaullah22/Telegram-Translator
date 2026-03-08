import { useEffect, useRef, useCallback, useState } from 'react';
import Cookies from 'js-cookie';
import { useAuth } from './useAuth';

/**
 * USE SOCKET HOOK
 * Manages a persistent WebSocket connection to the backend.
 * Provides real-time event broadcasting to UI components.
 */
export function useSocket() {
  const { isAuthenticated, token: authContextToken } = useAuth();

  // Connection state refs
  const wsRef = useRef<WebSocket | null>(null);
  const messageHandlers = useRef<Set<(data: any) => void>>(new Set());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  /**
   * CONNECTION LOGIC
   * Establishes a secure/insecure WebSocket connection using the user's JWT token.
   * Includes error handling, heartbeat (ping/pong), and automatic exponential backoff for reconnection.
   */
  const connect = useCallback(() => {

    // Only attempt connection if authenticated
    if (!isAuthenticated) return;

    // Use token from context or fallback to cookie
    const token = authContextToken || Cookies.get('auth_token');

    if (!token) {
      // If we think we're authenticated but have no token, don't spam the console on login page
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return; // Already connected or connecting
    }

    try {
      // DEBUG: console.log('Attempting WebSocket connection...');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${token}`);

      ws.onopen = () => {
        console.log('WebSocket connected successfully');
        setIsConnected(true);
        reconnectAttempts.current = 0;

        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          messageHandlers.current.forEach(handler => handler(data));
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
        wsRef.current = null;

        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // Attempt to reconnect if not a normal closure and we have a token
        if (event.code !== 1000 && isAuthenticated) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`Attempting to reconnect in ${delay}ms (Attempt ${reconnectAttempts.current + 1})`);
          reconnectAttempts.current++;

          if (reconnectAttempts.current < maxReconnectAttempts) {
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
          } else {
            console.error('Max reconnection attempts reached');
          }
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error creating WebSocket:', error);
    }
  }, [isAuthenticated, authContextToken]);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (wsRef.current) {
        console.log('Closing WebSocket connection due to unmount or logout');
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
    };
  }, [connect, isAuthenticated]);

  const onMessage = useCallback((handler: (data: any) => void) => {
    messageHandlers.current.add(handler);

    return () => {
      messageHandlers.current.delete(handler);
    };
  }, []);

  const sendMessage = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return {
    ws: wsRef.current,
    onMessage,
    sendMessage,
    isConnected,
    reconnect: connect,
  };
}