import {createIndexedDbProjectStore} from './kidscode-workspace-persistence/kidscode-development-project-store';
import {KidscodeReturnDestinationType} from './kidscode-workspace-navigation/kidscode-workspace-navigation-contract';

// A launch response's return_to.type must be one of the destinations a real launch can produce.
// KidscodeReturnDestinationType.RECOVERY is deliberately excluded: it is a client-side-only concept
// for the injected/configured fallback used when there is no session at all (e.g. Session Expired),
// never a value a launch response itself should be able to send.
const KidscodeLaunchReturnDestinationTypes = [
    KidscodeReturnDestinationType.LESSON,
    KidscodeReturnDestinationType.PROJECTS,
    KidscodeReturnDestinationType.REVIEW
];

const KidscodeLaunchType = Object.freeze({
    NEW_INDEPENDENT: 'new_independent',
    EXISTING_INDEPENDENT: 'existing_independent',
    NEW_LESSON: 'new_lesson',
    EXISTING_LESSON: 'existing_lesson',
    REVIEW: 'review'
});

const KidscodeLaunchTypes = Object.values(KidscodeLaunchType);

const KidscodeLaunchErrorCode = Object.freeze({
    SESSION_EXPIRED: 'LAUNCH_SESSION_EXPIRED',
    INVALID_SESSION: 'INVALID_LAUNCH_SESSION',
    ACCESS_DENIED: 'WORKSPACE_ACCESS_DENIED',
    INVALID_RESPONSE: 'INVALID_LAUNCH_RESPONSE'
});

const createSuccessFixture = ({
    assignment,
    course,
    lesson,
    launchType,
    projectRef,
    projectStatus = 'draft',
    projectTitle,
    projectType,
    review = null,
    reviewFeedback = null,
    role = 'student',
    sessionRef
}) => ({
    success: true,
    data: {
        session_ref: sessionRef,
        expires_at: '2099-08-10T15:00:00Z',
        workspace_access_token: `DEVELOPMENT_WORKSPACE_TOKEN_${sessionRef}`,
        role,
        student: {
            display_name: 'Adewale'
        },
        project: {
            project_ref: projectRef,
            title: projectTitle,
            project_type: projectType,
            status: projectStatus
        },
        assignment,
        course,
        lesson,
        launch_type: launchType,
        review,
        review_feedback: reviewFeedback,
        // Tutor review launches return to the tutor's own submissions/review queue, never to the
        // student-facing lesson or My Scratch Projects pages: a review-mode return_to always uses
        // KidscodeReturnDestinationType.REVIEW regardless of the underlying project's type.
        return_to: launchType === KidscodeLaunchType.REVIEW ?
            {type: KidscodeReturnDestinationType.REVIEW, url: '/tutor/submissions'} :
            {
                type: projectType === 'lesson' ? KidscodeReturnDestinationType.LESSON :
                    KidscodeReturnDestinationType.PROJECTS,
                url: projectType === 'lesson' ? '/lessons' : '/scratch-projects'
            }
    }
});

// Reserved development-only project_ref values recognised by the development persistence
// adapter to simulate a save that always fails and a saved project that fails to load. Kept
// here (next to the other development fixtures) so the adapter has a single source for them
// instead of duplicating magic strings.
const KidscodeDevelopmentPersistenceFixtureProjectRef = Object.freeze({
    SAVE_FAILURE: 'SCR-PROJ-DEVFAILSAVE',
    CORRUPTED_PROJECT: 'SCR-PROJ-DEVCORRUPT'
});

// Reserved development-only project_ref values recognised by the development project-management
// adapter to simulate a rename, duplicate, or delete that always fails.
const KidscodeDevelopmentProjectManagementFixtureProjectRef = Object.freeze({
    RENAME_FAILURE: 'SCR-PROJ-DEVFAILRENAME',
    DUPLICATE_FAILURE: 'SCR-PROJ-DEVFAILDUP',
    DELETE_FAILURE: 'SCR-PROJ-DEVFAILDEL'
});

const KidscodeDevelopmentSubmissionFixtureProjectRef = Object.freeze({
    SUBMIT_FAILURE: 'SCR-PROJ-DEVFAILSUBMIT'
});

