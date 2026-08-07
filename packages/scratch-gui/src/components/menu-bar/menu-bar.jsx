import classNames from 'classnames';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {defineMessages, FormattedMessage, injectIntl} from 'react-intl';
import intlShape from '../../lib/intlShape.js';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import bowser from 'bowser';
import React from 'react';

import VM from '@scratch/scratch-vm';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import CommunityButton from './community-button.jsx';
import ShareButton from './share-button.jsx';
import {ComingSoonTooltip} from '../coming-soon/coming-soon.jsx';
import Divider from '../divider/divider.jsx';
import SaveStatus from './save-status.jsx';
import ProjectWatcher from '../../containers/project-watcher.jsx';
import ProjectTitleInput from './project-title-input.jsx';
import AuthorInfo from './author-info.jsx';
import LoginDropdown from './login-dropdown.jsx';
import MenuBarHOC from '../../containers/menu-bar-hoc.jsx';
import SettingsMenu from './settings-menu.jsx';
import FileMenu from './file-menu.jsx';
import EditMenu from './edit-menu.jsx';
import ModeMenu from './mode-menu.jsx';
import AboutMenu from './about-menu.jsx';

import {openTipsLibrary, openDebugModal} from '../../reducers/modals';
import {setPlayer} from '../../reducers/mode';
import {
    isTimeTravel220022BC,
    isTimeTravel1920,
    isTimeTravel1990,
    isTimeTravel2020,
    isTimeTravelNow,
    setTimeTravel
} from '../../reducers/time-travel';
import {
    autoUpdateProject,
    getIsUpdating,
    getIsShowingProject,
    requestNewProject,
    manualUpdateProject,
    remixProject
} from '../../reducers/project-state';
import {
    openLoginMenu,
    closeLoginMenu,
    loginMenuOpen
} from '../../reducers/menus';
import {setProjectTitle} from '../../reducers/project-title';

import collectMetadata from '../../lib/collect-metadata';
import {PLATFORM} from '../../lib/platform';

import styles from './menu-bar.css';

import helpIcon from '../../lib/assets/icon--tutorials.svg';
import mystuffIcon from './icon--mystuff.png';
import profileIcon from './icon--profile.png';
import remixIcon from './icon--remix.svg';
import dropdownCaret from './dropdown-caret.svg';
import debugIcon from '../debug-modal/icons/icon--debug.svg';

import scratchLogo from './scratch-logo.svg';
import scratchLogoAndroid from './scratch-logo-android.svg';
import ninetiesLogo from './nineties_logo.svg';
import catLogo from './cat_logo.svg';
import prehistoricLogo from './prehistoric-logo.svg';
import oldtimeyLogo from './oldtimey-logo.svg';
import kidscodeLogo from '../kidscode-menu-bar/kidscode-logo.png';

import sharedMessages from '../../lib/shared-messages';

import {AccountMenuOptionsPropTypes} from '../../lib/account-menu-options';
import AccountMenu from './account-menu.jsx';

import BackToKidscodeButton from '../kidscode-menu-bar/back-to-kidscode-button.jsx';
import {
    KidscodeProjectActionButtons,
    KidscodeProjectMenu
} from '../kidscode-menu-bar/kidscode-project-controls.jsx';
import KidscodeProjectTitle from '../kidscode-menu-bar/kidscode-project-title.jsx';
import KidscodeStudentIndicator from '../kidscode-menu-bar/kidscode-student-indicator.jsx';
import {
    KidscodeWorkspaceStates,
    resolveKidscodeWorkspaceState
} from '../../lib/kidscode-workspace-state';

const ariaMessages = defineMessages({
    tutorials: {
        id: 'gui.menuBar.tutorialsLibrary',
        defaultMessage: 'Tutorials',
        description: 'accessibility text for the tutorials button'
    },
    debug: {
        id: 'gui.menuBar.debug',
        defaultMessage: 'Debug',
        description: 'accessibility text for the debug button'
    },
    home: {
        id: 'gui.menuBar.home',
        defaultMessage: 'Home',
        description: 'accessibility text for the home button'
    },
    myStuff: {
        id: 'gui.menuBar.myStuff',
        defaultMessage: 'My Stuff',
        description: 'accessibility text for the my stuff button'
    }
});

