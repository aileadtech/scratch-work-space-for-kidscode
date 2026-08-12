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
import KidscodeWorkspaceProjectManagementHOC
    from '../lib/kidscode-workspace-project-management/kidscode-workspace-project-management-hoc.jsx';
import {createUnavailableKidscodeWorkspaceProjectManagementAdapter}
    from '../lib/kidscode-workspace-project-management/kidscode-workspace-project-management-contract';
import {createKidscodeDevelopmentProjectManagementAdapter}
    from '../lib/kidscode-workspace-project-management/kidscode-development-project-management-adapter';
import KidscodeWorkspaceSubmissionReviewHOC
    from '../lib/kidscode-workspace-submission-review/kidscode-workspace-submission-review-hoc.jsx';
import {createUnavailableKidscodeWorkspaceSubmissionReviewAdapter}
    from '../lib/kidscode-workspace-submission-review/kidscode-workspace-submission-review-contract';
import {createKidscodeDevelopmentSubmissionReviewAdapter}
    from '../lib/kidscode-workspace-submission-review/kidscode-development-submission-review-adapter';
import KidscodeWorkspaceNavigationHOC
    from '../lib/kidscode-workspace-navigation/kidscode-workspace-navigation-hoc.jsx';

const onClickLogo = () => {
    window.location = 'https://scratch.mit.edu';
};

const onSaveProject = () => {};
const unavailableLaunchResolver = () =>
    Promise.reject(new Error('The Workspace launch resolver is not configured.'));

// Injected/configurable recovery seam (see docs/SHARED-API-CONTRACT.md, Workspace Navigation and
// Recovery). Production has no configured Kidscode origin yet, so it stays fail-closed (no
// recovery destination, no absolute-URL origin allowed) rather than guessing one; Phase 8 is the
// intended place to supply real values here. Development uses explicit, clearly local-only values.
const kidscodeWorkspaceRecoveryUrl = process.env.NODE_ENV === 'production' ? null : '/';
const kidscodeWorkspaceAllowedReturnOrigins = process.env.NODE_ENV === 'production' ?
    [] :
    ['http://localhost:8601'];

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
        KidscodeWorkspaceProjectManagementHOC,
        KidscodeWorkspaceSubmissionReviewHOC,
        KidscodeWorkspacePersistenceHOC,
        KidscodeWorkspaceNavigationHOC
    )(GUI));

    const launchResolver = process.env.NODE_ENV === 'production' ?
        unavailableLaunchResolver :
        createDevelopmentMockLaunchResolver();

    // The Laravel persistence adapter does not exist yet; production must fail closed rather than
    // silently falling back to the development-only IndexedDB mock store.
    const persistenceAdapter = process.env.NODE_ENV === 'production' ?
        createUnavailableKidscodeWorkspacePersistenceAdapter() :
        createKidscodeDevelopmentPersistenceAdapter();

    // Same production-safe selection as the persistence adapter above: the Laravel
    // project-management adapter does not exist yet, so production must fail closed.
    const projectManagementAdapter = process.env.NODE_ENV === 'production' ?
        createUnavailableKidscodeWorkspaceProjectManagementAdapter() :
        createKidscodeDevelopmentProjectManagementAdapter();

    const submissionReviewAdapter = process.env.NODE_ENV === 'production' ?
        createUnavailableKidscodeWorkspaceSubmissionReviewAdapter() :
        createKidscodeDevelopmentSubmissionReviewAdapter();

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

    const root = ReactDomClient.createRoot(appTarget);

    root.render(
        // important: this is checking whether `simulateScratchDesktop` is truthy, not just defined!
        simulateScratchDesktop ? (
            <WrappedGui
                canEditTitle={false}
                kidscodeWorkspaceAllowedReturnOrigins={kidscodeWorkspaceAllowedReturnOrigins}
                kidscodeWorkspacePersistenceAdapter={persistenceAdapter}
                kidscodeWorkspaceProjectManagementAdapter={projectManagementAdapter}
                kidscodeWorkspaceRecoveryUrl={kidscodeWorkspaceRecoveryUrl}
                kidscodeWorkspaceSubmissionReviewAdapter={submissionReviewAdapter}
                launchResolver={launchResolver}
                platform={PLATFORM.DESKTOP}
                showTelemetryModal
                canSave={false}
                onSaveProject={onSaveProject}
                onTelemetryModalCancel={handleTelemetryModalCancel}
                onTelemetryModalOptIn={handleTelemetryModalOptIn}
                onTelemetryModalOptOut={handleTelemetryModalOptOut}
            />
        ) : (
            <WrappedGui
                canEditTitle={false}
                kidscodeWorkspaceAllowedReturnOrigins={kidscodeWorkspaceAllowedReturnOrigins}
                kidscodeWorkspacePersistenceAdapter={persistenceAdapter}
                kidscodeWorkspaceProjectManagementAdapter={projectManagementAdapter}
                kidscodeWorkspaceRecoveryUrl={kidscodeWorkspaceRecoveryUrl}
                kidscodeWorkspaceSubmissionReviewAdapter={submissionReviewAdapter}
                launchResolver={launchResolver}
                backpackVisible
                showComingSoon
                backpackHost={backpackHost}
                canSave={false}
                onClickLogo={onClickLogo}
                onSaveProject={onSaveProject}
            />
        )
    );
};
