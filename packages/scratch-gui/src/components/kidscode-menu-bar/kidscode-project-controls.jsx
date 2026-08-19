import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useCallback, useState} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import SB3Downloader from '../../containers/sb3-downloader.jsx';
import {MenuItem, MenuSection} from '../menu/menu.jsx';
import MenuBarMenu from '../menu-bar/menu-bar-menu.jsx';
import useMenuNavigation from '../../hooks/use-menu-navigation';
import {useKidscodeWorkspaceSession} from '../../contexts/kidscode-workspace-session-context.jsx';

import dropdownCaret from '../menu-bar/dropdown-caret.svg';
import projectIcon from './icon--project.svg';
import saveIcon from './icon--save.svg';
import submitIcon from './icon--submit.svg';

import menuBarStyles from '../menu-bar/menu-bar.css';
import styles from './kidscode-project-controls.css';
import {KidscodeWorkspaceStatus} from './kidscode-workspace-state.jsx';
import {
    KidscodeWorkspaceState,
    KidscodeWorkspaceStates
} from '../../lib/kidscode-workspace-state';
import {
    KIDSCODE_PROJECT_TITLE_MAX_LENGTH,
    KidscodeProjectStatus
} from '../../lib/kidscode-workspace-project-management/kidscode-workspace-project-management-contract';
import {KidscodeReturnDestinationType}
    from '../../lib/kidscode-workspace-navigation/kidscode-workspace-navigation-contract';
import {isKidscodeRealTutorReviewSession} from '../../lib/kidscode-workspace-launch';