const KidscodeDevelopmentSubmissionFixtureSubmissionRef = Object.freeze({
    SUBMITTED: 'SCR-SUB-DEV-REVIEW-FIXTURE',
    FILE_UNAVAILABLE: 'SCR-SUB-DEVUNAVAILABLE',
    CORRUPTED_FILE: 'SCR-SUB-DEVCORRUPT',
    ACCESS_DENIED: 'SCR-SUB-DEVDENIED',
    APPROVE_FAILURE: 'SCR-SUB-DEVFAILAPPROVE',
    REQUEST_CHANGES_FAILURE: 'SCR-SUB-DEVFAILCHANGES'
});

const lessonContext = {
    assignment: {
        assignment_ref: 'SCR-ASG-A1B2C3',
        title: 'Make the Cat Walk',
        instructions: 'Use Motion and Control blocks to make the sprite walk.'
    },
    course: {
        course_ref: 'COURSE-001',
        title: 'Introduction to Scratch'
    },
    lesson: {
        lesson_ref: 'LESSON-004',
        title: 'Motion'
    }
};

const developmentFixtures = {
    'demo-lesson': createSuccessFixture({
        ...lessonContext,
        launchType: KidscodeLaunchType.EXISTING_LESSON,
        projectRef: 'SCR-PROJ-X82AB',
        projectTitle: 'Make the Cat Walk',
        projectType: 'lesson',
        sessionRef: 'SCR-SESSION-X78KM'
    }),
    'demo-independent': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.EXISTING_INDEPENDENT,
        projectRef: 'SCR-PROJ-I82AB',
        projectTitle: 'My Space Animation',
        projectType: 'independent',
        sessionRef: 'SCR-SESSION-I78KM'
    }),
    'demo-new-lesson': createSuccessFixture({
        ...lessonContext,
        assignment: {
            ...lessonContext.assignment,
            title: 'Animate Your Name'
        },
        launchType: KidscodeLaunchType.NEW_LESSON,
        projectRef: 'SCR-PROJ-NL82A',
        projectTitle: 'Animate Your Name',
        projectType: 'lesson',
        sessionRef: 'SCR-SESSION-NL78K'
    }),
    'demo-new-independent': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.NEW_INDEPENDENT,
        projectRef: 'SCR-PROJ-NI82A',
        projectTitle: 'Untitled Scratch Project',
        projectType: 'independent',
        sessionRef: 'SCR-SESSION-NI78K'
    }),
    'demo-save-failure': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.EXISTING_INDEPENDENT,
        projectRef: KidscodeDevelopmentPersistenceFixtureProjectRef.SAVE_FAILURE,
        projectTitle: 'Save Failure Demo',
        projectType: 'independent',
        sessionRef: 'SCR-SESSION-DEVFAILSAVE'
    }),
    'demo-corrupted-project': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.EXISTING_INDEPENDENT,
        projectRef: KidscodeDevelopmentPersistenceFixtureProjectRef.CORRUPTED_PROJECT,
        projectTitle: 'Corrupted Project Demo',
        projectType: 'independent',
        sessionRef: 'SCR-SESSION-DEVCORRUPT'
    }),
    'demo-rename-failure': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.EXISTING_INDEPENDENT,
        projectRef: KidscodeDevelopmentProjectManagementFixtureProjectRef.RENAME_FAILURE,
        projectTitle: 'Rename Failure Demo',
        projectType: 'independent',
        sessionRef: 'SCR-SESSION-DEVFAILRENAME'
    }),
    'demo-duplicate-failure': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.EXISTING_INDEPENDENT,
        projectRef: KidscodeDevelopmentProjectManagementFixtureProjectRef.DUPLICATE_FAILURE,
        projectTitle: 'Duplicate Failure Demo',
        projectType: 'independent',
        sessionRef: 'SCR-SESSION-DEVFAILDUP'
    }),
    'demo-delete-failure': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.EXISTING_INDEPENDENT,
        projectRef: KidscodeDevelopmentProjectManagementFixtureProjectRef.DELETE_FAILURE,
        projectTitle: 'Delete Failure Demo',
        projectType: 'independent',
        sessionRef: 'SCR-SESSION-DEVFAILDEL'
    }),
    'demo-submit-failure': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.EXISTING_INDEPENDENT,
        projectRef: KidscodeDevelopmentSubmissionFixtureProjectRef.SUBMIT_FAILURE,
        projectTitle: 'Submission Failure Demo',
        projectType: 'independent',
        sessionRef: 'SCR-SESSION-DEVFAILSUBMIT'
    }),
    'demo-changes-requested': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.EXISTING_INDEPENDENT,
        projectRef: 'SCR-PROJ-DEVCHANGES',
        projectStatus: 'changes_requested',
        projectTitle: 'Changes Requested Demo',
        projectType: 'independent',
        reviewFeedback: {
            submission_ref: 'SCR-SUB-DEVCHANGES-1',
            submitted_version_ref: 'SCR-SUB-VER-DEVCHANGES-1',
            feedback: 'Add a loop so the sprite repeats its movement.',
            reviewed_at: '2026-08-11T12:00:00Z'
        },
        sessionRef: 'SCR-SESSION-DEVCHANGES'
    }),
    'demo-approved': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.EXISTING_INDEPENDENT,
        projectRef: 'SCR-PROJ-DEVAPPROVED',
        projectStatus: 'approved',
        projectTitle: 'Approved Project Demo',
        projectType: 'independent',
        sessionRef: 'SCR-SESSION-DEVAPPROVED'
    }),
    'demo-review-submitted': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.REVIEW,
        projectRef: 'SCR-PROJ-DEVREVIEW',
        projectStatus: 'submitted',
        projectTitle: 'Tutor Review Demo',
        projectType: 'independent',
        review: {
            submission_ref: KidscodeDevelopmentSubmissionFixtureSubmissionRef.SUBMITTED,
            submitted_version_ref: 'SCR-SUB-VER-DEV-REVIEW-FIXTURE',
            submitted_at: '2026-08-11T12:00:00Z'
        },
        role: 'tutor',
        sessionRef: 'SCR-SESSION-DEVREVIEW'
    }),
    'demo-review-latest': createSuccessFixture({
        ...lessonContext,
        launchType: KidscodeLaunchType.REVIEW,
        projectRef: 'SCR-PROJ-X82AB',
        projectStatus: 'submitted',
        projectTitle: 'Make the Cat Walk',
        projectType: 'lesson',
        review: {
            submission_ref: KidscodeDevelopmentSubmissionFixtureSubmissionRef.SUBMITTED,
            submitted_version_ref: 'SCR-SUB-VER-DEV-REVIEW-FIXTURE',
            submitted_at: '2026-08-11T12:00:00Z'
        },
        role: 'tutor',
        sessionRef: 'SCR-SESSION-DEVREVIEWLATEST'
    }),
    'demo-review-unavailable': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.REVIEW,
        projectRef: 'SCR-PROJ-DEVUNAVAILABLEREVIEW',
        projectStatus: 'submitted',
        projectTitle: 'Unavailable Submission Demo',
        projectType: 'independent',
        review: {
            submission_ref: KidscodeDevelopmentSubmissionFixtureSubmissionRef.FILE_UNAVAILABLE,
            submitted_version_ref: 'SCR-SUB-VER-DEV-REVIEW-FIXTURE',
            submitted_at: '2026-08-11T12:00:00Z'
        },
        role: 'tutor',
        sessionRef: 'SCR-SESSION-DEVUNAVAILABLEREVIEW'
    }),
    'demo-review-corrupted': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.REVIEW,
        projectRef: 'SCR-PROJ-DEVCORRUPTREVIEW',
        projectStatus: 'submitted',
        projectTitle: 'Corrupted Submission Demo',
        projectType: 'independent',
        review: {
            submission_ref: KidscodeDevelopmentSubmissionFixtureSubmissionRef.CORRUPTED_FILE,
            submitted_version_ref: 'SCR-SUB-VER-DEV-REVIEW-FIXTURE',
            submitted_at: '2026-08-11T12:00:00Z'
        },
        role: 'tutor',
        sessionRef: 'SCR-SESSION-DEVCORRUPTREVIEW'
    }),
    'demo-review-denied': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.REVIEW,
        projectRef: 'SCR-PROJ-DEVDENIEDREVIEW',
        projectStatus: 'submitted',
        projectTitle: 'Review Access Denied Demo',
        projectType: 'independent',
        review: {
            submission_ref: KidscodeDevelopmentSubmissionFixtureSubmissionRef.ACCESS_DENIED,
            submitted_version_ref: 'SCR-SUB-VER-DEV-REVIEW-FIXTURE',
            submitted_at: '2026-08-11T12:00:00Z'
        },
        role: 'tutor',
        sessionRef: 'SCR-SESSION-DEVDENIEDREVIEW'
    }),
    'demo-review-approve-failure': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.REVIEW,
        projectRef: 'SCR-PROJ-DEVREVIEW',
        projectStatus: 'submitted',
        projectTitle: 'Approve Failure Demo',
        projectType: 'independent',
        review: {
            submission_ref: KidscodeDevelopmentSubmissionFixtureSubmissionRef.APPROVE_FAILURE,
            submitted_version_ref: 'SCR-SUB-VER-DEV-REVIEW-FIXTURE',
            submitted_at: '2026-08-11T12:00:00Z'
        },
        role: 'tutor',
        sessionRef: 'SCR-SESSION-DEVFAILAPPROVE'
    }),
    'demo-review-request-changes-failure': createSuccessFixture({
        assignment: null,
        course: null,
        lesson: null,
        launchType: KidscodeLaunchType.REVIEW,
        projectRef: 'SCR-PROJ-DEVREVIEW',
        projectStatus: 'submitted',
        projectTitle: 'Request Changes Failure Demo',
        projectType: 'independent',
        review: {
            submission_ref: KidscodeDevelopmentSubmissionFixtureSubmissionRef.REQUEST_CHANGES_FAILURE,
            submitted_version_ref: 'SCR-SUB-VER-DEV-REVIEW-FIXTURE',
            submitted_at: '2026-08-11T12:00:00Z'
        },
        role: 'tutor',
        sessionRef: 'SCR-SESSION-DEVFAILCHANGES'
    }),
    'demo-expired': {
        success: false,
        error: {
            code: KidscodeLaunchErrorCode.SESSION_EXPIRED,
            message: 'This workspace session has expired. Return to Kidscode and open the project again.'
        }
    },
    'demo-invalid': {
        success: false,
        error: {
            code: KidscodeLaunchErrorCode.INVALID_SESSION,
            message: 'This workspace launch is invalid.'
        }
    },
    'demo-denied': {
        success: false,
        error: {
            code: KidscodeLaunchErrorCode.ACCESS_DENIED,
            message: 'This project cannot be opened from this session.'
        }
    }
};

