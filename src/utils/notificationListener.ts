import echo from './echo';
import { toast } from './toast';
import { PushNotification } from './pushNotification';

/** Payload of the `.app.activity` broadcast (App\Events\WebhookReceived). */
interface AppActivityEvent {
    type?: string; // 'install' or 'uninstall'
    message?: string;
    shopDomain?: string;
}

export const initNotificationListener = () => {
    console.log('Initializing notification listener...');
    
    // Request permission for desktop notifications on init
    PushNotification.requestPermission();
    
    echo.private('crm-notifications')
        .listen('.app.activity', (e: AppActivityEvent) => {
            // Extract domain for formatting fallback if missing from payload
            let domain = e.shopDomain;
            if (!domain && e.message) {
                const match = e.message.match(/([a-zA-Z0-9-]+\.myshopify\.com)/);
                if (match) domain = match[1];
            }

            // Plain text: both the toast and desktop notifications show markup literally.
            let message = (e.message || '').replace(/<[^>]*>/g, '');
            if (domain) {
                message = message.replace(domain, `"${domain}"`);
            }

            let title = 'New activity detected';
            let icon: 'success' | 'info' | 'warning' = 'info';
            
            if (e.type === 'install') {
                icon = 'success';
                title = 'New installation detected';
            } else if (e.type === 'uninstall') {
                icon = 'warning';
                title = 'App uninstallation detected';
            }

            if (Notification.permission === 'granted') {
                PushNotification.show(title, {
                    body: message,
                    tag: 'crm-activity'
                });
            } else {
                toast[icon](title, { description: message });
            }
        });
};