const messages = defineMessages({
    projectMenu: {
        id: 'kidscode.menuBar.projectMenu',
        defaultMessage: 'Project menu',
        description: 'Accessibility label for the Kidscode project menu'
    },
    project: {
        id: 'kidscode.menuBar.project',
        defaultMessage: 'Project',
        description: 'Label for the Kidscode project menu'
    },
    rename: {
        id: 'kidscode.menuBar.rename',
        defaultMessage: 'Rename',
        description: 'Menu item and confirmation button for renaming a Kidscode project'
    },
    duplicate: {
        id: 'kidscode.menuBar.duplicate',
        defaultMessage: 'Duplicate',
        description: 'Menu item for duplicating a Kidscode project'
    },
    downloadSb3: {
        id: 'kidscode.menuBar.downloadSb3',
        defaultMessage: 'Download .sb3',
        description: 'Menu item for downloading a Kidscode project as an SB3 file'
    },
    deleteDraft: {
        id: 'kidscode.menuBar.deleteDraft',
        defaultMessage: 'Delete draft',
        description: 'Menu item and confirmation button for deleting a Kidscode project draft'
    },
    returnToLesson: {
        id: 'kidscode.menuBar.returnToLesson',
        defaultMessage: 'Return to lesson',
        description: 'Menu item for returning to the lesson containing a Kidscode project'
    },
    returnToProjects: {
        id: 'kidscode.menuBar.returnToProjects',
        defaultMessage: 'Return to My Scratch Projects',
        description: 'Menu item for returning to the student\'s Kidscode Scratch projects list'
    },
    returnToTutorReview: {
        id: 'kidscode.menuBar.returnToTutorReview',
        defaultMessage: 'Return to Tutor Review',
        description: 'Menu item for returning a tutor to their Kidscode submissions/review queue'
    },
    renameDialogTitle: {
        id: 'kidscode.renameProject.title',
        defaultMessage: 'Rename project',
        description: 'Title of the dialog for renaming a Kidscode project'
    },
    projectTitle: {
        id: 'kidscode.renameProject.projectTitle',
        defaultMessage: 'Project title',
        description: 'Label for the project title field in the Kidscode rename dialog'
    },
    cancel: {
        id: 'kidscode.projectDialog.cancel',
        defaultMessage: 'Cancel',
        description: 'Button for cancelling a Kidscode project dialog'
    },
    deleteDialogTitle: {
        id: 'kidscode.deleteDraft.title',
        defaultMessage: 'Delete draft?',
        description: 'Title of the dialog for confirming deletion of a Kidscode project draft'
    },
    deleteDialogMessage: {
        id: 'kidscode.deleteDraft.message',
        defaultMessage: 'This will permanently delete the current draft. This cannot be undone.',
        description: 'Explanation in the Kidscode delete draft confirmation dialog'
    },
    renameFailed: {
        id: 'kidscode.renameProject.failed',
        defaultMessage: 'Something went wrong renaming this project. Please try again.',
        description: 'Error shown in the Kidscode rename dialog when the rename could not be saved'
    },
    deleteFailed: {
        id: 'kidscode.deleteDraft.failed',
        defaultMessage: 'Something went wrong deleting this draft. Please try again.',
        description: 'Error shown in the Kidscode delete draft dialog when the delete could not be completed'
    },
    duplicateDialogTitle: {
        id: 'kidscode.duplicateProject.title',
        defaultMessage: 'Duplicate project',
        description: 'Title of the dialog shown while a Kidscode project is being duplicated'
    },
    duplicateInProgress: {
        id: 'kidscode.duplicateProject.inProgress',
        defaultMessage: 'Duplicating your project…',
        description: 'Message shown while a Kidscode project is being duplicated'
    },
    duplicateSuccess: {
        id: 'kidscode.duplicateProject.success',
        defaultMessage: 'Your project was duplicated as “{title}”.',
        description: 'Message shown after a Kidscode project has been duplicated, with the new copy\'s title'
    },
    duplicateFailed: {
        id: 'kidscode.duplicateProject.failed',
        defaultMessage: 'Something went wrong duplicating this project. Please try again.',
        description: 'Error shown when a Kidscode project could not be duplicated'
    },
    tryAgain: {
        id: 'kidscode.projectDialog.tryAgain',
        defaultMessage: 'Try again',
        description: 'Button for retrying a failed Kidscode project dialog action'
    },
    ok: {
        id: 'kidscode.projectDialog.ok',
        defaultMessage: 'OK',
        description: 'Button for dismissing a Kidscode project dialog after its action finished'
    },
    save: {
        id: 'kidscode.menuBar.save',
        defaultMessage: 'Save',
        description: 'Button for saving a Kidscode project'
    },
    saveProject: {
        id: 'kidscode.menuBar.saveProject',
        defaultMessage: 'Save project',
        description: 'Accessibility label for the Kidscode save button'
    },
    submit: {
        id: 'kidscode.menuBar.submit',
        defaultMessage: 'Submit',
        description: 'Button for submitting a Kidscode project'
    },
    submitProject: {
        id: 'kidscode.menuBar.submitProject',
        defaultMessage: 'Submit project',
        description: 'Accessibility label for the Kidscode submit button'
    },
    resubmit: {
        id: 'kidscode.menuBar.resubmit',
        defaultMessage: 'Resubmit',
        description: 'Button for resubmitting a Kidscode project after changes were requested'
    },
    resubmitProject: {
        id: 'kidscode.menuBar.resubmitProject',
        defaultMessage: 'Resubmit project',
        description: 'Accessibility label for the Kidscode resubmit button'
    },
    submitted: {
        id: 'kidscode.submission.submitted',
        defaultMessage: 'Submitted',
        description: 'Lifecycle status shown after a Kidscode project is submitted'
    },
    changesRequested: {
        id: 'kidscode.submission.changesRequested',
        defaultMessage: 'Changes requested',
        description: 'Lifecycle status shown when a tutor requests project changes'
    },
    approved: {
        id: 'kidscode.submission.approved',
        defaultMessage: 'Approved',
        description: 'Lifecycle status shown when a tutor approves a project'
    },
    submitting: {
        id: 'kidscode.submission.submitting',
        defaultMessage: 'Submittingâ€¦',
        description: 'Status shown while a Kidscode project submission is in progress'
    },
    submissionFailed: {
        id: 'kidscode.submission.failed',
        defaultMessage: 'Submission failed. Try again.',
        description: 'Error shown when a Kidscode project could not be submitted'
    },
    viewFeedback: {
        id: 'kidscode.submission.viewFeedback',
        defaultMessage: 'View feedback',
        description: 'Button for opening tutor feedback on a Kidscode project'
    },
    feedbackTitle: {
        id: 'kidscode.submission.feedbackTitle',
        defaultMessage: 'Tutor feedback',
        description: 'Title for the dialog showing tutor feedback'
    },
    reviewMode: {
        id: 'kidscode.review.mode',
        defaultMessage: 'Review mode',
        description: 'Status identifying a tutor review Workspace'
    },
    approve: {
        id: 'kidscode.review.approve',
        defaultMessage: 'Approve',
        description: 'Button for approving the exact submitted project under review'
    },
    requestChanges: {
        id: 'kidscode.review.requestChanges',
        defaultMessage: 'Request changes',
        description: 'Button for requesting changes to the exact submitted project under review'
    },
    requestChangesTitle: {
        id: 'kidscode.review.requestChangesTitle',
        defaultMessage: 'Request changes',
        description: 'Title for the tutor feedback dialog'
    },
    feedbackLabel: {
        id: 'kidscode.review.feedbackLabel',
        defaultMessage: 'Feedback for the student',
        description: 'Label for tutor review feedback'
    },
    reviewActionFailed: {
        id: 'kidscode.review.actionFailed',
        defaultMessage: 'The review action failed. Please try again.',
        description: 'Error shown when approval or a change request could not be saved'
    }
});

