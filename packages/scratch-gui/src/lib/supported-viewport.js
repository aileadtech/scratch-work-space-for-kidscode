// Smallest viewport width, in CSS pixels, at which the editor's layout (stage,
// block palette, and sprite pane) renders without being clipped or requiring
// horizontal scrolling to reach the stage or sprite controls. Matches the
// narrowest layout observed to render without overflow: a landscape tablet at
// 1024px wide.
const MIN_SUPPORTED_WIDTH = 1024;

/**
 * Helper function to determine if the current viewport is wide enough to use the
 * editor. Desktop, laptop, and tablets in landscape orientation are supported;
 * phones and tablets in portrait orientation are not, since the editor's layout
 * does not reflow below this width and the stage and sprite pane become
 * unreachable without horizontal scrolling.
 * @returns {boolean} False if the viewport is too narrow to use the editor.
 */
const supportedViewport = () => window.innerWidth >= MIN_SUPPORTED_WIDTH;

/**
 * Subscribe to viewport-support changes (e.g. device rotation, or a desktop window
 * resized across the threshold). Backed by matchMedia rather than a `resize`
 * listener: the browser only fires `change` when the query's truth value actually
 * flips, so this does not fire repeatedly while a window is being dragged.
 * @param {function(boolean)} onChange - called with the new supportedViewport()
 * value whenever it changes. Not called immediately with the current value.
 * @returns {function()} unsubscribe function.
 */
const watchSupportedViewport = onChange => {
    const mql = window.matchMedia(`(min-width: ${MIN_SUPPORTED_WIDTH}px)`);
    const listener = event => onChange(event.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
};

export {
    supportedViewport as default,
    watchSupportedViewport,
    MIN_SUPPORTED_WIDTH
};
