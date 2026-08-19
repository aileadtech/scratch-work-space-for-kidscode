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
import {
    createKidscodeLaunchResolver,
    createKidscodeProductionLaunchResolver,
    getKidscodeWorkspaceApiBase
} from '../lib/kidscode-production-launch-resolver';
import KidscodeWorkspacePersistenceHOC
    from '../lib/kidscode-workspace-persistence/kidscode-workspace-persistence-hoc.jsx';
import {createUnavailableKidscodeWorkspacePersistenceAdapter}
    from '../lib/kidscode-workspace-persistence/kidscode-workspace-persistence-contract';
import {createKidscodeDevelopmentPersistenceAdapter}
    from '../lib/kidscode-workspace-persistence/kidscode-development-persistence-adapter';
import {
    createKidscodeProductionPersistenceAdapter,
    createKidscodeWorkspacePersistenceAdapter
} from '../lib/kidscode-workspace-persistence/kidscode-production-persistence-adapter';
import KidscodeWorkspaceProjectManagementHOC
    from '../lib/kidscode-workspace-project-management/kidscode-workspace-project-management-hoc.jsx';
import {createUnavailableKidscodeWorkspaceProjectManagementAdapter}
    from '../lib/kidscode-workspace-project-management/kidscode-workspace-project-management-contract';
import {createKidscodeDevelopmentProjectManagementAdapter}
    from '../lib/kidscode-workspace-project-management/kidscode-development-project-management-adapter';
import {
    createKidscodeProductionProjectManagementAdapter,
    createKidscodeWorkspaceProjectManagementAdapter
} from '../lib/kidscode-workspace-project-management/kidscode-production-project-management-adapter';
import KidscodeWorkspaceSubmissionReviewHOC
    from '../lib/kidscode-workspace-submission-review/kidscode-workspace-submission-review-hoc.jsx';
import {createUnavailableKidscodeWorkspaceSubmissionReviewAdapter}
    from '../lib/kidscode-workspace-submission-review/kidscode-workspace-submission-review-contract';
import {createKidscodeDevelopmentSubmissionReviewAdapter}
    from '../lib/kidscode-workspace-submission-review/kidscode-development-submission-review-adapter';
import {
    createKidscodeProductionSubmissionReviewAdapter,
    createKidscodeWorkspaceSubmissionReviewAdapter
} from '../lib/kidscode-workspace-submission-review/kidscode-production-submission-review-adapter';
import KidscodeWorkspaceNavigationHOC
    from '../lib/kidscode-workspace-navigation/kidscode-workspace-navigation-hoc.jsx';
import {getKidscodeWorkspaceAllowedReturnOrigins}
    from '../lib/kidscode-workspace-navigation/kidscode-workspace-navigation-contract';

const onClickLogo = () => {
    window.location = 'https://scratch.mit.edu';
};

const onSaveProject = () => {};
const unavailableLaunchResolver = () =>
    Promise.reject(new Error('The Workspace launch resolver is not configured.'));

// Injected/configurable recovery seam (see docs/SHARED-API-CONTRACT.md, Workspace Navigation and
// Recovery). Production has no configured Kidscode origin yet, so it stays fail-closed (no
// recovery destination) rather than guessing one; Phase 8 is the intended place to supply real
// values here. Development uses explicit, clearly local-only values.
const kidscodeWorkspaceRecoveryUrl = process.env.NODE_ENV === 'production' ? null : '/';
// The allowed-origin allowlist is now build-time configurable via
// KIDSCODE_WORKSPACE_ALLOWED_RETURN_ORIGINS (see kidscode-workspace-navigation-contract.js) instead
// of a fixed literal, since a real session's return_to.url points at the real Kidscode frontend's
// own absolute origin, which differs per deployment target and is unknown at this repository's
// build time. Still fails closed (empty allowlist) in production and in development until
// configured, except for the Workspace's own dev-server origin.
const kidscodeWorkspaceAllowedReturnOrigins = getKidscodeWorkspaceAllowedReturnOrigins();

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

    const apiBase = getKidscodeWorkspaceApiBase();
    const productionLaunchResolver = apiBase ?
        createKidscodeProductionLaunchResolver({apiBase}) :
        unavailableLaunchResolver;
    const launchResolver = createKidscodeLaunchResolver({
        developmentResolver: process.env.NODE_ENV === 'production' ? null : createDevelopmentMockLaunchResolver(),
        productionResolver: productionLaunchResolver
    });

    // The real Stage 2 Laravel adapter is selected per-session by workspace_access_token, the same
    // way launchResolver above selects per-session by launch token: exact development fixtures keep
    // using the isolated local IndexedDB store, while any real (TEST/production) session reaches the
    // real Stage 2 endpoints. Production never constructs the development adapter at all. A missing
    // API base fails closed to the unavailable adapter rather than falling back to IndexedDB.
    const productionPersistenceAdapter = apiBase ?
        createKidscodeProductionPersistenceAdapter({apiBase}) :
        createUnavailableKidscodeWorkspacePersistenceAdapter();
    const persistenceAdapter = process.env.NODE_ENV === 'production' ?
        productionPersistenceAdapter :
        createKidscodeWorkspacePersistenceAdapter({
            developmentAdapter: createKidscodeDevelopmentPersistenceAdapter(),
            productionAdapter: productionPersistenceAdapter
        });

    // The real Stage 3 Laravel adapter is selected per-session by workspace_access_token, the same
    // way persistenceAdapter above selects per-session for Stage 2: exact development fixtures keep
    // using the isolated local IndexedDB store, while any real (TEST/production) session reaches the
    // real Stage 3 endpoints. Production never constructs the development adapter at all. A missing
    // API base fails closed to the unavailable adapter rather than falling back to IndexedDB.
    const productionProjectManagementAdapter = apiBase ?
        createKidscodeProductionProjectManagementAdapter({apiBase}) :
        createUnavailableKidscodeWorkspaceProjectManagementAdapter();
    const projectManagementAdapter = process.env.NODE_ENV === 'production' ?
        productionProjectManagementAdapter :
        createKidscodeWorkspaceProjectManagementAdapter({
            developmentAdapter: createKidscodeDevelopmentProjectManagementAdapter(),
            productionAdapter: productionProjectManagementAdapter
        });

    // The real Stage 4 Laravel adapter is selected per-session by access token, the same way
    // persistenceAdapter/projectManagementAdapter above select per-session for Stage 2/3: exact
    // development fixtures keep using the isolated local IndexedDB store, while any other (real
    // TEST/production) session reaches the real Stage 4 endpoints. Production never constructs the
    // development adapter at all. A missing API base fails closed to the unavailable adapter rather
    // than falling back to IndexedDB. NOTE: only real Student Submit is reachable today — a real
    // tutor review session cannot reach loadSubmission yet because its launch response is missing
    // fields (project/return_to/student) the Workspace's session contract still requires; see
    // kidscode-workspace-submission-review-hoc.jsx.
    const productionSubmissionReviewAdapter = apiBase ?
        createKidscodeProductionSubmissionReviewAdapter({apiBase}) :
        createUnavailableKidscodeWorkspaceSubmissionReviewAdapter();
    const submissionReviewAdapter = process.env.NODE_ENV === 'production' ?
        productionSubmissionReviewAdapter :
        createKidscodeWorkspaceSubmissionReviewAdapter({
            developmentAdapter: createKidscodeDevelopmentSubmissionReviewAdapter(),
            productionAdapter: productionSubmissionReviewAdapter
        });

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
