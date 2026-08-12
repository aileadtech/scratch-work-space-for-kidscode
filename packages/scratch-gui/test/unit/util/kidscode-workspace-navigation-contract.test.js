import {
    KidscodeReturnDestinationType,
    createKidscodeMockNavigationTransport,
    createKidscodeWindowNavigationTransport,
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