const RenameProjectDialog = ({projectTitle, hasError, isSubmitting, onCancel, onConfirm}) => {
    const intl = useIntl();
    const [nextTitle, setNextTitle] = useState(projectTitle);
    const trimmedTitle = nextTitle.trim();

    const handleChange = useCallback(event => {
        setNextTitle(event.target.value);
    }, []);
    const handleSubmit = useCallback(event => {
        event.preventDefault();
        if (trimmedTitle && !isSubmitting) onConfirm(trimmedTitle);
    }, [isSubmitting, onConfirm, trimmedTitle]);

    return (
        <Modal
            className={styles.dialog}
            contentLabel={intl.formatMessage(messages.renameDialogTitle)}
            id="kidscodeRenameProject"
            onRequestClose={onCancel}
        >
            <Box
                className={styles.dialogBody}
                element="form"
                onSubmit={handleSubmit}
            >
                <label
                    className={styles.dialogLabel}
                    htmlFor="kidscode-project-title"
                >
                    <FormattedMessage {...messages.projectTitle} />
                </label>
                <input
                    autoFocus
                    aria-label={intl.formatMessage(messages.projectTitle)}
                    className={styles.titleInput}
                    id="kidscode-project-title"
                    maxLength={KIDSCODE_PROJECT_TITLE_MAX_LENGTH}
                    type="text"
                    value={nextTitle}
                    onChange={handleChange}
                />
                {hasError && (
                    <p
                        className={styles.dialogError}
                        role="alert"
                    >
                        <FormattedMessage {...messages.renameFailed} />
                    </p>
                )}
                <Box className={styles.dialogButtons}>
                    <button
                        className={styles.cancelButton}
                        type="button"
                        onClick={onCancel}
                    >
                        <FormattedMessage {...messages.cancel} />
                    </button>
                    <button
                        className={styles.confirmButton}
                        disabled={!trimmedTitle || isSubmitting}
                        type="submit"
                    >
                        <FormattedMessage {...messages.rename} />
                    </button>
                </Box>
            </Box>
        </Modal>
    );
};

RenameProjectDialog.propTypes = {
    hasError: PropTypes.bool,
    isSubmitting: PropTypes.bool,
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    projectTitle: PropTypes.string.isRequired
};

const DeleteDraftDialog = ({hasError, isSubmitting, onCancel, onConfirm}) => {
    const intl = useIntl();
    return (
        <Modal
            className={styles.dialog}
            contentLabel={intl.formatMessage(messages.deleteDialogTitle)}
            id="kidscodeDeleteDraft"
            onRequestClose={onCancel}
        >
            <Box className={styles.dialogBody}>
                <p className={styles.deleteMessage}>
                    <FormattedMessage {...messages.deleteDialogMessage} />
                </p>
                {hasError && (
                    <p
                        className={styles.dialogError}
                        role="alert"
                    >
                        <FormattedMessage {...messages.deleteFailed} />
                    </p>
                )}
                <Box className={styles.dialogButtons}>
                    <button
                        className={styles.cancelButton}
                        type="button"
                        onClick={onCancel}
                    >
                        <FormattedMessage {...messages.cancel} />
                    </button>
                    <button
                        className={classNames(styles.confirmButton, styles.deleteButton)}
                        disabled={isSubmitting}
                        type="button"
                        onClick={onConfirm}
                    >
                        <FormattedMessage {...messages.deleteDraft} />
                    </button>
                </Box>
            </Box>
        </Modal>
    );
};

DeleteDraftDialog.propTypes = {
    hasError: PropTypes.bool,
    isSubmitting: PropTypes.bool,
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired
};

const DuplicateProjectDialog = ({duplicateTitle, hasError, isSubmitting, onCancel, onRetry}) => {
    const intl = useIntl();
    return (
        <Modal
            className={styles.dialog}
            contentLabel={intl.formatMessage(messages.duplicateDialogTitle)}
            id="kidscodeDuplicateProject"
            onRequestClose={onCancel}
        >
            <Box className={styles.dialogBody}>
                {isSubmitting ? (
                    <p className={styles.duplicateMessage}>
                        <FormattedMessage {...messages.duplicateInProgress} />
                    </p>
                ) : hasError ? (
                    <p
                        className={styles.dialogError}
                        role="alert"
                    >
                        <FormattedMessage {...messages.duplicateFailed} />
                    </p>
                ) : (
                    <p className={styles.duplicateMessage}>
                        <FormattedMessage
                            {...messages.duplicateSuccess}
                            values={{title: duplicateTitle}}
                        />
                    </p>
                )}
                <Box className={styles.dialogButtons}>
                    {hasError && (
                        <button
                            className={styles.cancelButton}
                            type="button"
                            onClick={onRetry}
                        >
                            <FormattedMessage {...messages.tryAgain} />
                        </button>
                    )}
                    <button
                        className={styles.confirmButton}
                        disabled={isSubmitting}
                        type="button"
                        onClick={onCancel}
                    >
                        <FormattedMessage {...messages.ok} />
                    </button>
                </Box>
            </Box>
        </Modal>
    );
};

