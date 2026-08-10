import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useCallback} from 'react';
import ReactModal from 'react-modal';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import Loader from '../loader/loader.jsx';
import Spinner from '../spinner/spinner.jsx';
import {
    KidscodeWorkspaceState,
    KidscodeWorkspaceStates
} from '../../lib/kidscode-workspace-state';

import errorIcon from '../../lib/assets/icon--error.svg';
import successIcon from '../../lib/assets/icon--success.svg';

import styles from './kidscode-workspace-state.css';

const messages = defineMessages({
    unsaved: {
        id: 'kidscode.workspaceState.unsaved',
        defaultMessage: 'Unsaved',
        description: 'Status shown when a Kidscode project has local changes that are not saved'
    },
    saving: {
        id: 'kidscode.workspaceState.saving',
        defaultMessage: 'Saving…',
        description: 'Status shown while a Kidscode project is being saved'
    },
    saved: {
        id: 'kidscode.workspaceState.saved',
        defaultMessage: 'Saved',
        description: 'Status shown after a Kidscode project has been saved'
    },
    saveFailed: {
        id: 'kidscode.workspaceState.saveFailed',
        defaultMessage: 'Save failed',
        description: 'Status shown when a Kidscode project could not be saved'
    },
    connectionLost: {
        id: 'kidscode.workspaceState.connectionLost',
        defaultMessage: 'Connection lost',
        description: 'Status shown when the Kidscode workspace has lost its connection'
    },
    tryAgain: {
        id: 'kidscode.workspaceState.tryAgain',
        defaultMessage: 'Try again',
        description: 'Button to retry the action associated with a Kidscode workspace error'
    },
    sessionExpiredTitle: {
        id: 'kidscode.workspaceState.sessionExpiredTitle',
        defaultMessage: 'Session Expired',
        description: 'Heading shown when a Kidscode workspace session has expired'
    },
    sessionExpiredDescription: {
        id: 'kidscode.workspaceState.sessionExpiredDescription',
        defaultMessage: 'This workspace session has expired. Return to Kidscode and open the project again.',
        description: 'Explanation shown when a Kidscode workspace session has expired'
    },
    sessionExpiredAction: {
        id: 'kidscode.workspaceState.sessionExpiredAction',
        defaultMessage: 'Return to Kidscode',
        description: 'Button shown when a Kidscode workspace session has expired'
    },
    launchConnectionLostTitle: {
        id: 'kidscode.workspaceState.launchConnectionLostTitle',
        defaultMessage: 'Connection Lost',
        description: 'Heading shown when a Kidscode workspace launch cannot connect'
    },
    launchConnectionLostDescription: {
        id: 'kidscode.workspaceState.launchConnectionLostDescription',
        defaultMessage: 'The Workspace could not connect to Kidscode. Check your connection and try again.',
        description: 'Explanation shown when a Kidscode workspace launch cannot connect'
    },
    accessBlockedTitle: {
        id: 'kidscode.workspaceState.accessBlockedTitle',
        defaultMessage: 'Workspace Access Blocked',
        description: 'Heading shown when a Kidscode workspace launch is invalid or denied'
    },
    accessBlockedDescription: {
        id: 'kidscode.workspaceState.accessBlockedDescription',
        defaultMessage: 'This workspace launch is invalid or does not have access to the requested project.',
        description: 'Explanation shown when a Kidscode workspace launch is invalid or denied'
    },
    corruptedProjectTitle: {
        id: 'kidscode.workspaceState.corruptedProjectTitle',
        defaultMessage: 'Project could not be opened',
        description: 'Heading shown when a Kidscode project is corrupted'
    },
    corruptedProjectDescription: {
        id: 'kidscode.workspaceState.corruptedProjectDescription',
        defaultMessage: 'This project could not be opened safely. Your project data has not been changed.',
        description: 'Explanation shown when a Kidscode project is corrupted'
    },
    corruptedProjectAction: {
        id: 'kidscode.workspaceState.corruptedProjectAction',
        defaultMessage: 'Return to My Scratch Projects',
        description: 'Button shown when a Kidscode project is corrupted'
    }
});

const statusMessages = {
    [KidscodeWorkspaceState.UNSAVED]: messages.unsaved,
    [KidscodeWorkspaceState.SAVING]: messages.saving,
    [KidscodeWorkspaceState.SAVED]: messages.saved,
    [KidscodeWorkspaceState.SAVE_FAILED]: messages.saveFailed,
    [KidscodeWorkspaceState.CONNECTION_LOST]: messages.connectionLost
};

const errorStates = [
    KidscodeWorkspaceState.SAVE_FAILED,
    KidscodeWorkspaceState.CONNECTION_LOST
];

