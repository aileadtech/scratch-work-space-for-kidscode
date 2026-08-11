import React from 'react';
import ReactDomClient from 'react-dom/client';
import {compose} from 'redux';

import AppStateHOC from '../lib/app-state-hoc.jsx';
import GUI from '../containers/gui.jsx';
import HashParserHOC from '../lib/hash-parser-hoc.jsx';
import log from '../lib/log.js';
import {PLATFORM} from '../lib/platform.js';
import KidscodeWorkspaceLaunchHOC from '../lib/kidscode-workspace-launch-hoc.jsx';
import {createDevelopmentMockLaunchResolver} from '../lib/kidscode-workspace-launch';
import KidscodeWorkspacePersistenceHOC
    from '../lib/kidscode-workspace-persistence/kidscode-workspace-persistence-hoc.jsx';
import {createUnavailableKidscodeWorkspacePersistenceAdapter}
    from '../lib/kidscode-workspace-persistence/kidscode-workspace-persistence-contract';
import {createKidscodeDevelopmentPersistenceAdapter}
    from '../lib/kidscode-workspace-persistence/kidscode-development-persistence-adapter';

const onClickLogo = () => {
    window.location = 'https://scratch.mit.edu';
};

const onBackToKidscode = () => {};
const onDeleteDraft = () => {};
const onDuplicateProject = () => {};
const onRenameProject = () => {};
const onReturnToLesson = () => {};
const onReturnToMyScratchProjects = () => {};
const onSaveProject = () => {};
const onSubmitProject = () => {};
const unavailableLaunchResolver = () =>
    Promise.reject(new Error('The Workspace launch resolver is not configured.'));

const handleTelemetryModalCancel = () => {
    log('User canceled telemetry modal');
};

const handleTelemetryModalOptIn = () => {
    log('User opted into telemetry');
};

const handleTelemetryModalOptOut = () => {
    log('User opted out of telemetry');
};

/*
 * Render the GUI playground. This is a separate function because importing anything
 * that instantiates the VM causes unsupported browsers to crash
 * {object} appTarget - the DOM element to render to
 */
export default appTarget => {
    GUI.setAppElement(appTarget);

    // note that redux's 'compose' function is just being used as a general utility to make
    // the hierarchy of HOC constructor calls clearer here; it has nothing to do with redux's
    // ability to compose reducers.
    const WrappedGui = KidscodeWorkspaceLaunchHOC(compose(
        AppStateHOC,
        HashParserHOC,
        KidscodeWorkspacePersistenceHOC
    )(GUI));

    const launchResolver = process.env.NODE_ENV === 'production' ?
        unavailableLaunchResolver :
        createDevelopmentMockLaunchResolver();

    // The Laravel persistence adapter does not exist yet; production must fail closed rather than
    // silently falling back to the development-only IndexedDB mock store.
    const persistenceAdapter = process.env.NODE_ENV === 'production' ?
        createUnavailableKidscodeWorkspacePersistenceAdapter() :
        createKidscodeDevelopmentPersistenceAdapter();

    // TODO a hack for testing the backpack, allow backpack host to be set by url param
    const backpackHostMatches = window.location.href.match(/[?&]backpack_host=([^&]*)&?/);
    const backpackHost = backpackHostMatches ? backpackHostMatches[1] : null;

    const scratchDesktopMatches = window.location.href.match(/[?&]isScratchDesktop=([^&]+)/);
    let simulateScratchDesktop;
    if (scratchDesktopMatches) {
        try {
            // parse 'true' into `true`, 'false' into `false`, etc.
            simulateScratchDesktop = JSON.parse(scratchDesktopMatches[1]);
        } catch {
            // it's not JSON so just use the string
            // note that a typo like "falsy" will be treated as true
            simulateScratchDesktop = scratchDesktopMatches[1];
        }
    }

    if (process.env.NODE_ENV === 'production' && typeof window === 'object') {
        // Warn before navigating away
        window.onbeforeunload = () => true;
    }

    const root = ReactDomClient.createRoot(appTarget);

    root.render(
        // important: this is checking whether `simulateScratchDesktop` is truthy, not just defined!
        simulateScratchDesktop ? (
            <WrappedGui
                canEditTitle={false}
                kidscodeWorkspacePersistenceAdapter={persistenceAdapter}
                launchResolver={launchResolver}
                platform={PLATFORM.DESKTOP}
                showTelemetryModal
                canSave={false}
                onBackToKidscode={onBackToKidscode}
                onDeleteDraft={onDeleteDraft}
                onDuplicateProject={onDuplicateProject}
                onRenameProject={onRenameProject}
                onReturnToLesson={onReturnToLesson}
                onReturnToMyScratchProjects={onReturnToMyScratchProjects}
                onSaveProject={onSaveProject}
                onSubmitProject={onSubmitProject}
                onTelemetryModalCancel={handleTelemetryModalCancel}
                onTelemetryModalOptIn={handleTelemetryModalOptIn}
                onTelemetryModalOptOut={handleTelemetryModalOptOut}
            />
        ) : (
            <WrappedGui
                canEditTitle={false}
                kidscodeWorkspacePersistenceAdapter={persistenceAdapter}
                launchResolver={launchResolver}
                backpackVisible
                showComingSoon
                backpackHost={backpackHost}
                canSave={false}
                onBackToKidscode={onBackToKidscode}
                onClickLogo={onClickLogo}
                onDeleteDraft={onDeleteDraft}
                onDuplicateProject={onDuplicateProject}
                onRenameProject={onRenameProject}
                onReturnToLesson={onReturnToLesson}
                onReturnToMyScratchProjects={onReturnToMyScratchProjects}
                onSaveProject={onSaveProject}
                onSubmitProject={onSubmitProject}
            />
        )
    );
};