DuplicateProjectDialog.propTypes = {
    duplicateTitle: PropTypes.string,
    hasError: PropTypes.bool,
    isSubmitting: PropTypes.bool,
    onCancel: PropTypes.func.isRequired,
    onRetry: PropTypes.func.isRequired
};

const DownloadProjectMenuItem = ({
    downloadProject,
    getSaveToComputerHandler,
    onClose,
    onParentKeyDown
}) => {
    const handleClick = useCallback(event => {
        event.stopPropagation();
        onClose();
        getSaveToComputerHandler(downloadProject)();
    }, [downloadProject, getSaveToComputerHandler, onClose]);

    return (
        <MenuItem
            isDataMenuItem
            onClick={handleClick}
            onParentKeyDown={onParentKeyDown}
        >
            <FormattedMessage {...messages.downloadSb3} />
        </MenuItem>
    );
};

DownloadProjectMenuItem.propTypes = {
    downloadProject: PropTypes.func.isRequired,
    getSaveToComputerHandler: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onParentKeyDown: PropTypes.func.isRequired
};

const KidscodeProjectMenu = ({
    depth = 1,
    getSaveToComputerHandler,
    isRtl,
    onDeleteDraft,
    onDuplicateProject,
    onRenameProject,
    onReturnToLesson,
    onReturnToMyScratchProjects,
    onReturnToTutorReview,
    projectManagementStatus,
    projectStatus: suppliedProjectStatus,
    projectTitle,
    reviewMode,
    workspaceState
}) => {
    const intl = useIntl();
    const session = useKidscodeWorkspaceSession();
    // No session (e.g. before launch resolves) is treated as a draft rather than locking the
    // menu down, matching every development launch fixture's initial status. A tutor review session
    // has no session.project at all (see kidscode-workspace-launch.js) — session.submission.status
    // is read instead; this only ever matters before suppliedProjectStatus is populated, since
    // reviewMode already locks the menu down regardless of the resulting status value.
    const projectStatus = suppliedProjectStatus ||
        (session && session.project && session.project.status) ||
        (session && session.submission && session.submission.status) ||
        KidscodeProjectStatus.DRAFT;

    const [renameOpen, setRenameOpen] = useState(false);
    const [renameError, setRenameError] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteError, setDeleteError] = useState(false);
    const [duplicateOpen, setDuplicateOpen] = useState(false);
    const [duplicateError, setDuplicateError] = useState(false);
    const [duplicateTitle, setDuplicateTitle] = useState(null);
    const {
        menuRef,
        isExpanded,
        handleKeyDown,
        handleKeyDownOpenMenu,
        handleOnOpen,
        handleOnClose
    } = useMenuNavigation({depth, isRtl});

    const isDeleted = workspaceState === KidscodeWorkspaceState.PROJECT_DELETED || projectManagementStatus.deleted;
    const anyActionInFlight = projectManagementStatus.isRenaming ||
        projectManagementStatus.isDuplicating ||
        projectManagementStatus.isDeleting;
    // Conservative Phase 5 rule (see docs/SHARED-API-CONTRACT.md): rename and delete are only
    // offered for draft projects, since neither has an agreed behaviour for submitted/
    // changes-requested/approved projects yet. Duplicate is offered regardless of status, since it
    // only ever creates a new independent draft copy and leaves the original untouched. All three
    // are unavailable once the project has been deleted or another action is already in flight.
    const canRename = !reviewMode && !isDeleted && !anyActionInFlight &&
        projectStatus === KidscodeProjectStatus.DRAFT;
    const canDuplicate = !reviewMode && !isDeleted && !anyActionInFlight;
    const canDelete = !reviewMode && !isDeleted && !anyActionInFlight &&
        projectStatus === KidscodeProjectStatus.DRAFT;

    const handleRenameOpen = useCallback(event => {
        event.stopPropagation();
        handleOnClose();
        setRenameError(false);
        setRenameOpen(true);
    }, [handleOnClose]);
    const handleRenameCancel = useCallback(() => {
        setRenameOpen(false);
    }, []);
    const handleRenameConfirm = useCallback(title => {
        setRenameError(false);
        Promise.resolve(onRenameProject(title)).then(() => {
            setRenameOpen(false);
        })
            .catch(() => {
                setRenameError(true);
            });
    }, [onRenameProject]);

    const handleDeleteOpen = useCallback(event => {
        event.stopPropagation();
        handleOnClose();
        setDeleteError(false);
        setDeleteOpen(true);
    }, [handleOnClose]);
    const handleDeleteCancel = useCallback(() => {
        setDeleteOpen(false);
    }, []);
    const handleDeleteConfirm = useCallback(() => {
        setDeleteError(false);
        Promise.resolve(onDeleteDraft()).then(() => {
            setDeleteOpen(false);
        })
            .catch(() => {
                setDeleteError(true);
            });
    }, [onDeleteDraft]);

    const startDuplicate = useCallback(() => {
        setDuplicateError(false);
        Promise.resolve(onDuplicateProject()).then(data => {
            setDuplicateTitle(data && data.title);
        })
            .catch(() => {
                setDuplicateError(true);
            });
    }, [onDuplicateProject]);
    const handleDuplicate = useCallback(event => {
        event.stopPropagation();
        handleOnClose();
        setDuplicateTitle(null);
        setDuplicateOpen(true);
        startDuplicate();
    }, [handleOnClose, startDuplicate]);
    const handleDuplicateCancel = useCallback(() => {
        setDuplicateOpen(false);
    }, []);
    const handleDuplicateRetry = useCallback(() => {
        startDuplicate();
    }, [startDuplicate]);

    const handleReturnToLesson = useCallback(event => {
        event.stopPropagation();
        handleOnClose();
        onReturnToLesson();
    }, [handleOnClose, onReturnToLesson]);
    const handleReturnToProjects = useCallback(event => {
        event.stopPropagation();
        handleOnClose();
        onReturnToMyScratchProjects();
    }, [handleOnClose, onReturnToMyScratchProjects]);
    const handleReturnToTutorReview = useCallback(event => {
        event.stopPropagation();
        handleOnClose();
        onReturnToTutorReview();
    }, [handleOnClose, onReturnToTutorReview]);

    // Exactly one destination is ever valid for the current session (see
    // docs/SHARED-API-CONTRACT.md, Workspace Navigation and Recovery), so only the single matching
    // menu item is shown: the Tutor's own review destination in review mode, otherwise whichever
    // destination the validated launch session's return_to.type names. No session (e.g. a moment
    // before launch resolves) means no known destination yet, so no item renders rather than
    // guessing one.
    const returnDestinationType = session && session.return_to && session.return_to.type;

    return (
        <React.Fragment>
            <button
                aria-expanded={isExpanded()}
                aria-label={intl.formatMessage(messages.projectMenu)}
                className={classNames(menuBarStyles.menuBarItem, menuBarStyles.hoverable, {
                    [menuBarStyles.active]: isExpanded()
                })}
                onClick={handleOnOpen}
                onKeyDown={handleKeyDown}
                ref={menuRef}
            >
                <img src={projectIcon} />
                <span className={styles.projectLabel}>
                    <FormattedMessage {...messages.project} />
                </span>
                <img src={dropdownCaret} />
                <MenuBarMenu
                    className={menuBarStyles.menuBarMenu}
                    open={isExpanded()}
                    place={isRtl ? 'left' : 'right'}
                    onRequestClose={handleOnClose}
                >
                    <MenuSection>
                        <MenuItem
                            className={classNames({[styles.disabledMenuItem]: !canRename})}
                            isDataMenuItem
                            isDisabled={!canRename}
                            onClick={canRename ? handleRenameOpen : null}
                            onParentKeyDown={handleKeyDownOpenMenu}
                        >
                            <FormattedMessage {...messages.rename} />
                        </MenuItem>
                        <MenuItem
                            className={classNames({[styles.disabledMenuItem]: !canDuplicate})}
                            isDataMenuItem
                            isDisabled={!canDuplicate}
                            onClick={canDuplicate ? handleDuplicate : null}
                            onParentKeyDown={handleKeyDownOpenMenu}
                        >
                            <FormattedMessage {...messages.duplicate} />
                        </MenuItem>
                        <SB3Downloader>{(className, downloadProject) => (
                            <DownloadProjectMenuItem
                                downloadProject={downloadProject}
                                getSaveToComputerHandler={getSaveToComputerHandler}
                                onClose={handleOnClose}
                                onParentKeyDown={handleKeyDownOpenMenu}
                            />
                        )}</SB3Downloader>
                        <MenuItem
                            className={classNames(styles.deleteMenuItem, {[styles.disabledMenuItem]: !canDelete})}
                            isDataMenuItem
                            isDisabled={!canDelete}
                            onClick={canDelete ? handleDeleteOpen : null}
                            onParentKeyDown={handleKeyDownOpenMenu}
                        >
                            <FormattedMessage {...messages.deleteDraft} />
                        </MenuItem>
                    </MenuSection>
                    <MenuSection>
                        {reviewMode ? (
                            <MenuItem
                                isDataMenuItem
                                onClick={handleReturnToTutorReview}
                                onParentKeyDown={handleKeyDownOpenMenu}
                            >
                                <FormattedMessage {...messages.returnToTutorReview} />
                            </MenuItem>
                        ) : returnDestinationType === KidscodeReturnDestinationType.LESSON ? (
                            <MenuItem
                                isDataMenuItem
                                onClick={handleReturnToLesson}
                                onParentKeyDown={handleKeyDownOpenMenu}
                            >
                                <FormattedMessage {...messages.returnToLesson} />
                            </MenuItem>
                        ) : returnDestinationType === KidscodeReturnDestinationType.PROJECTS ? (
                            <MenuItem
                                isDataMenuItem
                                onClick={handleReturnToProjects}
                                onParentKeyDown={handleKeyDownOpenMenu}
                            >
                                <FormattedMessage {...messages.returnToProjects} />
                            </MenuItem>
                        ) : null}
                    </MenuSection>
                </MenuBarMenu>
            </button>
            {renameOpen && (
                <RenameProjectDialog
                    hasError={renameError}
                    isSubmitting={projectManagementStatus.isRenaming}
                    projectTitle={projectTitle}
                    onCancel={handleRenameCancel}
                    onConfirm={handleRenameConfirm}
                />
            )}
            {deleteOpen && (
                <DeleteDraftDialog
                    hasError={deleteError}
                    isSubmitting={projectManagementStatus.isDeleting}
                    onCancel={handleDeleteCancel}
                    onConfirm={handleDeleteConfirm}
                />
            )}
            {duplicateOpen && (
                <DuplicateProjectDialog
                    duplicateTitle={duplicateTitle}
                    hasError={duplicateError}
                    isSubmitting={projectManagementStatus.isDuplicating}
                    onCancel={handleDuplicateCancel}
                    onRetry={handleDuplicateRetry}
                />
            )}
        </React.Fragment>
    );
};

