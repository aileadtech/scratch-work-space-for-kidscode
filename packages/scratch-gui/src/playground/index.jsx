// Polyfills
import 'es6-object-assign/auto';
import 'core-js/fn/array/includes';
import 'core-js/fn/promise/finally';
import 'intl'; // For Safari 9

import React from 'react';
import ReactDomClient from 'react-dom/client';

import AppStateHOC from '../lib/app-state-hoc.jsx';
import BrowserModalComponent from '../components/browser-modal/browser-modal.jsx';
import LocalizationHOC from '../lib/localization-hoc.jsx';
import ViewportGuard from '../components/viewport-modal/viewport-guard.jsx';
import supportedBrowser from '../lib/supported-browser';
import supportedViewport, {watchSupportedViewport} from '../lib/supported-viewport';

import styles from './index.css';

const appTarget = document.createElement('div');
document.body.appendChild(appTarget);

if (supportedBrowser()) {
    // ViewportGuard is mounted immediately and stays mounted for the page's
    // lifetime, independently of the editor below -- it watches
    // supported-viewport.js live and shows/hides its "screen too small" message
    // as the window is resized or the device rotated, with no reload needed.
    // AppStateHOC(..., localesOnly) alone only provides the redux Provider, not an
    // IntlProvider -- LocalizationHOC supplies the connected IntlProvider that
    // FormattedMessage needs, reading off the locales-only redux slice.
    const guardTarget = document.createElement('div');
    document.body.appendChild(guardTarget);
    const WrappedViewportGuard = AppStateHOC(LocalizationHOC(ViewportGuard), true /* localesOnly */);
    ReactDomClient.createRoot(guardTarget).render(<WrappedViewportGuard />);

    // index.css's `min-width: 1024px` rule targets `html` and `body` directly (not
    // just the `.app` class below), so it applies before the editor has ever been
    // mounted -- overridden here so the message-only page does not itself report a
    // (harmless, but needless) horizontal overflow. Restored once the real editor
    // mounts and genuinely needs that floor.
    document.documentElement.style.minWidth = '0';
    document.body.style.minWidth = '0';

    // The real editor mounts lazily, the first time the viewport is wide enough
    // (immediately, if it already is) -- and is never unmounted again, even if the
    // viewport later becomes too narrow. Unmounting it would destroy in-progress
    // project state (the VM, sprites, scripts, etc. all live inside it); instead,
    // ViewportGuard's full-viewport overlay simply covers it until the viewport is
    // wide enough again.
    let editorMounted = false;
    const mountEditorOnceSupported = () => {
        if (editorMounted || !supportedViewport()) return;
        editorMounted = true;
        document.documentElement.style.minWidth = '';
        document.body.style.minWidth = '';
        appTarget.className = styles.app;
        // require needed here to avoid importing unsupported browser-crashing code
        // at the top level
        require('./render-gui.jsx').default(appTarget);
    };
    mountEditorOnceSupported();
    watchSupportedViewport(mountEditorOnceSupported);
} else {
    appTarget.className = styles.app;
    BrowserModalComponent.setAppElement(appTarget);
    const WrappedBrowserModalComponent = AppStateHOC(BrowserModalComponent, true /* localesOnly */);
    const handleBack = () => {};
    const root = ReactDomClient.createRoot(appTarget);
    // eslint-disable-next-line react/jsx-no-bind
    root.render(<WrappedBrowserModalComponent onBack={handleBack} />);
}
