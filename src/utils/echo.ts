import Echo from 'laravel-echo';
import Pusher, { type Channel, type ChannelAuthorizationCallback } from 'pusher-js';

declare global {
    interface Window {
        Pusher: typeof Pusher;
    }
}

window.Pusher = Pusher;

const echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: import.meta.env.VITE_REVERB_PORT ?? 80,
    wssPort: import.meta.env.VITE_REVERB_PORT ?? 443,
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
    enabledTransports: ['ws', 'wss'],
    authorizer: (channel: Channel) => {
        return {
            authorize: (socketId: string, callback: ChannelAuthorizationCallback) => {
                const token = localStorage.getItem('token');
                fetch(`${import.meta.env.VITE_BACKEND_URL}/api/broadcasting/auth`, {
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
                    callback(null, data);
                })
                .catch(error => {
                    callback(error, null);
                });
            }
        };
    },
});

export default echo;