const isDevelopmentLaunchFixtureToken = launchToken =>
    launchToken === 'demo-offline' || Object.prototype.hasOwnProperty.call(developmentFixtures, launchToken);

const readKidscodeLaunchToken = locationObject =>
    new URLSearchParams(locationObject.search).get('launch');

const removeKidscodeLaunchToken = (locationObject, historyObject) => {
    const url = new URL(locationObject.href);
    url.searchParams.delete('launch');
    historyObject.replaceState(
        historyObject.state,
        '',
        `${url.pathname}${url.search}${url.hash}`
    );
};

const invalidResponse = message => ({
    success: false,
    error: {
        code: KidscodeLaunchErrorCode.INVALID_RESPONSE,
        message
    }
});

const isNullableObject = value => value === null || (typeof value === 'object' && !Array.isArray(value));

const validateKidscodeLaunchResponse = response => {
    if (!response || typeof response !== 'object' || typeof response.success !== 'boolean') {
        return invalidResponse('The workspace launch resolver returned an invalid response.');
    }

    if (!response.success) {
        if (!response.error || typeof response.error.code !== 'string' ||
            typeof response.error.message !== 'string') {
            return invalidResponse('The workspace launch resolver returned an invalid error response.');
        }
        return response;
    }

    const {data} = response;
    const hasRequiredStrings = data &&
        ['session_ref', 'expires_at', 'workspace_access_token', 'launch_type', 'role'].every(key =>
            typeof data[key] === 'string' && data[key].length > 0
        ) &&
        data.student && typeof data.student.display_name === 'string' && data.student.display_name.length > 0 &&
        data.project &&
        ['project_ref', 'title', 'project_type', 'status'].every(key =>
            typeof data.project[key] === 'string' && data.project[key].length > 0
        );

    if (!hasRequiredStrings ||
        !isNullableObject(data.assignment) ||
        !isNullableObject(data.course) ||
        !isNullableObject(data.lesson) ||
        !data.return_to || typeof data.return_to.type !== 'string' || typeof data.return_to.url !== 'string') {
        return invalidResponse('The workspace launch resolver returned incomplete session data.');
    }

    if (!KidscodeLaunchTypes.includes(data.launch_type)) {
        return invalidResponse('The workspace launch resolver returned an unsupported launch type.');
    }

    // return_to.type is only ever used to pick a trusted, already-safe destination (see
    // kidscode-workspace-navigation-contract.js); a value outside the known set is rejected here so
    // navigation never has to reason about an unrecognised destination "kind".
    if (!KidscodeLaunchReturnDestinationTypes.includes(data.return_to.type)) {
        return invalidResponse('The workspace launch resolver returned an unsupported return destination.');
    }

    const expectedProjectType = data.launch_type === KidscodeLaunchType.REVIEW ?
        data.project.project_type :
        (data.launch_type.endsWith('_lesson') ? 'lesson' : 'independent');
    if (!['lesson', 'independent'].includes(expectedProjectType) || data.project.project_type !== expectedProjectType) {
        return invalidResponse('The workspace launch type does not match the project type.');
    }

    if (data.launch_type === KidscodeLaunchType.REVIEW &&
        (!data.review || !['submission_ref', 'submitted_version_ref', 'submitted_at'].every(key =>
            typeof data.review[key] === 'string' && data.review[key].length > 0
        ))) {
        return invalidResponse('The workspace review launch is missing submitted version context.');
    }

    return response;
};