const getScratchLogo = platform => (platform === PLATFORM.ANDROID ? scratchLogoAndroid : scratchLogo);

const MenuBarItemTooltip = ({
    children,
    className,
    enable,
    id,
    place = 'bottom'
}) => {
    if (enable) {
        return (
            <React.Fragment>
                {children}
            </React.Fragment>
        );
    }
    return (
        <ComingSoonTooltip
            className={classNames(styles.comingSoon, className)}
            place={place}
            tooltipClassName={styles.comingSoonTooltip}
            tooltipId={id}
        >
            {children}
        </ComingSoonTooltip>
    );
};

MenuBarItemTooltip.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    enable: PropTypes.bool,
    id: PropTypes.string,
    place: PropTypes.oneOf(['top', 'bottom', 'left', 'right'])
};

const MenuItemTooltip = ({id, isRtl, children, className}) => (
    <ComingSoonTooltip
        className={classNames(styles.comingSoon, className)}
        isRtl={isRtl}
        place={isRtl ? 'left' : 'right'}
        tooltipClassName={styles.comingSoonTooltip}
        tooltipId={id}
    >
        {children}
    </ComingSoonTooltip>
);

MenuItemTooltip.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string,
    id: PropTypes.string,
    isRtl: PropTypes.bool
};

class MenuBar extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClickNew',
            'handleClickSeeCommunity',
            'handleClickShare',
            'handleRenameProject',
            'handleSetMode',
            'handleKeyPress',
            'handleRestoreOption',
            'getSaveToComputerHandler',
            'restoreOptionMessage'
        ]);
    }
    componentDidMount () {
        document.addEventListener('keydown', this.handleKeyPress);
    }
    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyPress);
    }
    handleClickNew () {
        // if the project is dirty, and user owns the project, we will autosave.
        // but if they are not logged in and can't save, user should consider
        // downloading or logging in first.
        // Note that if user is logged in and editing someone else's project,
        // they'll lose their work.
        const readyToReplaceProject = this.props.confirmReadyToReplaceProject(
            this.props.intl.formatMessage(sharedMessages.replaceProjectWarning)
        );
        if (readyToReplaceProject) {
            this.props.onClickNew(this.props.canSave && this.props.canCreateNew);
        }
    }
    handleClickSeeCommunity (waitForUpdate) {
        if (this.props.shouldSaveBeforeTransition()) {
            this.props.autoUpdateProject(); // save before transitioning to project page
            waitForUpdate({
                isSaving: true
            }); // queue the transition to project page
        } else {
            waitForUpdate(); // immediately transition to project page
        }
    }
    handleClickShare (waitForUpdate) {
        if (!this.props.isShared) {
            if (this.props.canShare) { // save before transitioning to project page
                this.props.onShare();
            }
            if (this.props.canSave) { // save before transitioning to project page
                this.props.autoUpdateProject();
                waitForUpdate({
                    isSaving: true,
                    isSharing: true
                }); // queue the transition to project page
            }
        }
    }
    handleSetMode (mode) {
        return () => {
            // Turn on/off filters for modes.
            if (mode === '1920') {
                document.documentElement.style.filter = 'brightness(.9)contrast(.8)sepia(1.0)';
                document.documentElement.style.height = '100%';
            } else if (mode === '1990') {
                document.documentElement.style.filter = 'hue-rotate(40deg)';
                document.documentElement.style.height = '100%';
            } else {
                document.documentElement.style.filter = '';
                document.documentElement.style.height = '';
            }

            // Change the Scratch logo for modes without replacing Kidscode branding.
            if (!this.props.kidscodeProjectTitle) {
                if (mode === '1990') {
                    document.getElementById('logo_img').src = ninetiesLogo;
                } else if (mode === '2020') {
                    document.getElementById('logo_img').src = catLogo;
                } else if (mode === '1920') {
                    document.getElementById('logo_img').src = oldtimeyLogo;
                } else if (mode === '220022BC') {
                    document.getElementById('logo_img').src = prehistoricLogo;
                } else {
                    document.getElementById('logo_img').src = getScratchLogo(this.props.platform);
                }
            }

            this.props.onSetTimeTravelMode(mode);
        };
    }
    handleRenameProject (title) {
        this.props.onSetProjectTitle(title);
        this.props.onRenameProject(title);
    }
    handleRestoreOption (restoreFun) {
        return () => {
            restoreFun();
        };
    }
    handleKeyPress (event) {
        const modifier = bowser.mac ? event.metaKey : event.ctrlKey;
        if (modifier && event.key === 's') {
            if (this.props.kidscodeProjectTitle) {
                this.props.onSaveProject();
            } else {
                this.props.onClickSave();
            }
            event.preventDefault();
        }
    }
    getSaveToComputerHandler (downloadProjectCallback) {
        return () => {
            downloadProjectCallback();
            if (this.props.onProjectTelemetryEvent) {
                const metadata = collectMetadata(this.props.vm, this.props.projectTitle, this.props.locale);
                this.props.onProjectTelemetryEvent('projectDidSave', metadata);
            }
        };
    }
    restoreOptionMessage (deletedItem) {
        switch (deletedItem) {
        case 'Sprite':
            return (<FormattedMessage
                defaultMessage="Restore Sprite"
                description="Menu bar item for restoring the last deleted sprite."
                id="gui.menuBar.restoreSprite"
            />);
        case 'Sound':
            return (<FormattedMessage
                defaultMessage="Restore Sound"
                description="Menu bar item for restoring the last deleted sound."
                id="gui.menuBar.restoreSound"
            />);
        case 'Costume':
            return (<FormattedMessage
                defaultMessage="Restore Costume"
                description="Menu bar item for restoring the last deleted costume."
                id="gui.menuBar.restoreCostume"
            />);
        default: {
            return (<FormattedMessage
                defaultMessage="Restore"
                description="Menu bar item for restoring the last deleted item in its disabled state." /* eslint-disable-line @stylistic/max-len */
                id="gui.menuBar.restore"
            />);
        }
        }
    }
    render () {
        const remixMessage = (
            <FormattedMessage
                defaultMessage="Remix"
                description="Menu bar item for remixing"
                id="gui.menuBar.remix"
            />
        );
        const remixButton = (
            <Button
                className={classNames(
                    styles.menuBarButton,
                    styles.remixButton
                )}
                iconClassName={styles.remixButtonIcon}
                iconSrc={remixIcon}
                onClick={this.props.onClickRemix}
            >
                {remixMessage}
            </Button>
        );

        const menuOpts = this.props.accountMenuOptions;

        return (
            <Box
                className={classNames(
                    this.props.className,
                    styles.menuBar,
                    {[styles.kidscode]: this.props.kidscodeProjectTitle}
                )}
                aria-label={this.props.ariaLabel}
                role={this.props.ariaRole}
                element="header"
            >
                <div className={styles.mainMenu}>
                    <div className={styles.fileGroup}>
                        {this.props.onBackToKidscode && (
                            <BackToKidscodeButton onBackToKidscode={this.props.onBackToKidscode} />
                        )}
                        {this.props.kidscodeProjectTitle ? (
                            <div className={styles.kidscodeBranding}>
                                <img
                                    alt="Kidscode"
                                    className={styles.kidscodeLogo}
                                    draggable={false}
                                    src={kidscodeLogo}
                                />
                            </div>
                        ) : (
                            <button
                                aria-label={this.props.intl.formatMessage(ariaMessages.home)}
                                className={classNames(styles.menuBarItem)}
                                onClick={this.props.onClickLogo}
                            >
                                <img
                                    id="logo_img"
                                    alt="Scratch"
                                    className={classNames(styles.scratchLogo, {
                                        [styles.clickable]: typeof this.props.onClickLogo !== 'undefined'
                                    })}
                                    draggable={false}
                                    src={getScratchLogo(this.props.platform)}
                                />
                            </button>
                        )}
                        {!this.props.kidscodeProjectTitle &&
                        (this.props.canChangeColorMode || this.props.canChangeLanguage || this.props.canChangeTheme) &&
                        (<SettingsMenu
                            canChangeLanguage={this.props.canChangeLanguage}
                            canChangeColorMode={this.props.canChangeColorMode}
                            canChangeTheme={this.props.canChangeTheme}
                            hasActiveMembership={this.props.hasActiveMembership}
                            isRtl={this.props.isRtl}
                            depth={1}
                        />)}
                        {(this.props.canManageFiles) && (<FileMenu
                            onStartSelectingFileUpload={this.props.onStartSelectingFileUpload}
                            onClickNew={this.handleClickNew}
                            onClickRemix={this.props.onClickRemix}
                            onClickSave={this.props.onClickSave}
                            getSaveToComputerHandler={this.getSaveToComputerHandler}
                            canSave={this.props.canSave}
                            canCreateCopy={this.props.canCreateCopy}
                            canRemix={this.props.canRemix}
                            intl={this.props.intl}
                            isRtl={this.props.isRtl}
                            remixMessage={remixMessage}
                            depth={1}
                        />)}
                        <EditMenu
                            isRtl={this.props.isRtl}
                            onRestoreOption={this.handleRestoreOption}
                            restoreOptionMessage={this.restoreOptionMessage}
                            depth={1}
                        />
                        {this.props.kidscodeProjectTitle && (
                            <KidscodeProjectMenu
                                getSaveToComputerHandler={this.getSaveToComputerHandler}
                                isRtl={this.props.isRtl}
                                projectTitle={this.props.projectTitle}
                                onDeleteDraft={this.props.onDeleteDraft}
                                onDuplicateProject={this.props.onDuplicateProject}
                                onRenameProject={this.handleRenameProject}
                                onReturnToLesson={this.props.onReturnToLesson}
                                onReturnToMyScratchProjects={this.props.onReturnToMyScratchProjects}
                            />
                        )}
                        {this.props.kidscodeProjectTitle &&
                        (this.props.canChangeColorMode || this.props.canChangeLanguage || this.props.canChangeTheme) &&
                        (<SettingsMenu
                            canChangeLanguage={this.props.canChangeLanguage}
                            canChangeColorMode={this.props.canChangeColorMode}
                            canChangeTheme={this.props.canChangeTheme}
                            hasActiveMembership={this.props.hasActiveMembership}
                            hideLabel
                            isRtl={this.props.isRtl}
                            depth={1}
                        />)}
                        {this.props.isTotallyNormal && (<ModeMenu
                            onSetMode={this.handleSetMode}
                            modeNow={this.props.modeNow}
                            mode2020={this.props.mode2020}
                            isRtl={this.props.isRtl}
                            depth={1}
                        />)}
                    </div>
                    {this.props.kidscodeProjectTitle ? (
                        <div className={classNames(styles.menuBarItem, styles.growable)}>
                            <KidscodeProjectTitle title={this.props.projectTitle} />
                        </div>
                    ) : this.props.canEditTitle ? (
                        <div className={classNames(styles.menuBarItem, styles.growable)}>
                            <MenuBarItemTooltip
                                enable
                                id="title-field"
                            >
                                <ProjectTitleInput
                                    className={classNames(styles.titleFieldGrowable)}
                                />
                            </MenuBarItemTooltip>
                        </div>
                    ) : ((this.props.authorUsername && this.props.authorUsername !== this.props.username) ? (
                        <AuthorInfo
                            className={styles.authorInfo}
                            imageUrl={this.props.authorThumbnailUrl}
                            projectTitle={this.props.projectTitle}
                            userId={this.props.authorId}
                            username={this.props.authorUsername}
                            avatarBadge={this.props.authorAvatarBadge}
                        />
                    ) : null)}
                    {this.props.kidscodeProjectTitle && (
                        <KidscodeProjectActionButtons
                            onSaveProject={this.props.onSaveProject}
                            onSubmitProject={this.props.onSubmitProject}
                            onWorkspaceStateAction={this.props.onWorkspaceStateAction}
                            workspaceState={this.props.kidscodeWorkspaceState}
                        />
                    )}
                    {(!this.props.kidscodeProjectTitle || this.props.canRemix) && (
                        <div className={classNames(styles.menuBarItem)}>
                            {!this.props.kidscodeProjectTitle && (
                                this.props.canShare ? (
                                    (this.props.isShowingProject || this.props.isUpdating) && (
                                        <ProjectWatcher
                                            onDoneUpdating={this.props.onSeeCommunity}
                                            isShared={this.props.isShared}
                                        >
                                            {
                                                waitForUpdate => (
                                                    <ShareButton
                                                        className={styles.menuBarButton}
                                                        isShared={this.props.isShared}
                                                        /* eslint-disable react/jsx-no-bind */
                                                        onClick={() => {
                                                            this.handleClickShare(waitForUpdate);
                                                        }}
                                                        /* eslint-enable react/jsx-no-bind */
                                                    />
                                                )
                                            }
                                        </ProjectWatcher>
                                    )
                                ) : (
                                    this.props.showComingSoon ? (
                                        <MenuBarItemTooltip id="share-button">
                                            <ShareButton className={styles.menuBarButton} />
                                        </MenuBarItemTooltip>
                                    ) : []
                                )
                            )}
                            {this.props.canRemix ? remixButton : []}
                        </div>
                    )}
                    {!this.props.kidscodeProjectTitle && (
                        <div className={classNames(styles.menuBarItem, styles.communityButtonWrapper)}>
                            {this.props.enableCommunity ? (
                                (this.props.isShowingProject || this.props.isUpdating) && (
                                    <ProjectWatcher onDoneUpdating={this.props.onSeeCommunity}>
                                        {
                                            waitForUpdate => (
                                                <CommunityButton
                                                    className={styles.menuBarButton}
                                                    /* eslint-disable react/jsx-no-bind */
                                                    onClick={() => {
                                                        this.handleClickSeeCommunity(waitForUpdate);
                                                    }}
                                                    /* eslint-enable react/jsx-no-bind */
                                                />
                                            )
                                        }
                                    </ProjectWatcher>
                                )
                            ) : (this.props.showComingSoon ? (
                                <MenuBarItemTooltip id="community-button">
                                    <CommunityButton className={styles.menuBarButton} />
                                </MenuBarItemTooltip>
                            ) : [])}
                        </div>
                    )}
                    <Divider className={classNames(styles.divider)} />
                    <div className={styles.fileGroup}>
                        <button
                            aria-label={this.props.intl.formatMessage(ariaMessages.tutorials)}
                            className={
                                classNames(styles.menuBarItem, styles.noOffset, styles.hoverable, 'tutorials-button')
                            }
                            onClick={this.props.onOpenTipLibrary}
                        >
                            <img
                                className={styles.helpIcon}
                                src={helpIcon}
                            />
                            <span className={styles.tutorialsLabel}>
                                <FormattedMessage {...ariaMessages.tutorials} />
                            </span>
                        </button>
                        <button
                            aria-label={this.props.intl.formatMessage(ariaMessages.debug)}
                            className={classNames(styles.menuBarItem, styles.noOffset, styles.hoverable)}
                            onClick={this.props.onOpenDebugModal}
                        >
                            <img
                                className={styles.helpIcon}
                                src={debugIcon}
                            />
                            <span className={styles.debugLabel}>
                                <FormattedMessage {...ariaMessages.debug} />
                            </span>
                        </button>
                    </div>
                </div>

                {/* show the proper UI in the account menu, given whether the user is
                logged in, and whether a session is available to log in with */}
                <div className={styles.accountInfoGroup}>
                    <div className={styles.menuBarItem}>
                        {this.props.canSave && (
                            <SaveStatus className={classNames(styles.hoverable, styles.menuBarItem)} />
                        )}
                    </div>

                    {menuOpts.canHaveSession ? (
                        this.props.username ? (
                            // ************ user is logged in ************
                            <React.Fragment>
                                {menuOpts.myStuffUrl ? (
                                    <a
                                        href={menuOpts.myStuffUrl}
                                        aria-label={this.props.intl.formatMessage(ariaMessages.myStuff)}
                                    >
                                        <div
                                            className={classNames(
                                                styles.menuBarItem,
                                                styles.hoverable,
                                                styles.mystuffButton
                                            )}
                                        >
                                            <img
                                                className={styles.mystuffIcon}
                                                src={mystuffIcon}
                                            />
                                        </div>
                                    </a>
                                ) : null}

                                <AccountMenu
                                    menuOpts={menuOpts}
                                    username={this.props.username}
                                    isRtl={this.props.isRtl}
                                    onLogOut={this.props.onLogOut}
                                    avatarBadge={this.props.avatarBadge}
                                    depth={1}
                                />
                            </React.Fragment>
                        ) : (
                            // ********* user not logged in, but a session exists
                            // ********* so they can choose to log in
                            <React.Fragment>
                                {menuOpts.canRegister ? (
                                    <button
                                        className={classNames(
                                            styles.menuBarItem,
                                            styles.hoverable
                                        )}
                                        key="join"
                                        onClick={this.props.onOpenRegistration}
                                    >
                                        <FormattedMessage
                                            defaultMessage="Join Scratch"
                                            description="Link for creating a Scratch account"
                                            id="gui.menuBar.joinScratch"
                                        />
                                    </button>
                                ) : null}

                                {menuOpts.canLogin ? (
                                    <button
                                        className={classNames(
                                            styles.menuBarItem,
                                            styles.hoverable
                                        )}
                                        key="login"
                                        onMouseUp={this.props.onClickLogin}
                                        onClick={this.props.onClickLogin}
                                    >
                                        <FormattedMessage
                                            defaultMessage="Sign in"
                                            description="Link for signing in to your Scratch account"
                                            id="gui.menuBar.signIn"
                                        />
                                        <LoginDropdown
                                            className={classNames(styles.menuBarMenu)}
                                            isOpen={this.props.loginMenuOpen}
                                            isRtl={this.props.isRtl}
                                            renderLogin={this.props.renderLogin}
                                            onClose={this.props.onRequestCloseLogin}
                                        />
                                    </button>
                                ) : null}
                            </React.Fragment>
                        )
                    ) : this.props.kidscodeStudentName ? (
                        // Kidscode has no Scratch login session of its own -- the student
                        // indicator takes over the slot Scratch's own account UI would
                        // otherwise occupy here.
                        <KidscodeStudentIndicator studentName={this.props.kidscodeStudentName} />
                    ) : (
                        // ******** no login session is available, so don't show login stuff
                        <React.Fragment>
                            {this.props.showComingSoon ? (
                                <React.Fragment>
                                    <MenuBarItemTooltip id="mystuff">
                                        <div
                                            className={classNames(
                                                styles.menuBarItem,
                                                styles.hoverable,
                                                styles.mystuffButton
                                            )}
                                        >
                                            <img
                                                className={styles.mystuffIcon}
                                                src={mystuffIcon}
                                            />
                                        </div>
                                    </MenuBarItemTooltip>
                                    <MenuBarItemTooltip
                                        id="account-nav"
                                        place={this.props.isRtl ? 'right' : 'left'}
                                    >
                                        <div
                                            className={classNames(
                                                styles.menuBarItem,
                                                styles.hoverable,
                                                styles.accountNavMenu
                                            )}
                                        >
                                            <img
                                                className={styles.profileIcon}
                                                src={profileIcon}
                                            />
                                            <span>
                                                {'scratch-cat'}
                                            </span>
                                            <img
                                                className={styles.dropdownCaretIcon}
                                                src={dropdownCaret}
                                            />
                                        </div>
                                    </MenuBarItemTooltip>
                                </React.Fragment>
                            ) : []}
                        </React.Fragment>
                    )}
                </div>

                {this.props.onClickAbout && (
                    <AboutMenu
                        onClick={this.props.onClickAbout}
                        isRtl={this.props.isRtl}
                        depth={1}
                    />
                )}
            </Box>
        );
    }
}

