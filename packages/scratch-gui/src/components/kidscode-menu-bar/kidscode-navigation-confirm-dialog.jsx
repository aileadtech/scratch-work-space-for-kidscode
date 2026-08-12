import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import Spinner from '../spinner/spinner.jsx';

import styles from './kidscode-project-controls.css';

const messages = defineMessages({
    title: {
        id: 'kidscode.navigation.confirmTitle',
        defaultMessage: 'Leave Workspace?',
        description: 'Title of the dialog asking whether to leave the Workspace with work that is not safely saved'
    },
    unsavedMessage: {
        id: 'kidscode.navigation.unsavedMessage',
        defaultMessage: 'You have changes that have not been saved yet. Save your project before you leave so ' +
            'you don’t lose your work.',
        description: 'Explanation shown when leaving the Workspace with unsaved changes'
    },
    savingMessage: {
        id: 'kidscode.navigation.savingMessage',
        defaultMessage: 'Your project is still saving. Please wait a moment.',
        description: 'Explanation shown when leaving the Workspace while a save is in progress'
    },
    saveFailedMessage: {
        id: 'kidscode.navigation.saveFailedMessage',
        defaultMessage: 'Your last save did not work. Try saving again before you leave, or you could lose your ' +
            'recent changes.',
        description: 'Explanation shown when leaving the Workspace after a save failed'
    },
    saveAndLeave: {
        id: 'kidscode.navigation.saveAndLeave',
        defaultMessage: 'Save and Leave',
        description: 'Button that saves the current project and then leaves the Workspace'
    },
    stay: {
        id: 'kidscode.navigation.stay',
        defaultMessage: 'Stay',
        description: 'Button that cancels leaving the Workspace and stays on the current project'
    },
    leaveWithoutSaving: {
        id: 'kidscode.navigation.leaveWithoutSaving',
        defaultMessage: 'Leave without saving',
        description: 'Destructive button that leaves the Workspace without saving recent changes'
    }
});

const reasonMessages = {
    saveFailed: messages.saveFailedMessage,
    saving: messages.savingMessage,
    unsaved: messages.unsavedMessage
};

const KidscodeNavigationConfirmDialog = ({reason, onLeaveWithoutSaving, onSaveAndLeave, onStay}) => {
    const intl = useIntl();
    const isSaving = reason === 'saving';

    return (
        <Modal
            className={styles.dialog}
            contentLabel={intl.formatMessage(messages.title)}
            id="kidscodeNavigationConfirm"
            onRequestClose={onStay}
        >
            <Box className={styles.dialogBody}>
                <p className={styles.deleteMessage}>
                    <FormattedMessage {...reasonMessages[reason]} />
                </p>
                <Box className={styles.dialogButtons}>
                    {!isSaving && (
                        <button
                            className={classNames(styles.confirmButton, styles.deleteButton)}
                            type="button"
                            onClick={onLeaveWithoutSaving}
                        >
                            <FormattedMessage {...messages.leaveWithoutSaving} />
                        </button>
                    )}
                    <button
                        className={styles.cancelButton}
                        type="button"
                        onClick={onStay}
                    >
                        <FormattedMessage {...messages.stay} />
                    </button>
                    <button
                        className={styles.confirmButton}
                        disabled={isSaving}
                        type="button"
                        onClick={onSaveAndLeave}
                    >
                        {isSaving && <Spinner small />}
                        <FormattedMessage {...messages.saveAndLeave} />
                    </button>
                </Box>
            </Box>
        </Modal>
    );
};

KidscodeNavigationConfirmDialog.propTypes = {
    onLeaveWithoutSaving: PropTypes.func.isRequired,
    onSaveAndLeave: PropTypes.func.isRequired,
    onStay: PropTypes.func.isRequired,
    reason: PropTypes.oneOf(['unsaved', 'saving', 'saveFailed']).isRequired
};

export default KidscodeNavigationConfirmDialog;
