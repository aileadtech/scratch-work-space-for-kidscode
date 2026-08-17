import {
    KidscodeReturnDestinationType,
    createKidscodeMockNavigationTransport,
    createKidscodeWindowNavigationTransport,
    getKidscodeWorkspaceAllowedReturnOrigins,
    validateKidscodeReturnDestination
} from '../../../src/lib/kidscode-workspace-navigation/kidscode-workspace-navigation-contract';

describe('Kidscode workspace return destination validator', () => {
    test('accepts a same-origin relative path', () => {
        expect(validateKidscodeReturnDestination({url: '/lessons'})).toBe('/lessons');
    });

    test('accepts an absolute URL whose origin is explicitly allowed', () => {
        const destination = {type: KidscodeReturnDestinationType.PROJECTS, url: 'https://kidscode.example/scratch-projects'};
        expect(validateKidscodeReturnDestination(destination, {
            allowedOrigins: ['https://kidscode.example']
        })).toBe('https://kidscode.example/scratch-projects');
    });

    test('rejects an absolute URL whose origin is not in the allowlist', () => {
        const destination = {url: 'https://evil.example.com/steal'};
        expect(validateKidscodeReturnDestination(destination, {
            allowedOrigins: ['https://kidscode.example']
        })).toBeNull();
    });

    test('rejects an absolute URL when no origin is configured', () => {
        expect(validateKidscodeReturnDestination({url: 'https://kidscode.example/lessons'})).toBeNull();
    });

    test.each([
        // eslint-disable-next-line no-script-url
        ['javascript:alert(1)'],
        ['data:text/html,<script>alert(1)</script>'],
        ['//evil.example.com/steal'],
        ['evil.example.com/steal']
    ])('rejects the unsafe destination %s', unsafeUrl => {
        expect(validateKidscodeReturnDestination({url: unsafeUrl}, {
            allowedOrigins: ['https://kidscode.example', 'http://evil.example.com', 'https://evil.example.com']
        })).toBeNull();
    });

    test('rejects a missing or empty destination', () => {
        expect(validateKidscodeReturnDestination(null)).toBeNull();
        expect(validateKidscodeReturnDestination({url: ''})).toBeNull();
        expect(validateKidscodeReturnDestination({})).toBeNull();
    });
});

describe('getKidscodeWorkspaceAllowedReturnOrigins', () => {
    test('production has no configured origins by default (fails closed)', () => {
        expect(getKidscodeWorkspaceAllowedReturnOrigins({environment: 'production'}))
            .toEqual([]);
    });

    test('production uses exactly the configured origins, once set', () => {
        expect(getKidscodeWorkspaceAllowedReturnOrigins({
            environment: 'production',
            configuredOrigins: 'https://app.kidscode.example, https://tutor.kidscode.example'
        })).toEqual(['https://app.kidscode.example', 'https://tutor.kidscode.example']);
    });

    test('development includes the Workspace dev-server origin even when nothing is configured', () => {
        expect(getKidscodeWorkspaceAllowedReturnOrigins({environment: 'development'}))
            .toEqual(['http://localhost:8601']);
    });

    test('development adds a configured real-session origin alongside the dev-server origin', () => {
        expect(getKidscodeWorkspaceAllowedReturnOrigins({
            environment: 'development',
            configuredOrigins: 'https://testing.aileadkidscode.com'
        })).toEqual(['https://testing.aileadkidscode.com', 'http://localhost:8601']);
    });

    test('blank/whitespace-only configuration is treated as unset', () => {
        expect(getKidscodeWorkspaceAllowedReturnOrigins({environment: 'production', configuredOrigins: '   '}))
            .toEqual([]);
    });
});

describe('Kidscode workspace navigation transports', () => {
    test('the window transport assigns the injected location object', () => {
        const locationObject = {href: '/workspace'};
        const transport = createKidscodeWindowNavigationTransport({locationObject});

        transport.navigate('/lessons');

        expect(locationObject.href).toBe('/lessons');
    });

    test('the window transport is inert without a location object', () => {
        const transport = createKidscodeWindowNavigationTransport({locationObject: null});
        expect(() => transport.navigate('/lessons')).not.toThrow();
    });

    test('the mock transport records calls instead of navigating', () => {
        const transport = createKidscodeMockNavigationTransport();

        transport.navigate('/lessons');
        transport.navigate('/scratch-projects');

        expect(transport.calls).toEqual(['/lessons', '/scratch-projects']);
    });
});
