const KidscodeLaunchType = Object.freeze({
    NEW_INDEPENDENT: 'new_independent',
    EXISTING_INDEPENDENT: 'existing_independent',
    NEW_LESSON: 'new_lesson',
    EXISTING_LESSON: 'existing_lesson'
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
    projectTitle,
    projectType,
    sessionRef
}) => ({
    success: true,
    data: {
        session_ref: sessionRef,
        expires_at: '2099-08-10T15:00:00Z',
        workspace_access_token: `DEVELOPMENT_WORKSPACE_TOKEN_${sessionRef}`,
        student: {
            display_name: 'Adewale'
        },
        project: {
            project_ref: projectRef,
            title: projectTitle,
            project_type: projectType,
            status: 'draft'
        },
        assignment,
        course,
        lesson,
        launch_type: launchType,
        return_to: {
            type: projectType === 'lesson' ? 'lesson' : 'projects',
            url: projectType === 'lesson' ? '/lessons' : '/scratch-projects'
        }
    }
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
        ['session_ref', 'expires_at', 'workspace_access_token', 'launch_type'].every(key =>
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

    const expectedProjectType = data.launch_type.endsWith('_lesson') ? 'lesson' : 'independent';
    if (data.project.project_type !== expectedProjectType) {
        return invalidResponse('The workspace launch type does not match the project type.');
    }

    return response;
};

const createDevelopmentMockLaunchResolver = ({delay = 500, environment = process.env.NODE_ENV} = {}) => {
    if (environment === 'production') {
        throw new Error('The development workspace launch resolver cannot run in production.');
    }

    return launchToken => new Promise((resolve, reject) => {
        setTimeout(() => {
            if (launchToken === 'demo-offline') {
                reject(new Error('The development workspace launch resolver is offline.'));
                return;
            }

            resolve(developmentFixtures[launchToken] || developmentFixtures['demo-invalid']);
        }, delay);
    });
};

export {
    KidscodeLaunchErrorCode,
    KidscodeLaunchType,
    KidscodeLaunchTypes,
    createDevelopmentMockLaunchResolver,
    readKidscodeLaunchToken,
    removeKidscodeLaunchToken,
    validateKidscodeLaunchResponse
};