MenuBar.propTypes = {
    accountMenuOpen: PropTypes.bool,
    ariaLabel: PropTypes.string,
    ariaRole: PropTypes.string,
    authorId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
    authorThumbnailUrl: PropTypes.string,
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
    authorAvatarBadge: PropTypes.number,
    autoUpdateProject: PropTypes.func,
    canChangeLanguage: PropTypes.bool,
    canChangeColorMode: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    canCreateCopy: PropTypes.bool,
    canCreateNew: PropTypes.bool,
    canEditTitle: PropTypes.bool,
    canManageFiles: PropTypes.bool,
    canRemix: PropTypes.bool,
    canSave: PropTypes.bool,
    canShare: PropTypes.bool,
    className: PropTypes.string,
    confirmReadyToReplaceProject: PropTypes.func,
    currentLocale: PropTypes.string.isRequired,
    enableCommunity: PropTypes.bool,
    hasActiveMembership: PropTypes.bool,
    intl: intlShape,
    isRtl: PropTypes.bool,
    isShared: PropTypes.bool,
    isShowingProject: PropTypes.bool,
    isTotallyNormal: PropTypes.bool,
    isUpdating: PropTypes.bool,
    kidscodeProjectTitle: PropTypes.string,
    kidscodeStudentName: PropTypes.string,
    kidscodeWorkspaceState: PropTypes.oneOf(KidscodeWorkspaceStates),
    locale: PropTypes.string.isRequired,
    loginMenuOpen: PropTypes.bool,
    logo: PropTypes.string,
    mode1920: PropTypes.bool,
    mode1990: PropTypes.bool,
    mode2020: PropTypes.bool,
    mode220022BC: PropTypes.bool,
    modeNow: PropTypes.bool,
    onBackToKidscode: PropTypes.func,
    onClickAbout: PropTypes.oneOfType([
        PropTypes.func, // button mode: call this callback when the About button is clicked
        PropTypes.arrayOf( // menu mode: list of items in the About menu
            PropTypes.shape({
                title: PropTypes.string, // text for the menu item
                onClick: PropTypes.func // call this callback when the menu item is clicked
            })
        )
    ]),
    onClickLogin: PropTypes.func,
    onClickLogo: PropTypes.func,
    onClickMode: PropTypes.func,
    onClickNew: PropTypes.func,
    onClickRemix: PropTypes.func,
    onClickSave: PropTypes.func,
    onClickSaveAsCopy: PropTypes.func,
    onDeleteDraft: PropTypes.func,
    onDuplicateProject: PropTypes.func,
    onLogOut: PropTypes.func,
    onOpenRegistration: PropTypes.func,
    onOpenTipLibrary: PropTypes.func,
    onOpenDebugModal: PropTypes.func,
    onProjectTelemetryEvent: PropTypes.func,
    onRequestCloseLogin: PropTypes.func,
    onRenameProject: PropTypes.func,
    onReturnToLesson: PropTypes.func,
    onReturnToMyScratchProjects: PropTypes.func,
    onSaveProject: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onSetProjectTitle: PropTypes.func,
    onSetTimeTravelMode: PropTypes.func,
    onShare: PropTypes.func,
    onStartSelectingFileUpload: PropTypes.func,
    onSubmitProject: PropTypes.func,
    onToggleLoginOpen: PropTypes.func,
    onWorkspaceStateAction: PropTypes.func,
    platform: PropTypes.oneOf(Object.keys(PLATFORM)),
    projectTitle: PropTypes.string,
    renderLogin: PropTypes.func,
    shouldSaveBeforeTransition: PropTypes.func,
    showComingSoon: PropTypes.bool,
    username: PropTypes.string,
    avatarBadge: PropTypes.number,
    userOwnsProject: PropTypes.bool,

    accountMenuOptions: AccountMenuOptionsPropTypes,

    vm: PropTypes.instanceOf(VM).isRequired
};

