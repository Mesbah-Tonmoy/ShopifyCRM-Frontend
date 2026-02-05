export const PushNotification = {
    async requestPermission() {
        if (!('Notification' in window)) {
            console.warn('This browser does not support desktop notification');
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }

        return false;
    },

    /**
     * Converts text wrapped in <b> tags to Unicode bold characters
     * logic: A -> 𝐀 (U+1D400), a -> 𝐚 (U+1D41A), 0 -> 𝟎 (U+1D7CE)
     */
    toBoldUnicode(text: string) {
        return text.replace(/<b>(.*?)<\/b>/g, (_, content) => {
            return content.split('').map((char: string) => {
                const code = char.charCodeAt(0);
                // Uppercase A-Z
                if (code >= 65 && code <= 90) {
                    return String.fromCodePoint(0x1D400 + (code - 65));
                }
                // Lowercase a-z
                if (code >= 97 && code <= 122) {
                    return String.fromCodePoint(0x1D41A + (code - 97));
                }
                // Digits 0-9
                if (code >= 48 && code <= 57) {
                    return String.fromCodePoint(0x1D7CE + (code - 48));
                }
                return char;
            }).join('');
        });
    },

    show(title: string, options: NotificationOptions = {}) {
        if (!('Notification' in window) || Notification.permission !== 'granted') {
            return;
        }

        const transformedTitle = this.toBoldUnicode(title);
        let body = options.body || '';
        
        if (body) {
            body = this.toBoldUnicode(body);
            body = body.replace(/<[^>]*>?/gm, ''); // Strip remaining HTML
        }

        const notification = new Notification(transformedTitle, {
            icon: '/favicon.png',
            ...options,
            body
        });

        notification.onclick = (event) => {
            event.preventDefault();
            window.focus();
            if (options.data?.url) {
                window.location.href = options.data.url;
            }
            notification.close();
        };

        return notification;
    }
};
