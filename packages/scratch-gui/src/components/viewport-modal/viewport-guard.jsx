import React, {useEffect, useState} from 'react';

import ViewportModal from './viewport-modal.jsx';
import supportedViewport, {watchSupportedViewport} from '../../lib/supported-viewport.js';

// Renders ViewportModal whenever the viewport is too narrow, and keeps it in sync
// with rotation and window-resize events for the lifetime of the page -- unlike
// the browser-support check (index.jsx), a device's viewport genuinely can change
// after load, and the restriction message explicitly asks the user to rotate or
// resize rather than reload. Renders nothing (not even a hidden node) once the
// viewport is wide enough, so it never sits over, or interferes with, the editor.
const ViewportGuard = () => {
    const [supported, setSupported] = useState(supportedViewport());
    useEffect(() => watchSupportedViewport(setSupported), []);
    return supported ? null : <ViewportModal />;
};

export default ViewportGuard;