const KidscodeWorkspaceStatusIcon = ({workspaceState}) => {
    switch (workspaceState) {
    case KidscodeWorkspaceState.SAVING:
        return <Spinner small />;
    case KidscodeWorkspaceState.SAVED:
        return (
            <img
                aria-hidden="true"
                className={styles.statusIcon}
                src={successIcon}
            />
        );
    case KidscodeWorkspaceState.SAVE_FAILED:
    case KidscodeWorkspaceState.CONNECTION_LOST:
        return (
            <img
                aria-hidden="true"
                className={styles.statusIcon}
                src={errorIcon}
            />
        );
    case KidscodeWorkspaceState.UNSAVED:
        return <span className={styles.unsavedDot} />;
    default:
        return null;
    }
};

KidscodeWorkspaceStatusIcon.propTypes = {
    workspaceState: PropTypes.oneOf(KidscodeWorkspaceStates).isRequired
};

const KidscodeWorkspaceStatus = ({workspaceState, onAction}) => {
    const intl = useIntl();
    const handleAction = useCallback(() => onAction(workspaceState), [onAction, workspaceState]);
    const statusMessage = statusMessages[workspaceState];
    if (!statusMessage) return null;

    const isError = errorStates.includes(workspaceState);

    return (
        <div
            aria-atomic="true"
            aria-live={isError ? null : 'polite'}
            className={classNames(styles.workspaceStatus, {
                [styles.errorStatus]: isError
            })}
            role={isError ? 'alert' : 'status'}
            title={intl.formatMessage(statusMessage)}
        >
            <KidscodeWorkspaceStatusIcon workspaceState={workspaceState} />
            <span className={styles.statusLabel}>
                <FormattedMessage {...statusMessage} />
            </span>
            {isError && onAction && (
                <button
                    aria-label={intl.formatMessage(messages.tryAgain)}
                    className={styles.statusAction}
                    type="button"
                    onClick={handleAction}
                >
                    <FormattedMessage {...messages.tryAgain} />
                </button>
            )}
        </div>
    );
};

KidscodeWorkspaceStatus.propTypes = {
    onAction: PropTypes.func,
    workspaceState: PropTypes.oneOf(KidscodeWorkspaceStates)
};

const blockingStateMessages = {
    [KidscodeWorkspaceState.SESSION_EXPIRED]: {
        title: messages.sessionExpiredTitle,
        description: messages.sessionExpiredDescription,
        action: messages.sessionExpiredAction
    },
    [KidscodeWorkspaceState.LAUNCH_CONNECTION_LOST]: {
        title: messages.launchConnectionLostTitle,
        description: messages.launchConnectionLostDescription,
        action: messages.tryAgain
    },
    [KidscodeWorkspaceState.ACCESS_BLOCKED]: {
        title: messages.accessBlockedTitle,
        description: messages.accessBlockedDescription
    },
    [KidscodeWorkspaceState.CORRUPTED_PROJECT]: {
        title: messages.corruptedProjectTitle,
        description: messages.corruptedProjectDescription,
        action: messages.corruptedProjectAction
    }
};

const KidscodeWorkspaceBlockingState = ({isRtl, workspaceState, onAction}) => {
    const intl = useIntl();
    const handleAction = useCallback(() => onAction(workspaceState), [onAction, workspaceState]);
    if (workspaceState === KidscodeWorkspaceState.LOADING_PROJECT) {
        return <Loader />;
    }

    const stateMessages = blockingStateMessages[workspaceState];
    if (!stateMessages) return null;

    return (
        <ReactModal
            isOpen
            className={styles.blockingDialog}
            contentLabel={intl.formatMessage(stateMessages.title)}
            overlayClassName={styles.blockingOverlay}
            role="alertdialog"
            shouldCloseOnEsc={false}
            shouldCloseOnOverlayClick={false}
        >
            <div
                className={styles.blockingContent}
                dir={isRtl ? 'rtl' : 'ltr'}
            >
                <img
                    aria-hidden="true"
                    className={styles.blockingIcon}
                    src={errorIcon}
                />
                <h2>
                    <FormattedMessage {...stateMessages.title} />
                </h2>
                <p>
                    <FormattedMessage {...stateMessages.description} />
                </p>
                {onAction && stateMessages.action && (
                    <button
                        className={styles.blockingAction}
                        type="button"
                        onClick={handleAction}
                    >
                        <FormattedMessage {...stateMessages.action} />
                    </button>
                )}
            </div>
        </ReactModal>
    );
};

KidscodeWorkspaceBlockingState.propTypes = {
    isRtl: PropTypes.bool,
    onAction: PropTypes.func,
    workspaceState: PropTypes.oneOf(KidscodeWorkspaceStates)
};

export {
    KidscodeWorkspaceBlockingState,
    KidscodeWorkspaceStatus
};
