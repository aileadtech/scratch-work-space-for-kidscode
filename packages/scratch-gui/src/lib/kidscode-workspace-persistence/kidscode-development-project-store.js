/**
 * Development-only persistent project store, backed by IndexedDB so a saved .sb3 survives a
 * page refresh or browser reopen during local development. This is the only place in the
 * Workspace that touches IndexedDB — the persistence and project-management adapters, and the
 * Workspace UI, never do.
 *
 * Records are keyed by project_ref. The Phase 4 persistence adapter reads/writes the content
 * fields (versionRef, versionNumber, savedAt, sb3, lastSaveReason); the Phase 5 project-management
 * adapter reads/writes the metadata fields (title, projectType, status, createdAt, updatedAt,
 * deletedAt). Both adapters share this one store rather than each keeping their own, so
 * `putProject` merges a partial record onto whatever is already stored instead of overwriting it
 * wholesale — otherwise a save from one adapter would silently erase metadata written by the
 * other (e.g. a rename landing mid-autosave). Launch tokens, workspace access tokens, and student
 * authentication are never written here.
 */

const DATABASE_NAME = 'kidscode-workspace-dev-store';
const DATABASE_VERSION = 1;
const PROJECTS_STORE = 'projects';

const openDatabase = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
            db.createObjectStore(PROJECTS_STORE, {keyPath: 'projectRef'});
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
    const withStore = (mode, useStore) =>
        openDatabase().then(db => new Promise((resolve, reject) => {
            const transaction = db.transaction(PROJECTS_STORE, mode);
            const store = transaction.objectStore(PROJECTS_STORE);
            const result = useStore(store);
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error);
        }));

    // Reads whatever is already stored for this project_ref and merges the incoming partial
    // record onto it before writing back, so a save from one adapter cannot erase metadata
    // written by the other (see the file header comment).
    const putProject = record => openDatabase().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
        const store = transaction.objectStore(PROJECTS_STORE);
        const getRequest = store.get(record.projectRef);
        getRequest.onsuccess = () => {
            store.put(Object.assign({}, getRequest.result, record));
        };
        getRequest.onerror = () => reject(getRequest.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    }));

    return {
        getProject: projectRef => withStore('readonly', store => runRequest(store.get(projectRef))),
        putProject
    };
};

export {
    createIndexedDbProjectStore
};
