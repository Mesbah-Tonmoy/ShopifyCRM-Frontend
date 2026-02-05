import echo from './echo';
import { Toast } from './toast';
import { PushNotification } from './pushNotification';

export const initNotificationListener = () => {
    console.log('Initializing notification listener...');
    
    // Request permission for desktop notifications on init
    PushNotification.requestPermission();
    
    echo.private('crm-notifications')
        .listen('.app.activity', (e: any) => {
            // Extract domain for formatting fallback if missing from payload
            let domain = e.shopDomain;
            if (!domain && e.message) {
                const match = e.message.match(/([a-zA-Z0-9-]+\.myshopify\.com)/);
                if (match) domain = match[1];
            }

            let message = e.message || '';
            if (domain && !message.includes('<b>')) {
                message = message.replace(domain, `"<b>${domain}</b>"`);
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
                Toast.fire({ icon, title, html: message });
            }
        });
};
