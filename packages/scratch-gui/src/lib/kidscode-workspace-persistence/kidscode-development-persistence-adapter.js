import {KidscodeDevelopmentPersistenceFixtureProjectRef, KidscodeLaunchType} from '../kidscode-workspace-launch';
import {KidscodeProjectStatus}
    from '../kidscode-workspace-project-management/kidscode-workspace-project-management-contract';
import {createIndexedDbProjectStore} from './kidscode-development-project-store';
import {KidscodeProjectSource} from './kidscode-workspace-persistence-contract';
import {buildKidscodeWorkspaceStarterProject} from './kidscode-workspace-starter-project';

const DEV_VERSION_PREFIX = 'SCR-DEV-VER-';
const nextVersionRef = versionNumber => `${DEV_VERSION_PREFIX}${versionNumber}`;

// Deliberately not a valid Scratch project, so `vm.loadProject()` rejects and the Workspace
// demonstrates the Corrupted Project state without a committed corrupt .sb3 fixture. Built from
// raw char codes rather than TextEncoder, which is not available in every test environment.
const buildCorruptedProjectBytes = () => {
    const text = 'not-a-valid-scratch-project';
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        bytes[i] = text.charCodeAt(i);
    }
    return bytes.buffer;
};

const requireWorkspaceAccessToken = workspaceAccessToken => {
    if (!workspaceAccessToken) {
        throw new Error('Missing workspace access token.');
    }
};

// Defense in depth: the Workspace already blocks Save/autosave client-side as soon as a delete
// succeeds (see KidscodeWorkspaceProjectManagementHOC), but a deleted project's record is checked
// here too, since this store is shared with the Phase 5 project-management adapter and a stale
// in-memory Workspace session should not be able to resurrect a deleted draft by saving over it.
const requireNotDeleted = record => {
    if (record && record.deletedAt) {
        throw new Error('This project has been deleted and can no longer be saved.');
    }
};

const requireWritableStatus = record => {
    const status = (record && record.status) || KidscodeProjectStatus.DRAFT;
    if (![KidscodeProjectStatus.DRAFT, KidscodeProjectStatus.CHANGES_REQUESTED].includes(status)) {
        throw new Error('Submitted and approved projects cannot be saved.');
    }
    return status;
};

/**
 * Create the development-only mock persistence adapter. It behaves like the future Laravel
 * adapter's request/response shape (see docs/SHARED-API-CONTRACT.md) but persists to a
 * browser-local, development-only IndexedDB store instead of a real server, so save/load/autosave
 * and a close-reopen round trip can be demonstrated before the Laravel API exists.
 *
 * A `project_ref` alone is not treated as authorisation here, matching the real adapter's future
 * requirement for a workspace access credential; a missing token is a rejected request.
 * @param {object} [options] - adapter options
 * @param {string} [options.environment] - override for `process.env.NODE_ENV`, for tests
 * @param {{getProject: Function, putProject: Function}} [options.store] - override for the
 *   underlying store, for tests that cannot use real IndexedDB
 * @returns {{loadProject: Function, saveProject: Function}} the development persistence adapter
 */
const createKidscodeDevelopmentPersistenceAdapter = ({
    environment = process.env.NODE_ENV,
    store = createIndexedDbProjectStore()
} = {}) => {
    if (environment === 'production') {
        throw new Error('The development workspace persistence adapter cannot run in production.');
    }

    const loadProject = ({projectRef, workspaceAccessToken, launchType}) => Promise.resolve()
        .then(() => {
            requireWorkspaceAccessToken(workspaceAccessToken);

            if (projectRef === KidscodeDevelopmentPersistenceFixtureProjectRef.CORRUPTED_PROJECT) {
                return {
                    project_ref: projectRef,
                    source: KidscodeProjectSource.SAVED,
                    version_ref: nextVersionRef(1),
                    saved_at: new Date(0).toISOString(),
                    sb3: buildCorruptedProjectBytes()
                };
            }

            return Promise.resolve(store.getProject(projectRef)).then(record => {
                requireNotDeleted(record);

                if (record) {
                    return {
                        project_ref: projectRef,
                        source: KidscodeProjectSource.SAVED,
                        version_ref: record.versionRef,
                        saved_at: record.savedAt,
                        sb3: record.sb3
                    };
                }
                if (launchType === KidscodeLaunchType.NEW_LESSON) {
                    return {
                        project_ref: projectRef,
                        source: KidscodeProjectSource.STARTER,
                        version_ref: null,
                        saved_at: null,
                        sb3: buildKidscodeWorkspaceStarterProject()
                    };
                }
                return {
                    project_ref: projectRef,
                    source: KidscodeProjectSource.BLANK,
                    version_ref: null,
                    saved_at: null,
                    sb3: null
                };
            });
        });

    const saveProject = ({projectRef, workspaceAccessToken, sb3, reason}) => Promise.resolve()
        .then(() => {
            requireWorkspaceAccessToken(workspaceAccessToken);

            if (projectRef === KidscodeDevelopmentPersistenceFixtureProjectRef.SAVE_FAILURE) {
                throw new Error('The development save-failure fixture always rejects saves.');
            }

            return Promise.resolve(store.getProject(projectRef)).then(existingRecord => {
                requireNotDeleted(existingRecord);
                const status = requireWritableStatus(existingRecord);

                const versionNumber = (existingRecord ? existingRecord.versionNumber : 0) + 1;
                const record = {
                    projectRef,
                    versionRef: nextVersionRef(versionNumber),
                    versionNumber,
                    savedAt: new Date().toISOString(),
                    sb3,
                    lastSaveReason: reason,
                    status
                };
                return Promise.resolve(store.putProject(record, {
                    expectedVersionRef: (existingRecord && existingRecord.versionRef) || null,
                    allowedStatuses: [KidscodeProjectStatus.DRAFT, KidscodeProjectStatus.CHANGES_REQUESTED]
                })).then(() => ({
                    success: true,
                    data: {
                        project_ref: projectRef,
                        version_ref: record.versionRef,
                        saved_at: record.savedAt,
                        status
                    }
                }));
            });
        });

    return {
        loadProject,
        saveProject
    };
};

export {
    createKidscodeDevelopmentPersistenceAdapter
};