KidscodeProjectMenu.propTypes = {
    depth: PropTypes.number,
    getSaveToComputerHandler: PropTypes.func.isRequired,
    isRtl: PropTypes.bool,
    onDeleteDraft: PropTypes.func.isRequired,
    onDuplicateProject: PropTypes.func.isRequired,
    onRenameProject: PropTypes.func.isRequired,
    onReturnToLesson: PropTypes.func.isRequired,
    onReturnToMyScratchProjects: PropTypes.func.isRequired,
    onReturnToTutorReview: PropTypes.func.isRequired,
    projectManagementStatus: PropTypes.shape({
        isRenaming: PropTypes.bool,
        isDuplicating: PropTypes.bool,
        isDeleting: PropTypes.bool,
        deleted: PropTypes.bool
    }),
    projectStatus: PropTypes.oneOf(Object.values(KidscodeProjectStatus)),
    projectTitle: PropTypes.string.isRequired,
    reviewMode: PropTypes.bool,
    workspaceState: PropTypes.oneOf(KidscodeWorkspaceStates)
};

KidscodeProjectMenu.defaultProps = {
    projectManagementStatus: {
        isRenaming: false,
        isDuplicating: false,
        isDeleting: false,
        deleted: false
    },
    reviewMode: false
};

const FeedbackDialog = ({feedback, onClose}) => {
    const intl = useIntl();
    return (
        <Modal
            className={styles.dialog}
            contentLabel={intl.formatMessage(messages.feedbackTitle)}
            id="kidscodeTutorFeedback"
            onRequestClose={onClose}
        >
            <Box className={styles.dialogBody}>
                <p className={styles.feedbackMessage}>{feedback}</p>
                <div className={styles.dialogButtons}>
                    <button
                        type="button"
                        onClick={onClose}
                    >
                        <FormattedMessage {...messages.ok} />
                    </button>
                </div>
            </Box>
        </Modal>
    );
};

