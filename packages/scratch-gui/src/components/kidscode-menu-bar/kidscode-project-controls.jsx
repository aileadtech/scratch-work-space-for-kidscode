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

import dropdownCaret from '../menu-bar/dropdown-caret.svg';
import projectIcon from './icon--project.svg';
import saveIcon from './icon--save.svg';
import submitIcon from './icon--submit.svg';

import menuBarStyles from '../menu-bar/menu-bar.css';
import styles from './kidscode-project-controls.css';

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
        defaultMessage: 'This will delete the current draft when project deletion is connected.',
        description: 'Explanation in the Kidscode delete draft confirmation dialog'
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
    }
});

const RenameProjectDialog = ({projectTitle, onCancel, onConfirm}) => {
    const intl = useIntl();
    const [nextTitle, setNextTitle] = useState(projectTitle);
    const trimmedTitle = nextTitle.trim();

    const handleChange = useCallback(event => {
        setNextTitle(event.target.value);
    }, []);
    const handleSubmit = useCallback(event => {
        event.preventDefault();
        if (trimmedTitle) onConfirm(trimmedTitle);
    }, [onConfirm, trimmedTitle]);

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
                    maxLength="100"
                    type="text"
                    value={nextTitle}
                    onChange={handleChange}
                />
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
                        disabled={!trimmedTitle}
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
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired,
    projectTitle: PropTypes.string.isRequired
};

const DeleteDraftDialog = ({onCancel, onConfirm}) => {
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
    onCancel: PropTypes.func.isRequired,
    onConfirm: PropTypes.func.isRequired
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
    projectTitle
}) => {
    const intl = useIntl();
    const [renameOpen, setRenameOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const {
        menuRef,
        isExpanded,
        handleKeyDown,
        handleKeyDownOpenMenu,
        handleOnOpen,
        handleOnClose
    } = useMenuNavigation({depth, isRtl});

    const handleRenameOpen = useCallback(event => {
        event.stopPropagation();
        handleOnClose();
        setRenameOpen(true);
    }, [handleOnClose]);
    const handleRenameCancel = useCallback(() => {
        setRenameOpen(false);
    }, []);
    const handleRenameConfirm = useCallback(title => {
        onRenameProject(title);
        setRenameOpen(false);
    }, [onRenameProject]);
    const handleDeleteOpen = useCallback(event => {
        event.stopPropagation();
        handleOnClose();
        setDeleteOpen(true);
    }, [handleOnClose]);
    const handleDeleteCancel = useCallback(() => {
        setDeleteOpen(false);
    }, []);
    const handleDeleteConfirm = useCallback(() => {
        onDeleteDraft();
        setDeleteOpen(false);
    }, [onDeleteDraft]);
    const handleDuplicate = useCallback(event => {
        event.stopPropagation();
        handleOnClose();
        onDuplicateProject();
    }, [handleOnClose, onDuplicateProject]);
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
                            isDataMenuItem
                            onClick={handleRenameOpen}
                            onParentKeyDown={handleKeyDownOpenMenu}
                        >
                            <FormattedMessage {...messages.rename} />
                        </MenuItem>
                        <MenuItem
                            isDataMenuItem
                            onClick={handleDuplicate}
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
                            className={styles.deleteMenuItem}
                            isDataMenuItem
                            onClick={handleDeleteOpen}
                            onParentKeyDown={handleKeyDownOpenMenu}
                        >
                            <FormattedMessage {...messages.deleteDraft} />
                        </MenuItem>
                    </MenuSection>
                    <MenuSection>
                        <MenuItem
                            isDataMenuItem
                            onClick={handleReturnToLesson}
                            onParentKeyDown={handleKeyDownOpenMenu}
                        >
                            <FormattedMessage {...messages.returnToLesson} />
                        </MenuItem>
                        <MenuItem
                            isDataMenuItem
                            onClick={handleReturnToProjects}
                            onParentKeyDown={handleKeyDownOpenMenu}
                        >
                            <FormattedMessage {...messages.returnToProjects} />
                        </MenuItem>
                    </MenuSection>
                </MenuBarMenu>
            </button>
            {renameOpen && (
                <RenameProjectDialog
                    projectTitle={projectTitle}
                    onCancel={handleRenameCancel}
                    onConfirm={handleRenameConfirm}
                />
            )}
            {deleteOpen && (
                <DeleteDraftDialog
                    onCancel={handleDeleteCancel}
                    onConfirm={handleDeleteConfirm}
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
    projectTitle: PropTypes.string.isRequired
};

const KidscodeProjectActionButtons = ({onSaveProject, onSubmitProject}) => {
    const intl = useIntl();
    return (
        <div className={styles.actionButtons}>
            <button
                aria-label={intl.formatMessage(messages.saveProject)}
                className={classNames(styles.actionButton, styles.saveButton)}
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
            <button
                aria-label={intl.formatMessage(messages.submitProject)}
                className={classNames(styles.actionButton, styles.submitButton)}
                onClick={onSubmitProject}
            >
                <img
                    aria-hidden="true"
                    className={styles.actionIcon}
                    src={submitIcon}
                />
                <span className={styles.actionLabel}>
                    <FormattedMessage {...messages.submit} />
                </span>
            </button>
        </div>
    );
};

KidscodeProjectActionButtons.propTypes = {
    onSaveProject: PropTypes.func.isRequired,
    onSubmitProject: PropTypes.func.isRequired
};

export {
    KidscodeProjectActionButtons,
    KidscodeProjectMenu
};
