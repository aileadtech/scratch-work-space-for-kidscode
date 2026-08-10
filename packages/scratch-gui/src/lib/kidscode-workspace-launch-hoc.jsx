import PropTypes from 'prop-types';
import React from 'react';

import {KidscodeWorkspaceSessionProvider} from '../contexts/kidscode-workspace-session-context.jsx';
import {
    KidscodeLaunchErrorCode,
    readKidscodeLaunchToken,
    removeKidscodeLaunchToken,
    validateKidscodeLaunchResponse
} from './kidscode-workspace-launch';
import {KidscodeWorkspaceState} from './kidscode-workspace-state';

const KIDSCODE_LOADING_PROJECT_TITLE = 'Loading Project';
const KIDSCODE_LOADING_STUDENT_NAME = 'Student';

const workspaceStateForError = errorCode => {
    if (errorCode === KidscodeLaunchErrorCode.SESSION_EXPIRED) {
        return KidscodeWorkspaceState.SESSION_EXPIRED;
    }
    return KidscodeWorkspaceState.ACCESS_BLOCKED;
};

const KidscodeWorkspaceLaunchHOC = WrappedComponent => {
    class KidscodeWorkspaceLaunch extends React.Component {
        constructor (props) {
            super(props);
            this.state = {
                session: null,
                workspaceState: KidscodeWorkspaceState.LOADING_PROJECT
            };
            this.handleWorkspaceStateAction = this.handleWorkspaceStateAction.bind(this);
        }
        componentDidMount () {
            this.isMountedForLaunch = true;
            this.resolveLaunch();
        }
        componentWillUnmount () {
            this.isMountedForLaunch = false;
        }
        getLocation () {
            return this.props.launchLocation || window.location;
        }
        getHistory () {
            return this.props.launchHistory || window.history;
        }
        async resolveLaunch () {
            const launchToken = readKidscodeLaunchToken(this.getLocation());
            if (!launchToken) {
                this.setState({
                    session: null,
                    workspaceState: KidscodeWorkspaceState.ACCESS_BLOCKED
                });
                return;
            }

            this.setState({
                session: null,
                workspaceState: KidscodeWorkspaceState.LOADING_PROJECT
            });

            try {
                const response = validateKidscodeLaunchResponse(await this.props.launchResolver(launchToken));
                if (!this.isMountedForLaunch) return;

                if (!response.success) {
                    this.setState({
                        session: null,
                        workspaceState: workspaceStateForError(response.error.code)
                    });
                    return;
                }

                removeKidscodeLaunchToken(this.getLocation(), this.getHistory());
                this.setState({
                    session: response.data,
                    workspaceState: null
                });
            } catch {
                if (!this.isMountedForLaunch) return;
                this.setState({
                    session: null,
                    workspaceState: KidscodeWorkspaceState.LAUNCH_CONNECTION_LOST
                });
            }
        }
        handleWorkspaceStateAction (workspaceState) {
            if (workspaceState === KidscodeWorkspaceState.LAUNCH_CONNECTION_LOST) {
                this.resolveLaunch();
                return;
            }
            if (this.props.onWorkspaceStateAction) {
                this.props.onWorkspaceStateAction(workspaceState);
            }
        }
        render () {
            const {
                launchHistory: _launchHistory,
                launchLocation: _launchLocation,
                launchResolver: _launchResolver,
                onWorkspaceStateAction: _onWorkspaceStateAction,
                ...componentProps
            } = this.props;
            const {session, workspaceState} = this.state;
            const projectTitle = session ? session.project.title : KIDSCODE_LOADING_PROJECT_TITLE;
            const studentName = session ? session.student.display_name : KIDSCODE_LOADING_STUDENT_NAME;

            return (
                <KidscodeWorkspaceSessionProvider session={session}>
                    <WrappedComponent
                        {...componentProps}
                        kidscodeProjectTitle={projectTitle}
                        kidscodeStudentName={studentName}
                        kidscodeWorkspaceState={workspaceState}
                        projectTitle={projectTitle}
                        onWorkspaceStateAction={this.handleWorkspaceStateAction}
                    />
                </KidscodeWorkspaceSessionProvider>
            );
        }
    }

    KidscodeWorkspaceLaunch.propTypes = {
        launchHistory: PropTypes.shape({
            replaceState: PropTypes.func.isRequired
        }),
        launchLocation: PropTypes.shape({
            href: PropTypes.string.isRequired,
            search: PropTypes.string.isRequired
        }),
        launchResolver: PropTypes.func.isRequired,
        onWorkspaceStateAction: PropTypes.func
    };

    return KidscodeWorkspaceLaunch;
};

export default KidscodeWorkspaceLaunchHOC;
