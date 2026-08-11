import {KidscodeDevelopmentProjectManagementFixtureProjectRef} from '../kidscode-workspace-launch';
import {createIndexedDbProjectStore} from '../kidscode-workspace-persistence/kidscode-development-project-store';
import {
    KIDSCODE_PROJECT_TITLE_MAX_LENGTH,
    KidscodeProjectStatus,
    buildDuplicateProjectTitle
} from './kidscode-workspace-project-management-contract';

// A duplicate is always created as an independent project, regardless of the original's
// project_type — see the product rule documented on duplicateProject below.
const DUPLICATE_PROJECT_TYPE = 'independent';

const DEV_PROJECT_REF_PREFIX = 'SCR-PROJ-DEV-';
let devProjectRefCounter = 0;
const generateDevelopmentProjectRef = () => {
    devProjectRefCounter += 1;
    const randomSegment = Date.now()
        .toString(36)
        .toUpperCase();
    return `${DEV_PROJECT_REF_PREFIX}${randomSegment}${devProjectRefCounter}`;
};

const requireWorkspaceAccessToken = workspaceAccessToken => {
    if (!workspaceAccessToken) {
        throw new Error('Missing workspace access token.');
    }
};

const requireDraftStatus = (record, action) => {
    if (record && record.deletedAt) {
        throw new Error('This project has already been deleted.');
    }
    const status = (record && record.status) || KidscodeProjectStatus.DRAFT;
    if (status !== KidscodeProjectStatus.DRAFT) {
        throw new Error(`Only draft projects can be ${action}.`);
    }
};

/**
 * Create the development-only mock project-management adapter. It behaves like the future
 * Laravel adapter's request/response shape (see docs/SHARED-API-CONTRACT.md) but persists to the
 * same browser-local, development-only IndexedDB store the Phase 4 persistence adapter uses, so
 * rename/duplicate/delete can be demonstrated before the Laravel API exists.
 *
 * A `project_ref` alone is not treated as authorisation here, matching the real adapter's future
 * requirement for a workspace access credential; a missing token is a rejected request.
 * @param {object} [options] - adapter options
 * @param {string} [options.environment] - override for `process.env.NODE_ENV`, for tests
 * @param {{getProject: Function, putProject: Function}} [options.store] - override for the
 *   underlying store, for tests that cannot use real IndexedDB
 * @param {Function} [options.generateProjectRef] - override for generating a new project_ref on
 *   duplicate, for deterministic tests
 * @returns {{renameProject: Function, duplicateProject: Function, deleteDraftProject: Function}}
 *   the development project-management adapter
 */
const createKidscodeDevelopmentProjectManagementAdapter = ({
    environment = process.env.NODE_ENV,
    store = createIndexedDbProjectStore(),
    generateProjectRef = generateDevelopmentProjectRef
} = {}) => {
    if (environment === 'production') {
        throw new Error('The development workspace project-management adapter cannot run in production.');
    }

    const renameProject = ({projectRef, workspaceAccessToken, title}) => Promise.resolve()
        .then(() => {
            requireWorkspaceAccessToken(workspaceAccessToken);

            if (projectRef === KidscodeDevelopmentProjectManagementFixtureProjectRef.RENAME_FAILURE) {
                throw new Error('The development rename-failure fixture always rejects renames.');
            }

            const trimmedTitle = (title || '').trim();
            if (!trimmedTitle) {
                throw new Error('Project title cannot be empty.');
            }
            if (trimmedTitle.length > KIDSCODE_PROJECT_TITLE_MAX_LENGTH) {
                throw new Error(`Project title cannot be longer than ${KIDSCODE_PROJECT_TITLE_MAX_LENGTH} characters.`);
            }

            return Promise.resolve(store.getProject(projectRef)).then(existingRecord => {
                requireDraftStatus(existingRecord, 'renamed');

                const now = new Date().toISOString();
                const record = {
                    projectRef,
                    title: trimmedTitle,
                    status: (existingRecord && existingRecord.status) || KidscodeProjectStatus.DRAFT,
                    createdAt: (existingRecord && existingRecord.createdAt) || now,
                    updatedAt: now
                };
                return Promise.resolve(store.putProject(record)).then(() => ({
                    success: true,
                    data: {
                        project_ref: projectRef,
                        title: trimmedTitle,
                        updated_at: now
                    }
                }));
            });
        });

    const duplicateProject = ({projectRef, workspaceAccessToken, sb3, title}) => Promise.resolve()
        .then(() => {
            requireWorkspaceAccessToken(workspaceAccessToken);

            if (projectRef === KidscodeDevelopmentProjectManagementFixtureProjectRef.DUPLICATE_FAILURE) {
                throw new Error('The development duplicate-failure fixture always rejects duplicates.');
            }

            const newProjectRef = generateProjectRef();
            const duplicateTitle = buildDuplicateProjectTitle(title);
            const now = new Date().toISOString();
            const record = {
                projectRef: newProjectRef,
                title: duplicateTitle,
                // A duplicate is always an independent draft, even when the original is a lesson
                // project: a student must not end up with a second active lesson project attached
                // to the same assignment. This is not configurable by the caller.
                projectType: DUPLICATE_PROJECT_TYPE,
                status: KidscodeProjectStatus.DRAFT,
                versionRef: 'SCR-DEV-VER-1',
                versionNumber: 1,
                savedAt: now,
                sb3,
                createdAt: now,
                updatedAt: now
            };
            return Promise.resolve(store.putProject(record)).then(() => ({
                success: true,
                data: {
                    project_ref: newProjectRef,
                    title: duplicateTitle,
                    project_type: DUPLICATE_PROJECT_TYPE,
                    status: KidscodeProjectStatus.DRAFT,
                    created_at: now
                }
            }));
        });

    const deleteDraftProject = ({projectRef, workspaceAccessToken}) => Promise.resolve()
        .then(() => {
            requireWorkspaceAccessToken(workspaceAccessToken);

            if (projectRef === KidscodeDevelopmentProjectManagementFixtureProjectRef.DELETE_FAILURE) {
                throw new Error('The development delete-failure fixture always rejects deletes.');
            }

            return Promise.resolve(store.getProject(projectRef)).then(existingRecord => {
                requireDraftStatus(existingRecord, 'deleted');

                const now = new Date().toISOString();
                return Promise.resolve(store.putProject({
                    projectRef,
                    deletedAt: now,
                    updatedAt: now
                })).then(() => ({
                    success: true,
                    data: {
                        project_ref: projectRef,
                        deleted: true
                    }
                }));
            });
        });

    return {
        renameProject,
        duplicateProject,
        deleteDraftProject
    };
};

export {
    createKidscodeDevelopmentProjectManagementAdapter
};