// Applies the development project-management store's current title onto a launch fixture's
// response, without mutating the shared fixture object (developmentFixtures is a module-level
// singleton reused by every call).
const withDevelopmentProjectOverride = (fixture, record, submission) => ({
    ...fixture,
    data: {
        ...fixture.data,
        project: {
            ...fixture.data.project,
            title: record.title || fixture.data.project.title,
            status: record.status || fixture.data.project.status
        },
        review: submission ? {
            submission_ref: submission.submissionRef,
            submitted_version_ref: submission.submittedVersionRef,
            submitted_at: submission.submittedAt
        } : fixture.data.review,
        review_feedback: record.reviewFeedback || fixture.data.review_feedback
    }
});

/**
 * Development-only launch resolver. Its fixtures are static, but a Rename made earlier in the
 * same browser session is stored in the shared development project-management store; without
 * consulting it, reopening a demo project would visibly "forget" its renamed title even though
 * the store still has it. This is purely a local development convenience — it does not make
 * IndexedDB authoritative (a real Laravel launch response is authoritative for project title once
 * connected, and this resolver never runs in production; see render-gui.jsx) and it does not
 * touch persisted .sb3 content.
 * @param {object} [options] - resolver options
 * @param {number} [options.delay] - artificial network delay in ms
 * @param {string} [options.environment] - override for `process.env.NODE_ENV`, for tests
 * @param {{getProject: Function, putProject: Function}} [options.store] - override for the
 *   underlying store, for tests that cannot use real IndexedDB
 * @returns {Function} a launch resolver
 */
