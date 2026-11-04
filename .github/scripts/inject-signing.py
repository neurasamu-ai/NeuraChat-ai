#!/usr/bin/env python3
"""Inject release signingConfigs into a Capacitor-generated app/build.gradle."""
import re
import sys

path = 'android/app/build.gradle'
try:
    with open(path) as f:
        g = f.read()
except FileNotFoundError:
    print(f'ERROR: {path} not found', file=sys.stderr)
    sys.exit(1)

# 1) Insert signingConfigs right after `android {`
signing = """
    signingConfigs {
        release {
            storeFile file('neurachat-release.jks')
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
"""
marker = 'android {'
idx = g.find(marker)
if idx == -1:
    print('ERROR: android { not found', file=sys.stderr)
    sys.exit(1)
insert_at = idx + len(marker)
g = g[:insert_at] + signing + g[insert_at:]

# 2) Wire signingConfig into the existing release {} buildType
m = re.search(r'(buildTypes\s*\{[\s\S]*?release\s*\{)', g)
if not m:
    print('ERROR: release buildType not found', file=sys.stderr)
    sys.exit(1)
g = g[:m.end()] + '\n            signingConfig signingConfigs.release' + g[m.end():]

with open(path, 'w') as f:
    f.write(g)
print('build.gradle signing injected OK')
