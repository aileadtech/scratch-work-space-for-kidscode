import React, {useEffect, useRef} from 'react';
import Box from '../box/box.jsx';
import {FormattedMessage} from 'react-intl';

import styles from './viewport-modal.css';

// Shown instead of the editor when the viewport is too narrow to use it (see
// ../../lib/supported-viewport.js). Unlike browser-modal, this is not a
// react-modal overlay: there is no usable editor underneath to dismiss back to
// on initial load -- though it can also appear later, covering an already-loaded
// editor, if the window is resized or the device rotated (see viewport-guard.jsx).
// role="alert" + the focus move below announce that transition to screen readers
// and keyboard users, who would otherwise have no indication the view changed.
const ViewportModal = () => {
    const headingRef = useRef(null);
    useEffect(() => {
        headingRef.current?.focus();
    }, []);
    return (
        <Box
            className={styles.body}
            role="alert"
        >
            <h2
                ref={headingRef}
                tabIndex={-1}
            >
                <FormattedMessage
                    defaultMessage="Screen too small"
                    description="Heading shown when the browser window is too narrow to use the editor"
                    id="gui.unsupportedViewport.label"
                />
            </h2>
            <p>
                <FormattedMessage
                    defaultMessage="The Scratch Workspace is designed for a desktop, a laptop, or a tablet in
                        landscape mode. Please rotate your device or switch to a larger screen to continue."
                    description="Explanation shown when the browser window is too narrow to use the editor"
                    id="gui.unsupportedViewport.description"
                />
            </p>
        </Box>
    );
};

export default ViewportModal;
