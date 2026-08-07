import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, useIntl} from 'react-intl';

import styles from './kidscode-student-indicator.css';

const messages = defineMessages({
    studentIndicatorLabel: {
        id: 'kidscode.menuBar.studentIndicatorLabel',
        description: 'Visually hidden text following the student\'s name in the workspace menu bar, ' +
            'clarifying for screen reader users that this is the logged-in student',
        defaultMessage: '(student account)'
    }
});

// Rendered in MenuBar's account-info area, in place of the anonymous-session
// mystuff/account placeholders (see the `kidscodeStudentName` prop in menu-bar.jsx).
// `studentName` is session data (like project title, see kidscode-project-title.jsx),
// so it is rendered as-is. The hidden label clarifies for screen reader users what the
// avatar and name mean, since sighted users infer that from context alone.
const KidscodeStudentIndicator = ({studentName}) => {
    const intl = useIntl();
    return (
        <div className={styles.studentIndicator}>
            <span
                aria-hidden="true"
                className={styles.avatar}
            >
                {studentName.charAt(0).toUpperCase()}
            </span>
            <span className={styles.studentName}>
                {studentName}
            </span>
            <span className={styles.visuallyHidden}>
                {intl.formatMessage(messages.studentIndicatorLabel)}
            </span>
        </div>
    );
};

KidscodeStudentIndicator.propTypes = {
    studentName: PropTypes.string.isRequired
};

export default KidscodeStudentIndicator;