FeedbackDialog.propTypes = {
    feedback: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired
};

const RequestChangesDialog = ({hasError, isSubmitting, onCancel, onConfirm}) => {
    const intl = useIntl();
    const [feedback, setFeedback] = useState('');
    const trimmedFeedback = feedback.trim();
    const handleFeedbackChange = useCallback(event => {
        setFeedback(event.target.value);
    }, []);
    const handleSubmit = useCallback(event => {
        event.preventDefault();
        if (trimmedFeedback && !isSubmitting) onConfirm(trimmedFeedback);
    }, [isSubmitting, onConfirm, trimmedFeedback]);
    return (
        <Modal
            className={styles.dialog}
            contentLabel={intl.formatMessage(messages.requestChangesTitle)}
            id="kidscodeRequestChanges"
            onRequestClose={onCancel}
        >
            <Box className={styles.dialogBody}>
                <form onSubmit={handleSubmit}>
                    <label
                        className={styles.dialogLabel}
                        htmlFor="kidscode-review-feedback"
                    >
                        <FormattedMessage {...messages.feedbackLabel} />
                    </label>
                    <textarea
                        className={styles.feedbackInput}
                        disabled={isSubmitting}
                        id="kidscode-review-feedback"
                        rows={5}
                        value={feedback}
                        onChange={handleFeedbackChange}
                    />
                    {hasError && <p
                        className={styles.dialogError}
                        role="alert"
                    >
                        <FormattedMessage {...messages.reviewActionFailed} />
                    </p>}
                    <div className={styles.dialogButtons}>
                        <button
                            disabled={isSubmitting}
                            type="button"
                            onClick={onCancel}
                        >
                            <FormattedMessage {...messages.cancel} />
                        </button>
                        <button
                            className={styles.confirmButton}
                            disabled={!trimmedFeedback || isSubmitting}
                            type="submit"
                        >
                            <FormattedMessage {...messages.requestChanges} />
                        </button>
                    </div>
                </form>
            </Box>
        </Modal>
    );
};

