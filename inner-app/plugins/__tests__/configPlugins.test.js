const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { setGradleJvmArgs, GRADLE_JVM_ARGS } = require('../withGradleMemory');
const { addFmtFix, MARKER } = require('../withFmtConstevalFix');

const PODFILE = `target 'Inner' do
  post_install do |installer|
    react_native_post_install(installer)
  end
end
`;

describe('withGradleMemory', () => {
  it('replaces an existing JVM argument entry', () => {
    const props = [
      { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m -XX:MaxMetaspaceSize=512m' },
      { type: 'property', key: 'android.useAndroidX', value: 'true' },
    ];
    const result = setGradleJvmArgs(props);
    expect(result.filter(p => p.key === 'org.gradle.jvmargs')).toHaveLength(1);
    expect(result.find(p => p.key === 'org.gradle.jvmargs').value).toBe(GRADLE_JVM_ARGS);
    expect(result.find(p => p.key === 'android.useAndroidX').value).toBe('true');
  });

  it('adds the entry when it is missing, and is idempotent', () => {
    const once = setGradleJvmArgs([{ type: 'property', key: 'newArchEnabled', value: 'false' }]);
    const twice = setGradleJvmArgs(once);
    expect(twice.filter(p => p.key === 'org.gradle.jvmargs')).toHaveLength(1);
  });

  it('gives Metaspace more room than the 512 MB that ran out', () => {
    expect(GRADLE_JVM_ARGS).toMatch(/MaxMetaspaceSize=1024m/);
    expect(GRADLE_JVM_ARGS).toMatch(/-Xmx4096m/);
  });
});

describe('withFmtConstevalFix', () => {
  it('adds the patch once, inside the first post_install block', () => {
    const once = addFmtFix(PODFILE);
    expect(once).toContain(MARKER);
    expect(once.indexOf(MARKER)).toBeGreaterThan(once.indexOf('post_install do |installer|'));
    expect(once.indexOf(MARKER)).toBeLessThan(once.indexOf('react_native_post_install'));
    expect(addFmtFix(once)).toBe(once);
  });

  it('fails loudly if the Podfile has no post_install block', () => {
    expect(() => addFmtFix("target 'Inner' do\nend\n")).toThrow(/post_install/);
  });

  const hasRuby = spawnSync('ruby', ['-v']).status === 0;
  (hasRuby ? it : it.skip)('turns off consteval in a real-shaped fmt header and leaves the rest alone', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmtfix-'));
    const header = path.join(dir, 'fmt', 'include', 'fmt', 'base.h');
    fs.mkdirSync(path.dirname(header), { recursive: true });
    const original = [
      '#elif defined(__cpp_consteval)',
      '#  define FMT_USE_CONSTEVAL 1',
      '#elif FMT_GCC_VERSION >= 1002 || FMT_CLANG_VERSION >= 1101',
      '#  define FMT_USE_CONSTEVAL 1',
      '#else',
      '#  define FMT_USE_CONSTEVAL 0',
      '#endif',
      '#define FMT_VERSION 110002',
      '',
    ].join('\n');
    fs.writeFileSync(header, original);
    fs.chmodSync(header, 0o444); // read-only like a downloaded pod

    const podfile = addFmtFix(PODFILE);
    const block = podfile.slice(podfile.indexOf(MARKER) - 6, podfile.indexOf('react_native_post_install'));
    const script = `Sandbox = Struct.new(:root)\nInstaller = Struct.new(:sandbox)\ninstaller = Installer.new(Sandbox.new('${dir}'))\n${block}\n`;
    const run = spawnSync('ruby', ['-e', script], { encoding: 'utf8' });
    expect(run.status).toBe(0);

    const patched = fs.readFileSync(header, 'utf8');
    expect(patched).not.toMatch(/FMT_USE_CONSTEVAL 1\b/);
    expect(patched).toContain('#define FMT_VERSION 110002');
    expect(patched.match(/FMT_USE_CONSTEVAL 0/g)).toHaveLength(3);

    // Running it again changes nothing.
    const again = spawnSync('ruby', ['-e', script], { encoding: 'utf8' });
    expect(again.status).toBe(0);
    expect(fs.readFileSync(header, 'utf8')).toBe(patched);
  });
});