MenuBar.defaultProps = {
    logo: scratchLogo,
    onDeleteDraft: () => {},
    onDuplicateProject: () => {},
    onRenameProject: () => {},
    onReturnToLesson: () => {},
    onReturnToMyScratchProjects: () => {},
    onSaveProject: () => {},
    onShare: () => {},
    onSubmitProject: () => {}
};

const mapStateToProps = (state, ownProps) => {
    const loadingState = state.scratchGui.projectState.loadingState;
    const user = state.session && state.session.session && state.session.session.user;
    const permissions = state.session && state.session.permissions;
    const sessionExists = state.session && typeof state.session.session !== 'undefined';

    return {
        currentLocale: state.locales.locale,
        isRtl: state.locales.isRtl,
        isUpdating: getIsUpdating(loadingState),
        isShowingProject: getIsShowingProject(loadingState),
        kidscodeWorkspaceState: resolveKidscodeWorkspaceState({
            workspaceState: ownProps.kidscodeWorkspaceState,
            projectChanged: state.scratchGui.projectChanged,
            isUpdating: getIsUpdating(loadingState)
        }),
        locale: state.locales.locale,
        loginMenuOpen: loginMenuOpen(state),
        projectTitle: state.scratchGui.projectTitle,
        username: ownProps.username ?? (user ? user.username : null),
        avatarBadge: ownProps.avatarBadge ?? (user ? user.membership_avatar_badge : null),
        userIsEducator: permissions && permissions.educator,
        vm: state.scratchGui.vm,
        mode220022BC: isTimeTravel220022BC(state),
        mode1920: isTimeTravel1920(state),
        mode1990: isTimeTravel1990(state),
        mode2020: isTimeTravel2020(state),
        modeNow: isTimeTravelNow(state),

        platform: state.scratchGui.platform.platform,

        userOwnsProject: ownProps.userOwnsProject ?? (
            ownProps.authorUsername && user && (ownProps.authorUsername === user.username)
        ),

        accountMenuOptions: ownProps.accountMenuOptions ?? {
            canHaveSession: sessionExists ?? false,

            canRegister: true,
            canLogin: true,
            canLogout: true,

            avatarUrl: user?.thumbnailUrl,
            myStuffUrl: '/mystuff/',
            profileUrl: user && `/users/${user.username}`,
            myClassesUrl: permissions?.educator ? '/educators/classes/' : null,
            myClassUrl: user && permissions?.student ? `/classes/${user.classroomId}/` : null,
            accountSettingsUrl: '/accounts/settings/'
        }
    };
};

const mapDispatchToProps = (dispatch, ownProps) => ({
    autoUpdateProject: () => dispatch(autoUpdateProject()),
    onOpenTipLibrary: () => dispatch(openTipsLibrary()),
    onOpenDebugModal: () => dispatch(openDebugModal()),
    onClickNew: needSave => dispatch(requestNewProject(needSave)),
    onClickLogin: ownProps.onClickLogin ?? (() => dispatch(openLoginMenu())),
    onClickSave: () => dispatch(manualUpdateProject()),
    onClickRemix: () => dispatch(remixProject()),
    onRequestCloseLogin: () => dispatch(closeLoginMenu()),
    onSeeCommunity: ownProps.onSeeCommunity ?? (() => dispatch(setPlayer(true))),
    onSetProjectTitle: title => dispatch(setProjectTitle(title)),
    onSetTimeTravelMode: mode => dispatch(setTimeTravel(mode))
});

export default compose(
    injectIntl,
    MenuBarHOC,
    connect(
        mapStateToProps,
        mapDispatchToProps
    )
)(MenuBar);