const createDevelopmentMockLaunchResolver = ({
    delay = 500,
    environment = process.env.NODE_ENV,
    store = createIndexedDbProjectStore()
} = {}) => {
    if (environment === 'production') {
        throw new Error('The development workspace launch resolver cannot run in production.');
    }

    return launchToken => new Promise((resolve, reject) => {
        setTimeout(() => {
            if (launchToken === 'demo-offline') {
                reject(new Error('The development workspace launch resolver is offline.'));
                return;
            }

            const fixture = developmentFixtures[launchToken] || developmentFixtures['demo-invalid'];
            if (!fixture.success) {
                resolve(fixture);
                return;
            }

            Promise.resolve(store.getProject(fixture.data.project.project_ref))
                .then(record => {
                    if (!record) {
                        resolve(fixture);
                        return;
                    }
                    if (fixture.data.launch_type === KidscodeLaunchType.REVIEW && record.latestSubmissionRef &&
                        store.getSubmission) {
                        Promise.resolve(store.getSubmission(record.latestSubmissionRef))
                            .then(submission => resolve(withDevelopmentProjectOverride(fixture, record, submission)))
                            .catch(() => resolve(withDevelopmentProjectOverride(fixture, record)));
                        return;
                    }
                    resolve(withDevelopmentProjectOverride(fixture, record));
                })
                // A development store read failure is not a reason to fail the whole launch demo;
                // fall back to the static fixture title.
                .catch(() => resolve(fixture));
        }, delay);
    });
};

export {
    KidscodeDevelopmentPersistenceFixtureProjectRef,
    KidscodeDevelopmentProjectManagementFixtureProjectRef,
    KidscodeDevelopmentSubmissionFixtureProjectRef,
    KidscodeDevelopmentSubmissionFixtureSubmissionRef,
    KidscodeLaunchErrorCode,
    KidscodeLaunchType,
    KidscodeLaunchTypes,
    createDevelopmentMockLaunchResolver,
    isDevelopmentLaunchFixtureToken,
    readKidscodeLaunchToken,
    removeKidscodeLaunchToken,
    validateKidscodeLaunchResponse
};
