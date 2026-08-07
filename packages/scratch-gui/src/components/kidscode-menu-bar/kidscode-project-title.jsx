import PropTypes from 'prop-types';
import React from 'react';

import styles from './kidscode-project-title.css';

// `title` is project data, not UI copy (the same reasoning applies as to Scratch's
// own `state.scratchGui.projectTitle`, which is likewise rendered raw rather than
// through FormattedMessage), so it is displayed as-is. Rendered in MenuBar's existing
// title slot instead of Scratch's own editable `ProjectTitleInput` (see the
// `kidscodeProjectTitle` prop in menu-bar.jsx), making this the single visible
// project-title surface for Phase 2.
const KidscodeProjectTitle = ({title}) => (
    <span
        className={styles.projectTitle}
        title={title}
    >
        {title}
    </span>
);

KidscodeProjectTitle.propTypes = {
    title: PropTypes.string.isRequired
};

export default KidscodeProjectTitle;