RequestChangesDialog.propTypes = {
    hasError: PropTypes.bool,
    isSubmitting: PropTypes.bool,
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired
};

const initialSubmissionReviewStatus = {
    isSubmitting: false,
    submissionFailed: false,
    isApproving: false,
    isRequestingChanges: false,
    reviewActionFailed: false
};

const KidscodeProjectActionButtons = ({
    onApproveSubmission,
    onRequestChanges,
    onSaveProject,
    onSubmitProject,
    onWorkspaceStateAction,
    projectReadOnly,
    projectStatus,
    reviewFeedback,
    reviewMode,
    submissionReviewStatus,
    workspaceState
}) => {
    const intl = useIntl();
    // Approve/Request Changes exist only for the development-fixture review shape (local testing —
    // the development adapter implements them); the real backend keeps both exclusively on the
    // tutor's Sanctum-authenticated Kidscode frontend routes, so a real tutor review session must
    // never render controls for actions the Workspace has no credential to ever perform.
    const isRealTutorReview = isKidscodeRealTutorReviewSession(useKidscodeWorkspaceSession());
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [requestChangesOpen, setRequestChangesOpen] = useState(false);
    const [requestChangesError, setRequestChangesError] = useState(false);
    const lifecycleMessage = projectStatus === KidscodeProjectStatus.SUBMITTED ? messages.submitted :
        (projectStatus === KidscodeProjectStatus.CHANGES_REQUESTED ? messages.changesRequested :
            (projectStatus === KidscodeProjectStatus.APPROVED ? messages.approved : null));
    const canSubmit = !reviewMode && [
        KidscodeProjectStatus.DRAFT,
        KidscodeProjectStatus.CHANGES_REQUESTED
    ].includes(projectStatus);
    const submitMessage = projectStatus === KidscodeProjectStatus.CHANGES_REQUESTED ?
        messages.resubmit : messages.submit;
    const submitAriaMessage = projectStatus === KidscodeProjectStatus.CHANGES_REQUESTED ?
        messages.resubmitProject : messages.submitProject;
    const handleRequestChanges = useCallback(feedback => {
        setRequestChangesError(false);
        Promise.resolve(onRequestChanges(feedback)).then(() => {
            setRequestChangesOpen(false);
        })
            .catch(() => setRequestChangesError(true));
    }, [onRequestChanges]);
    const handleFeedbackOpen = useCallback(() => setFeedbackOpen(true), []);
    const handleFeedbackClose = useCallback(() => setFeedbackOpen(false), []);
    const handleRequestChangesOpen = useCallback(() => {
        setRequestChangesError(false);
        setRequestChangesOpen(true);
    }, []);
    const handleRequestChangesCancel = useCallback(() => setRequestChangesOpen(false), []);
    const handleSubmitProject = useCallback(() => {
        Promise.resolve(onSubmitProject()).catch(() => {});
    }, [onSubmitProject]);
    const handleApproveSubmission = useCallback(() => {
        Promise.resolve(onApproveSubmission()).catch(() => {});
    }, [onApproveSubmission]);
    return (
        <React.Fragment>
            <div className={styles.actionButtons}>
                {!reviewMode && (
                    <button
                        aria-label={intl.formatMessage(messages.saveProject)}
                        className={classNames(styles.actionButton, styles.saveButton)}
                        disabled={projectReadOnly || workspaceState === KidscodeWorkspaceState.SAVING}
                        onClick={onSaveProject}
                    >
                        <img
                            aria-hidden="true"
                            className={styles.actionIcon}
                            src={saveIcon}
                        />
                        <span className={styles.actionLabel}>
                            <FormattedMessage {...messages.save} />
                        </span>
                    </button>
                )}
                {!projectReadOnly && <KidscodeWorkspaceStatus
                    workspaceState={workspaceState}
                    onAction={onWorkspaceStateAction}
                />}
                {reviewMode && <span
                    className={styles.lifecycleStatus}
                    role="status"
                >
                    <FormattedMessage {...messages.reviewMode} />
                </span>}
                {lifecycleMessage && <span
                    className={styles.lifecycleStatus}
                    role="status"
                >
                    <FormattedMessage {...lifecycleMessage} />
                </span>}
                {!reviewMode && reviewFeedback && projectStatus === KidscodeProjectStatus.CHANGES_REQUESTED && (
                    <button
                        className={classNames(styles.actionButton, styles.saveButton)}
                        type="button"
                        onClick={handleFeedbackOpen}
                    >
                        <span className={styles.actionLabel}>
                            <FormattedMessage {...messages.viewFeedback} />
                        </span>
                    </button>
                )}
                {submissionReviewStatus.submissionFailed && <span
                    className={styles.actionError}
                    role="alert"
                >
                    <FormattedMessage {...messages.submissionFailed} />
                </span>}
                {reviewMode && submissionReviewStatus.reviewActionFailed && !requestChangesOpen && <span
                    className={styles.actionError}
                    role="alert"
                >
                    <FormattedMessage {...messages.reviewActionFailed} />
                </span>}
                {canSubmit && (
                    <button
                        aria-label={intl.formatMessage(submitAriaMessage)}
                        className={classNames(styles.actionButton, styles.submitButton)}
                        disabled={submissionReviewStatus.isSubmitting}
                        onClick={handleSubmitProject}
                    >
                        <img
                            aria-hidden="true"
                            className={styles.actionIcon}
                            src={submitIcon}
                        />
                        <span className={styles.actionLabel}>
                            <FormattedMessage
                                {...(submissionReviewStatus.isSubmitting ? messages.submitting : submitMessage)}
                            />
                        </span>
                    </button>
                )}
                {reviewMode && !isRealTutorReview && projectStatus === KidscodeProjectStatus.SUBMITTED && (
                    <React.Fragment>
                        <button
                            aria-label={intl.formatMessage(messages.requestChanges)}
                            className={classNames(styles.actionButton, styles.saveButton)}
                            disabled={submissionReviewStatus.isApproving || submissionReviewStatus.isRequestingChanges}
                            type="button"
                            onClick={handleRequestChangesOpen}
                        >
                            <span className={styles.actionLabel}>
                                <FormattedMessage {...messages.requestChanges} />
                            </span>
                        </button>
                        <button
                            aria-label={intl.formatMessage(messages.approve)}
                            className={classNames(styles.actionButton, styles.submitButton)}
                            disabled={submissionReviewStatus.isApproving || submissionReviewStatus.isRequestingChanges}
                            type="button"
                            onClick={handleApproveSubmission}
                        >
                            <span className={styles.actionLabel}>
                                <FormattedMessage {...messages.approve} />
                            </span>
                        </button>
                    </React.Fragment>
                )}
            </div>
            {feedbackOpen && <FeedbackDialog
                feedback={reviewFeedback}
                onClose={handleFeedbackClose}
            />}
            {requestChangesOpen && (
                <RequestChangesDialog
                    hasError={requestChangesError || submissionReviewStatus.reviewActionFailed}
                    isSubmitting={submissionReviewStatus.isRequestingChanges}
                    onCancel={handleRequestChangesCancel}
                    onConfirm={handleRequestChanges}
                />
            )}
        </React.Fragment>
    );
};

