import PropTypes from 'prop-types';
import React from 'react';
import {defineMessage, FormattedMessage, useIntl} from 'react-intl';

import backIcon from '../../lib/assets/icon--back.svg';
import styles from './back-to-kidscode-button.css';

const backToKidscodeMessage = defineMessage({
    id: 'kidscode.menuBar.backToKidscode',
    defaultMessage: 'Back to Kidscode',
    description: 'Button in the workspace menu bar that returns the student to the Kidscode dashboard'
});

// Rendered inside MenuBar, which already sits inside GUI's own Redux/Intl tree, so
// this needs no Redux/Intl wrapping of its own (contrast with a component mounted as
// a sibling of the editor -- e.g. ViewportGuard in playground/index.jsx -- which does).
//
// `onBackToKidscode` is provided by the mount site (playground/render-gui.jsx) and
// threaded through GUIComponent -- this component never decides what "back" means, so
// a real navigation handler can be wired in later without touching this file.
//
// The visible label collapses to icon-only at narrow widths (see .back-label in
// back-to-kidscode-button.css), so `aria-label` carries the accessible name at every
// width -- the same pattern MenuBar's own tutorials/debug buttons already use for the
// same reason.
const BackToKidscodeButton = ({onBackToKidscode}) => {
    const intl = useIntl();
    return (
        <button
            aria-label={intl.formatMessage(backToKidscodeMessage)}
            className={styles.backButton}
            onClick={onBackToKidscode}
        >
            <img
                className={styles.backIcon}
                draggable={false}
                src={backIcon}
            />
            <span className={styles.backLabel}>
                <FormattedMessage {...backToKidscodeMessage} />
            </span>
        </button>
    );
};

BackToKidscodeButton.propTypes = {
    onBackToKidscode: PropTypes.func.isRequired
};

export default BackToKidscodeButton;
