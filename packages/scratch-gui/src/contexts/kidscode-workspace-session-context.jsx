import PropTypes from 'prop-types';
import React, {useContext} from 'react';

const KidscodeWorkspaceSessionContext = React.createContext(null);

const KidscodeWorkspaceSessionProvider = ({children, session}) => (
    <KidscodeWorkspaceSessionContext.Provider value={session}>
        {children}
    </KidscodeWorkspaceSessionContext.Provider>
);

KidscodeWorkspaceSessionProvider.propTypes = {
    children: PropTypes.node,
    session: PropTypes.shape({
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
        return_to: PropTypes.shape({
            type: PropTypes.string.isRequired,
            url: PropTypes.string.isRequired
        }).isRequired,
        session_ref: PropTypes.string.isRequired,
        student: PropTypes.shape({
            display_name: PropTypes.string.isRequired
        }).isRequired,
        workspace_access_token: PropTypes.string.isRequired
    })
};

const useKidscodeWorkspaceSession = () => useContext(KidscodeWorkspaceSessionContext);

export {
    KidscodeWorkspaceSessionContext,
    KidscodeWorkspaceSessionProvider,
    useKidscodeWorkspaceSession
};