KidscodeProjectActionButtons.propTypes = {
    onApproveSubmission: PropTypes.func,
    onRequestChanges: PropTypes.func,
    onSaveProject: PropTypes.func.isRequired,
    onSubmitProject: PropTypes.func.isRequired,
    onWorkspaceStateAction: PropTypes.func,
    projectReadOnly: PropTypes.bool,
    projectStatus: PropTypes.oneOf(Object.values(KidscodeProjectStatus)),
    reviewFeedback: PropTypes.string,
    reviewMode: PropTypes.bool,
    submissionReviewStatus: PropTypes.shape({
        isSubmitting: PropTypes.bool,
        submissionFailed: PropTypes.bool,
        isApproving: PropTypes.bool,
        isRequestingChanges: PropTypes.bool,
        reviewActionFailed: PropTypes.bool
    }),
    workspaceState: PropTypes.oneOf(KidscodeWorkspaceStates)
};

KidscodeProjectActionButtons.defaultProps = {
    onApproveSubmission: () => {},
    onRequestChanges: () => Promise.resolve(),
    projectReadOnly: false,
    projectStatus: KidscodeProjectStatus.DRAFT,
    reviewFeedback: null,
    reviewMode: false,
    submissionReviewStatus: initialSubmissionReviewStatus
};

export {
    KidscodeProjectActionButtons,
    KidscodeProjectMenu
};
