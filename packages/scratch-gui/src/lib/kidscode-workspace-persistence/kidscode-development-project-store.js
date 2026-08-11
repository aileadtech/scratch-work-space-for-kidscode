/**
 * Development-only persistent project store, backed by IndexedDB so a saved .sb3 survives a
 * page refresh or browser reopen during local development. This is the only place in the
 * Workspace that touches IndexedDB — the persistence and project-management adapters, and the
 * Workspace UI, never do.
 *
 * Records are keyed by project_ref. The Phase 4 persistence adapter reads/writes the content
 * fields (versionRef, versionNumber, savedAt, sb3, lastSaveReason); the Phase 5 project-management
 * adapter reads/writes the metadata fields (title, projectType, status, createdAt, updatedAt,
 * deletedAt). Phase 6 stores immutable submitted project versions in a separate object store.
 * The adapters share this database rather than each keeping their own, so
 * `putProject` merges a partial record onto whatever is already stored instead of overwriting it
 * wholesale — otherwise a save from one adapter would silently erase metadata written by the
 * other (e.g. a rename landing mid-autosave). Launch tokens, workspace access tokens, and student
 * authentication are never written here.
 */

const DATABASE_NAME = 'kidscode-workspace-dev-store';
const DATABASE_VERSION = 2;
const PROJECTS_STORE = 'projects';
const SUBMISSIONS_STORE = 'submissions';

const openDatabase = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
            db.createObjectStore(PROJECTS_STORE, {keyPath: 'projectRef'});
        }
        if (!db.objectStoreNames.contains(SUBMISSIONS_STORE)) {
            db.createObjectStore(SUBMISSIONS_STORE, {keyPath: 'submissionRef'});
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const runRequest = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

/**
 * Create a project store backed by the browser's IndexedDB. Records hold both Phase 4 content
 * fields (versionRef, versionNumber, savedAt, sb3, lastSaveReason) and Phase 5 metadata fields
 * (title, projectType, status, createdAt, updatedAt, deletedAt), merged onto whatever already
 * exists for that project_ref.
 * @returns {{getProject: Function, putProject: Function}} the store
 */
const createIndexedDbProjectStore = () => {
    const withStore = (storeName, mode, useStore) =>
        openDatabase().then(db => new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const result = useStore(store);
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error);
        }));

    // Reads whatever is already stored for this project_ref and merges the incoming partial
    // record onto it before writing back, so a save from one adapter cannot erase metadata
    // written by the other (see the file header comment).
    const putProject = (record, {expectedVersionRef, allowedStatuses} = {}) =>
        openDatabase().then(db => new Promise((resolve, reject) => {
            const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
            const store = transaction.objectStore(PROJECTS_STORE);
            const getRequest = store.get(record.projectRef);
            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                const existingVersionRef = (existing && existing.versionRef) || null;
                const existingStatus = (existing && existing.status) || 'draft';
                if (typeof expectedVersionRef !== 'undefined' && expectedVersionRef !== existingVersionRef) {
                    transaction.abort();
                    reject(new Error('Project version conflict.'));
                    return;
                }
                if (allowedStatuses && !allowedStatuses.includes(existingStatus)) {
                    transaction.abort();
                    reject(new Error('Project status conflict.'));
                    return;
                }
                store.put(Object.assign({}, getRequest.result, record));
            };
            getRequest.onerror = () => reject(getRequest.error);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        }));

    // Submission creation and the corresponding working-copy advance share one transaction.
    // This prevents any observable state where only one copy exists and makes an autosave with
    // a stale working version lose cleanly instead of overwriting the submitted working copy.
    const commitSubmission = ({
        projectRef,
        baseVersionRef,
        allowedStatuses,
        projectRecord,
        submission
    }) => openDatabase().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction([PROJECTS_STORE, SUBMISSIONS_STORE], 'readwrite');
        const projects = transaction.objectStore(PROJECTS_STORE);
        const submissions = transaction.objectStore(SUBMISSIONS_STORE);
        const getRequest = projects.get(projectRef);
        getRequest.onsuccess = () => {
            const existing = getRequest.result;
            const existingVersionRef = (existing && existing.versionRef) || null;
            const existingStatus = (existing && existing.status) || 'draft';
            if (existing && existing.deletedAt) {
                transaction.abort();
                reject(new Error('A deleted project cannot be submitted.'));
                return;
            }
            if (baseVersionRef !== existingVersionRef) {
                transaction.abort();
                reject(new Error('The base project version does not match the latest working version.'));
                return;
            }
            if (!allowedStatuses.includes(existingStatus)) {
                transaction.abort();
                reject(new Error('Only draft or changes-requested projects can be submitted.'));
                return;
            }
            submissions.add(submission);
            projects.put(Object.assign({}, existing, projectRecord));
        };
        getRequest.onerror = () => reject(getRequest.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    }));

    // Review updates always preserve the original identity fields and sb3 bytes.
    const updateSubmissionReview = (submissionRef, review) => openDatabase().then(db => new Promise(
        (resolve, reject) => {
            const transaction = db.transaction(SUBMISSIONS_STORE, 'readwrite');
            const store = transaction.objectStore(SUBMISSIONS_STORE);
            const getRequest = store.get(submissionRef);
            getRequest.onsuccess = () => {
                if (!getRequest.result) {
                    transaction.abort();
                    reject(new Error('Submission not found.'));
                    return;
                }
                store.put(Object.assign({}, getRequest.result, review, {
                    submissionRef: getRequest.result.submissionRef,
                    projectRef: getRequest.result.projectRef,
                    submittedVersionRef: getRequest.result.submittedVersionRef,
                    submittedAt: getRequest.result.submittedAt,
                    sb3: getRequest.result.sb3
                }));
            };
            getRequest.onerror = () => reject(getRequest.error);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        }
    ));

    return {
        getProject: projectRef => withStore(PROJECTS_STORE, 'readonly', store => runRequest(store.get(projectRef))),
        putProject,
        getSubmission: submissionRef => withStore(
            SUBMISSIONS_STORE,
            'readonly',
            store => runRequest(store.get(submissionRef))
        ),
        commitSubmission,
        updateSubmissionReview
    };
};

export {
    createIndexedDbProjectStore
};
