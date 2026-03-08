import { useEffect, useRef, useCallback, useState } from 'react';
import Cookies from 'js-cookie';

/**
 * ADMIN USE SOCKET HOOK
 * Manages the WebSocket connection for the administrative dashboard.
 * Authenticats using 'admin_token' to receive global management events.
 */
export function useSocket() {
    const wsRef = useRef<WebSocket | null>(null);
    const messageHandlers = useRef<Set<(data: any) => void>>(new Set());
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const reconnectAttempts = useRef(0);
    const maxReconnectAttempts = 5;

    /**
     * CONNECTION LOGIC
     * Handles establishing the WebSocket with automatic retry and auth token retrieval.
     */
    const connect = useCallback(() => {
        const token = Cookies.get('admin_token');


        if (!token) {
            return;
        }

        if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
            return;
        }

        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${token}`);

            ws.onopen = () => {
                console.log('Admin WebSocket connected successfully');
                setIsConnected(true);
                reconnectAttempts.current = 0;

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

                if (heartbeatIntervalRef.current) {
                    clearInterval(heartbeatIntervalRef.current);
                    heartbeatIntervalRef.current = null;
                }

                if (event.code !== 1000) {
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
                    reconnectAttempts.current++;

                    if (reconnectAttempts.current < maxReconnectAttempts) {
                        reconnectTimeoutRef.current = setTimeout(() => {
                            connect();
                        }, delay);
                    }
                }
            };

            wsRef.current = ws;
        } catch (error) {
            console.error('Error creating WebSocket:', error);
        }
    }, []);

    useEffect(() => {
        connect();

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close(1000, 'Component unmounting');
                wsRef.current = null;
            }
        };
    }, [connect]);

    const onMessage = useCallback((handler: (data: any) => void) => {
        messageHandlers.current.add(handler);
        return () => {
            messageHandlers.current.delete(handler);
        };
    }, []);

    return {
        ws: wsRef.current,
        onMessage,
        isConnected,
        reconnect: connect,
    };
}
