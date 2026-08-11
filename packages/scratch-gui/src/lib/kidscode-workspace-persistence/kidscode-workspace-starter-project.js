/**
 * Development-only "lesson starter" project used to demonstrate the starter-project loading seam
 * for `new_lesson` launches (see docs/SHARED-API-CONTRACT.md, Phase 4 section).
 *
 * It reuses the costume/backdrop assets already bundled with the editor's own default project
 * (registered into the builtin asset store at startup — see lib/legacy-storage.ts), so no new
 * binary fixture needs to be committed. A single "when green flag clicked / move 10 steps" script
 * makes it visibly different from a blank project once loaded.
 * @returns {object} a project.json-shaped object, suitable for `vm.loadProject()`
 */
const buildKidscodeWorkspaceStarterProject = () => ({
    targets: [
        {
            isStage: true,
            name: 'Stage',
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: {},
            currentCostume: 0,
            costumes: [
                {
                    assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
                    name: 'backdrop1',
                    md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
                    dataFormat: 'svg',
                    rotationCenterX: 240,
                    rotationCenterY: 180
                }
            ],
            sounds: [],
            volume: 100
        },
        {
            isStage: false,
            name: 'Starter Sprite',
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: {
                kidscodeStarterFlag: {
                    opcode: 'event_whenflagclicked',
                    next: 'kidscodeStarterMove',
                    parent: null,
                    inputs: {},
                    fields: {},
                    shadow: false,
                    topLevel: true,
                    x: 0,
                    y: 0
                },
                kidscodeStarterMove: {
                    opcode: 'motion_movesteps',
                    next: null,
                    parent: 'kidscodeStarterFlag',
                    inputs: {
                        STEPS: [1, [4, '10']]
                    },
                    fields: {},
                    shadow: false,
                    topLevel: false
                }
            },
            currentCostume: 0,
            costumes: [
                {
                    assetId: 'bcf454acf82e4504149f7ffe07081dbc',
                    name: 'costume1',
                    bitmapResolution: 1,
                    md5ext: 'bcf454acf82e4504149f7ffe07081dbc.svg',
                    dataFormat: 'svg',
                    rotationCenterX: 48,
                    rotationCenterY: 50
                }
            ],
            sounds: [],
            volume: 100,
            visible: true,
            x: 0,
            y: 0,
            size: 100,
            direction: 90,
            draggable: false,
            rotationStyle: 'all around'
        }
    ],
    meta: {
        semver: '3.0.0',
        vm: '0.1.0',
        agent: ''
    }
});

export {
    buildKidscodeWorkspaceStarterProject
};
