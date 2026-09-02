import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

/**
 * The slice of this document that the person can actually see.
 *
 * Inside an iframe, `position: fixed` and `vh` resolve against the iframe's own
 * box, not the browser window. The board reports its content height so the host
 * app can grow the iframe, which means that box can be far taller than the
 * screen — a centred overlay then lands in the middle of the iframe, off screen,
 * and the whole host page has to be scrolled to reach it.
 *
 * IntersectionObserver rects are clipped by every ancestor frame up to the
 * top-level viewport, so intersecting this document against the implicit root
 * gives exactly the visible band, in this document's own client coordinates —
 * which is the coordinate space `position: fixed` uses.
 */
export function useVisibleViewport(active: Ref<boolean>) {
    // null means "no adjustment needed" — cover the viewport normally.
    const top = ref<number | null>(null);
    const height = ref<number | null>(null);

    const isFramed = typeof window !== 'undefined' && window.parent !== window;
    const supported = typeof IntersectionObserver !== 'undefined';

    let observer: IntersectionObserver | null = null;

    const update = (entry: IntersectionObserverEntry) => {
        const rect = entry.intersectionRect;

        // Nothing visible (host scrolled past the board) — keep the last known
        // band rather than collapsing the overlay to zero height.
        if (rect.height <= 0) return;

        top.value = rect.top;
        height.value = rect.height;
    };

    const start = () => {
        if (!isFramed || !supported || observer) return;

        observer = new IntersectionObserver(
            (entries) => entries.forEach(update),
            // A dense threshold list so the band tracks the host page's scroll
            // rather than only firing when the element enters or leaves.
            { threshold: Array.from({ length: 101 }, (_, i) => i / 100) }
        );

        observer.observe(document.documentElement);
    };

    const stop = () => {
        observer?.disconnect();
        observer = null;
        top.value = null;
        height.value = null;
    };

    watch(active, (isActive) => (isActive ? start() : stop()), { immediate: true });

    onBeforeUnmount(stop);

    return { top, height };
}
