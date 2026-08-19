import PropTypes from 'prop-types';
import React, {useContext} from 'react';

const KidscodeWorkspaceSessionContext = React.createContext(null);

const KidscodeWorkspaceSessionProvider = ({children, session}) => (
    <KidscodeWorkspaceSessionContext.Provider value={session}>
        {children}
    </KidscodeWorkspaceSessionContext.Provider>
);

// Student launches and every existing development fixture (student or tutor-review) share this
// shape — unchanged from before the Workspace understood the real tutor review contract below.
const kidscodeStudentShapedSessionPropType = PropTypes.shape({
    assignment: PropTypes.shape({
        assignment_ref: PropTypes.string,
        instructions: PropTypes.string,
        title: PropTypes.string
    }),
    course: PropTypes.shape({
        course_ref: PropTypes.string,
        title: PropTypes.string
    }),
    expires_at: PropTypes.string.isRequired,
    launch_type: PropTypes.string.isRequired,
    lesson: PropTypes.shape({
        lesson_ref: PropTypes.string,
        title: PropTypes.string
    }),
    project: PropTypes.shape({
        project_ref: PropTypes.string.isRequired,
        project_type: PropTypes.string.isRequired,
        status: PropTypes.string.isRequired,
        title: PropTypes.string.isRequired
    }).isRequired,
    review: PropTypes.shape({
        submission_ref: PropTypes.string.isRequired,
        submitted_at: PropTypes.string.isRequired,
        submitted_version_ref: PropTypes.string.isRequired
    }),
    review_feedback: PropTypes.shape({
        feedback: PropTypes.string.isRequired,
        reviewed_at: PropTypes.string.isRequired,
        submission_ref: PropTypes.string.isRequired,
        submitted_version_ref: PropTypes.string.isRequired
    }),
    role: PropTypes.string.isRequired,
    return_to: PropTypes.shape({
        type: PropTypes.string.isRequired,
        url: PropTypes.string.isRequired
    }).isRequired,
    session_ref: PropTypes.string.isRequired,
    student: PropTypes.shape({
        display_name: PropTypes.string.isRequired
    }).isRequired,
    workspace_access_token: PropTypes.string.isRequired
});

// The real Stage 4 tutor read-only review session (ScratchWorkspaceLaunchController::
// resolveReviewSession): deliberately has no project/student/return_to — see
// kidscode-workspace-launch.js's validateTutorReviewLaunchResponse for the same required fields.
const kidscodeTutorReviewSessionPropType = PropTypes.shape({
    expires_at: PropTypes.string.isRequired,
    mode: PropTypes.oneOf(['read_only']).isRequired,
    permissions: PropTypes.objectOf(PropTypes.bool).isRequired,
    review_access_token: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['tutor']).isRequired,
    session_ref: PropTypes.string.isRequired,
    submission: PropTypes.shape({
        project_ref: PropTypes.string.isRequired,
        project_title: PropTypes.string,
        status: PropTypes.string.isRequired,
        student_ref: PropTypes.string,
        submission_ref: PropTypes.string.isRequired,
        submitted_at: PropTypes.string,
        version_ref: PropTypes.string.isRequired
    }).isRequired,
    submission_ref: PropTypes.string.isRequired
});

KidscodeWorkspaceSessionProvider.propTypes = {
    children: PropTypes.node,
    session: PropTypes.oneOfType([
        kidscodeStudentShapedSessionPropType,
        kidscodeTutorReviewSessionPropType
    ])
};

const useKidscodeWorkspaceSession = () => useContext(KidscodeWorkspaceSessionContext);

export {
    KidscodeWorkspaceSessionContext,
    KidscodeWorkspaceSessionProvider,
    useKidscodeWorkspaceSession
};
