import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
    interface Window {
        Pusher: typeof Pusher;
    }
}

window.Pusher = Pusher;

const appKey = import.meta.env.VITE_REVERB_APP_KEY;

if (!appKey) {
    console.error('VITE_REVERB_APP_KEY is not defined. Please check your .env file and rebuild the frontend.');
}

const echo = new Echo({
    broadcaster: 'reverb',
    key: appKey,
    wsHost: import.meta.env.VITE_REVERB_HOST || window.location.hostname,
    wsPort: import.meta.env.VITE_REVERB_PORT ?? 80,
    wssPort: import.meta.env.VITE_REVERB_PORT ?? 443,
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
    enabledTransports: ['ws', 'wss'],
    authorizer: (channel: any) => {
        return {
            authorize: (socketId: string, callback: any) => {
                const token = localStorage.getItem('token');
                const backendUrl = import.meta.env.VITE_BACKEND_URL;
                
                if (!backendUrl) {
                    console.error('VITE_BACKEND_URL is not defined.');
                    callback(true, 'Backend URL missing');
                    return;
                }

                fetch(`${backendUrl}/api/broadcasting/auth`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        socket_id: socketId,
                        channel_name: channel.name
                    })
                })
                .then(response => response.json())
                .then(data => {
                    callback(false, data);
                })
                .catch(error => {
                    console.error('Broadcast authorization failed:', error);
                    callback(true, error);
                });
            }
        };
    },
});

export default echo;
