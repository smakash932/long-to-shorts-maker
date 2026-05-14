/**
 * Socket.IO hook for real-time progress updates from the engine.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3847';

export function useSocket() {
    const socketRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const listenersRef = useRef(new Map());

    useEffect(() => {
        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 10,
        });

        socket.on('connect', () => {
            console.log('[Socket.IO] Connected:', socket.id);
            setIsConnected(true);
        });

        socket.on('disconnect', () => {
            console.log('[Socket.IO] Disconnected');
            setIsConnected(false);
        });

        socket.on('connect_error', (err) => {
            console.log('[Socket.IO] Connection error:', err.message);
            setIsConnected(false);
        });

        socketRef.current = socket;

        return () => {
            socket.disconnect();
        };
    }, []);

    const joinJob = useCallback((jobId) => {
        if (socketRef.current) {
            socketRef.current.emit('join_job', jobId);
        }
    }, []);

    const onEngineEvent = useCallback((callback) => {
        if (socketRef.current) {
            // Remove previous listener if exists
            const prev = listenersRef.current.get('engine_event');
            if (prev) {
                socketRef.current.off('engine_event', prev);
            }
            
            socketRef.current.on('engine_event', callback);
            listenersRef.current.set('engine_event', callback);
        }
    }, []);

    const offEngineEvent = useCallback(() => {
        if (socketRef.current) {
            const prev = listenersRef.current.get('engine_event');
            if (prev) {
                socketRef.current.off('engine_event', prev);
                listenersRef.current.delete('engine_event');
            }
        }
    }, []);

    return { 
        socket: socketRef.current, 
        isConnected, 
        joinJob, 
        onEngineEvent, 
        offEngineEvent 
    };
}
